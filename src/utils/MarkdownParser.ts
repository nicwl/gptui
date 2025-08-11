/**
 * Pushdown automaton parser for streaming markdown
 * 
 * Based on practical streaming grammar (see MarkdownGrammar.md):
 * - Token-based processing (not character-based)
 * - Pushdown automaton with stack for nested structures
 * - Incremental AST building
 * - Context-sensitive parsing with lookahead
 * 
 * Design principles:
 * - Accepts tokens from tokenizer
 * - Uses stack for nested structures (bold, italic, links, etc.)
 * - Builds AST incrementally
 * - Flush method for EOF
 * - Tracks buffered tokens
 * - No knowledge of tokenizer or rendering
 */

import { Token, TokenType } from './MarkdownTokenizer';

// Discriminated union types for type safety
export type MarkdownASTNode = 
  | { type: 'text'; content: string }
  | { type: 'document'; children: MarkdownASTNode[] }
  | { type: 'paragraph'; children: MarkdownASTNode[] }
  | { type: 'heading'; children: MarkdownASTNode[]; metadata: { level: number } }
  | { type: 'code_block'; content: string; metadata?: { language?: string } }
  | { type: 'code_inline'; content: string }
  | { type: 'strong'; children: MarkdownASTNode[] }
  | { type: 'emphasis'; children: MarkdownASTNode[] }
  | { type: 'link'; children: MarkdownASTNode[]; metadata: { url: string } };

// Type guards for runtime type checking
export function hasContent(node: MarkdownASTNode): node is { type: 'text' | 'code_block' | 'code_inline'; content: string } {
  return node.type === 'text' || node.type === 'code_block' || node.type === 'code_inline';
}

export function hasChildren(node: MarkdownASTNode): node is Extract<MarkdownASTNode, { children: any }> {
  return 'children' in node;
}

export function hasMetadata(node: MarkdownASTNode): node is Extract<MarkdownASTNode, { metadata: any }> {
  return 'metadata' in node;
}

enum ParserState {
  DOCUMENT,                   // Root document state
  PARAGRAPH,                  // Building paragraph content
  HEADING,                    // Building heading content
  CODE_BLOCK,                 // Inside code block
  CODE_FENCE_LANG,            // Reading code block language
}

interface StackFrame {
  type: 'strong' | 'emphasis' | 'link' | 'paragraph' | 'heading' | 'code_block' | 'code_inline';
  node: MarkdownASTNode;
  metadata?: {
    url?: string;             // For links - store URL when we find it
    expecting?: 'link_url' | 'link_text' | 'url_content';  // What we're expecting next for links
    pendingLink?: boolean;    // Whether this is a pending link that might be incomplete
  };
}

export class MarkdownParser {
  private state = ParserState.DOCUMENT;
  private ast: MarkdownASTNode & { type: 'document'; children: MarkdownASTNode[] };
  private stack: StackFrame[] = [];
  private bufferedTokens: Token[] = [];
  private currentLine: Token[] = [];
  private expectingNewline = false;
  
  constructor() {
    this.ast = {
      type: 'document',
      children: []
    };
  }
  
  /**
   * Accept a token and update the AST
   */
  accept(token: Token): void {
    // Add to buffered tokens
    this.bufferedTokens.push(token);
    
    switch (token.type) {
      case TokenType.ATX_HEADING:
        this.handleHeading(token);
        break;
        
      case TokenType.CODE_FENCE:
        this.handleCodeFence(token);
        break;
        
      case TokenType.CODE_DELIMITER:
        this.handleCodeDelimiter(token);
        break;
        
      case TokenType.BOLD_DELIMITER:
        this.handleBoldDelimiter(token);
        break;
        
      case TokenType.ITALIC_DELIMITER:
        this.handleItalicDelimiter(token);
        break;
        
      case TokenType.LINK_TEXT_OPEN:
        this.handleLinkTextOpen(token);
        break;
        
      case TokenType.LINK_TEXT_CLOSE:
        this.handleLinkTextClose(token);
        break;
        
      case TokenType.LINK_URL_OPEN:
        this.handleLinkUrlOpen(token);
        break;
        
      case TokenType.LINK_URL_CLOSE:
        this.handleLinkUrlClose(token);
        break;
        
      case TokenType.NEWLINE:
        this.handleNewline(token);
        break;
        
      case TokenType.TEXT:
      case TokenType.CODE_CONTENT:
        this.handleText(token);
        break;
        
      case TokenType.EOF:
        // Clean up any incomplete links at end of input
        this.cleanupIncompleteLinks();
        break;
    }
  }
  
