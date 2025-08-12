/**
 * Curated CommonMark examples with inline snapshots representing the
 * correct AST per the spec. These are intentionally strict and some
 * will fail until the parser is fixed, which is desired.
 */

import { MarkdownParser, MarkdownASTNode } from '../MarkdownParser';
import { MarkdownTokenizer } from '../SimpleMarkdownTokenizer';

function parseMarkdown(text: string): MarkdownASTNode {
  const tokenizer = new MarkdownTokenizer();
  const parser = new MarkdownParser();
  for (const ch of text) {
    const tokens = tokenizer.accept(ch);
    for (const t of tokens) parser.accept(t);
  }
  for (const t of tokenizer.flush()) parser.accept(t);
  parser.flush();
  return parser.getAST();
}

describe('MarkdownParser – Curated CommonMark correctness tests (inline snapshots)', () => {
  test('Tabs example 1: indented code block via tab', () => {
    // From CommonMark example 1
    const md = "\tfoo\tbaz\t\tbim\n";
    const ast = parseMarkdown(md);
    const expected: MarkdownASTNode = {
      type: 'document',
      children: [
        { type: 'code_block', content: 'foo\tbaz\t\tbim\n' },
      ],
    };
    expect(ast).toEqual(expected);
  });

  test('Tabs example 4: list item with second paragraph', () => {
    // From CommonMark example 4
    const md = "  - foo\n\n\tbar\n";
    const ast = parseMarkdown(md);
    const expected: MarkdownASTNode = {
      type: 'document',
      children: [
        {
          type: 'list_item',
          metadata: { depth: 2, ordered: false },
          children: [
            { type: 'paragraph', children: [ { type: 'text', content: 'foo' } ] },
            { type: 'paragraph', children: [ { type: 'text', content: 'bar' } ] },
          ],
        },
      ],
    };
    expect(ast).toEqual(expected);
  });

  test('Thematic breaks example 43: three horizontal rules', () => {
    // From CommonMark example 43
    const md = "***\n---\n___\n";
    const ast = parseMarkdown(md);
    const expected: MarkdownASTNode = {
      type: 'document',
      children: [ { type: 'hr' }, { type: 'hr' }, { type: 'hr' } ],
    };
    expect(ast).toEqual(expected);
  });

  test('Fenced code blocks example 121: two backticks make inline code', () => {
    // From CommonMark example 121
    const md = "``\nfoo\n``\n";
    const ast = parseMarkdown(md);
    const expected: MarkdownASTNode = {
      type: 'document',
      children: [ { type: 'paragraph', children: [ { type: 'code_inline', content: 'foo' } ] } ],
    };
    expect(ast).toEqual(expected);
  });

  test('Setext headings example 80: h1 and h2 with emphasis content', () => {
    // From CommonMark example 80
    const md = "Foo *bar*\n=========\n\nFoo *bar*\n---------\n";
    const ast = parseMarkdown(md);
    const expected: MarkdownASTNode = {
      type: 'document',
      children: [
        {
          type: 'heading',
          metadata: { level: 1 },
          children: [
            { type: 'text', content: 'Foo ' },
            { type: 'emphasis', children: [ { type: 'text', content: 'bar' } ] },
          ],
        },
        {
          type: 'heading',
          metadata: { level: 2 },
          children: [
            { type: 'text', content: 'Foo ' },
            { type: 'emphasis', children: [ { type: 'text', content: 'bar' } ] },
          ],
        },
      ],
    };
    expect(ast).toEqual(expected);
  });

  test('ATX headings example 65: escaped hash is literal text', () => {
    // From CommonMark example 65
    const md = "\\## foo\n";
    const ast = parseMarkdown(md);
    const expected: MarkdownASTNode = {
      type: 'document',
      children: [ { type: 'paragraph', children: [ { type: 'text', content: '## foo' } ] } ],
    };
    expect(ast).toEqual(expected);
  });

  test('Links example 485: basic inline link', () => {
    // From CommonMark example 485
    const md = "[link](/uri)\n";
    const ast = parseMarkdown(md);
    const expected: MarkdownASTNode = {
      type: 'document',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'link', metadata: { url: '/uri' }, children: [ { type: 'text', content: 'link' } ] },
          ],
        },
      ],
    };
    expect(ast).toEqual(expected);
  });

  test('Emphasis example 430: strong with nested emphasis', () => {
    // From CommonMark example 430
    const md = "**foo *bar* baz**\n";
    const ast = parseMarkdown(md);
    const expected: MarkdownASTNode = {
      type: 'document',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'strong',
              children: [
                { type: 'text', content: 'foo ' },
                { type: 'emphasis', children: [ { type: 'text', content: 'bar' } ] },
                { type: 'text', content: ' baz' },
              ],
            },
          ],
        },
      ],
    };
    expect(ast).toEqual(expected);
  });

  test('Links example 497: escaped parens in destination', () => {
    // From CommonMark example 497
    const md = "[link](\\(foo\\))\n";
    const ast = parseMarkdown(md);
    const expected: MarkdownASTNode = {
      type: 'document',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'link', metadata: { url: '(foo)' }, children: [ { type: 'text', content: 'link' } ] },
          ],
        },
      ],
    };
    expect(ast).toEqual(expected);
  });
});


