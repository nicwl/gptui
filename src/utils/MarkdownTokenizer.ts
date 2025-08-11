/**
 * Character-based state machine tokenizer for streaming markdown
 * 
 * Based on practical streaming grammar (see MarkdownGrammar.md):
 * - Left-to-right parsing suitable for streaming
 * - Greedy tokenization - commit to tokens ASAP
 * - Context-sensitive disambiguation with simple rules
 * - Focus on core cases: **bold**, *italic*, `code`, [links](url), # headings
 * 
 * Design principles:
 * - Pure state machine, no regex
 * - Character-by-character processing
 * - Stateful between calls
 * - Flush method for EOF
 * - No knowledge of parser or rendering
 */

export enum TokenType {
  // Inline formatting delimiters
  BOLD_DELIMITER = 'BOLD_DELIMITER',         // **
  ITALIC_DELIMITER = 'ITALIC_DELIMITER',     // *
  CODE_DELIMITER = 'CODE_DELIMITER',         // `
  
  // Link tokens
  LINK_TEXT_OPEN = 'LINK_TEXT_OPEN',         // [
  LINK_TEXT_CLOSE = 'LINK_TEXT_CLOSE',       // ]
  LINK_URL_OPEN = 'LINK_URL_OPEN',           // (
  LINK_URL_CLOSE = 'LINK_URL_CLOSE',         // )
  
  // Block structure tokens
  ATX_HEADING = 'ATX_HEADING',               // # ## ### etc.
  SETEXT_UNDERLINE = 'SETEXT_UNDERLINE',     // === or ---
  CODE_FENCE = 'CODE_FENCE',                 // ``` or ~~~
  BLOCKQUOTE_MARKER = 'BLOCKQUOTE_MARKER',   // >
  LIST_MARKER = 'LIST_MARKER',               // -, *, +, 1., a., etc.
  TABLE_DELIMITER = 'TABLE_DELIMITER',       // |
  HORIZONTAL_RULE = 'HORIZONTAL_RULE',       // --- *** ___
  
  // Structural tokens
  NEWLINE = 'NEWLINE',                       // \n
  INDENT = 'INDENT',                         // 4 spaces or tab
  SPACE = 'SPACE',                           // significant whitespace
  
  // Content
  TEXT = 'TEXT',                             // Regular text content
  CODE_CONTENT = 'CODE_CONTENT',             // Content inside code blocks
  
  // Special
  EOF = 'EOF'                                // End of input
}

export interface Token {
  type: TokenType;
  content: string;
  position: number;
  metadata?: {
    level?: number;           // For headings (1-6)
    listType?: 'ordered' | 'unordered';
    listMarker?: string;      // The actual marker (1., a., -, etc.)
    indentLevel?: number;     // For nested lists
    language?: string;        // For code fences
    alignment?: 'left' | 'center' | 'right';  // For table columns
    fenceChar?: string;       // ` or ~ for code fences
  };
}

enum TokenizerState {
  LINE_START,               // Beginning of line - determines block type
  TEXT,                     // Default state, accumulating text content
  
  // Emphasis states
  EMPHASIS_SINGLE,          // Seen single *, determining context
  
  // Heading states  
  ATX_HASH_SEQUENCE,        // Building ATX heading level (# ## ###)
  SETEXT_UNDERLINE,         // Checking for setext underline (=== or ---)
  
  // List states
  LIST_MARKER_BUILD,        // Building list marker (1., a., -, etc.)
  
  // Code states
  BACKTICK,                 // Seen single `, inline code delimiter
  CODE_FENCE_BACKTICKS,     // Building ``` code fence
  CODE_FENCE_TILDES,        // Building ~~~ code fence
  CODE_FENCE_LANG,          // Reading language specifier after fence
  CODE_BLOCK_CONTENT,       // Inside fenced code block
  
  // Link states
  BRACKET,                  // Seen [, potential link start
  
  // Block quote state
  BLOCKQUOTE,               // Processing content after >
  
  // Table state
  TABLE_CELL,               // Inside table cell content
  
  // Horizontal rule state
  HORIZONTAL_RULE_DASHES,   // Building --- horizontal rule
  HORIZONTAL_RULE_STARS,    // Building *** horizontal rule
  HORIZONTAL_RULE_UNDERSCORES, // Building ___ horizontal rule
}

export class MarkdownTokenizer {
  private state = TokenizerState.LINE_START;
  private position = 0;
  private lineStart = true;
  private linePosition = 0; // Position within current line
  
  // Character buffer for building tokens
  private charBuffer = '';
  
