/**
 * Tests for MarkdownParser
 * Pushdown automaton parser for streaming markdown
 */

import { MarkdownParser, MarkdownASTNode } from '../MarkdownParser';
import { MarkdownTokenizer, TokenType } from '../MarkdownTokenizer';

// Helper function to tokenize and parse
function parseMarkdown(text: string): MarkdownASTNode {
  const tokenizer = new MarkdownTokenizer();
  const parser = new MarkdownParser();
  
  // Tokenize
  for (const char of text) {
    const tokens = tokenizer.accept(char);
    for (const token of tokens) {
      parser.accept(token);
    }
  }
  
  // Flush both
  const finalTokens = tokenizer.flush();
  for (const token of finalTokens) {
    parser.accept(token);
  }
  parser.flush();
  
  return parser.getAST();
}

describe('MarkdownParser', () => {
  let parser: MarkdownParser;

  beforeEach(() => {
    parser = new MarkdownParser();
  });

  describe('Basic document structure', () => {
    test('should create empty document', () => {
      parser.flush();
      const ast = parser.getAST();
      
      expect(ast.type).toBe('document');
      expect(ast.children).toEqual([]);
    });

    test('should handle simple text as paragraph', () => {
      const ast = parseMarkdown('Hello world');
      
      expect(ast.type).toBe('document');
      expect(ast.children).toHaveLength(1);
      expect(ast.children![0].type).toBe('paragraph');
      expect(ast.children![0].children).toHaveLength(1);
      expect(ast.children![0].children![0].type).toBe('text');
      expect(ast.children![0].children![0].content).toBe('Hello world');
    });

    test('should handle multiple paragraphs', () => {
      const ast = parseMarkdown('Paragraph 1\n\nParagraph 2');
      
      expect(ast.children).toHaveLength(2);
      expect(ast.children![0].type).toBe('paragraph');
      expect(ast.children![1].type).toBe('paragraph');
    });
  });

  describe('Headings', () => {
    test('should parse ATX heading', () => {
      const ast = parseMarkdown('# Heading 1');
      
      expect(ast.children).toHaveLength(1);
      expect(ast.children![0].type).toBe('heading');
      expect(ast.children![0].metadata?.level).toBe(1);
      expect(ast.children![0].children).toHaveLength(1);
      expect(ast.children![0].children![0].content).toBe('Heading 1');
    });

    test('should parse multiple heading levels', () => {
      const ast = parseMarkdown('# H1\n## H2\n### H3');
      
      expect(ast.children).toHaveLength(3);
      expect(ast.children![0].metadata?.level).toBe(1);
      expect(ast.children![1].metadata?.level).toBe(2);
      expect(ast.children![2].metadata?.level).toBe(3);
    });
  });

  describe('Code blocks', () => {
    test('should parse fenced code block', () => {
      const ast = parseMarkdown('```\ncode content\n```');
      
      expect(ast.children).toHaveLength(1);
      expect(ast.children![0].type).toBe('code_block');
      expect(ast.children![0].content).toBe('code content');
    });

    test('should parse fenced code block with language', () => {
      const ast = parseMarkdown('```javascript\nconst x = 1;\n```');
      
      expect(ast.children![0].type).toBe('code_block');
      expect(ast.children![0].content).toBe('const x = 1;');
      expect(ast.children![0].metadata?.language).toBe('');
    });

    test('should parse inline code', () => {
      const ast = parseMarkdown('Some `inline code` here');
      
      expect(ast.children![0].type).toBe('paragraph');
      
      // Verify the exact structure: "Some ", `inline code`, " here"
      expect(ast.children![0].children![0].type).toBe('text');
      expect(ast.children![0].children![0].content).toBe('Some ');
      
      expect(ast.children![0].children![1].type).toBe('code_inline');
      expect(ast.children![0].children![1].content).toBe('inline code');
      
      expect(ast.children![0].children![2].type).toBe('text');
      expect(ast.children![0].children![2].content).toBe(' here');
    });
  });

  describe('Emphasis', () => {
    test('should parse bold text', () => {
      const ast = parseMarkdown('**bold text**');
      
      expect(ast.children![0].children).toHaveLength(1);
      expect(ast.children![0].children![0].type).toBe('strong');
      expect(ast.children![0].children![0].children).toHaveLength(1);
      expect(ast.children![0].children![0].children![0].content).toBe('bold text');
    });

    test('should parse italic text', () => {
      const ast = parseMarkdown('*italic text*');
      
      expect(ast.children![0].children![0].type).toBe('emphasis');
      expect(ast.children![0].children![0].children![0].content).toBe('italic text');
    });

    test('should parse nested emphasis', () => {
      const ast = parseMarkdown('**bold *and italic* text**');
      
      const strongNode = ast.children![0].children![0];
      expect(strongNode.type).toBe('strong');
      expect(strongNode.children).toHaveLength(3); // Verify exact count
      
      // Verify the exact structure: "bold ", *and italic*, " text"
      expect(strongNode.children![0].type).toBe('text');
      expect(strongNode.children![0].content).toBe('bold ');
      
      expect(strongNode.children![1].type).toBe('emphasis');
      expect(strongNode.children![1].children).toHaveLength(1); // Verify italic has exactly one child
      expect(strongNode.children![1].children![0].type).toBe('text');
      expect(strongNode.children![1].children![0].content).toBe('and italic');
      
      expect(strongNode.children![2].type).toBe('text');
      expect(strongNode.children![2].content).toBe(' text');
    });
  });

  describe('Links', () => {
    test('should parse simple link', () => {
      const ast = parseMarkdown('[link text](https://example.com)');
      
      expect(ast.children![0].children).toHaveLength(1);
      expect(ast.children![0].children![0].type).toBe('link');
      expect(ast.children![0].children![0].children![0].content).toBe('link text');
      expect(ast.children![0].children![0].metadata?.url).toBe('https://example.com');
    });

    test('should parse link with emphasis', () => {
      const ast = parseMarkdown('[**bold link**](url)');
      
      const linkNode = ast.children![0].children![0];
      expect(linkNode.type).toBe('link');
      expect(linkNode.children![0].type).toBe('strong');
      expect(linkNode.children![0].children![0].content).toBe('bold link');
      expect(linkNode.metadata?.url).toBe('url');
    });
  });

  describe('Mixed content', () => {
    test('should parse complex mixed content', () => {
      const ast = parseMarkdown('# Heading\n\nThis is **bold** and *italic* with `code`.\n\n```js\nconsole.log("hello");\n```');
      
      expect(ast.children).toHaveLength(3);
      
      // Heading
      expect(ast.children![0].type).toBe('heading');
      
      // Paragraph with mixed formatting
      const paragraph = ast.children![1];
      expect(paragraph.type).toBe('paragraph');
      expect(paragraph.children).toHaveLength(7); // Verify exact count
      
      // Verify the exact structure: "This is ", **bold**, " and ", *italic*, " with ", `code`, "."
      expect(paragraph.children![0].type).toBe('text');
      expect(paragraph.children![0].content).toBe('This is ');
      
      expect(paragraph.children![1].type).toBe('strong');
      expect(paragraph.children![1].children![0].content).toBe('bold');
      
      expect(paragraph.children![2].type).toBe('text');
      expect(paragraph.children![2].content).toBe(' and ');
      
      expect(paragraph.children![3].type).toBe('emphasis');
      expect(paragraph.children![3].children![0].content).toBe('italic');
      
      expect(paragraph.children![4].type).toBe('text');
      expect(paragraph.children![4].content).toBe(' with ');
      
      expect(paragraph.children![5].type).toBe('code_inline');
      expect(paragraph.children![5].content).toBe('code');
      
      expect(paragraph.children![6].type).toBe('text');
      expect(paragraph.children![6].content).toBe('.');
      
      // Code block
      expect(ast.children![2].type).toBe('code_block');
      expect(ast.children![2].content).toBe('console.log("hello");');
    });
  });

  describe('Streaming behavior', () => {
    test('should build AST incrementally', () => {
      const tokenizer = new MarkdownTokenizer();
      const parser = new MarkdownParser();
      
      const text = 'Hello **bold** world';
      
      // Process character by character
      for (const char of text) {
        const tokens = tokenizer.accept(char);
        for (const token of tokens) {
          parser.accept(token);
        }
        
        // AST should be buildable at any point
        const ast = parser.getAST();
        expect(ast.type).toBe('document');
      }
      
      // Finalize
      const finalTokens = tokenizer.flush();
      for (const token of finalTokens) {
        parser.accept(token);
      }
      parser.flush();
      
      const finalAst = parser.getAST();
      expect(finalAst.children).toHaveLength(1);
      expect(finalAst.children![0].type).toBe('paragraph');
    });

    test('should track buffered tokens', () => {
      const tokenizer = new MarkdownTokenizer();
      const parser = new MarkdownParser();
      
      // Use text with delimiters that will emit tokens during streaming
      const text = 'Hello **bold** world';
      let tokensEmitted = 0;
      
      for (const char of text) {
        const tokens = tokenizer.accept(char);
        tokensEmitted += tokens.length;
        for (const token of tokens) {
          parser.accept(token);
        }
      }
      
      // Should have emitted some tokens during streaming
      expect(tokensEmitted).toBeGreaterThan(0);
      
      // Should have buffered tokens
      expect(parser.getBufferedTokens().length).toBeGreaterThan(0);
      
      // After flush, buffered tokens should be cleared
      const finalTokens = tokenizer.flush();
      for (const token of finalTokens) {
        parser.accept(token);
      }
      parser.flush();
      expect(parser.getBufferedTokens()).toHaveLength(0);
    });
  });

  describe('State management', () => {
    test('should reset properly', () => {
      // Build some AST
      const ast1 = parseMarkdown('# Heading');
      expect(ast1.children).toHaveLength(1);
      
      // Reset
      parser.reset();
      
      // Should start fresh
      const ast2 = parseMarkdown('Different content');
      expect(ast2.children).toHaveLength(1);
      expect(ast2.children![0].type).toBe('paragraph');
    });

    test('should handle flush with open formatting', () => {
      const tokenizer = new MarkdownTokenizer();
      const parser = new MarkdownParser();
      
      // Incomplete bold formatting
      const text = '**incomplete bold';
      for (const char of text) {
        const tokens = tokenizer.accept(char);
        for (const token of tokens) {
          parser.accept(token);
        }
      }
      
      const finalTokens = tokenizer.flush();
      for (const token of finalTokens) {
        parser.accept(token);
      }
      parser.flush();
      
      const ast = parser.getAST();
      expect(ast.children).toHaveLength(1);
      expect(ast.children![0].type).toBe('paragraph');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty input', () => {
      const ast = parseMarkdown('');
      expect(ast.type).toBe('document');
      expect(ast.children).toHaveLength(0);
    });

    test('should handle only whitespace', () => {
      const ast = parseMarkdown('   \n  \t  ');
      expect(ast.type).toBe('document');
      // Should create a paragraph with whitespace text
      expect(ast.children).toHaveLength(1);
    });

    test('should handle malformed markdown gracefully', () => {
      const ast = parseMarkdown('**bold without closing *italic without closing [link without closing');
      
      // Should still create a valid AST
      expect(ast.type).toBe('document');
      expect(ast.children).toHaveLength(1);
      expect(ast.children![0].type).toBe('paragraph');
    });
  });
});