  /**
   * Signal end of input and finalize AST
   */
  flush(): void {
    // Finalize any open paragraph
    this.finalizeParagraph();
    
    // Close any remaining open formatting
    while (this.stack.length > 0) {
      this.popStack();
    }
    
    // Consolidate adjacent text nodes to fix fragmentation
    this.consolidateTextNodes(this.ast);
    
    // Clear buffered tokens since we're done
    this.bufferedTokens = [];
  }
  
  /**
   * Get the current AST (shallow copy for performance)
   */
  getAST(): MarkdownASTNode {
    return this.ast;
  }
  
  /**
   * Get a reference to the AST (for performance-critical rendering)
   */
  getASTReference(): MarkdownASTNode {
    return this.ast;
  }
  
  /**
   * Get buffered tokens that haven't been incorporated into AST yet
   */
  getBufferedTokens(): Token[] {
    return [...this.bufferedTokens];
  }
  
  /**
   * Reset parser state
   */
  reset(): void {
    this.state = ParserState.DOCUMENT;
    this.ast = {
      type: 'document',
      children: []
    };
    this.stack = [];
    this.bufferedTokens = [];
    this.currentLine = [];
    this.expectingNewline = false;
  }
  
  private handleHeading(token: Token): void {
    this.finalizeParagraph();
    
    const headingNode: MarkdownASTNode = {
      type: 'heading',
      children: [],
      metadata: { level: token.metadata?.level || 1 }
    };
    
    this.ast.children.push(headingNode);
    this.pushStack('heading', headingNode);
    this.state = ParserState.HEADING;
    this.consumeBufferedToken(token);
  }
  
  private handleCodeFence(token: Token): void {
    if (this.state === ParserState.CODE_BLOCK) {
      // Closing code fence - trim leading and trailing newlines from content
      const codeFrame = this.findStackFrame('code_block');
      if (codeFrame && codeFrame.node.type === 'code_block') {
        // Remove leading and trailing newlines, but preserve internal newlines
        codeFrame.node.content = codeFrame.node.content.replace(/^\n+|\n+$/g, '');
      }
      this.popStack();
      this.state = ParserState.DOCUMENT;
    } else {
      // Opening code fence
      this.finalizeParagraph();
      
      const codeNode: MarkdownASTNode = {
        type: 'code_block',
        content: '',
        metadata: { language: '' }
      };
      
      this.ast.children.push(codeNode);
      this.pushStack('code_block', codeNode);
      this.state = ParserState.CODE_BLOCK;
    }
    this.consumeBufferedToken(token);
  }
  
  private handleCodeDelimiter(token: Token): void {
    const existingCode = this.findStackFrame('code_inline');
    
    if (existingCode) {
      // Closing inline code
      this.popStackUntil('code_inline');
    } else {
      // Opening inline code
      this.ensureParagraph();
      
      const codeNode: MarkdownASTNode = {
        type: 'code_inline',
        content: ''
      };
      
      this.getCurrentContainer().children.push(codeNode);
      this.pushStack('code_inline', codeNode);
    }
    this.consumeBufferedToken(token);
  }
  