  // State-specific counters and flags
  private hashCount = 0;
  private backtickCount = 0;
  private tildeCount = 0;
  private dashCount = 0;
  private starCount = 0;
  private underscoreCount = 0;
  private spaceCount = 0;
  private inCodeBlock = false;
  private codeFenceType = ''; // 'backtick' or 'tilde'
  private codeLanguage = '';
  
  // List tracking
  private currentListMarker = '';
  private digitSequence = '';
  
  // Previous line content for setext heading detection
  private previousLineContent = '';
  
  /**
   * Accept a single character and return any complete tokens
   */
  accept(char: string): Token[] {
    const tokens: Token[] = [];
    this.position++;
    
    switch (this.state) {
      case TokenizerState.LINE_START:
        tokens.push(...this.handleLineStartState(char));
        break;
        
      case TokenizerState.TEXT:
        tokens.push(...this.handleTextState(char));
        break;
        
      case TokenizerState.EMPHASIS_SINGLE:
        tokens.push(...this.handleEmphasisSingleState(char));
        break;
        
      case TokenizerState.ATX_HASH_SEQUENCE:
        tokens.push(...this.handleHashSequenceState(char));
        break;
        
      case TokenizerState.BACKTICK:
        tokens.push(...this.handleBacktickState(char));
        break;
        
      case TokenizerState.CODE_FENCE_BACKTICKS:
        tokens.push(...this.handleCodeFenceBackticksState(char));
        break;
        
      case TokenizerState.CODE_FENCE_LANG:
        tokens.push(...this.handleCodeFenceLangState(char));
        break;
        
      case TokenizerState.CODE_BLOCK_CONTENT:
        tokens.push(...this.handleCodeBlockContentState(char));
        break;
        
      case TokenizerState.BRACKET:
        tokens.push(...this.handleBracketState(char));
        break;
    }
    
    // Update line tracking
    if (char === '\n') {
      this.lineStart = true;
      this.linePosition = 0;
      // Save previous line content for setext heading detection
      this.previousLineContent = this.charBuffer;
    } else {
      this.linePosition++;
      if (char !== ' ' && char !== '\t') {
        this.lineStart = false;
      }
    }
    
    return tokens;
  }
  
  /**
   * Signal end of input and return any remaining tokens
   */
  flush(): Token[] {
    const tokens: Token[] = [];
    
    // Handle any pending state
    switch (this.state) {
      case TokenizerState.EMPHASIS_SINGLE:
        // Single asterisk at end - emit as italic delimiter
        tokens.push({
          type: TokenType.ITALIC_DELIMITER,
          content: '*',
          position: this.position - 1
        });
        break;
        
      case TokenizerState.ATX_HASH_SEQUENCE:
        // Hash sequence without space - treat as text
        if (this.hashCount > 0) {
          this.charBuffer = '#'.repeat(this.hashCount) + this.charBuffer;
        }
        break;
        
      case TokenizerState.BACKTICK:
        // Single backtick at end - emit as code delimiter
        tokens.push({
          type: TokenType.CODE_DELIMITER,
          content: '`',
          position: this.position - 1
        });
        break;
        
      case TokenizerState.CODE_FENCE_BACKTICKS:
        // Incomplete code fence - treat as text
        if (this.backtickCount > 0) {
          this.charBuffer = '`'.repeat(this.backtickCount) + this.charBuffer;
        }
        break;
        
      case TokenizerState.CODE_FENCE_LANG:
        // Language specifier without newline - save what we have
        if (this.charBuffer.length > 0) {
          this.codeLanguage = this.charBuffer.trim();
        }
        break;
        
      case TokenizerState.CODE_BLOCK_CONTENT:
        // Code content at end - emit as code content
        if (this.charBuffer.length > 0) {
          tokens.push({
            type: TokenType.CODE_CONTENT,
            content: this.charBuffer,
            position: this.position - this.charBuffer.length
          });
          this.charBuffer = '';
        }
        break;
        
      case TokenizerState.BRACKET:
        // Bracket at end - emit as link text open
        tokens.push({
          type: TokenType.LINK_TEXT_OPEN,
          content: '[',
          position: this.position - 1
        });
        break;
    }
    
    // Emit any buffered text
    if (this.charBuffer.length > 0) {
      tokens.push(this.createTextToken(this.charBuffer));
      this.charBuffer = '';
    }
    
    // Emit EOF token
    tokens.push({
      type: TokenType.EOF,
      content: '',
      position: this.position
    });
    
    return tokens;
  }
  
  /**
   * Get buffered characters that haven't been emitted as tokens yet
   */
  getBufferedChars(): string {
    return this.charBuffer;
  }

