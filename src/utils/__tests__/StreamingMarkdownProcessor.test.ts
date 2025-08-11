/**
 * Tests for StreamingMarkdownProcessor
 * Complete integration tests for the streaming markdown pipeline
 */

import { StreamingMarkdownProcessor } from '../StreamingMarkdownProcessor';
import { MarkdownASTNode } from '../MarkdownParser';

// Helper function to safely get children from document node
function getChildren(node: MarkdownASTNode): MarkdownASTNode[] {
  return node.type === 'document' ? node.children : [];
}

// Helper function to safely get content from content nodes
function getContent(node: MarkdownASTNode): string {
  return (node.type === 'text' || node.type === 'code_block' || node.type === 'code_inline') ? node.content : '';
}

describe('StreamingMarkdownProcessor', () => {
  let processor: StreamingMarkdownProcessor;
  let astUpdates: MarkdownASTNode[][] = [];

  beforeEach(() => {
    astUpdates = [];
    processor = new StreamingMarkdownProcessor((ast) => {
      astUpdates.push(ast);
    });
  });

  describe('Basic text processing', () => {
    test('should process simple text incrementally', () => {
      const content = 'Hello world';
      
      // Simulate character-by-character reveal
      for (let i = 1; i <= content.length; i++) {
        const ast = processor.appendText(content, i);
        expect(ast.type).toBe('document');
      }
      
      // Finalize
      const finalAST = processor.finalize(content);
      expect(getChildren(finalAST)).toHaveLength(1);
      const paragraph = getChildren(finalAST)[0];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        const text = paragraph.children[0];
        expect(text.type).toBe('text');
        if (text.type === 'text') expect(text.content).toBe('Hello world');
      }
    });

    test('should handle tentative content during reveal', () => {
      const content = 'Hello world';
      
      // Reveal first 5 characters
      const ast1 = processor.appendText(content, 5);
      expect(getChildren(ast1)).toHaveLength(1);
      const text1 = getChildren(ast1)[0];
      expect(text1.type).toBe('text');
      if (text1.type === 'text') expect(text1.content).toBe('Hello');
      
      // Reveal more characters
      const ast2 = processor.appendText(content, 8);
      const text2 = getChildren(ast2)[0];
      if (text2.type === 'text') expect(text2.content).toBe('Hello wo');
      
      // Complete reveal
      const ast3 = processor.appendText(content, content.length);
      const text3 = getChildren(ast3)[0];
      if (text3.type === 'text') expect(text3.content).toBe('Hello world');
    });
  });

  describe('Markdown formatting during streaming', () => {
    test('should handle bold text formation', () => {
      const content = '**bold text**';
      
      // Reveal character by character - this is the intended usage
      for (let i = 1; i <= content.length; i++) {
        processor.appendText(content, i);
      }
      
      // Finalize to see complete structure
      const finalAST = processor.finalize(content);
      const paragraph = getChildren(finalAST)[0];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        const strong = paragraph.children[0];
        expect(strong.type).toBe('strong');
        if (strong.type === 'strong') {
          const text = strong.children[0];
          expect(text.type).toBe('text');
          if (text.type === 'text') expect(text.content).toBe('bold text');
        }
      }
    });

    test('should handle mixed formatting during streaming', () => {
      const content = 'Text with **bold** and *italic* content';
      
      // Test various reveal points
      const partialAST1 = processor.appendText(content, 15); // "Text with **bol"
      expect(getChildren(partialAST1)).toHaveLength(1);
      
      const partialAST2 = processor.appendText(content, 25); // "Text with **bold** and *"
      expect(getChildren(partialAST2)).toHaveLength(1);
      
      // Finalize
      const finalAST = processor.finalize(content);
      const finalParagraph = getChildren(finalAST)[0];
      expect(finalParagraph.type).toBe('paragraph');
      if (finalParagraph.type === 'paragraph') {
        expect(finalParagraph.children).toHaveLength(5); // "Text with ", bold, " and ", italic, " content"
      }
    });

    test('should handle code blocks during streaming', () => {
      const content = '```javascript\nconst x = 1;\n```';
      
      // Reveal up to language - tentative rendering may show language as text
      const partialAST1 = processor.appendText(content, 10); // "```javascr"
      expect(getChildren(partialAST1).length).toBeGreaterThanOrEqual(1);
      
      // Reveal content
      const partialAST2 = processor.appendText(content, 20); // "```javascript\ncons"
      expect(getChildren(partialAST2).length).toBeGreaterThanOrEqual(1);
      
      // Finalize
      const finalAST = processor.finalize(content);
      expect(getChildren(finalAST)).toHaveLength(1);
      const codeBlock = getChildren(finalAST)[0];
      expect(codeBlock.type).toBe('code_block');
      if (codeBlock.type === 'code_block') {
        expect(codeBlock.content).toBe('const x = 1;');
      }
    });
  });

  describe('Incomplete markdown handling', () => {
    test('should handle incomplete bold formatting gracefully', () => {
      const content = '**incomplete bold';
      
      // Process incrementally - early positions may not have content yet
      for (let i = 1; i <= content.length; i++) {
        const ast = processor.appendText(content, i);
        expect(ast.type).toBe('document');
        // During early processing, AST might be empty until there's enough content
        // Only check for content once we have substantial text
        if (i > 5) { // After "**inc"
          expect(getChildren(ast).length).toBeGreaterThanOrEqual(1);
        }
      }
      
      // Finalize should handle incomplete formatting
      const finalAST = processor.finalize(content);
      expect(getChildren(finalAST)).toHaveLength(1);
      const paragraph = getChildren(finalAST)[0];
      expect(paragraph.type).toBe('paragraph');
    });

    test('should handle incomplete links', () => {
      const content = '[incomplete link';
      
      const finalAST = processor.finalize(content);
      const paragraph = getChildren(finalAST)[0];
      expect(paragraph.type).toBe('paragraph');
    });
  });

  describe('Performance and state management', () => {
    test('should handle large content efficiently', () => {
      const content = 'Large content '.repeat(1000) + '**bold** ending';
      
      // Should not throw or hang
      const startTime = performance.now();
      
      // Process in chunks
      for (let i = 100; i <= content.length; i += 100) {
        processor.appendText(content, Math.min(i, content.length));
      }
      
      const finalAST = processor.finalize(content);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(getChildren(finalAST)).toHaveLength(1);
    });

    test('should reset properly', () => {
      // Process some content
      processor.appendText('Some content', 12);
      
      // Reset
      processor.reset();
      
      // Should start fresh
      const ast = processor.appendText('New content', 11);
      expect(getChildren(ast)).toHaveLength(1);
      const text = getChildren(ast)[0];
      expect(text.type).toBe('text');
      if (text.type === 'text') expect(text.content).toBe('New content');
    });

    test('should call AST update callback', () => {
      const content = 'Hello **bold** world';
      
      // Clear initial updates
      astUpdates = [];
      
      // Process content that will generate tokens
      for (let i = 1; i <= content.length; i++) {
        processor.appendText(content, i);
      }
      processor.finalize(content);
      
      // Should have received AST updates
      expect(astUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('Complex document structures', () => {
    test('should handle headings and paragraphs', () => {
      const content = '# Heading\n\nParagraph with **bold** text.';
      
      const finalAST = processor.finalize(content);
      expect(getChildren(finalAST)).toHaveLength(2);
      const heading = getChildren(finalAST)[0];
      const paragraph = getChildren(finalAST)[1];
      expect(heading.type).toBe('heading');
      expect(paragraph.type).toBe('paragraph');
    });

    test('should handle nested structures', () => {
      const content = '[**bold link**](https://example.com)';
      
      const finalAST = processor.finalize(content);
      const paragraph = getChildren(finalAST)[0];
      expect(paragraph.type).toBe('paragraph');
      let linkNode: MarkdownASTNode | undefined;
      if (paragraph.type === 'paragraph') {
        linkNode = paragraph.children[0];
      }
      if (linkNode && linkNode.type === 'link') {
        expect(linkNode.type).toBe('link');
        const strong = linkNode.children[0];
        expect(strong.type).toBe('strong');
        expect(linkNode.metadata.url).toBe('https://example.com');
      }
    });
  });

  describe('Edge cases', () => {
    test('should handle empty input', () => {
      const ast = processor.appendText('', 0);
      expect(ast.type).toBe('document');
      expect(getChildren(ast)).toHaveLength(0);
    });

    test('should handle zero visible length', () => {
      const content = 'Hello world';
      const ast = processor.appendText(content, 0);
      expect(ast.type).toBe('document');
    });

    test('should handle visible length beyond content', () => {
      const content = 'Short';
      const ast = processor.appendText(content, 100);
      const text = getChildren(ast)[0];
      expect(text.type).toBe('text');
      if (text.type === 'text') expect(text.content).toBe('Short');
    });

    test('should handle malformed markdown', () => {
      const content = '**bold without closing [link without closing `code without closing';
      
      const finalAST = processor.finalize(content);
      expect(finalAST.type).toBe('document');
      expect(getChildren(finalAST)).toHaveLength(1);
    });
  });

  describe('Streaming simulation', () => {
    test('should simulate real streaming behavior', () => {
      const content = 'Streaming **bold** text with `code` and [links](url).';
      const targetRevealTime = 1000; // 1 second
      const revealInterval = targetRevealTime / content.length;
      
      // Simulate character-by-character reveal with timing
      const startTime = performance.now();
      
      for (let i = 1; i <= content.length; i++) {
        const ast = processor.appendText(content, i);
        
        // Verify AST is always valid
        expect(ast.type).toBe('document');
        expect(getChildren(ast)).toHaveLength(1);
        
        // Simulate time passing (in real app this would be requestAnimationFrame)
        const expectedTime = startTime + (i * revealInterval);
        // Note: In real usage, timing would be handled by the UI layer
      }
      
      // Finalize
      const finalAST = processor.finalize(content);
      const paragraph = getChildren(finalAST)[0];
      expect(paragraph.type).toBe('paragraph');
      if (paragraph.type === 'paragraph') {
        expect(paragraph.children).toHaveLength(7); // Multiple formatted elements
      }
    });
  });
});
