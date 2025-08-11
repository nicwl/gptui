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
import { MarkdownParser, MarkdownASTNode, hasContent, hasChildren } from './MarkdownParser';

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
    
    if (newlyVisibleText.length === 0 ) {
        return this.createTentativeAST();
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
    const tentativeAST = this.createTentativeAST();
    
    // Notify of AST update
    if (this.onASTUpdate && newTokens.length > 0) {
      this.onASTUpdate(tentativeAST.type === 'document' ? tentativeAST.children : []);
    }
    // console.log('🔥tentativeAST',tentativeAST);
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
      this.onASTUpdate(finalAST.type === 'document' ? finalAST.children : []);
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
  private createTentativeAST(): MarkdownASTNode {
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
   * Create tentative AST with extra content, copying only the minimal path needed
   */
  private createTentativeASTWithContent(ast: MarkdownASTNode, extraContent: string): MarkdownASTNode {
    // If it's a text node, create a copy with the extra content
    if (ast.type === 'text') {
      return {
        ...ast,
        content: ast.content + extraContent
      };
    }
    
    // If it's a content node (but not text), wrap it
    if (ast.type === 'code_block' || ast.type === 'code_inline') {
      // For content nodes, we need to create a proper container
      return {
        type: 'document',
        children: [{
          type: 'text',
          content: ast.content + extraContent
        }]
      } satisfies MarkdownASTNode;
    }

    // Now we know it's a container node
    if (ast.children.length === 0) {
      return {
        ...ast,
        children: [{
          type: 'text',
          content: extraContent
        }]
      } satisfies MarkdownASTNode;
    }

    // Find the rightmost child and create tentative version
    const children = [...ast.children];
    const lastChild = children[children.length - 1];
    
    // Recursively handle the last child
    children[children.length - 1] = this.createTentativeASTWithContent(lastChild, extraContent);
    
    return {
      ...ast,
      children
    } satisfies MarkdownASTNode;
  }

  /**
   * Add tentative content to the rightmost text node in AST
   */
  private addTentativeContent(ast: MarkdownASTNode, extraContent: string): MarkdownASTNode {
    if (extraContent.length === 0) {
      return ast;
    }
    
    // Create a shallow copy of the root and copy only the path to the rightmost text node
    const tentativeAST = this.createTentativeASTWithContent(ast, extraContent);
    
    return tentativeAST;
  }
}