  private handleBoldDelimiter(token: Token): void {
    // Check if we're potentially inside a link - if so, don't process emphasis yet
    const hasUnresolvedLinkStart = this.bufferedTokens.some(t => 
      t.type === TokenType.LINK_TEXT_OPEN
    );
    
    if (hasUnresolvedLinkStart) {
      // Don't consume emphasis tokens while potential links are being resolved
      // They will be processed by the recursive parser if the link is complete
      return;
    }
    
    const existingBold = this.findStackFrame('strong');
    
    if (existingBold) {
      // Closing bold
      this.popStackUntil('strong');
    } else {
      // Opening bold
      this.ensureParagraph();
      
      const boldNode: MarkdownASTNode = {
        type: 'strong',
        children: []
      };
      
      this.getCurrentContainer().children.push(boldNode);
      this.pushStack('strong', boldNode);
    }
    this.consumeBufferedToken(token);
  }
  
  private handleItalicDelimiter(token: Token): void {
    // Check if we're potentially inside a link - if so, don't process emphasis yet
    const hasUnresolvedLinkStart = this.bufferedTokens.some(t => 
      t.type === TokenType.LINK_TEXT_OPEN
    );
    
    if (hasUnresolvedLinkStart) {
      // Don't consume emphasis tokens while potential links are being resolved
      // They will be processed by the recursive parser if the link is complete
      return;
    }
    
    const existingItalic = this.findStackFrame('emphasis');
    
    if (existingItalic) {
      // Closing italic
      this.popStackUntil('emphasis');
    } else {
      // Opening italic
      this.ensureParagraph();
      
      const italicNode: MarkdownASTNode = {
        type: 'emphasis',
        children: []
      };
      
      this.getCurrentContainer().children.push(italicNode);
      this.pushStack('emphasis', italicNode);
    }
    this.consumeBufferedToken(token);
  }
  
  private handleLinkTextOpen(token: Token): void {
    // Don't consume - keep in buffer for potential cleanup
    // Explicitly do nothing to leave token in buffer
  }
  
  private handleLinkTextClose(token: Token): void {
    // Don't consume - keep in buffer for potential cleanup
    // Explicitly do nothing to leave token in buffer
  }
  
  private handleLinkUrlOpen(token: Token): void {
    // Don't consume - keep in buffer for potential cleanup
    // Explicitly do nothing to leave token in buffer
  }
  
  private handleLinkUrlClose(token: Token): void {
    // We have a complete link! Parse it properly with nested content
    
    // Find the most recent link pattern in the buffer: [text](url)
    const bufferCopy = [...this.bufferedTokens];
    let linkStartIndex = -1;
    let linkTextCloseIndex = -1;
    let linkUrlOpenIndex = -1;
    
    // Find the pattern: LINK_TEXT_OPEN ... LINK_TEXT_CLOSE LINK_URL_OPEN ... (current token is LINK_URL_CLOSE)
    for (let i = bufferCopy.length - 1; i >= 0; i--) {
      if (bufferCopy[i].type === TokenType.LINK_URL_OPEN) {
        linkUrlOpenIndex = i;
        // Look backwards for LINK_TEXT_CLOSE
        for (let j = i - 1; j >= 0; j--) {
          if (bufferCopy[j].type === TokenType.LINK_TEXT_CLOSE) {
            linkTextCloseIndex = j;
            // Look backwards for LINK_TEXT_OPEN
            for (let k = j - 1; k >= 0; k--) {
              if (bufferCopy[k].type === TokenType.LINK_TEXT_OPEN) {
                linkStartIndex = k;
                break;
              }
            }
            break;
          }
        }
        break;
      }
    }
    
    if (linkStartIndex >= 0 && linkTextCloseIndex >= 0 && linkUrlOpenIndex >= 0) {
      // Parse the link content properly with nested formatting
      const linkTextTokens = bufferCopy.slice(linkStartIndex + 1, linkTextCloseIndex);
      const linkUrlTokens = bufferCopy.slice(linkUrlOpenIndex + 1, bufferCopy.length);
      
      // Parse URL (simple text concatenation)
      const linkUrl = linkUrlTokens
        .filter(t => t.type === TokenType.TEXT)
        .map(t => t.content)
        .join('');
      
      // Parse link text with proper nested formatting
      const linkTextChildren = this.parseInlineTokens(linkTextTokens);
      
      // Create the link node with proper children
      this.ensureParagraph();
      const linkNode: MarkdownASTNode = {
        type: 'link',
        children: linkTextChildren,
        metadata: { url: linkUrl }
      };
      
      this.getCurrentContainer().children.push(linkNode);
      
      // Remove all the consumed link tokens from the buffer
      this.bufferedTokens.splice(linkStartIndex, bufferCopy.length - linkStartIndex);
    }
    
    this.consumeBufferedToken(token);
  }
  