  /**
   * Get current tokenizer state (for tentative rendering decisions)
   */
  getState(): string {
    return TokenizerState[this.state];
  }
  
  /**
   * Reset tokenizer state
   */
  reset(): void {
    this.state = TokenizerState.LINE_START;
    this.position = 0;
    this.lineStart = true;
    this.linePosition = 0;
    this.charBuffer = '';
    this.hashCount = 0;
    this.backtickCount = 0;
    this.tildeCount = 0;
    this.dashCount = 0;
    this.starCount = 0;
    this.underscoreCount = 0;
    this.spaceCount = 0;
    this.inCodeBlock = false;
    this.codeFenceType = '';
    this.codeLanguage = '';
    this.currentListMarker = '';
    this.digitSequence = '';
    this.previousLineContent = '';
  }
  
  private handleLineStartState(char: string): Token[] {
    const tokens: Token[] = [];
    
    // If we're inside a code block, handle specially
    if (this.inCodeBlock) {
      this.state = TokenizerState.CODE_BLOCK_CONTENT;
      tokens.push(...this.handleCodeBlockContentState(char));
      return tokens;
    }
    
    if (char === '#') {
      this.state = TokenizerState.ATX_HASH_SEQUENCE;
      this.hashCount = 1;
    } else {
      // For any other character (including `), switch to text state and process normally
      // This allows inline code to work while still allowing fenced code blocks to be
      // detected when there are 3+ backticks at the start of a line
      this.state = TokenizerState.TEXT;
      tokens.push(...this.handleTextState(char));
    }
    
    return tokens;
  }
  
  private handleTextState(char: string): Token[] {
    const tokens: Token[] = [];
    
    switch (char) {
      case '*':
        // Emit any buffered text before asterisk
        if (this.charBuffer.length > 0) {
          tokens.push(this.createTextToken(this.charBuffer));
          this.charBuffer = '';
        }
        this.state = TokenizerState.EMPHASIS_SINGLE;
        break;
        
      case '`':
        // Emit any buffered text before backtick
        if (this.charBuffer.length > 0) {
          tokens.push(this.createTextToken(this.charBuffer));
          this.charBuffer = '';
        }
        this.state = TokenizerState.BACKTICK;
        break;
        
      case '[':
        // Emit any buffered text before bracket
        if (this.charBuffer.length > 0) {
          tokens.push(this.createTextToken(this.charBuffer));
          this.charBuffer = '';
        }
        this.state = TokenizerState.BRACKET;
        break;
        
      case ']':
        // Always emit bracket close
        if (this.charBuffer.length > 0) {
          tokens.push(this.createTextToken(this.charBuffer));
          this.charBuffer = '';
        }
        tokens.push({
          type: TokenType.LINK_TEXT_CLOSE,
          content: ']',
          position: this.position - 1
        });
        break;
        
      case '(':
        // Could be URL open if after ]
        if (this.charBuffer.length > 0) {
          tokens.push(this.createTextToken(this.charBuffer));
          this.charBuffer = '';
        }
        tokens.push({
          type: TokenType.LINK_URL_OPEN,
          content: '(',
          position: this.position - 1
        });
        break;
        
      case ')':
        // Always emit paren close
        if (this.charBuffer.length > 0) {
          tokens.push(this.createTextToken(this.charBuffer));
          this.charBuffer = '';
        }
        tokens.push({
          type: TokenType.LINK_URL_CLOSE,
          content: ')',
          position: this.position - 1
        });
        break;
        
      case '\n':
        // Emit any buffered text before newline
        if (this.charBuffer.length > 0) {
          tokens.push(this.createTextToken(this.charBuffer));
          this.charBuffer = '';
        }
        tokens.push({
          type: TokenType.NEWLINE,
          content: '\n',
          position: this.position - 1
        });
        this.state = TokenizerState.LINE_START;
        break;
        
      default:
        this.charBuffer += char;
        break;
    }
    
    return tokens;
  }
  
  private handleEmphasisSingleState(char: string): Token[] {
    const tokens: Token[] = [];
    
    if (char === '*') {
      // Double asterisk - bold delimiter
      tokens.push({
        type: TokenType.BOLD_DELIMITER,
        content: '**',
        position: this.position - 2
      });
      this.state = TokenizerState.TEXT;
    } else {
      // Single asterisk - italic delimiter
      tokens.push({
        type: TokenType.ITALIC_DELIMITER,
        content: '*',
        position: this.position - 2
      });
      this.state = TokenizerState.TEXT;
      
      // Process current character in text state
      tokens.push(...this.handleTextState(char));
    }
    
    return tokens;
  }
  
