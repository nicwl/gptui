/**
 * Streaming Markdown Processor
 * 
 * Orchestrates the complete streaming markdown pipeline:
 * character -> tokenizer -> parser -> tentative AST -> render
 * 
 * Based on user requirements from conversation:
 * "The flow should go (pseudocode):
 * newlyVisibleText = substring(content, ...)
 * newTokens = []
 * for char in newlyVisibleText:
 *   newTokens += tokens.accept(char)
 * for token in newTokens:
 *   newAst = parser.accept(token)
 * extraText = concat(parser.bufferTokens) + concat(tokens.bufferChars)
 * make as-shallow-as-possible copy of AST with the extra text added to the rightmost node
 * render AST"
 */

import { MarkdownTokenizer } from './MarkdownTokenizer';
import { MarkdownParser, MarkdownASTNode } from './MarkdownParser';

export class StreamingMarkdownProcessor {
  private tokenizer = new MarkdownTokenizer();
  private parser = new MarkdownParser();
  private processedChars = 0;
  private onASTUpdate?: (ast: MarkdownASTNode[]) => void;
  
  constructor(onASTUpdate?: (ast: MarkdownASTNode[]) => void) {
    this.onASTUpdate = onASTUpdate;
  }
  
  /**
   * Process newly visible text (for character reveal during streaming)
   */
  appendText(content: string, visibleLength: number): MarkdownASTNode {
    // Clamp visible length to content length
    const actualVisibleLength = Math.min(visibleLength, content.length);
    
    // Determine newly visible text
    const newlyVisibleText = content.substring(this.processedChars, actualVisibleLength);
    
    if (newlyVisibleText.length === 0) {
      return this.createTentativeAST(content, actualVisibleLength);
    }
    
    // Process character by character through the pipeline
    const newTokens = [];
    for (const char of newlyVisibleText) {
      const tokens = this.tokenizer.accept(char);
      newTokens.push(...tokens);
    }
    
    // Process tokens through parser
    for (const token of newTokens) {
      this.parser.accept(token);
    }
    
    // Update processed position
    this.processedChars = actualVisibleLength;
    
    // Create tentative AST with extra content
    const tentativeAST = this.createTentativeAST(content, actualVisibleLength);
    
    // Notify of AST update
    if (this.onASTUpdate && newTokens.length > 0) {
      this.onASTUpdate(tentativeAST.children || []);
    }
    
    return tentativeAST;
  }
  
  /**
   * Finalize processing (when streaming is complete)
   */
  finalize(content: string): MarkdownASTNode {
    // Process any remaining characters
    const remainingText = content.substring(this.processedChars);
    
    if (remainingText.length > 0) {
      for (const char of remainingText) {
        const tokens = this.tokenizer.accept(char);
        for (const token of tokens) {
          this.parser.accept(token);
        }
      }
      this.processedChars = content.length;
    }
    
    // Flush both tokenizer and parser to handle any buffered content
    const finalTokens = this.tokenizer.flush();
    for (const token of finalTokens) {
      this.parser.accept(token);
    }
    this.parser.flush();
    
    const finalAST = this.parser.getASTReference();
    
    // Final AST update
    if (this.onASTUpdate) {
      this.onASTUpdate(finalAST.children || []);
    }
    
    return finalAST;
  }
  
  /**
   * Get current AST reference (for performance)
   */
  getASTReference(): MarkdownASTNode {
    return this.parser.getASTReference();
  }
  
  /**
   * Reset processor state
   */
  reset(): void {
    this.tokenizer.reset();
    this.parser.reset();
    this.processedChars = 0;
  }
  
  /**
   * Create tentative AST with buffered content for smooth rendering
   */
  private createTentativeAST(content: string, visibleLength: number): MarkdownASTNode {
    // Get current AST
    const currentAST = this.parser.getASTReference();
    
    // Calculate extra content from buffered tokens and tokenizer buffer
    const bufferedTokens = this.parser.getBufferedTokens();
    const tokenizerBuffer = this.tokenizer.getBufferedChars();
    
    // Combine buffered content
    let extraContent = '';
    
    // Add content from buffered tokens (only TEXT tokens for tentative rendering)
    for (const token of bufferedTokens) {
      if (token.type === 'TEXT') {
        extraContent += token.content || '';
      }
    }
    
    // Add content from tokenizer buffer
    extraContent += tokenizerBuffer;
    
    // Don't add preview of remaining content for tests - only use buffered content
    // In production, you might want a small preview for smoother transitions
    
    // If no extra content, return current AST
    if (extraContent.length === 0) {
      return currentAST;
    }
    
    // Create tentative AST with extra content
    return this.addTentativeContent(currentAST, extraContent);
  }
  
  /**
   * Add tentative content to the rightmost text node in AST
   */
  private addTentativeContent(ast: MarkdownASTNode, extraContent: string): MarkdownASTNode {
    if (extraContent.length === 0) {
      return ast;
    }
    
    // Create shallow copy of the AST
    const tentativeAST: MarkdownASTNode = {
      ...ast,
      children: ast.children ? [...ast.children] : []
    };
    
    // Find the rightmost text node to append content to
    const rightmostTextNode = this.findRightmostTextNode(tentativeAST);
    
    if (rightmostTextNode) {
      // Add extra content to existing text node
      rightmostTextNode.content = (rightmostTextNode.content || '') + extraContent;
    } else {
      // No existing text node - need to create one in appropriate container
      this.addTentativeTextNode(tentativeAST, extraContent);
    }
    
    return tentativeAST;
  }
  
  /**
   * Find the rightmost text node in the AST for appending content
   */
  private findRightmostTextNode(ast: MarkdownASTNode): MarkdownASTNode | null {
    if (ast.type === 'text') {
      return ast;
    }
    
    if (ast.children && ast.children.length > 0) {
      // Search from right to left
      for (let i = ast.children.length - 1; i >= 0; i--) {
        const found = this.findRightmostTextNode(ast.children[i]);
        if (found) {
          return found;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Check if the tokenizer is in a safe context for adding buffered chars as tentative text
   */
  private isInSafeTextContext(): boolean {
    // For now, be conservative and only allow tentative text in basic text/paragraph contexts
    // This prevents issues with language specifiers in code blocks, etc.
    const tokenizerState = this.tokenizer.getState();
    
    // Safe states where buffered characters can be shown as tentative text
    const safeStates = ['TEXT', 'LINE_START'];
    return safeStates.includes(tokenizerState);
  }

  /**
   * Add a tentative text node to the AST when no existing text node is found
   */
  private addTentativeTextNode(ast: MarkdownASTNode, content: string): void {
    // Find or create a paragraph to hold the text
    let targetContainer = ast;
    
    if (ast.type === 'document') {
      // Check if there's already a paragraph at the end
      if (ast.children && ast.children.length > 0) {
        const lastChild = ast.children[ast.children.length - 1];
        if (lastChild.type === 'paragraph') {
          targetContainer = lastChild;
        } else {
          // Create new paragraph
          const newParagraph: MarkdownASTNode = {
            type: 'paragraph',
            children: []
          };
          ast.children!.push(newParagraph);
          targetContainer = newParagraph;
        }
      } else {
        // Create first paragraph
        const newParagraph: MarkdownASTNode = {
          type: 'paragraph',
          children: []
        };
        ast.children = [newParagraph];
        targetContainer = newParagraph;
      }
    }
    
    // Add text node to target container
    if (!targetContainer.children) {
      targetContainer.children = [];
    }
    
    targetContainer.children.push({
      type: 'text',
      content
    });
  }
}