  private handleNewline(token: Token): void {
    if (this.state === ParserState.CODE_BLOCK) {
      // Preserve newlines in code blocks
      const codeFrame = this.findStackFrame('code_block');
      if (codeFrame) {
        if (codeFrame.node.type === 'code_block') {
          codeFrame.node.content += '\n';
        }
      }
    } else if (this.state === ParserState.HEADING) {
      // End of heading
      this.popStack();
      this.state = ParserState.DOCUMENT;
    } else if (this.state === ParserState.PARAGRAPH && this.expectingNewline) {
      // End of paragraph (double newline)
      this.finalizeParagraph();
    } else if (this.state === ParserState.PARAGRAPH) {
      // Single newline in paragraph - mark that we're expecting another
      this.expectingNewline = true;
    }
    
    // Newlines break incomplete link syntax
    this.cleanupIncompleteLinks();
    
    this.currentLine = [];
    this.consumeBufferedToken(token);
  }
  
  private handleText(token: Token): void {
    this.expectingNewline = false;
    
    // Handle different contexts
    if (this.state === ParserState.CODE_BLOCK) {
      // Add to code block content
      const codeFrame = this.findStackFrame('code_block');
      if (codeFrame) {
        if (codeFrame.node.type === 'code_block') {
          codeFrame.node.content += token.content;
        }
      }
    } else {
      // Check if there are unresolved LINK_TEXT_OPEN tokens (potential link start)
      // but allow other processing to continue for nested formatting
      const hasUnresolvedLinkStart = this.bufferedTokens.some(t => 
        t.type === TokenType.LINK_TEXT_OPEN
      );
      
      if (hasUnresolvedLinkStart) {
        // We're potentially inside a link - don't consume text tokens yet
        // but other formatting like emphasis should still be processed
        this.currentLine.push(token);
        return;
      }
      
      // Regular text content - add to AST
      // Check if we're in inline code
      const codeFrame = this.findStackFrame('code_inline');
      if (codeFrame) {
        if (codeFrame.node.type === 'code_inline') {
          codeFrame.node.content += token.content;
        }
      } else {
        // Regular text - add to current context (heading or paragraph)
        if (this.state === ParserState.HEADING || this.state === ParserState.PARAGRAPH) {
          // Don't create a new paragraph if we're already in heading/paragraph context
          if (this.state !== ParserState.HEADING) {
            this.ensureParagraph();
          }
        } else {
          this.ensureParagraph();
        }
        
        // Add text node to current container
        const textNode: MarkdownASTNode = {
          type: 'text',
          content: token.content
        };
        
        this.getCurrentContainer().children.push(textNode);
      }
    }
    
    this.currentLine.push(token);
    this.consumeBufferedToken(token);
  }
  
  private ensureParagraph(): void {
    if (this.state !== ParserState.PARAGRAPH) {
      const paragraphNode: MarkdownASTNode = {
        type: 'paragraph',
        children: []
      };
      
      this.ast.children.push(paragraphNode);
      this.pushStack('paragraph', paragraphNode);
      this.state = ParserState.PARAGRAPH;
    }
  }
  
  private finalizeParagraph(): void {
    if (this.state === ParserState.PARAGRAPH) {
      this.popStackUntil('paragraph');
      this.state = ParserState.DOCUMENT;
    }
    this.expectingNewline = false;
  }
  