  private handleHashSequenceState(char: string): Token[] {
    const tokens: Token[] = [];
    
    if (char === '#' && this.hashCount < 6) {
      this.hashCount++;
    } else if (char === ' ' || char === '\t') {
      // End of hash sequence, start of heading content
      tokens.push({
        type: TokenType.ATX_HEADING,
        content: '#'.repeat(this.hashCount),
        position: this.position - this.hashCount - 1,
        metadata: { level: this.hashCount }
      });
      this.state = TokenizerState.TEXT;
      this.hashCount = 0;
    } else {
      // Not a heading, treat as regular text
      this.charBuffer = '#'.repeat(this.hashCount) + char;
      this.state = TokenizerState.TEXT;
      this.hashCount = 0;
    }
    
    return tokens;
  }
  
  private handleBacktickState(char: string): Token[] {
    const tokens: Token[] = [];
    
    if (char === '`' && this.linePosition <= 2) {
      // Potential fenced code block - switch to fence state
      this.state = TokenizerState.CODE_FENCE_BACKTICKS;
      this.backtickCount = 2; // We already had one, now we have two
    } else {
      // Single backtick - inline code delimiter
      tokens.push({
        type: TokenType.CODE_DELIMITER,
        content: '`',
        position: this.position - 2
      });
      this.state = TokenizerState.TEXT;
      
      // Process current character in text state
      tokens.push(...this.handleTextState(char));
    }
    
    return tokens;
  }
  
  private handleBracketState(char: string): Token[] {
    const tokens: Token[] = [];
    
    // Always emit link text open token
    tokens.push({
      type: TokenType.LINK_TEXT_OPEN,
      content: '[',
      position: this.position - 2
    });
    this.state = TokenizerState.TEXT;
    
    // Process current character in text state
    tokens.push(...this.handleTextState(char));
    
    return tokens;
  }
  
  private handleCodeFenceBackticksState(char: string): Token[] {
    const tokens: Token[] = [];
    
    if (char === '`') {
      this.backtickCount++;
      
      // Check if we have enough backticks for a fence
      if (this.backtickCount >= 3) {
        // We have a valid code fence
        const fenceContent = '`'.repeat(this.backtickCount);
        tokens.push({
          type: TokenType.CODE_FENCE,
          content: fenceContent,
          position: this.position - this.backtickCount,
          metadata: { fenceChar: '`' }
        });
        
        if (this.inCodeBlock) {
          // Closing fence
          this.inCodeBlock = false;
          this.codeFenceType = '';
          this.state = TokenizerState.TEXT;
        } else {
          // Opening fence - need to check if there's a language specifier
          this.inCodeBlock = true;
          this.codeFenceType = 'backtick';
          this.state = TokenizerState.CODE_FENCE_LANG; // Always go to language state first
        }
        
        this.backtickCount = 0;
      }
    } else {
      // Not a valid fence, treat as regular backticks + text
      this.charBuffer = '`'.repeat(this.backtickCount) + char;
      this.state = TokenizerState.TEXT;
      this.backtickCount = 0;
    }
    
    return tokens;
  }
  
  private handleCodeFenceLangState(char: string): Token[] {
    const tokens: Token[] = [];
    
    if (char === '\n') {
      // End of language specifier line
      if (this.charBuffer.length > 0) {
        this.codeLanguage = this.charBuffer.trim();
        this.charBuffer = '';
      }
      tokens.push({
        type: TokenType.NEWLINE,
        content: '\n',
        position: this.position - 1
      });
      this.state = TokenizerState.LINE_START;
    } else {
      // Accumulate language specifier
      this.charBuffer += char;
    }
    
    return tokens;
  }
  
  private handleCodeBlockContentState(char: string): Token[] {
    const tokens: Token[] = [];
    
    if (char === '`') {
      // Potential closing fence (remove lineStart check temporarily for debugging)
      this.state = TokenizerState.CODE_FENCE_BACKTICKS;
      this.backtickCount = 1;
    } else if (char === '\n') {
      // Emit any buffered code content
      if (this.charBuffer.length > 0) {
        tokens.push({
          type: TokenType.CODE_CONTENT,
          content: this.charBuffer,
          position: this.position - this.charBuffer.length
        });
        this.charBuffer = '';
      }
      tokens.push({
        type: TokenType.NEWLINE,
        content: '\n',
        position: this.position - 1
      });
      this.state = TokenizerState.LINE_START;
    } else {
      // Accumulate code content
      this.charBuffer += char;
    }
    
    return tokens;
  }

  private createTextToken(content: string): Token {
    return {
      type: TokenType.TEXT,
      content,
      position: this.position - content.length
    };
  }
}