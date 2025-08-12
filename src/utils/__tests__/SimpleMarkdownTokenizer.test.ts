/**
 * Tests for SimpleMarkdownTokenizer
 * Basic character-level tokenization for streaming markdown
 */

import { MarkdownTokenizer, TokenType } from '../SimpleMarkdownTokenizer';

describe('SimpleMarkdownTokenizer', () => {
  let tokenizer: MarkdownTokenizer;

  beforeEach(() => {
    tokenizer = new MarkdownTokenizer();
  });

  describe('Backslash escaping and special character interactions', () => {
    test('backslash before non-special is ordinary backslash: "C:\\Program" -> single TEXT', () => {
      const text = String.raw`C:\Program`;
      const tokens: any[] = [];
      for (const ch of text) tokens.push(...tokenizer.accept(ch));
      tokens.push(...tokenizer.flush());
      expect(tokens[0].type).toBe(TokenType.TEXT);
      expect(tokens[0].content).toBe(String.raw`C:\Program`);
      expect(tokens).toHaveLength(2); // TEXT + EOF
    });

    test('two adjacent backslashes collapse to one ordinary backslash: tokenized same as single', () => {
      const text1 = String.raw`C:\Program`;
      const text2 = String.raw`C:\\Program`;
      const toks1: any[] = []; const toks2: any[] = [];
      for (const ch of text1) toks1.push(...tokenizer.accept(ch));
      toks1.push(...tokenizer.flush());
      tokenizer.reset();
      for (const ch of text2) toks2.push(...tokenizer.accept(ch));
      toks2.push(...tokenizer.flush());
      const content1 = toks1.filter((t: any) => t.type !== TokenType.EOF).map((t: any) => t.content).join('');
      const content2 = toks2.filter((t: any) => t.type !== TokenType.EOF).map((t: any) => t.content).join('');
      expect(content1).toBe(String.raw`C:\Program`);
      expect(content2).toBe(String.raw`C:\Program`);
    });

    test('\\\\\\* tokenizes to \\* text (pair -> \\ then escape next special *)', () => {
      const text = String.raw`\\\*`; // literal: \\*
      const tokens: any[] = [];
      for (const ch of text) tokens.push(...tokenizer.accept(ch));
      tokens.push(...tokenizer.flush());
      const reconstructed = tokens.filter((t: any) => t.type !== TokenType.EOF).map((t: any) => t.content).join('');
      expect(reconstructed).toBe(String.raw`\*`);
      // Ensure no ASTERISK token was emitted
      expect(tokens.some((t: any) => t.type === TokenType.ASTERISK || t.type === TokenType.DOUBLE_ASTERISK)).toBe(false);
    });

    test('\\\\ tokenizes to \\ text (two pairs)', () => {
      const text = String.raw`\\\\`; // literal: \\\\
      const tokens: any[] = [];
      for (const ch of text) tokens.push(...tokenizer.accept(ch));
      tokens.push(...tokenizer.flush());
      const reconstructed = tokens.filter((t: any) => t.type !== TokenType.EOF).map((t: any) => t.content).join('');
      expect(reconstructed).toBe(String.raw`\\`);
    });

    test('\\\\f tokenizes to \\f text (pair -> \\ then non-special f)', () => {
      const text = String.raw`\\f`; // literal: \\f
      const tokens: any[] = [];
      for (const ch of text) tokens.push(...tokenizer.accept(ch));
      tokens.push(...tokenizer.flush());
      const reconstructed = tokens.filter((t: any) => t.type !== TokenType.EOF).map((t: any) => t.content).join('');
      expect(reconstructed).toBe(String.raw`\f`);
    });

    test('backslash escapes other special characters too', () => {
      const cases = [
        { input: String.raw`\_italic\_`, expected: String.raw`_italic_` },
        { input: "\\`code\\`", expected: "`code`" },
        { input: String.raw`\# not heading`, expected: String.raw`# not heading` },
        { input: String.raw`\~strike\~`, expected: String.raw`~strike~` },
        { input: String.raw`\[link\](url)`, expected: String.raw`[link](url)` },
        { input: String.raw`\(paren\)`, expected: String.raw`(paren)` },
      ];
      for (const { input, expected } of cases) {
        tokenizer.reset();
        const tokens: any[] = [];
        for (const ch of input) tokens.push(...tokenizer.accept(ch));
        tokens.push(...tokenizer.flush());
        const reconstructed = tokens.filter((t: any) => t.type !== TokenType.EOF).map((t: any) => t.content).join('');
        expect(reconstructed).toBe(expected);
      }
    });
  });

  describe('Basic tokenization', () => {
    test('should tokenize simple text', () => {
      const text = 'hello world';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(4); // TEXT("hello"), SPACE, TEXT("world"), EOF
      expect(tokens[0].type).toBe(TokenType.TEXT);
      expect(tokens[0].content).toBe('hello');
      expect(tokens[1].type).toBe(TokenType.SPACE);
      expect(tokens[2].type).toBe(TokenType.TEXT);
      expect(tokens[2].content).toBe('world');
      expect(tokens[3].type).toBe(TokenType.EOF);
    });

    test('should treat escaped asterisks as literal text', () => {
      const text = String.raw`\*This text is not italic because the asterisks are escaped.\*`;
      const tokens: any[] = [];
      for (const char of text) tokens.push(...tokenizer.accept(char));
      tokens.push(...tokenizer.flush());

      // Ensure no ASTERISK tokens were emitted; the asterisks should be part of text
      expect(tokens.some((t: any) => t.type === TokenType.ASTERISK || t.type === TokenType.DOUBLE_ASTERISK)).toBe(false);
      // Reconstruct original content from tokens (excluding EOF) and ensure it matches
      const reconstructed = tokens
        .filter((t: any) => t.type !== TokenType.EOF)
        .map((t: any) => t.content)
        .join('');
      expect(reconstructed).toBe(String.raw`*This text is not italic because the asterisks are escaped.*`);
      // EOF must be present as the last token
      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
    });

    test('should tokenize emphasis characters', () => {
      const text = '**bold**';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(4); // DOUBLE_ASTERISK, TEXT("bold"), DOUBLE_ASTERISK, EOF
      expect(tokens[0].type).toBe(TokenType.DOUBLE_ASTERISK);
      expect(tokens[1].type).toBe(TokenType.TEXT);
      expect(tokens[1].content).toBe('bold');
      expect(tokens[2].type).toBe(TokenType.DOUBLE_ASTERISK);
      expect(tokens[3].type).toBe(TokenType.EOF);
    });

    test('should tokenize list markers', () => {
      const text = '- item';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(4); // DASH, SPACE, TEXT("item"), EOF
      expect(tokens[0].type).toBe(TokenType.DASH);
      expect(tokens[1].type).toBe(TokenType.SPACE);
      expect(tokens[2].type).toBe(TokenType.TEXT);
      expect(tokens[2].content).toBe('item');
      expect(tokens[3].type).toBe(TokenType.EOF);
    });

    test('should tokenize ordered list markers', () => {
      const text = '1. item';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(5); // DIGIT_SEQUENCE("1"), PERIOD, SPACE, TEXT("item"), EOF
      expect(tokens[0].type).toBe(TokenType.DIGIT_SEQUENCE);
      expect(tokens[0].content).toBe('1');
      expect(tokens[1].type).toBe(TokenType.PERIOD);
      expect(tokens[2].type).toBe(TokenType.SPACE);
      expect(tokens[3].type).toBe(TokenType.TEXT);
      expect(tokens[3].content).toBe('item');
      expect(tokens[4].type).toBe(TokenType.EOF);
    });

    test('should tokenize links', () => {
      const text = '[text](url)';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(7); // BRACKET_OPEN, TEXT("text"), BRACKET_CLOSE, PAREN_OPEN, TEXT("url"), PAREN_CLOSE, EOF
      expect(tokens[0].type).toBe(TokenType.BRACKET_OPEN);
      expect(tokens[1].type).toBe(TokenType.TEXT);
      expect(tokens[1].content).toBe('text');
      expect(tokens[2].type).toBe(TokenType.BRACKET_CLOSE);
      expect(tokens[3].type).toBe(TokenType.PAREN_OPEN);
      expect(tokens[4].type).toBe(TokenType.TEXT);
      expect(tokens[4].content).toBe('url');
      expect(tokens[5].type).toBe(TokenType.PAREN_CLOSE);
      expect(tokens[6].type).toBe(TokenType.EOF);
    });

    test('should handle newlines', () => {
      const text = 'line1\nline2';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(6); // TEXT("line"), DIGIT_SEQUENCE("1"), NEWLINE, TEXT("line"), DIGIT_SEQUENCE("2"), EOF
      expect(tokens[0].type).toBe(TokenType.TEXT);
      expect(tokens[0].content).toBe('line');
      expect(tokens[1].type).toBe(TokenType.DIGIT_SEQUENCE);
      expect(tokens[1].content).toBe('1');
      expect(tokens[2].type).toBe(TokenType.NEWLINE);
      expect(tokens[3].type).toBe(TokenType.TEXT);
      expect(tokens[3].content).toBe('line');
      expect(tokens[4].type).toBe(TokenType.DIGIT_SEQUENCE);
      expect(tokens[4].content).toBe('2');
      expect(tokens[5].type).toBe(TokenType.EOF);
    });

    test('should tokenize single asterisk', () => {
      const text = '*italic*';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(4); // ASTERISK, TEXT("italic"), ASTERISK, EOF
      expect(tokens[0].type).toBe(TokenType.ASTERISK);
      expect(tokens[1].type).toBe(TokenType.TEXT);
      expect(tokens[1].content).toBe('italic');
      expect(tokens[2].type).toBe(TokenType.ASTERISK);
      expect(tokens[3].type).toBe(TokenType.EOF);
    });

    test('should tokenize nested list structure', () => {
      const text = '  1. nested';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(7); // SPACE, SPACE, DIGIT_SEQUENCE("1"), PERIOD, SPACE, TEXT("nested"), EOF
      expect(tokens[0].type).toBe(TokenType.SPACE);
      expect(tokens[1].type).toBe(TokenType.SPACE);
      expect(tokens[2].type).toBe(TokenType.DIGIT_SEQUENCE);
      expect(tokens[2].content).toBe('1');
      expect(tokens[3].type).toBe(TokenType.PERIOD);
      expect(tokens[4].type).toBe(TokenType.SPACE);
      expect(tokens[5].type).toBe(TokenType.TEXT);
      expect(tokens[5].content).toBe('nested');
      expect(tokens[6].type).toBe(TokenType.EOF);
    });
  });
});