  private getCurrentContainer(): MarkdownASTNode & { children: MarkdownASTNode[] } {
    if (this.stack.length > 0) {
      const topFrame = this.stack[this.stack.length - 1];
      // Only return stack nodes that have children (containers)
      if (this.isContainerFrame(topFrame)) {
        return topFrame.node;
      }
      // If the top frame is a content node (code_block, code_inline), 
      // look for the nearest container frame
      for (let i = this.stack.length - 2; i >= 0; i--) {
        const frame = this.stack[i];
        if (this.isContainerFrame(frame)) {
          return frame.node;
        }
      }
    }
    // Default to document root (which always has children)
    return this.ast;
  }

  private isContainerFrame(frame: StackFrame): frame is StackFrame & { node: MarkdownASTNode & { children: MarkdownASTNode[] } } {
    return frame.type === 'strong' || frame.type === 'emphasis' || 
           frame.type === 'link' || frame.type === 'paragraph' || 
           frame.type === 'heading';
  }
  
  private pushStack(type: StackFrame['type'], node: MarkdownASTNode, metadata?: StackFrame['metadata']): void {
    this.stack.push({ type, node, metadata });
  }
  
  private popStack(): void {
    this.stack.pop();
  }
  
  private popStackUntil(targetType: StackFrame['type']): void {
    while (this.stack.length > 0 && this.stack[this.stack.length - 1].type !== targetType) {
      this.stack.pop();
    }
    if (this.stack.length > 0 && this.stack[this.stack.length - 1].type === targetType) {
      this.stack.pop();
    }
  }
  
