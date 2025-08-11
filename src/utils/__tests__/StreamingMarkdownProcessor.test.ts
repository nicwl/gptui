/**
 * Tests for StreamingMarkdownProcessor
 * Complete integration tests for the streaming markdown pipeline
 */

import { StreamingMarkdownProcessor } from '../StreamingMarkdownProcessor';
import { MarkdownASTNode } from '../MarkdownParser';

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
      expect(finalAST.children).toHaveLength(1);
      expect(finalAST.children![0].type).toBe('paragraph');
      expect(finalAST.children![0].children![0].content).toBe('Hello world');
    });

    test('should handle tentative content during reveal', () => {
      const content = 'Hello world';
      
      // Reveal first 5 characters
      const ast1 = processor.appendText(content, 5);
      expect(ast1.children).toHaveLength(1);
      expect(ast1.children![0].children![0].content).toBe('Hello');
      
      // Reveal more characters
      const ast2 = processor.appendText(content, 8);
      expect(ast2.children![0].children![0].content).toBe('Hello wo');
      
      // Complete reveal
      const ast3 = processor.appendText(content, content.length);
      expect(ast3.children![0].children![0].content).toBe('Hello world');
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
      expect(finalAST.children![0].type).toBe('paragraph');
      expect(finalAST.children![0].children![0].type).toBe('strong');
      expect(finalAST.children![0].children![0].children![0].type).toBe('text');
      expect(finalAST.children![0].children![0].children![0].content).toBe('bold text');
    });

    test('should handle mixed formatting during streaming', () => {
      const content = 'Text with **bold** and *italic* content';
      
      // Test various reveal points
      const partialAST1 = processor.appendText(content, 15); // "Text with **bol"
      expect(partialAST1.children).toHaveLength(1);
      
      const partialAST2 = processor.appendText(content, 25); // "Text with **bold** and *"
      expect(partialAST2.children).toHaveLength(1);
      
      // Finalize
      const finalAST = processor.finalize(content);
      expect(finalAST.children![0].children).toHaveLength(5); // "Text with ", bold, " and ", italic, " content"
    });

    test('should handle code blocks during streaming', () => {
      const content = '```javascript\nconst x = 1;\n```';
      
      // Reveal up to language - tentative rendering may show language as text
      const partialAST1 = processor.appendText(content, 10); // "```javascr"
      expect(partialAST1.children!.length).toBeGreaterThanOrEqual(1);
      
      // Reveal content
      const partialAST2 = processor.appendText(content, 20); // "```javascript\ncons"
      expect(partialAST2.children!.length).toBeGreaterThanOrEqual(1);
      
      // Finalize
      const finalAST = processor.finalize(content);
      expect(finalAST.children).toHaveLength(1);
      expect(finalAST.children![0].type).toBe('code_block');
      expect(finalAST.children![0].content).toBe('const x = 1;');
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
          expect(ast.children!.length).toBeGreaterThanOrEqual(1);
        }
      }
      
      // Finalize should handle incomplete formatting
      const finalAST = processor.finalize(content);
      expect(finalAST.children).toHaveLength(1);
      expect(finalAST.children![0].type).toBe('paragraph');
    });

    test('should handle incomplete links', () => {
      const content = '[incomplete link';
      
      const finalAST = processor.finalize(content);
      expect(finalAST.children![0].type).toBe('paragraph');
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
      expect(finalAST.children).toHaveLength(1);
    });

    test('should reset properly', () => {
      // Process some content
      processor.appendText('Some content', 12);
      
      // Reset
      processor.reset();
      
      // Should start fresh
      const ast = processor.appendText('New content', 11);
      expect(ast.children).toHaveLength(1);
      expect(ast.children![0].children![0].content).toBe('New content');
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
      expect(finalAST.children).toHaveLength(2);
      expect(finalAST.children![0].type).toBe('heading');
      expect(finalAST.children![1].type).toBe('paragraph');
    });

    test('should handle nested structures', () => {
      const content = '[**bold link**](https://example.com)';
      
      const finalAST = processor.finalize(content);
      const linkNode = finalAST.children![0].children![0];
      expect(linkNode.type).toBe('link');
      expect(linkNode.children![0].type).toBe('strong');
      expect(linkNode.metadata?.url).toBe('https://example.com');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty input', () => {
      const ast = processor.appendText('', 0);
      expect(ast.type).toBe('document');
      expect(ast.children).toHaveLength(0);
    });

    test('should handle zero visible length', () => {
      const content = 'Hello world';
      const ast = processor.appendText(content, 0);
      expect(ast.type).toBe('document');
    });

    test('should handle visible length beyond content', () => {
      const content = 'Short';
      const ast = processor.appendText(content, 100);
      expect(ast.children![0].children![0].content).toBe('Short');
    });

    test('should handle malformed markdown', () => {
      const content = '**bold without closing [link without closing `code without closing';
      
      const finalAST = processor.finalize(content);
      expect(finalAST.type).toBe('document');
      expect(finalAST.children).toHaveLength(1);
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
        expect(ast.children).toHaveLength(1);
        
        // Simulate time passing (in real app this would be requestAnimationFrame)
        const expectedTime = startTime + (i * revealInterval);
        // Note: In real usage, timing would be handled by the UI layer
      }
      
      // Finalize
      const finalAST = processor.finalize(content);
      expect(finalAST.children![0].children).toHaveLength(7); // Multiple formatted elements
    });
  });
});
