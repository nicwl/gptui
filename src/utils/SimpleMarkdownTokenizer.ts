/**
 * Simple character-based tokenizer for streaming markdown
 * 
 * Philosophy: Just emit basic character tokens, let the parser determine meaning
 * - No semantic interpretation (no BOLD_DELIMITER, just ASTERISK tokens)
 * - Character-by-character processing
 * - Stateless between calls (except for text buffering)
 * - Parser determines if * means emphasis, if - + space means list, etc.
 */

export enum TokenType {
  // Basic character tokens
  ASTERISK = 'ASTERISK',                     // *
  DOUBLE_ASTERISK = 'DOUBLE_ASTERISK',       // **
  TRIPLE_ASTERISK = 'TRIPLE_ASTERISK',       // ***
  UNDERSCORE = 'UNDERSCORE',                 // _
  DOUBLE_UNDERSCORE = 'DOUBLE_UNDERSCORE',   // __
  TRIPLE_UNDERSCORE = 'TRIPLE_UNDERSCORE',   // ___
  HASH_SEQUENCE = 'HASH_SEQUENCE',           // ### (one token for consecutive hashes)
  DASH = 'DASH',                             // -
  PLUS = 'PLUS',                             // +
  BACKTICK = 'BACKTICK',                     // `
  TRIPLE_BACKTICK = 'TRIPLE_BACKTICK',       // ```
  HASH = 'HASH',                             // #
  BRACKET_OPEN = 'BRACKET_OPEN',             // [
  BRACKET_CLOSE = 'BRACKET_CLOSE',           // ]
  PAREN_OPEN = 'PAREN_OPEN',                 // (
  PAREN_CLOSE = 'PAREN_CLOSE',               // )
  TILDE = 'TILDE',                           // ~
  DOUBLE_TILDE = 'DOUBLE_TILDE',             // ~~
  
  // Structural tokens
  NEWLINE = 'NEWLINE',                       // \n
  SPACE = 'SPACE',                           // space
  TAB = 'TAB',                               // tab
  GREATER = 'GREATER',                        // > (blockquote)
  
  // Content
  TEXT = 'TEXT',                             // Regular text content
  DIGIT_SEQUENCE = 'DIGIT_SEQUENCE',         // 123, 42, etc.
  PERIOD = 'PERIOD',                         // .
  
  // Special
  EOF = 'EOF'                                // End of input
}

export interface Token {
  type: TokenType;
  content: string;
  position: number;
}

export class MarkdownTokenizer {
  private position = 0;
  private charBuffer = '';
  private digitBuffer = '';
  private specialBuffer = '';
  private hashRun = 0;
  // Track consecutive backslashes. Pairs become one literal backslash; an odd
  // trailing backslash escapes the following special character.
  private pendingBackslashes = 0;

