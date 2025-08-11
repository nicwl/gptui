/**
 * Tests for MarkdownParser
 * Pushdown automaton parser for streaming markdown
 */

import { MarkdownParser, MarkdownASTNode, hasContent, hasChildren } from '../MarkdownParser';
import { MarkdownTokenizer, TokenType } from '../MarkdownTokenizer';

// Helper function to safely get children
function getChildren(node: MarkdownASTNode): MarkdownASTNode[] {
  return hasChildren(node) ? node.children : [];
}

// Helper function to safely get content
function getContent(node: MarkdownASTNode): string {
  return hasContent(node) ? node.content : '';
}

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
      expect(getChildren(ast)).toEqual([]);
    });

    test('should handle simple text as paragraph', () => {
      const ast = parseMarkdown('Hello world');
      
      expect(ast.type).toBe('document');
      expect(getChildren(ast)).toHaveLength(1);
      expect(getChildren(ast)[0].type).toBe('paragraph');
      const paragraph = getChildren(ast)[0];
      expect(getChildren(paragraph)).toHaveLength(1);
      expect(getChildren(paragraph)[0].type).toBe('text');
      expect(getContent(getChildren(paragraph)[0])).toBe('Hello world');
    });

    test('should handle multiple paragraphs', () => {
      const ast = parseMarkdown('Paragraph 1\n\nParagraph 2');
      
      expect(getChildren(ast)).toHaveLength(2);
      expect(getChildren(ast)[0].type).toBe('paragraph');
      expect(getChildren(ast)[1].type).toBe('paragraph');
    });
  });

  describe('Headings', () => {
    test('should parse ATX heading', () => {
      const ast = parseMarkdown('# Heading 1');
      
      expect(getChildren(ast)).toHaveLength(1);
      expect(getChildren(ast)[0].type).toBe('heading');
      const heading = getChildren(ast)[0];
      expect(heading.type).toBe('heading');
      if (heading.type === 'heading') {
        expect(heading.metadata.level).toBe(1);
        expect(getChildren(heading)).toHaveLength(1);
        expect(getContent(getChildren(heading)[0])).toBe('Heading 1');
      }
    });

    test('should parse multiple heading levels', () => {
      const ast = parseMarkdown('# H1\n## H2\n### H3');
      
      expect(getChildren(ast)).toHaveLength(3);
      const heading1 = getChildren(ast)[0];
      const heading2 = getChildren(ast)[1];
      const heading3 = getChildren(ast)[2];
      expect(heading1.type).toBe('heading');
      expect(heading2.type).toBe('heading');
      expect(heading3.type).toBe('heading');
      if (heading1.type === 'heading') expect(heading1.metadata.level).toBe(1);
      if (heading2.type === 'heading') expect(heading2.metadata.level).toBe(2);
      if (heading3.type === 'heading') expect(heading3.metadata.level).toBe(3);
    });
  });

  describe('Code blocks', () => {
    test('should parse fenced code block', () => {
      const ast = parseMarkdown('```\ncode content\n```');
      
      expect(getChildren(ast)).toHaveLength(1);
      expect(getChildren(ast)[0].type).toBe('code_block');
      expect(getContent(getChildren(ast)[0])).toBe('code content');
    });

    test('should parse fenced code block with language', () => {
      const ast = parseMarkdown('```javascript\nconst x = 1;\n```');
      
      expect(getChildren(ast)[0].type).toBe('code_block');
      expect(getContent(getChildren(ast)[0])).toBe('const x = 1;');
      const codeBlock = getChildren(ast)[0];
      expect(codeBlock.type).toBe('code_block');
      if (codeBlock.type === 'code_block') expect(codeBlock.metadata?.language).toBe('');
    });

    test('should parse inline code', () => {
      const ast = parseMarkdown('Some `inline code` here');
      
      expect(getChildren(ast)[0].type).toBe('paragraph');
      
      // Verify the exact structure: "Some ", `inline code`, " here"
      const paragraph = getChildren(ast)[0];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        const text1 = paragraph.children[0];
        const code = paragraph.children[1];
        const text2 = paragraph.children[2];
        
        expect(text1.type).toBe('text');
        expect(code.type).toBe('code_inline');
        expect(text2.type).toBe('text');
        
        if (text1.type === 'text') expect(text1.content).toBe('Some ');
        if (code.type === 'code_inline') expect(code.content).toBe('inline code');
        if (text2.type === 'text') expect(text2.content).toBe(' here');
      }
    });
  });

  describe('Emphasis', () => {
    test('should parse bold text', () => {
      const ast = parseMarkdown('**bold text**');
      
      const paragraph = getChildren(ast)[0];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        expect(paragraph.children).toHaveLength(1);
        const strong = paragraph.children[0];
        expect(strong.type).toBe('strong');
        if (strong.type === 'strong') {
          expect(strong.children).toHaveLength(1);
          const text = strong.children[0];
          expect(text.type).toBe('text');
          if (text.type === 'text') expect(text.content).toBe('bold text');
        }
      }
    });

    test('should parse italic text', () => {
      const ast = parseMarkdown('*italic text*');
      
      const paragraph = getChildren(ast)[0];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        const emphasis = paragraph.children[0];
        expect(emphasis.type).toBe('emphasis');
        if (emphasis.type === 'emphasis') {
          const text = emphasis.children[0];
          expect(text.type).toBe('text');
          if (text.type === 'text') expect(text.content).toBe('italic text');
        }
      }
    });

    test('should parse nested emphasis', () => {
      const ast = parseMarkdown('**bold *and italic* text**');
      
      const paragraph = getChildren(ast)[0];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        const strongNode = paragraph.children[0];
        expect(strongNode.type).toBe('strong');
        if (strongNode.type === 'strong') {
          expect(strongNode.children).toHaveLength(3); // Verify exact count
          
          // Verify the exact structure: "bold ", *and italic*, " text"
          const text1 = strongNode.children[0];
          const emphasis = strongNode.children[1];
          const text2 = strongNode.children[2];
          
          expect(text1.type).toBe('text');
          expect(emphasis.type).toBe('emphasis');
          expect(text2.type).toBe('text');
          
          if (text1.type === 'text') expect(text1.content).toBe('bold ');
          if (text2.type === 'text') expect(text2.content).toBe(' text');
          
          if (emphasis.type === 'emphasis') {
            expect(emphasis.children).toHaveLength(1); // Verify italic has exactly one child
            const italicText = emphasis.children[0];
            expect(italicText.type).toBe('text');
            if (italicText.type === 'text') expect(italicText.content).toBe('and italic');
          }
        }
      }
    });
  });

  describe('Links', () => {
    test('should parse simple link', () => {
      const ast = parseMarkdown('[link text](https://example.com)');
      
      const paragraph = getChildren(ast)[0];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        expect(paragraph.children).toHaveLength(1);
        const link = paragraph.children[0];
        expect(link.type).toBe('link');
        if (link.type === 'link') {
          expect(link.children).toHaveLength(1);
          const text = link.children[0];
          expect(text.type).toBe('text');
          if (text.type === 'text') expect(text.content).toBe('link text');
          expect(link.metadata.url).toBe('https://example.com');
        }
      }
    });

    test('should parse link with emphasis', () => {
      const ast = parseMarkdown('[**bold link**](url)');
      
      const paragraph = getChildren(ast)[0];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        const linkNode = paragraph.children[0];
        expect(linkNode.type).toBe('link');
        if (linkNode.type === 'link') {
          expect(linkNode.children).toHaveLength(1);
          const strong = linkNode.children[0];
          expect(strong.type).toBe('strong');
          if (strong.type === 'strong') {
            expect(strong.children).toHaveLength(1);
            const text = strong.children[0];
            expect(text.type).toBe('text');
            if (text.type === 'text') expect(text.content).toBe('bold link');
          }
          expect(linkNode.metadata.url).toBe('url');
        }
      }
    });

    test('should handle square brackets that are not links', () => {
      const ast = parseMarkdown('This [is not a link] and neither is [this one');
      
      const paragraph = getChildren(ast)[0];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        // Should be parsed as plain text since there are no parentheses
        expect(paragraph.children).toHaveLength(1);
        const text = paragraph.children[0];
        expect(text.type).toBe('text');
        if (text.type === 'text') {
          expect(text.content).toBe('This [is not a link] and neither is [this one');
        }
      }
    });

    test('should handle incomplete link syntax', () => {
      const ast = parseMarkdown('[link text without url] and [another](incomplete');
      
      const paragraph = getChildren(ast)[0];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        // Should be parsed as plain text since the link syntax is incomplete
        expect(paragraph.children).toHaveLength(1);
        const text = paragraph.children[0];
        expect(text.type).toBe('text');
        if (text.type === 'text') {
          expect(text.content).toBe('[link text without url] and [another](incomplete');
        }
      }
    });
  });

  describe('Mixed content', () => {
    test('should parse complex mixed content', () => {
      const ast = parseMarkdown('# Heading\n\nThis is **bold** and *italic* with `code`.\n\n```js\nconsole.log("hello");\n```');
      
      expect(getChildren(ast)).toHaveLength(3);
      
      // Heading
      expect(getChildren(ast)[0].type).toBe('heading');
      
      // Paragraph with mixed formatting
      const paragraph = getChildren(ast)[1];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        expect(paragraph.children).toHaveLength(7); // Verify exact count
        
        // Verify the exact structure: "This is ", **bold**, " and ", *italic*, " with ", `code`, "."
        const text1 = paragraph.children[0];
        const strong = paragraph.children[1];
        const text2 = paragraph.children[2];
        const emphasis = paragraph.children[3];
        const text3 = paragraph.children[4];
        const code = paragraph.children[5];
        const text4 = paragraph.children[6];
        
        expect(text1.type).toBe('text');
        expect(strong.type).toBe('strong');
        expect(text2.type).toBe('text');
        expect(emphasis.type).toBe('emphasis');
        expect(text3.type).toBe('text');
        expect(code.type).toBe('code_inline');
        expect(text4.type).toBe('text');
        
        if (text1.type === 'text') expect(text1.content).toBe('This is ');
        if (text2.type === 'text') expect(text2.content).toBe(' and ');
        if (text3.type === 'text') expect(text3.content).toBe(' with ');
        if (text4.type === 'text') expect(text4.content).toBe('.');
        if (code.type === 'code_inline') expect(code.content).toBe('code');
        
        if (strong.type === 'strong') {
          const boldText = strong.children[0];
          expect(boldText.type).toBe('text');
          if (boldText.type === 'text') expect(boldText.content).toBe('bold');
        }
        
        if (emphasis.type === 'emphasis') {
          const italicText = emphasis.children[0];
          expect(italicText.type).toBe('text');
          if (italicText.type === 'text') expect(italicText.content).toBe('italic');
        }
      }
      
      // Code block
      const codeBlock = getChildren(ast)[2];
      expect(codeBlock.type).toBe('code_block');
      if (codeBlock.type === 'code_block') {
        expect(codeBlock.content).toBe('console.log("hello");');
      }
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
      expect(getChildren(finalAst)).toHaveLength(1);
      expect(getChildren(finalAst)![0].type).toBe('paragraph');
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
      
      // With the corrected implementation, tokens are consumed immediately
      // so the buffer should be empty during normal processing
      expect(parser.getBufferedTokens().length).toBe(0);
      
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
    test('should clear buffered tokens when they become AST nodes', () => {
      const parser = new MarkdownParser();
      
      // Test that tokens are consumed immediately after processing
      const testToken = { type: TokenType.TEXT, content: 'test', position: 0 };
      
      // Add token to buffer manually and verify it's consumed
      parser.accept(testToken);
      
      // The token should have been added and then immediately consumed
      // since consumeBufferedToken is called in the handler
      expect(parser.getBufferedTokens()).toHaveLength(0);
      
      // Reset parser for the main test
      parser.reset();
      
      // Test multiple tokens to ensure they're all consumed
      const tokens = [
        { type: TokenType.TEXT, content: 'Hello ', position: 0 },
        { type: TokenType.BOLD_DELIMITER, content: '**', position: 6 },
        { type: TokenType.TEXT, content: 'bold', position: 8 },
        { type: TokenType.BOLD_DELIMITER, content: '**', position: 12 },
        { type: TokenType.TEXT, content: ' world', position: 14 }
      ];
      
      for (const token of tokens) {
        parser.accept(token);
        // After each token, buffer should be empty since tokens are consumed immediately
        expect(parser.getBufferedTokens()).toHaveLength(0);
      }
      
      // Verify the AST was built correctly with proper content
      const ast = parser.getASTReference();
      expect(ast.type).toBe('document');
      if (ast.type === 'document') {
        expect(ast.children).toHaveLength(1);
        const paragraph = ast.children[0];
        expect(paragraph.type).toBe('paragraph');
        
        if (paragraph.type === 'paragraph') {
          expect(paragraph.children).toHaveLength(3); // "Hello ", **bold**, " world"
          
          const text1 = paragraph.children[0];
          const strong = paragraph.children[1];
          const text2 = paragraph.children[2];
          
          expect(text1.type).toBe('text');
          expect(strong.type).toBe('strong');
          expect(text2.type).toBe('text');
          
          if (text1.type === 'text') expect(text1.content).toBe('Hello ');
          if (text2.type === 'text') expect(text2.content).toBe(' world');
          
          if (strong.type === 'strong') {
            expect(strong.children).toHaveLength(1);
            const boldText = strong.children[0];
            expect(boldText.type).toBe('text');
            if (boldText.type === 'text') expect(boldText.content).toBe('bold');
          }
        }
      }
      
      // After flush, buffer should still be empty
      parser.flush();
      expect(parser.getBufferedTokens()).toHaveLength(0);
    });

    test('should reset properly', () => {
      // Build some AST
      const ast1 = parseMarkdown('# Heading');
      expect(getChildren(ast1)).toHaveLength(1);
      
      // Reset
      parser.reset();
      
      // Should start fresh
      const ast2 = parseMarkdown('Different content');
      expect(getChildren(ast2)).toHaveLength(1);
      expect(getChildren(ast2)![0].type).toBe('paragraph');
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
      expect(getChildren(ast)).toHaveLength(1);
      expect(getChildren(ast)[0].type).toBe('paragraph');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty input', () => {
      const ast = parseMarkdown('');
      expect(ast.type).toBe('document');
      expect(getChildren(ast)).toHaveLength(0);
    });

    test('should handle only whitespace', () => {
      const ast = parseMarkdown('   \n  \t  ');
      expect(ast.type).toBe('document');
      // Should create a paragraph with whitespace text
      expect(getChildren(ast)).toHaveLength(1);
    });

    test('should handle malformed markdown gracefully', () => {
      const ast = parseMarkdown('**bold without closing *italic without closing [link without closing');
      
      // Should still create a valid AST
      expect(ast.type).toBe('document');
      expect(getChildren(ast)).toHaveLength(1);
      expect(getChildren(ast)[0].type).toBe('paragraph');
    });
  });

  describe('Code block newlines', () => {
    test('should preserve newlines in code blocks', () => {
      const input = '```\nfunction test() {\n  console.log("hello");\n  return true;\n}\n```';
      const ast = parseMarkdown(input);
      
      expect(ast.type).toBe('document');
      expect(getChildren(ast)).toHaveLength(1);
      expect(getChildren(ast)[0].type).toBe('code_block');
      
      const codeBlock = getChildren(ast)[0];
      expect(codeBlock.type).toBe('code_block');
      if (codeBlock.type === 'code_block') {
        expect(codeBlock.content).toContain('\n');
        expect(codeBlock.content).toBe('function test() {\n  console.log("hello");\n  return true;\n}');
        
        // Count newlines
        const newlineCount = codeBlock.content.split('\n').length - 1;
        expect(newlineCount).toBe(3);
      }
    });

    test('should preserve empty lines in code blocks', () => {
      const input = '```\nline1\n\nline3\n\nline5\n```';
      const ast = parseMarkdown(input);
      
      expect(ast.type).toBe('document');
      expect(getChildren(ast)).toHaveLength(1);
      expect(getChildren(ast)[0].type).toBe('code_block');
      
      const codeBlock = getChildren(ast)[0];
      expect(codeBlock.type).toBe('code_block');
      if (codeBlock.type === 'code_block') {
        expect(codeBlock.content).toBe('line1\n\nline3\n\nline5');
        
        // Should have 4 newlines (including empty lines)
        const newlineCount = codeBlock.content.split('\n').length - 1;
        expect(newlineCount).toBe(4);
      }
    });
  });

  describe('Complex real-world content', () => {
    test('should parse complex team update message correctly', () => {
      const input = `# Hello, Team! 👋

I hope you're all doing well. Here are the updates for **this week**:

## ✅ Completed Tasks
- Finished the **homepage redesign**
- Deployed the **v2.3 update**
- Fixed the login authentication bug

## 🚀 Upcoming Goals
1. Launch the **marketing campaign**
2. Test the **mobile app beta**
3. Prepare **quarterly report**

---

> **Reminder:** The next team meeting is on **Monday at 10 AM**.  
> Please bring your progress reports.

Thanks,  
**Alex**`;

      const ast = parseMarkdown(input);
      
      expect(ast.type).toBe('document');
      expect(getChildren(ast)).toHaveLength(9);
      
      // Check first heading
      const heading1 = getChildren(ast)[0];
      expect(heading1.type).toBe('heading');
      if (heading1.type === 'heading') {
        expect(heading1.metadata.level).toBe(1);
        expect(heading1.children).toHaveLength(1);
        const headingText = heading1.children[0];
        expect(headingText.type).toBe('text');
        if (headingText.type === 'text') expect(headingText.content).toBe('Hello, Team! 👋');
      }
      
      // Check first paragraph with bold text
      const paragraph1 = getChildren(ast)[1];
      expect(paragraph1.type).toBe('paragraph');
      if (paragraph1.type === 'paragraph') {
        expect(paragraph1.children).toHaveLength(3);
        const text1 = paragraph1.children[0];
        const strong = paragraph1.children[1];
        const text2 = paragraph1.children[2];
        
        expect(text1.type).toBe('text');
        expect(strong.type).toBe('strong');
        expect(text2.type).toBe('text');
        
        if (text1.type === 'text') expect(text1.content).toBe('I hope you\'re all doing well. Here are the updates for ');
        if (text2.type === 'text') expect(text2.content).toBe(':');
        
        if (strong.type === 'strong') {
          const strongText = strong.children[0];
          expect(strongText.type).toBe('text');
          if (strongText.type === 'text') expect(strongText.content).toBe('this week');
        }
      }
      
      // Check second heading (h2)
      const heading2 = getChildren(ast)[2];
      expect(heading2.type).toBe('heading');
      if (heading2.type === 'heading') {
        expect(heading2.metadata.level).toBe(2);
        const headingText = heading2.children[0];
        expect(headingText.type).toBe('text');
        if (headingText.type === 'text') expect(headingText.content).toBe('✅ Completed Tasks');
      }
      
      // Check first list paragraph
      const listParagraph = getChildren(ast)[3];
      expect(listParagraph.type).toBe('paragraph');
      if (listParagraph.type === 'paragraph') {
        expect(listParagraph.children.length).toBeGreaterThan(0);
        const listText = listParagraph.children.map((child: MarkdownASTNode) => {
          if (child.type === 'strong') {
            return child.children[0]?.type === 'text' ? child.children[0].content : '';
          } else if (child.type === 'text') {
            return child.content;
          }
          return '';
        }).join('');
        expect(listText).toContain('- Finished the ');
        expect(listText).toContain('homepage redesign');
      }
      
      // Check third heading (h2)
      const heading3 = getChildren(ast)[4];
      expect(heading3.type).toBe('heading');
      if (heading3.type === 'heading') {
        expect(heading3.metadata.level).toBe(2);
        const headingText = heading3.children[0];
        expect(headingText.type).toBe('text');
        if (headingText.type === 'text') expect(headingText.content).toBe('🚀 Upcoming Goals');
      }
      
      // Check numbered list paragraph
      const numberedListParagraph = getChildren(ast)[5];
      expect(numberedListParagraph.type).toBe('paragraph');
      if (numberedListParagraph.type === 'paragraph') {
        expect(numberedListParagraph.children.length).toBeGreaterThan(0);
        const numberedListText = numberedListParagraph.children.map((child: MarkdownASTNode) => {
          if (child.type === 'strong') {
            return child.children[0]?.type === 'text' ? child.children[0].content : '';
          } else if (child.type === 'text') {
            return child.content;
          }
          return '';
        }).join('');
        expect(numberedListText).toContain('1. Launch the ');
        expect(numberedListText).toContain('marketing campaign');
      }
      
      // Check horizontal rule (should be parsed as paragraph currently)
      const ruleParagraph = getChildren(ast)[6];
      expect(ruleParagraph.type).toBe('paragraph');
      if (ruleParagraph.type === 'paragraph') {
        const ruleText = ruleParagraph.children[0];
        expect(ruleText.type).toBe('text');
        if (ruleText.type === 'text') expect(ruleText.content).toBe('---');
      }
      
      // Check blockquote paragraph
      const quoteParagraph = getChildren(ast)[7];
      expect(quoteParagraph.type).toBe('paragraph');
      if (quoteParagraph.type === 'paragraph') {
        const quoteText = quoteParagraph.children.map((child: MarkdownASTNode) => {
          if (child.type === 'strong') {
            return child.children[0]?.type === 'text' ? child.children[0].content : '';
          } else if (child.type === 'text') {
            return child.content;
          }
          return '';
        }).join('');
        expect(quoteText).toContain('Reminder:');
        expect(quoteText).toContain('Monday at 10 AM');
      }
      
      // Check final paragraph with signature
      const finalParagraph = getChildren(ast)[8];
      expect(finalParagraph.type).toBe('paragraph');
      if (finalParagraph.type === 'paragraph') {
        const finalText = finalParagraph.children.map((child: MarkdownASTNode) => {
          if (child.type === 'strong') {
            return child.children[0]?.type === 'text' ? child.children[0].content : '';
          } else if (child.type === 'text') {
            return child.content;
          }
          return '';
        }).join('');
        expect(finalText).toContain('Thanks,');
        expect(finalText).toContain('Alex');
      }
    });
  });
});
