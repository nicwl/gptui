/**
 * Tests for MarkdownParser
 * Refactored to compare entire ASTs via snapshots for clarity.
 */

import { MarkdownParser, MarkdownASTNode } from '../MarkdownParser';
import { MarkdownTokenizer } from '../SimpleMarkdownTokenizer';

function parseMarkdown(text: string): MarkdownASTNode {
  const tokenizer = new MarkdownTokenizer();
  const parser = new MarkdownParser();
  for (const char of text) {
    const tokens = tokenizer.accept(char);
    for (const token of tokens) parser.accept(token);
  }
  const finalTokens = tokenizer.flush();
  for (const token of finalTokens) parser.accept(token);
  parser.flush();
  return parser.getAST();
}

function lines(parts: string[]): string { return parts.join('\n'); }

describe('MarkdownParser (AST snapshots)', () => {
  test.each([
    { name: 'empty document', input: '' },
    { name: 'simple paragraph', input: 'Hello world' },
    { name: 'multiple paragraphs', input: lines(['Paragraph 1', '', 'Paragraph 2']) },
    { name: 'ATX heading level 1', input: '# Heading 1' },
    { name: 'multiple heading levels', input: lines(['# H1', '## H2', '### H3']) },
    { name: 'fenced code block', input: '```\ncode content\n```' },
    { name: 'fenced code block with language', input: '```javascript\nconst x = 1;\n```' },
    { name: 'inline code', input: 'Some `inline code` here' },
    { name: 'bold text', input: '**bold text**' },
    { name: 'italic text', input: '*italic text*' },
    { name: 'nested emphasis', input: '**bold *and italic* text**' },
    { name: 'simple link', input: '[link text](https://example.com)' },
    { name: 'link with emphasis', input: '[**bold link**](url)' },
    { name: 'non-link brackets', input: 'This [is not a link] and neither is [this one' },
    { name: 'incomplete link syntax', input: '[link text without url] and [another](incomplete' },
    { name: 'blockquote simple', input: lines(['> This is a quote', '> that continues.']) },
    { name: 'blockquote with emphasis and link', input: '> *emphasis* and [link](https://example.com)' },
    { name: 'horizontal rule --- between paragraphs', input: lines(['First', '---', 'Second']) },
    { name: 'horizontal rule *** only', input: '***' },
    { name: 'triple-asterisk strong emphasis (with nested em)', input: '***very important*** and ***nested *em* inside***' },
    { name: 'mixed content', input: lines(['# Heading', '', 'This is **bold** and *italic* with `code`.', '', '```js', 'console.log("hello");', '```']) },
    { name: 'flush with open formatting', input: '**incomplete bold' },
    { name: 'only whitespace', input: '   \n  \t  ' },
    { name: 'malformed markdown', input: '**bold without closing *italic without closing [link without closing' },
    // Lists
    { name: 'unordered list (simple)', input: lines(['- First item', '- Second item', '- Third item']) },
    { name: 'ordered list (simple)', input: lines(['1. First item', '2. Second item', '3. Third item']) },
    { name: 'nested unordered list', input: lines(['- First item', '  - Nested item', '  - Another nested item', '- Second item', '  - More nesting', '    - Deep nesting']) },
    { name: 'mixed nested lists', input: lines(['1. First ordered item', '   - Unordered nested', '   - Another unordered', '2. Second ordered item', '   1. Nested ordered', '   2. Another nested ordered']) },
    { name: 'list items with formatting', input: lines(['- **Bold item** with normal text', '- *Italic item* and `code`', '- [Link item](https://example.com) with description', '1. **Bold ordered** item', '2. Item with `inline code` snippet']) },
    { name: 'complex nested lists with formatting', input: lines(['1. **Main task**: Complete the project', '   - Subtask with *emphasis*', '   - Another subtask with `code`', '      1. Deep nested **bold** task', '      2. Another deep task with [link](https://test.com)', '2. **Second main task**: Review and test', '   - Review `codebase`', '   - Test **critical paths**']) },
    { name: 'list item with multiple paragraphs', input: lines(['- First item', '', '  Second paragraph of first item', '', '- Second item with single paragraph']) },
    // Complex real world content
    { name: 'complex team update message', input: lines([
      '# Hello, Team! 👋',
      '',
      "I hope you're all doing well. Here are the updates for **this week**:",
      '',
      '## ✅ Completed Tasks',
      '- Finished the **homepage redesign**',
      '- Deployed the **v2.3 update**',
      '- Fixed the login authentication bug',
      '',
      '## 🚀 Upcoming Goals',
      '1. Launch the **marketing campaign**',
      '2. Test the **mobile app beta**',
      '3. Prepare **quarterly report**',
      '',
      '---',
      '',
      '> **Reminder:** The next team meeting is on **Monday at 10 AM**.  ',
      '> Please bring your progress reports.',
      '',
      'Thanks,  ',
      '**Alex**',
    ]) },
    // Code block newlines
    { name: 'code block preserves newlines', input: '```\nfunction test() {\n  console.log("hello");\n  return true;\n}\n```' },
    { name: 'code block preserves empty lines', input: '```\nline1\n\nline3\n\nline5\n```' },
    // New formatting support
    { name: 'underscore italic', input: '_text_' },
    { name: 'underscore strong', input: '__text__' },
    { name: 'triple underscore strong emphasis', input: '___text___' },
    { name: 'mixed bold+italic **_text_**', input: '**_text_**' },
    { name: 'mixed bold+italic _**text**_', input: '_**text**_' },
    { name: 'triple asterisk yields bold+italic', input: '***text***' },
    { name: 'strikethrough', input: '~~text~~' },
    { name: 'mixed strong+strike', input: '**~~gone~~** and ~~**gone too**~~' },
  ])('$name', ({ input }) => {
      const ast = parseMarkdown(input);
    expect(ast).toMatchSnapshot();
  });
});