  accept(char: string): Token[] {
    this.position++;
    const tokens: Token[] = [];

    // Handle backslashes and escaping (count consecutive backslashes)
    if (char === '\\') {
      // Flush pending hash sequence or special buffer before handling escape state
      if (this.hashRun > 0) {
        tokens.push({ type: TokenType.HASH_SEQUENCE, content: '#'.repeat(this.hashRun), position: this.position - this.hashRun - 1 });
        this.hashRun = 0;
      }
      if (this.specialBuffer.length > 0) {
        this.emitSpecialBuffer(tokens);
        this.specialBuffer = '';
      }
      this.pendingBackslashes += 1;
      return tokens;
    }

    const isDigit = char >= '0' && char <= '9';
    let isSpecial = this.isSpecialChar(char);

    // If we have pending backslashes, resolve them now based on the next char
    if (this.pendingBackslashes > 0) {
      const isSpec = isSpecial;
      if (isSpec) {
        // Pairs become literal backslashes; odd one escapes the special (no extra backslash)
        const pairs = Math.floor(this.pendingBackslashes / 2);
        if (pairs > 0) this.charBuffer += '\\'.repeat(pairs);
        if (this.pendingBackslashes % 2 === 1) {
          // Escape the special char into text
          if (this.digitBuffer.length > 0) { tokens.push(this.createDigitSequenceToken(this.digitBuffer)); this.digitBuffer = ''; }
          this.charBuffer += char;
          this.pendingBackslashes = 0;
          return tokens;
        }
        // Even count: no escaping; fall through to handle current special normally
        this.pendingBackslashes = 0;
      } else {
        // Before a non-special, pairs collapse and a leftover odd is a literal backslash as well
        const toEmit = Math.ceil(this.pendingBackslashes / 2);
        if (toEmit > 0) this.charBuffer += '\\'.repeat(toEmit);
        this.pendingBackslashes = 0;
        // continue processing current non-special char normally below
      }
    }
    
    // Flush buffers when transitioning between different token types
    if (this.digitBuffer.length > 0 && !isDigit) {
      tokens.push(this.createDigitSequenceToken(this.digitBuffer));
      this.digitBuffer = '';
    }
    
    if (this.charBuffer.length > 0 && (isSpecial || isDigit)) {
      tokens.push(this.createTextToken(this.charBuffer));
      this.charBuffer = '';
    }
    
    // Handle special characters
    if (isSpecial) {
      // If current special char cannot combine with existing special buffer, flush buffer first
      if (this.specialBuffer.length > 0) {
        const last = this.specialBuffer[this.specialBuffer.length - 1];
        const combinable = (last === char) && (char === '#' || char === '`' || char === '*' || char === ' ' || char === '_' || char === '~');
        if (!combinable) {
          this.emitSpecialBuffer(tokens);
          this.specialBuffer = '';
        }
      }
      if (char === '#') {
        // Flush other specials before starting/continuing a hash run
        if (this.specialBuffer.length > 0) { this.emitSpecialBuffer(tokens); this.specialBuffer = ''; }
        this.hashRun += 1;
        return tokens;
      }
      // If a non-# arrives and we had a hash run, emit it
      if (this.hashRun > 0) {
        tokens.push({ type: TokenType.HASH_SEQUENCE, content: '#'.repeat(this.hashRun), position: this.position - this.hashRun - 1 });
        this.hashRun = 0;
      }
      // Add to special buffer and check for multi-char sequences
      this.specialBuffer += char;
      const multiCharToken = this.tryCreateMultiCharToken();
      if (multiCharToken) { tokens.push(multiCharToken); this.specialBuffer = ''; }
    } else if (isDigit) {
      // Flush any pending special chars first
      if (this.hashRun > 0) { tokens.push({ type: TokenType.HASH_SEQUENCE, content: '#'.repeat(this.hashRun), position: this.position - this.hashRun - 1 }); this.hashRun = 0; }
      if (this.specialBuffer.length > 0) { this.emitSpecialBuffer(tokens); this.specialBuffer = ''; }
      this.digitBuffer += char;
    } else {
      // Flush any pending special chars first
      if (this.hashRun > 0) { tokens.push({ type: TokenType.HASH_SEQUENCE, content: '#'.repeat(this.hashRun), position: this.position - this.hashRun - 1 }); this.hashRun = 0; }
      if (this.specialBuffer.length > 0) { this.emitSpecialBuffer(tokens); this.specialBuffer = ''; }
      
      // Buffer non-special, non-digit characters as text
      this.charBuffer += char;
    }
    
    return tokens;
  }
  