  private findStackFrame(type: StackFrame['type']): StackFrame | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].type === type) {
        return this.stack[i];
      }
    }
    return undefined;
  }
  
    private consumeBufferedToken(token: Token): void {
    // Remove the token from buffered tokens since it has been processed into the AST
    const index = this.bufferedTokens.findIndex(t =>
      t.type === token.type && t.content === token.content
    );
    if (index !== -1) {
      this.bufferedTokens.splice(index, 1);
    }
  }
  
  private consumeLinkTokensFromBuffer(): void {
    // Consume all link-related tokens from the buffer when a complete link is confirmed
    const linkTokenTypes = [TokenType.LINK_TEXT_OPEN, TokenType.LINK_TEXT_CLOSE, TokenType.LINK_URL_OPEN, TokenType.LINK_URL_CLOSE];
    
    this.bufferedTokens = this.bufferedTokens.filter(token => 
      !linkTokenTypes.includes(token.type)
    );
    
    // Also consume any TEXT tokens that were part of the link
    // (This is approximated - in a real implementation we'd track which specific tokens belong to the link)
  }

  private cleanupIncompleteLinks(): void {
    // Process buffered tokens as regular text since any incomplete links should become text
    for (const token of this.bufferedTokens) {
      if (token.type === TokenType.TEXT || 
          token.type === TokenType.LINK_TEXT_OPEN || 
          token.type === TokenType.LINK_TEXT_CLOSE ||
          token.type === TokenType.LINK_URL_OPEN ||
          token.type === TokenType.LINK_URL_CLOSE) {
        
        this.ensureParagraph();
        const container = this.getCurrentContainer();
        
        // Check if we can append to the last text node to avoid fragmentation
        const children = container.children || [];
        const lastChild = children[children.length - 1];
        if (lastChild && lastChild.type === 'text') {
          lastChild.content += token.content;
        } else {
          const textNode: MarkdownASTNode = {
            type: 'text',
            content: token.content
          };
          if (container.children) {
            container.children.push(textNode);
          }
        }
      }
    }
    
    // Clear all buffered tokens since we've processed them
    this.bufferedTokens = [];
  }
  
  private extractTextFromNode(node: MarkdownASTNode): string {
    if (node.type === 'text') {
      return node.content;
    } else if (node.type !== 'code_block' && node.type !== 'code_inline') {
      return node.children.map(child => this.extractTextFromNode(child)).join('');
    }
    return '';
  }

  /**
   * Parse a sequence of tokens into inline AST nodes
   * This is a proper recursive descent parser for inline elements
   */
  private parseInlineTokens(tokens: Token[]): MarkdownASTNode[] {
    const result: MarkdownASTNode[] = [];
    let i = 0;
    
    while (i < tokens.length) {
      const token = tokens[i];
      
      switch (token.type) {
        case TokenType.BOLD_DELIMITER:
          const boldResult = this.parseEmphasis(tokens, i, 'strong', TokenType.BOLD_DELIMITER);
          if (boldResult) {
            result.push(boldResult.node);
            i = boldResult.nextIndex;
          } else {
            // Treat as text if no matching delimiter
            result.push({ type: 'text', content: token.content });
            i++;
          }
          break;
          
        case TokenType.ITALIC_DELIMITER:
          const italicResult = this.parseEmphasis(tokens, i, 'emphasis', TokenType.ITALIC_DELIMITER);
          if (italicResult) {
            result.push(italicResult.node);
            i = italicResult.nextIndex;
          } else {
            // Treat as text if no matching delimiter
            result.push({ type: 'text', content: token.content });
            i++;
          }
          break;
          
        case TokenType.CODE_DELIMITER:
          const codeResult = this.parseInlineCode(tokens, i);
          if (codeResult) {
            result.push(codeResult.node);
            i = codeResult.nextIndex;
          } else {
            // Treat as text if no matching delimiter
            result.push({ type: 'text', content: token.content });
            i++;
          }
          break;
          
        case TokenType.TEXT:
          // Accumulate consecutive text tokens
          let textContent = token.content;
          let j = i + 1;
          while (j < tokens.length && tokens[j].type === TokenType.TEXT) {
            textContent += tokens[j].content;
            j++;
          }
          result.push({ type: 'text', content: textContent });
          i = j;
          break;
          
        default:
          // Handle other tokens as text (like unmatched delimiters)
          result.push({ type: 'text', content: token.content });
          i++;
          break;
      }
    }
    
    return result;
  }
  
  private parseEmphasis(tokens: Token[], startIndex: number, nodeType: 'strong' | 'emphasis', delimiterType: TokenType): { node: MarkdownASTNode; nextIndex: number } | null {
    // Look for the closing delimiter
    for (let i = startIndex + 1; i < tokens.length; i++) {
      if (tokens[i].type === delimiterType) {
        // Found matching delimiter - parse the content between them
        const innerTokens = tokens.slice(startIndex + 1, i);
        const children = this.parseInlineTokens(innerTokens);
        
        return {
          node: {
            type: nodeType,
            children
          },
          nextIndex: i + 1
        };
      }
    }
    
    // No matching delimiter found
    return null;
  }
  
  private parseInlineCode(tokens: Token[], startIndex: number): { node: MarkdownASTNode; nextIndex: number } | null {
    // Look for the closing backtick
    for (let i = startIndex + 1; i < tokens.length; i++) {
      if (tokens[i].type === TokenType.CODE_DELIMITER) {
        // Found matching delimiter - collect text content
        const innerTokens = tokens.slice(startIndex + 1, i);
        const content = innerTokens
          .filter(t => t.type === TokenType.TEXT)
          .map(t => t.content)
          .join('');
        
        return {
          node: {
            type: 'code_inline',
            content
          },
          nextIndex: i + 1
        };
      }
    }
    
    // No matching delimiter found
    return null;
  }

  private consolidateTextNodes(node: MarkdownASTNode): void {
    // Recursively consolidate text nodes in children
    if (node.type !== 'text' && node.type !== 'code_block' && node.type !== 'code_inline') {
      const children = node.children;
      const consolidated: MarkdownASTNode[] = [];
      
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        
        // Recursively consolidate this child first
        this.consolidateTextNodes(child);
        
        // Check if we can merge with the previous node
        const lastConsolidated = consolidated[consolidated.length - 1];
        if (lastConsolidated && 
            lastConsolidated.type === 'text' && 
            child.type === 'text') {
          // Merge the text content
          lastConsolidated.content += child.content;
        } else {
          // Add as new node
          consolidated.push(child);
        }
      }
      
      // Update the children array
      node.children = consolidated;
    }
  }
}
