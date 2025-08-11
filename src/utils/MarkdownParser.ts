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

export interface MarkdownASTNode {
  type: 'document' | 'paragraph' | 'heading' | 'code_block' | 'code_inline' | 
        'strong' | 'emphasis' | 'link' | 'text';
  content?: string;
  children?: MarkdownASTNode[];
  metadata?: {
    level?: number;           // For headings (1-6)
    language?: string;        // For code blocks
    url?: string;             // For links
  };
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
    expecting?: 'link_url' | 'link_text';  // What we're expecting next for links
  };
}

export class MarkdownParser {
  private state = ParserState.DOCUMENT;
  private ast: MarkdownASTNode;
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
        // EOF is handled in flush()
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
    
    this.ast.children!.push(headingNode);
    this.pushStack('heading', headingNode);
    this.state = ParserState.HEADING;
    this.consumeBufferedToken(token);
  }
  
  private handleCodeFence(token: Token): void {
    if (this.state === ParserState.CODE_BLOCK) {
      // Closing code fence
      this.popStack();
      this.state = ParserState.DOCUMENT;
    } else {
      // Opening code fence
      this.finalizeParagraph();
      
      const codeNode: MarkdownASTNode = {
        type: 'code_block',
        content: '',
        children: [],
        metadata: { language: '' }
      };
      
      this.ast.children!.push(codeNode);
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
        content: '',
        children: []
      };
      
      this.getCurrentContainer().children!.push(codeNode);
      this.pushStack('code_inline', codeNode);
    }
    this.consumeBufferedToken(token);
  }
  
  private handleBoldDelimiter(token: Token): void {
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
      
      this.getCurrentContainer().children!.push(boldNode);
      this.pushStack('strong', boldNode);
    }
    this.consumeBufferedToken(token);
  }
  
  private handleItalicDelimiter(token: Token): void {
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
      
      this.getCurrentContainer().children!.push(italicNode);
      this.pushStack('emphasis', italicNode);
    }
    this.consumeBufferedToken(token);
  }
  
  private handleLinkTextOpen(token: Token): void {
    this.ensureParagraph();
    
    const linkNode: MarkdownASTNode = {
      type: 'link',
      children: [],
      metadata: { url: '' }
    };
    
    this.getCurrentContainer().children!.push(linkNode);
    this.pushStack('link', linkNode, { expecting: 'link_text' });
    this.consumeBufferedToken(token);
  }
  
  private handleLinkTextClose(token: Token): void {
    const linkFrame = this.findStackFrame('link');
    if (linkFrame && linkFrame.metadata?.expecting === 'link_text') {
      linkFrame.metadata.expecting = 'link_url';
    }
    this.consumeBufferedToken(token);
  }
  
  private handleLinkUrlOpen(token: Token): void {
    const linkFrame = this.findStackFrame('link');
    if (linkFrame && linkFrame.metadata?.expecting === 'link_url') {
      // Start collecting URL content
      linkFrame.metadata.url = '';
    }
    this.consumeBufferedToken(token);
  }
  
  private handleLinkUrlClose(token: Token): void {
    const linkFrame = this.findStackFrame('link');
    if (linkFrame && linkFrame.metadata?.expecting === 'link_url') {
      // Finalize link
      linkFrame.node.metadata!.url = linkFrame.metadata.url || '';
      this.popStackUntil('link');
    }
    this.consumeBufferedToken(token);
  }
  
  private handleNewline(token: Token): void {
    if (this.state === ParserState.HEADING) {
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
        if (codeFrame.node.content) {
          codeFrame.node.content += token.content;
        } else {
          codeFrame.node.content = token.content;
        }
      }
    } else {
      // Regular text content - need to determine the right container
      
      // Check if we're in a link URL
      const linkFrame = this.findStackFrame('link');
      if (linkFrame && linkFrame.metadata?.expecting === 'link_url') {
        linkFrame.metadata.url = (linkFrame.metadata.url || '') + token.content;
      } else {
        // Check if we're in inline code
        const codeFrame = this.findStackFrame('code_inline');
        if (codeFrame) {
          if (codeFrame.node.content) {
            codeFrame.node.content += token.content;
          } else {
            codeFrame.node.content = token.content;
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
          
          this.getCurrentContainer().children!.push(textNode);
        }
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
      
      this.ast.children!.push(paragraphNode);
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
  
  private getCurrentContainer(): MarkdownASTNode {
    if (this.stack.length > 0) {
      return this.stack[this.stack.length - 1].node;
    }
    return this.ast;
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
    // Only consume tokens that have been fully processed into the AST
    // For now, we'll keep tokens buffered until flush() to match the expected behavior
    // This allows the tentative rendering system to work properly
  }
}