  flush(): Token[] {
    const tokens: Token[] = [];
    
    // Emit any buffered digits
    if (this.digitBuffer.length > 0) {
      tokens.push(this.createDigitSequenceToken(this.digitBuffer));
      this.digitBuffer = '';
    }
    
    // Resolve any trailing backslashes at EOF
    if (this.pendingBackslashes > 0) {
      const toEmit = Math.ceil(this.pendingBackslashes / 2);
      if (toEmit > 0) this.charBuffer += '\\'.repeat(toEmit);
      this.pendingBackslashes = 0;
    }

    // Emit any buffered special chars
    if (this.hashRun > 0) { tokens.push({ type: TokenType.HASH_SEQUENCE, content: '#'.repeat(this.hashRun), position: this.position - this.hashRun }); this.hashRun = 0; }
    if (this.specialBuffer.length > 0) { this.emitSpecialBuffer(tokens); this.specialBuffer = ''; }
    
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

  private emitSpecialBuffer(tokens: Token[]) {
    if (this.specialBuffer.length === 0) return;
    if (/^#+$/.test(this.specialBuffer)) {
      tokens.push({ type: TokenType.HASH_SEQUENCE, content: this.specialBuffer, position: this.position - this.specialBuffer.length - 1 });
      return;
    }
    if (this.specialBuffer === '***') {
      tokens.push({ type: TokenType.TRIPLE_ASTERISK, content: '***', position: this.position - 3 });
      return;
    }
    if (this.specialBuffer === '**') {
      tokens.push({ type: TokenType.DOUBLE_ASTERISK, content: '**', position: this.position - 2 });
      return;
    }
    if (this.specialBuffer === '___') {
      tokens.push({ type: TokenType.TRIPLE_UNDERSCORE, content: '___', position: this.position - 3 });
      return;
    }
    if (this.specialBuffer === '__') {
      tokens.push({ type: TokenType.DOUBLE_UNDERSCORE, content: '__', position: this.position - 2 });
      return;
    }
    if (this.specialBuffer === '```') {
      tokens.push({ type: TokenType.TRIPLE_BACKTICK, content: '```', position: this.position - 3 });
      return;
    }
    if (this.specialBuffer === '~~') {
      tokens.push({ type: TokenType.DOUBLE_TILDE, content: '~~', position: this.position - 2 });
      return;
    }
    if (/^#+\s+$/.test(this.specialBuffer)) {
      const hashes = this.specialBuffer.replace(/\s+$/,'');
      const spaces = this.specialBuffer.slice(hashes.length);
      if (hashes.length > 0) tokens.push({ type: TokenType.HASH_SEQUENCE, content: hashes, position: this.position - this.specialBuffer.length - 1 });
      for (const ch of spaces) tokens.push(this.createCharToken(ch));
      return;
    }
    for (const c of this.specialBuffer) tokens.push(this.createCharToken(c));
  }
  
  reset(): void {
    this.position = 0;
    this.charBuffer = '';
    this.digitBuffer = '';
    this.specialBuffer = '';
    this.hashRun = 0;
    this.pendingBackslashes = 0;
  }

  /**
   * Expose currently buffered characters for tentative rendering during streaming
   * This intentionally includes any partially accumulated text, digit sequences,
   * and special characters that have not yet formed a complete token.
   */
  getBufferedChars(): string {
    const pending = this.pendingBackslashes > 0 ? '\\'.repeat(this.pendingBackslashes) : '';
    return this.charBuffer + this.digitBuffer + this.specialBuffer + pending;
  }
  
  private isSpecialChar(char: string): boolean {
    return char === '*' || char === '-' || char === '+' || char === '`' || 
           char === '#' || char === '[' || char === ']' || char === '(' || 
           char === ')' || char === '\n' || char === ' ' || char === '\t' ||
           char === '.' || char === '>' || char === '_' || char === '~';
  }
  
  private createCharToken(char: string): Token {
    let type: TokenType;
    
    switch (char) {
      case '*': type = TokenType.ASTERISK; break;
      case '-': type = TokenType.DASH; break;
      case '+': type = TokenType.PLUS; break;
      case '`': type = TokenType.BACKTICK; break;
      case '#': type = TokenType.HASH; break;
      case '[': type = TokenType.BRACKET_OPEN; break;
      case ']': type = TokenType.BRACKET_CLOSE; break;
      case '(': type = TokenType.PAREN_OPEN; break;
      case ')': type = TokenType.PAREN_CLOSE; break;
      case '\n': type = TokenType.NEWLINE; break;
      case ' ': type = TokenType.SPACE; break;
      case '\t': type = TokenType.TAB; break;
      case '.': type = TokenType.PERIOD; break;
      case '>': type = TokenType.GREATER; break;
      case '_': type = TokenType.UNDERSCORE; break;
      case '~': type = TokenType.TILDE; break;
      default:
        type = TokenType.TEXT;
        break;
    }
    
    return {
      type,
      content: char,
      position: this.position - 1
    };
  }
  
  private createTextToken(content: string): Token {
    return {
      type: TokenType.TEXT,
      content,
      position: this.position - content.length
    };
  }
  
  private createDigitSequenceToken(content: string): Token {
    return {
      type: TokenType.DIGIT_SEQUENCE,
      content,
      position: this.position - content.length
    };
  }
  
  private tryCreateMultiCharToken(): Token | null {
    switch (this.specialBuffer) {
      case '***':
        return {
          type: TokenType.TRIPLE_ASTERISK,
          content: '***',
          position: this.position - 3
        };
      case '**':
        // Defer emitting '**' to allow forming a '***'
        return null;
      case '___':
        return {
          type: TokenType.TRIPLE_UNDERSCORE,
          content: '___',
          position: this.position - 3
        };
      case '__':
        // Defer emitting '__' to allow forming a '___'
        return null;
      case '```':
        return {
          type: TokenType.TRIPLE_BACKTICK,
          content: '```',
          position: this.position - 3
        };
      case '~~':
        return {
          type: TokenType.DOUBLE_TILDE,
          content: '~~',
          position: this.position - 2
        };
      default:
        return null;
    }
  }
}
