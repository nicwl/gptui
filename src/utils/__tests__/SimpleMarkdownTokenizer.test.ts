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
