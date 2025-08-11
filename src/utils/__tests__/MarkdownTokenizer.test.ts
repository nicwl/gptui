/**
 * Tests for MarkdownTokenizer
 * Character-based state machine tokenizer for streaming markdown
 */

import { MarkdownTokenizer, TokenType } from '../MarkdownTokenizer';

describe('MarkdownTokenizer', () => {
  let tokenizer: MarkdownTokenizer;

  beforeEach(() => {
    tokenizer = new MarkdownTokenizer();
  });

  describe('Basic text tokenization', () => {
    test('should emit simple text tokens', () => {
      const text = 'Hello world';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(2);
      expect(tokens[0].type).toBe(TokenType.TEXT);
      expect(tokens[0].content).toBe('Hello world');
      expect(tokens[1].type).toBe(TokenType.EOF);
    });

    test('should handle newlines', () => {
      const text = 'Line 1\nLine 2';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(4); // TEXT, NEWLINE, TEXT, EOF
      expect(tokens[0].type).toBe(TokenType.TEXT);
      expect(tokens[0].content).toBe('Line 1');
      expect(tokens[1].type).toBe(TokenType.NEWLINE);
      expect(tokens[2].type).toBe(TokenType.TEXT);
      expect(tokens[2].content).toBe('Line 2');
      expect(tokens[3].type).toBe(TokenType.EOF);
    });
  });

  describe('Emphasis tokenization', () => {
    test('should tokenize single asterisk as italic delimiter', () => {
      const text = '*italic*';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(4); // ITALIC, TEXT, ITALIC, EOF
      expect(tokens[0].type).toBe(TokenType.ITALIC_DELIMITER);
      expect(tokens[1].type).toBe(TokenType.TEXT);
      expect(tokens[1].content).toBe('italic');
      expect(tokens[2].type).toBe(TokenType.ITALIC_DELIMITER);
      expect(tokens[3].type).toBe(TokenType.EOF);
    });

    test('should tokenize double asterisk as bold delimiter', () => {
      const text = '**bold**';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(4); // BOLD, TEXT, BOLD, EOF
      expect(tokens[0].type).toBe(TokenType.BOLD_DELIMITER);
      expect(tokens[0].content).toBe('**');
      expect(tokens[1].type).toBe(TokenType.TEXT);
      expect(tokens[1].content).toBe('bold');
      expect(tokens[2].type).toBe(TokenType.BOLD_DELIMITER);
      expect(tokens[3].type).toBe(TokenType.EOF);
    });

    test('should handle mixed emphasis', () => {
      const text = '*italic* and **bold**';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      // ITALIC, TEXT("italic"), ITALIC, TEXT(" and "), BOLD, TEXT("bold"), BOLD, EOF
      expect(tokens).toHaveLength(8);
      expect(tokens[0].type).toBe(TokenType.ITALIC_DELIMITER);
      expect(tokens[1].content).toBe('italic');
      expect(tokens[2].type).toBe(TokenType.ITALIC_DELIMITER);
      expect(tokens[3].content).toBe(' and ');
      expect(tokens[4].type).toBe(TokenType.BOLD_DELIMITER);
      expect(tokens[5].content).toBe('bold');
      expect(tokens[6].type).toBe(TokenType.BOLD_DELIMITER);
    });
  });

  describe('Code tokenization', () => {
    test('should tokenize inline code', () => {
      const text = '`code`';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      

      expect(tokens).toHaveLength(4); // CODE, TEXT, CODE, EOF
      expect(tokens[0].type).toBe(TokenType.CODE_DELIMITER);
      expect(tokens[1].type).toBe(TokenType.TEXT);
      expect(tokens[1].content).toBe('code');
      expect(tokens[2].type).toBe(TokenType.CODE_DELIMITER);
      expect(tokens[3].type).toBe(TokenType.EOF);
    });
  });

  describe('Link tokenization', () => {
    test('should tokenize complete link', () => {
      const text = '[text](url)';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      // LINK_TEXT_OPEN, TEXT("text"), LINK_TEXT_CLOSE, LINK_URL_OPEN, TEXT("url"), LINK_URL_CLOSE, EOF
      expect(tokens).toHaveLength(7);
      expect(tokens[0].type).toBe(TokenType.LINK_TEXT_OPEN);
      expect(tokens[1].content).toBe('text');
      expect(tokens[2].type).toBe(TokenType.LINK_TEXT_CLOSE);
      expect(tokens[3].type).toBe(TokenType.LINK_URL_OPEN);
      expect(tokens[4].content).toBe('url');
      expect(tokens[5].type).toBe(TokenType.LINK_URL_CLOSE);
      expect(tokens[6].type).toBe(TokenType.EOF);
    });
  });

  describe('Heading tokenization', () => {
    test('should tokenize ATX heading', () => {
      const text = '# Heading 1';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(3); // ATX_HEADING, TEXT, EOF
      expect(tokens[0].type).toBe(TokenType.ATX_HEADING);
      expect(tokens[0].content).toBe('#');
      expect(tokens[0].metadata?.level).toBe(1);
      expect(tokens[1].content).toBe('Heading 1');
      expect(tokens[2].type).toBe(TokenType.EOF);
    });

    test('should tokenize multi-level headings', () => {
      const text = '### Level 3';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens[0].type).toBe(TokenType.ATX_HEADING);
      expect(tokens[0].content).toBe('###');
      expect(tokens[0].metadata?.level).toBe(3);
    });

    test('should not tokenize # without space as heading', () => {
      const text = '#hashtag';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(2); // TEXT, EOF
      expect(tokens[0].type).toBe(TokenType.TEXT);
      expect(tokens[0].content).toBe('#hashtag');
    });
  });

  describe('Streaming behavior', () => {
    test('should emit tokens progressively during streaming', () => {
      const text = 'Hello **bold** world';
      const allTokens = [];
      
      // Simulate streaming character by character
      for (const char of text) {
        const newTokens = tokenizer.accept(char);
        allTokens.push(...newTokens);
      }
      
      // Should have emitted some tokens before the end
      expect(allTokens.length).toBeGreaterThan(0);
      
      // Complete the stream
      allTokens.push(...tokenizer.flush());
      
      // Check final result - should have 3 TEXT tokens: "Hello ", "bold", " world"
      expect(allTokens.filter(t => t.type === TokenType.TEXT).length).toBe(3);
      expect(allTokens.filter(t => t.type === TokenType.BOLD_DELIMITER).length).toBe(2);
      
      // Verify specific content
      const textTokens = allTokens.filter(t => t.type === TokenType.TEXT);
      expect(textTokens[0].content).toBe('Hello ');
      expect(textTokens[1].content).toBe('bold');
      expect(textTokens[2].content).toBe(' world');
    });

    test('should handle incomplete tokens at flush', () => {
      const text = 'Hello **incomplete';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      // Should treat incomplete bold as text
      expect(tokens.filter(t => t.type === TokenType.TEXT).length).toBe(2);
      expect(tokens.filter(t => t.type === TokenType.BOLD_DELIMITER).length).toBe(1);
    });
  });

  describe('State management', () => {
    test('should reset properly', () => {
      const text = 'Some text';
      
      // Process some text
      for (const char of text) {
        tokenizer.accept(char);
      }
      
      // Reset
      tokenizer.reset();
      
      // Should start fresh
      expect(tokenizer.getBufferedChars()).toBe('');
      
      // Process new text
      const tokens = [];
      for (const char of 'New text') {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens[0].content).toBe('New text');
    });
  });

  describe('Fenced code blocks', () => {
    test('should tokenize simple fenced code block', () => {
      const text = '```\ncode\n```';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      

      // Should have: CODE_FENCE, NEWLINE, CODE_CONTENT, NEWLINE, CODE_FENCE, EOF
      expect(tokens).toHaveLength(6);
      expect(tokens[0].type).toBe(TokenType.CODE_FENCE);
      expect(tokens[0].content).toBe('```');
      expect(tokens[1].type).toBe(TokenType.NEWLINE);
      expect(tokens[2].type).toBe(TokenType.CODE_CONTENT);
      expect(tokens[2].content).toBe('code');
      expect(tokens[3].type).toBe(TokenType.NEWLINE);
      expect(tokens[4].type).toBe(TokenType.CODE_FENCE);
      expect(tokens[4].content).toBe('```');
      expect(tokens[5].type).toBe(TokenType.EOF);
    });

    test('should tokenize fenced code block with language', () => {
      const text = '```javascript\nconst x = 1;\n```';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens[0].type).toBe(TokenType.CODE_FENCE);
      expect(tokens[0].content).toBe('```');
      // Language is stored internally but not emitted as separate token
      expect(tokens[1].type).toBe(TokenType.NEWLINE);
      expect(tokens[2].type).toBe(TokenType.CODE_CONTENT);
      expect(tokens[2].content).toBe('const x = 1;');
    });

    test('should handle incomplete fenced code block', () => {
      const text = '```\ncode without closing';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      // Should treat the content as code content even without closing fence
      expect(tokens.filter(t => t.type === TokenType.CODE_FENCE).length).toBe(1);
      expect(tokens.filter(t => t.type === TokenType.CODE_CONTENT).length).toBe(1);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty input', () => {
      const tokens = tokenizer.flush();
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.EOF);
    });

    test('should handle only whitespace', () => {
      const text = '   \t  ';
      const tokens = [];
      
      for (const char of text) {
        tokens.push(...tokenizer.accept(char));
      }
      tokens.push(...tokenizer.flush());
      
      expect(tokens).toHaveLength(2); // TEXT, EOF
      expect(tokens[0].content).toBe('   \t  ');
    });
  });
});
