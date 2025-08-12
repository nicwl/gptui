/**
 * Pushdown automaton Markdown parser (streaming-friendly)
 * - Block-level PDA with simple inline parser
 * - No regex; consumes tokenizer tokens incrementally
 */

import { Token, TokenType } from './SimpleMarkdownTokenizer';

export type MarkdownASTNode =
  | { type: 'text'; content: string }
  | { type: 'document'; children: MarkdownASTNode[] }
  | { type: 'paragraph'; children: MarkdownASTNode[] }
  | { type: 'heading'; children: MarkdownASTNode[]; metadata: { level: number } }
  | { type: 'code_block'; content: string; metadata?: { language?: string } }
  | { type: 'code_inline'; content: string }
  | { type: 'strong'; children: MarkdownASTNode[] }
  | { type: 'strong_emphasis'; children: MarkdownASTNode[] }
  | { type: 'emphasis'; children: MarkdownASTNode[] }
  | { type: 'strikethrough'; children: MarkdownASTNode[] }
  | { type: 'link'; children: MarkdownASTNode[]; metadata: { url: string } }
  | { type: 'blockquote'; children: MarkdownASTNode[] }
  | { type: 'list_item'; children: MarkdownASTNode[]; metadata: { depth: number; ordered: boolean; number?: number } }
  | { type: 'hr' };

export function hasContent(node: MarkdownASTNode): node is { type: 'text' | 'code_block' | 'code_inline'; content: string } {
  return node.type === 'text' || node.type === 'code_block' || node.type === 'code_inline';
}

export function hasChildren(node: MarkdownASTNode): node is Extract<MarkdownASTNode, { children: any }> {
  return 'children' in node;
}

enum BlockState { Document, Paragraph, Heading, CodeBlock, ListItem, Blockquote }

export class MarkdownParser {
  private ast: MarkdownASTNode & { type: 'document'; children: MarkdownASTNode[] } = { type: 'document', children: [] };
  private blockState: BlockState = BlockState.Document;
  private currentContainer: (MarkdownASTNode & { children?: MarkdownASTNode[] }) | null = null;
  private currentInline: Token[] = [];
  private lineTokens: Token[] = [];
  private sawBlankLine = false;
  private headingLevel = 0;
  private codeLanguage = '';
  private codeHeader = false;
  // Track active list item to allow continuation paragraphs after blank lines
  private activeListItem: (MarkdownASTNode & { type: 'list_item'; children: MarkdownASTNode[] }) | null = null;
  // Track whether current code block is indented (vs fenced)
  private codeBlockIsIndented = false;

  accept(token: Token): void {
    switch (this.blockState) {
      case BlockState.CodeBlock:
        this.acceptInCodeBlock(token);
        break;
      default:
        this.acceptInFlow(token);
        break;
    }
    if (token.type !== TokenType.NEWLINE && token.type !== TokenType.EOF) this.lineTokens.push(token);
  }

  flush(): void {
    this.accept({ type: TokenType.EOF, content: '', position: -1 });
    this.finalizeOpenBlock();
  }

  getAST(): MarkdownASTNode { return this.ast; }
  getASTReference(): MarkdownASTNode { return this.ast; }
  getBufferedTokens(): Token[] { return []; }
  reset(): void {
    this.ast = { type: 'document', children: [] };
    this.blockState = BlockState.Document;
    this.currentContainer = null;
    this.currentInline = [];
    this.lineTokens = [];
    this.sawBlankLine = false;
    this.headingLevel = 0;
    this.codeLanguage = '';
    this.codeHeader = false;
  }

  private acceptInFlow(token: Token): void {
    // Structural at line-start
    if (token.type === TokenType.TRIPLE_BACKTICK) { this.commitDeferredStartTokens(); this.startCodeBlock(); return; }
    if (token.type === TokenType.HASH_SEQUENCE && this.isStartOfLine()) { this.startHeading(Math.min(6, token.content.length)); return; }
    if (token.type === TokenType.GREATER && this.isStartOfLine()) { if (this.blockState !== BlockState.Blockquote) { this.startBlockquote(); } return; }

    // If we have an active list item and we just saw a blank line, an indented
    // line should start a new paragraph within the same list item. Drop leading
    // indentation for that paragraph.
    if (this.activeListItem && this.sawBlankLine && this.isStartOfLine()) {
      if (token.type === TokenType.SPACE || token.type === TokenType.TAB) {
        this.deferredStartTokens.push(token);
        return;
      } else if (this.deferredStartTokens.length > 0) {
        // Drop collected indentation and start the continuation paragraph
        this.deferredStartTokens = [];
        this.startParagraphUnderActiveListItem();
        // Fall through to normal handling to add the first content token
      }
    }

    // Defer potential list markers at the beginning of a line
    const isPotentialListChar = (
      token.type === TokenType.SPACE || token.type === TokenType.TAB || token.type === TokenType.DASH ||
      token.type === TokenType.PLUS || token.type === TokenType.ASTERISK || token.type === TokenType.DIGIT_SEQUENCE ||
      token.type === TokenType.PERIOD || (token as any).type === (TokenType as any).TRIPLE_ASTERISK
    );
    if (this.isStartOfLine() || (this as any).deferredStartTokens?.length > 0) {
      if (isPotentialListChar) {
        // @ts-ignore
        this.deferredStartTokens.push(token);
        // On space, attempt to resolve into a list marker or commit as plain text
        if (token.type === TokenType.SPACE) {
          // Use deferred tokens gathered for this line start, plus this space
          // @ts-ignore
          const tokensForCheck = [...this.deferredStartTokens];
          const marker = this.detectListMarkerFromTokens(tokensForCheck);
          if (marker) {
            if (this.canStartListHere()) {
              this.startListItem(marker.depth, marker.ordered, marker.number);
              // Clear deferred; content for the item starts after marker
              // @ts-ignore
              this.deferredStartTokens = [];
              return;
            }
            // Not allowed to start list here; treat as text
            this.commitDeferredStartTokens();
            // Clear deferred; content for the item starts after marker
            // @ts-ignore
            this.deferredStartTokens = [];
            return;
          } else {
            // Not enough info yet; keep deferring until a non-marker token arrives
            return;
          }
        }
        return;
      } else if ((this as any).deferredStartTokens?.length > 0) {
        // Non-marker token encountered; see if the deferred tokens are pure indentation
        if (this.isStartOfLine() && this.isOnlyIndentation(this.deferredStartTokens) && this.getIndentationColumns(this.deferredStartTokens) >= 4 && !this.activeListItem) {
          // Start an indented code block and consume the current token as part of it
          this.deferredStartTokens = [];
          this.startIndentedCodeBlock();
          this.acceptInCodeBlock(token);
          return;
        }
        // Otherwise, commit deferred as regular inline
        this.commitDeferredStartTokens();
      }
    }

    // Spaces handling and list detection
    if (token.type === TokenType.SPACE) {
      if (this.blockState === BlockState.Heading && this.currentInline.length === 0) {
        // ignore a single space right after heading marker
        return;
      }
      if (!this.isStartOfLine()) {
        const marker = this.extractListMarkerWithPendingSpace(token);
        if (marker) {
          if (this.canStartListHere()) {
            this.startListItem(marker.depth, marker.ordered, marker.number);
            // @ts-ignore
            this.deferredStartTokens = [];
            return;
          } else {
            this.commitDeferredStartTokens();
          }
        }
        // Not a marker: commit deferred and continue
        this.commitDeferredStartTokens();
      } else {
        // leading indentation or potential marker: defer
        this.deferredStartTokens.push(token);
        return;
      }
    }

    // At true start of a new line, defer emitting potential list-marker components
    if (this.isStartOfLine()) {
      if (
        token.type === TokenType.TAB || token.type === TokenType.DASH || token.type === TokenType.PLUS ||
        token.type === TokenType.ASTERISK || token.type === TokenType.DIGIT_SEQUENCE || token.type === TokenType.PERIOD ||
        (token as any).type === (TokenType as any).TRIPLE_ASTERISK
      ) {
        // Defer line-start structural candidates (including potential hr sequences)
        this.deferredStartTokens.push(token);
        return;
      }
    } else if (this.deferredStartTokens.length > 0) {
      if (token.type === TokenType.SPACE) {
        // handled above in SPACE handling for list marker detection
      } else if (token.type === TokenType.NEWLINE || token.type === TokenType.EOF) {
        // Leave deferred tokens untouched; newline/EOF handlers will decide (e.g., hr detection)
      } else {
        // If deferred tokens look like a potential hr sequence and current token continues it, keep deferring
        if (this.isAllHrChars(this.deferredStartTokens) && (token.type === TokenType.DASH || token.type === TokenType.ASTERISK || (token as any).type === (TokenType as any).TRIPLE_ASTERISK || (token as any).type === (TokenType as any).TRIPLE_UNDERSCORE)) {
          this.deferredStartTokens.push(token);
          return;
        }
        // If deferred tokens are pure indentation (>= 4 columns) at start of line and not within a list item,
        // treat this as an indented code block
        if (this.isStartOfLine() && this.isOnlyIndentation(this.deferredStartTokens) && this.getIndentationColumns(this.deferredStartTokens) >= 4 && !this.activeListItem) {
          this.deferredStartTokens = [];
          this.startIndentedCodeBlock();
          this.acceptInCodeBlock(token);
          return;
        }
        // Not a list marker or hr sequence, commit deferred
        this.commitDeferredStartTokens();
      }
    }

    // Before switching on token, if at line start and we have only hr chars in deferred, keep deferring
    if (this.isStartOfLine() && this.deferredStartTokens.length > 0 && this.isAllHrChars(this.deferredStartTokens)) {
      // For hr lines, we don't want to create a paragraph or commit text; we wait for newline to detect and emit hr
      return;
    }
    switch (token.type) {
      case TokenType.NEWLINE:
        this.handleNewlineInFlow();
        break;
      case TokenType.SPACE:
        // Should have been handled above
        // For safety, treat as normal whitespace
        this.ensureBlock();
        this.currentInline.push(token);
        this.sawBlankLine = false;
        this.updateCurrentInlineChildren();
        break;
      case TokenType.EOF:
        this.handleEOFInFlow();
        break;
      default:
        this.ensureBlock();
        this.currentInline.push(token);
        this.sawBlankLine = false;
        this.updateCurrentInlineChildren();
        break;
    }
  }

  private acceptInCodeBlock(token: Token): void {
    if (token.type === TokenType.TRIPLE_BACKTICK) {
      const codeNode = this.ast.children[this.ast.children.length - 1];
      if (codeNode && codeNode.type === 'code_block' && codeNode.content.endsWith('\n')) {
        codeNode.content = codeNode.content.slice(0, -1);
      }
      this.blockState = BlockState.Document;
      this.currentContainer = null;
      this.codeLanguage = '';
      this.codeHeader = false;
      this.codeBlockIsIndented = false;
      return;
    }
    const codeNode = this.ast.children[this.ast.children.length - 1];
    if (!codeNode || codeNode.type !== 'code_block') return;
    // Handle optional language header line
    if (this.codeHeader) {
      if (token.type === TokenType.NEWLINE) {
        const lang = this.codeLanguage.trim();
        if (lang.length > 0) {
          // attach language metadata only when non-empty
          (codeNode as any).metadata = { ...(codeNode as any).metadata, language: lang };
        }
        this.codeHeader = false;
      } else {
        this.codeLanguage += token.content;
      }
      return;
    }
    codeNode.content += token.type === TokenType.NEWLINE ? '\n' : token.content;
  }

  private startCodeBlock(): void {
    this.finalizeOpenBlock();
    const node: MarkdownASTNode = { type: 'code_block', content: '' } as any;
    this.ast.children.push(node);
    this.blockState = BlockState.CodeBlock;
    this.codeLanguage = '';
    this.codeHeader = true;
    this.codeBlockIsIndented = false;
  }

  private startIndentedCodeBlock(): void {
    this.finalizeOpenBlock();
    const node: MarkdownASTNode = { type: 'code_block', content: '' } as any;
    this.ast.children.push(node);
    this.blockState = BlockState.CodeBlock;
    this.codeLanguage = '';
    this.codeHeader = false;
    this.codeBlockIsIndented = true;
  }

  private startHeading(level: number): void {
    this.finalizeOpenBlock();
    const node: MarkdownASTNode = { type: 'heading', children: [], metadata: { level } };
    this.ast.children.push(node);
    this.currentContainer = node;
    this.blockState = BlockState.Heading;
    this.headingLevel = level;
    // Reset line tokens to capture heading text cleanly, but ignore a single leading space
    this.lineTokens = [];
    // Ensure we drop a single literal SPACE if it immediately follows the marker
    // by recording that the first SPACE should be ignored. We'll treat the first
    // SPACE token after heading start as a no-op in acceptInFlow.
  }

  private startParagraph(): void {
    const node: MarkdownASTNode = { type: 'paragraph', children: [] };
    this.ast.children.push(node);
    this.currentContainer = node;
    this.blockState = BlockState.Paragraph;
  }

  private startBlockquote(): void {
    // If previous blockquote exists and last token was newline (continuation), keep appending
    const last = this.ast.children[this.ast.children.length - 1];
    if (last && last.type === 'blockquote' && this.blockState !== BlockState.Blockquote) {
      this.currentContainer = last;
      this.blockState = BlockState.Blockquote;
      return;
    }
    this.finalizeOpenBlock();
    const node: MarkdownASTNode = { type: 'blockquote', children: [] };
    this.ast.children.push(node);
    this.currentContainer = node;
    this.blockState = BlockState.Blockquote;
  }

  private startListItem(depth: number, ordered: boolean, number?: number): void {
    this.finalizeOpenBlock();
    const node: MarkdownASTNode = { type: 'list_item', children: [], metadata: { depth, ordered, number } };
    this.ast.children.push(node);
    // create first paragraph inside list item
    const para: MarkdownASTNode = { type: 'paragraph', children: [] } as any;
    (node as any).children.push(para);
    this.currentContainer = para;
    this.blockState = BlockState.ListItem;
    this.activeListItem = node as any;
    // When starting a list item, drop the marker tokens from current line buffer
    this.currentInline = [];
    // Reset line context so subsequent content is treated as list item text
    this.lineTokens = [];
  }

  private ensureBlock(): void {
    if (this.blockState === BlockState.Document) this.startParagraph();
  }

  private handleNewlineInFlow(): void {
    // Setext underline detection (for previous paragraph)
    const setextLevel = this.isSetextUnderlineLine(this.lineTokens);
    if (setextLevel > 0) {
      this.removeTrailingUnderlineParagraph();
      const prev = this.ast.children[this.ast.children.length - 1];
      if (prev && prev.type === 'paragraph') {
        const heading: MarkdownASTNode = { type: 'heading', children: (prev as any).children || [], metadata: { level: setextLevel } } as any;
        this.ast.children[this.ast.children.length - 1] = heading;
      }
      this.blockState = BlockState.Document;
      this.currentContainer = null;
      this.sawBlankLine = false;
      this.lineTokens = [];
      this.deferredStartTokens = [];
      return;
    }
    // Horizontal rule detection for the just-finished line MUST happen before committing deferred tokens
    const hrCandidateTokens = this.deferredStartTokens.length > 0 ? [...this.lineTokens, ...this.deferredStartTokens] : this.lineTokens;
    if (this.isHrLine(hrCandidateTokens)) {
      // If we're in the middle of a block, end it first
      if (this.blockState === BlockState.Paragraph || this.blockState === BlockState.Heading || this.blockState === BlockState.ListItem || this.blockState === BlockState.Blockquote) {
        // Remove any trailing HR-like tokens that may have been appended to inline buffer
        this.stripTrailingHrFromCurrentInline();
        this.flushInline();
        this.blockState = BlockState.Document;
        this.currentContainer = null;
      }
      // If previous AST node is a paragraph that contains only HR characters, remove it
      this.removeTrailingHrOnlyParagraph();
      (this.ast.children as any).push({ type: 'hr' } as MarkdownASTNode);
      this.lineTokens = [];
      this.sawBlankLine = false;
      // Clear any deferred tokens representing the hr line; do NOT commit them as text
      this.deferredStartTokens = [];
      return;
    }
    // No hr: now commit deferred tokens if any
    if (this.deferredStartTokens && (this.deferredStartTokens as any).length > 0) { this.commitDeferredStartTokens(); }
    if (this.blockState === BlockState.Heading) {
      // Headings end at newline
      this.flushInline();
      this.blockState = BlockState.Document;
      this.currentContainer = null;
      this.sawBlankLine = false;
      this.lineTokens = [];
      // @ts-ignore
      if (this.deferredStartTokens) this.deferredStartTokens = [] as any;
      return;
    }
    if (this.blockState === BlockState.ListItem) {
      // End current list item line; next marker will start a new item
      this.flushInline();
      this.blockState = BlockState.Document;
      this.currentContainer = null;
      this.sawBlankLine = false;
      this.lineTokens = [];
      // @ts-ignore
      if (this.deferredStartTokens) this.deferredStartTokens = [] as any;
      return;
    }
    if (this.blockState === BlockState.Blockquote) {
      // Continue blockquote across single newline; end on blank line
      if (this.sawBlankLine) {
        this.flushInline();
        this.blockState = BlockState.Document;
        this.currentContainer = null;
        this.sawBlankLine = false;
      } else {
        // newline within blockquote should be treated as a space between lines
        this.currentInline.push({ type: TokenType.SPACE, content: ' ', position: -1 });
        this.sawBlankLine = true;
      }
      this.lineTokens = [];
      // @ts-ignore
      if (this.deferredStartTokens) this.deferredStartTokens = [] as any;
      return;
    }
    if (this.blockState === BlockState.Paragraph) {
      // Soft break on single newline, new paragraph on blank line
      if (this.sawBlankLine) {
        // End paragraph after blank line
        this.flushInline();
        this.blockState = BlockState.Document;
        this.currentContainer = null;
        this.sawBlankLine = false;
      } else {
        // Insert soft break as a space and keep accumulating tokens
        // Only add a space if last token isn't already space
        const last = this.currentInline[this.currentInline.length - 1];
        if (!(last && last.type === TokenType.SPACE)) {
          this.currentInline.push({ type: TokenType.SPACE, content: ' ', position: -1 });
        }
        this.updateCurrentInlineChildren();
        this.sawBlankLine = true;
      }
      this.lineTokens = [];
      // @ts-ignore
      if (this.deferredStartTokens) this.deferredStartTokens = [] as any;
      return;
    }
    // Outside any block: track blank lines for upcoming blocks
    this.sawBlankLine = true;
    this.lineTokens = [];
    // @ts-ignore
    if (this.deferredStartTokens) this.deferredStartTokens = [] as any;
  }

  private isHrLine(tokens: Token[]): boolean {
    if (!tokens || tokens.length === 0) return false;
    let dashes = 0; let stars = 0; let triple = false; let underscores = 0; let tripleUnderscore = false;
    for (const t of tokens) {
      if (t.type === TokenType.SPACE || t.type === TokenType.TAB) continue;
      if (t.type === TokenType.DASH) { dashes++; continue; }
      if (t.type === TokenType.ASTERISK) { stars++; continue; }
      if ((t as any).type === (TokenType as any).TRIPLE_ASTERISK) { triple = true; continue; }
      if ((t as any).type === (TokenType as any).TRIPLE_UNDERSCORE) { tripleUnderscore = true; continue; }
      if ((t as any).type === (TokenType as any).UNDERSCORE) { underscores++; continue; }
      return false;
    }
    return dashes >= 3 || stars >= 3 || underscores >= 3 || triple || tripleUnderscore;
  }

  private isAllHrChars(tokens: Token[]): boolean {
    if (!tokens || tokens.length === 0) return false;
    for (const t of tokens) {
      if (t.type === TokenType.SPACE || t.type === TokenType.TAB) continue;
      if (t.type === TokenType.DASH) continue;
      if (t.type === TokenType.ASTERISK) continue;
      if ((t as any).type === (TokenType as any).TRIPLE_ASTERISK) continue;
      if ((t as any).type === (TokenType as any).UNDERSCORE) continue;
      if ((t as any).type === (TokenType as any).TRIPLE_UNDERSCORE) continue;
      return false;
    }
    return true;
  }

  private handleEOFInFlow(): void {
    // If the current (last) line represents an HR, emit it before finalizing
    const hrCandidateTokens = this.deferredStartTokens.length > 0 ? [...this.lineTokens, ...this.deferredStartTokens] : this.lineTokens;
    if (this.isHrLine(hrCandidateTokens)) {
      if (this.blockState === BlockState.Paragraph || this.blockState === BlockState.Heading || this.blockState === BlockState.ListItem || this.blockState === BlockState.Blockquote) {
        // Remove any trailing HR-like tokens that may have been appended to inline buffer
        this.stripTrailingHrFromCurrentInline();
        this.flushInline();
      }
      // If previous AST node is a paragraph that contains only HR characters, remove it
      this.removeTrailingHrOnlyParagraph();
      (this.ast.children as any).push({ type: 'hr' } as MarkdownASTNode);
      this.blockState = BlockState.Document;
      this.currentContainer = null;
      this.lineTokens = [];
      // @ts-ignore
      if (this.deferredStartTokens) this.deferredStartTokens = [] as any;
      return;
    }
    if (this.deferredStartTokens && (this.deferredStartTokens as any).length > 0) { this.commitDeferredStartTokens(); }
    // remove trailing SPACE tokens (from soft breaks) so we don't introduce spurious trailing spaces
    this.stripTrailingSpacesFromCurrentInline();
    this.flushInline();
    this.blockState = BlockState.Document;
    this.currentContainer = null;
    this.lineTokens = [];
    // @ts-ignore
    if (this.deferredStartTokens) this.deferredStartTokens = [] as any;
  }

  private finalizeOpenBlock(): void {
    if (this.blockState === BlockState.Paragraph || this.blockState === BlockState.Heading || this.blockState === BlockState.ListItem) {
      this.flushInline();
      this.blockState = BlockState.Document;
      this.currentContainer = null;
      this.sawBlankLine = false;
      this.lineTokens = [];
    }
  }

  private canStartListHere(): boolean {
    // Lists can start at the top-level document or right after headings or blank lines
    // Disallow starting a list in the middle of an inline paragraph by requiring current block to be Document or just finalized
    return this.blockState === BlockState.Document || this.sawBlankLine || this.blockState === BlockState.Heading;
  }

  private flushInline(): void {
    if (!this.currentContainer || !('children' in this.currentContainer)) { this.currentInline = []; return; }
    // Commit inline content into the container only if we have uncommitted tokens
    if (this.currentInline.length > 0) {
      (this.currentContainer as any).children = this.parseInline(this.currentInline);
      this.currentInline = [];
    }
  }

  private updateCurrentInlineChildren(): void {
    if (!this.currentContainer || !('children' in this.currentContainer)) return;
    (this.currentContainer as any).children = this.parseInline(this.currentInline);
  }
  // Deferred potential list marker tokens at the start of line
  private deferredStartTokens: Token[] = [];
  private commitDeferredStartTokens(): void {
    if (!this.deferredStartTokens || this.deferredStartTokens.length === 0) return;
    this.ensureBlock();
    for (const t of this.deferredStartTokens) {
      this.currentInline.push(t);
    }
    this.deferredStartTokens = [];
    this.updateCurrentInlineChildren();
  }

  private parseInline(tokens: Token[]): MarkdownASTNode[] {
    const out: MarkdownASTNode[] = [];
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      // Strong (**...**) via dedicated token
      if (t.type === TokenType.DOUBLE_ASTERISK) {
        const j = this.findNext(tokens, i + 1, TokenType.DOUBLE_ASTERISK);
        if (j !== -1) { out.push({ type: 'strong', children: this.parseInline(tokens.slice(i + 1, j)) }); i = j + 1; continue; }
        // If no closing yet, treat as text for now
      }
      // Strong via double underscore (__...__)
      if ((t as any).type === (TokenType as any).DOUBLE_UNDERSCORE) {
        const j = this.findNext(tokens, i + 1, (TokenType as any).DOUBLE_UNDERSCORE);
        if (j !== -1) { out.push({ type: 'strong', children: this.parseInline(tokens.slice(i + 1, j)) }); i = j + 1; continue; }
      }
      // Strong emphasis (***...***)
      if ((t as any).type === (TokenType as any).TRIPLE_ASTERISK) {
        const j = this.findNext(tokens, i + 1, (TokenType as any).TRIPLE_ASTERISK);
        if (j !== -1) { out.push({ type: 'strong_emphasis', children: this.parseInline(tokens.slice(i + 1, j)) }); i = j + 1; continue; }
      }
      // Strong emphasis (___...___)
      if ((t as any).type === (TokenType as any).TRIPLE_UNDERSCORE) {
        const j = this.findNext(tokens, i + 1, (TokenType as any).TRIPLE_UNDERSCORE);
        if (j !== -1) { out.push({ type: 'strong_emphasis', children: this.parseInline(tokens.slice(i + 1, j)) }); i = j + 1; continue; }
      }
      // Fallback: two consecutive ASTERISK tokens behave like DOUBLE_ASTERISK
      if (t.type === TokenType.ASTERISK && i + 1 < tokens.length && tokens[i + 1].type === TokenType.ASTERISK) {
        // Look ahead for matching pair of consecutive asterisks
        let j = i + 2;
        while (j < tokens.length) {
          if (tokens[j].type === TokenType.ASTERISK && j + 1 < tokens.length && tokens[j + 1].type === TokenType.ASTERISK) {
            out.push({ type: 'strong', children: this.parseInline(tokens.slice(i + 2, j)) });
            i = j + 2;
            continue;
          }
          j++;
        }
      }
      // Emphasis (*...*) - only if not immediately a second asterisk (handled by double)
      if (t.type === TokenType.ASTERISK && !(i + 1 < tokens.length && tokens[i + 1].type === TokenType.ASTERISK)) {
        const j = this.findNext(tokens, i + 1, TokenType.ASTERISK);
        if (j !== -1) { out.push({ type: 'emphasis', children: this.parseInline(tokens.slice(i + 1, j)) }); i = j + 1; continue; }
      }
      // Emphasis via underscore (_..._) - not immediately a second underscore
      if ((t as any).type === (TokenType as any).UNDERSCORE && !(i + 1 < tokens.length && (tokens[i + 1] as any).type === (TokenType as any).UNDERSCORE)) {
        const j = this.findNext(tokens, i + 1, (TokenType as any).UNDERSCORE);
        if (j !== -1) { out.push({ type: 'emphasis', children: this.parseInline(tokens.slice(i + 1, j)) }); i = j + 1; continue; }
      }
      // Strikethrough (~~...~~)
      if ((t as any).type === (TokenType as any).DOUBLE_TILDE) {
        const j = this.findNext(tokens, i + 1, (TokenType as any).DOUBLE_TILDE);
        if (j !== -1) { out.push({ type: 'strikethrough', children: this.parseInline(tokens.slice(i + 1, j)) }); i = j + 1; continue; }
      }
      if (t.type === TokenType.BACKTICK) {
        // Support code spans with N backticks; find a matching run of the same length and trim surrounding spaces
        let runLen = 1;
        while (i + runLen < tokens.length && tokens[i + runLen].type === TokenType.BACKTICK) runLen++;
        const j = this.findNextBacktickRun(tokens, i + runLen, runLen);
        if (j !== -1) {
          const contentTokens = tokens.slice(i + runLen, j);
          const raw = contentTokens.map(x => x.content).join('');
          const content = raw.replace(/^\s+|\s+$/g, '');
          out.push({ type: 'code_inline', content });
          i = j + runLen;
          continue;
        }
      }
      if (t.type === TokenType.BRACKET_OPEN) {
        const link = this.tryParseLink(tokens, i);
        if (link) { out.push(link.node); i = link.nextIndex; continue; }
      }
      if (t.type === TokenType.GREATER) {
        // Ignore raw '>' in inline pass; block layer already consumed it
        i++;
        continue;
      }
      // text aggregation
      let text = t.content; let k = i + 1;
      while (k < tokens.length) {
        const nt = tokens[k];
        // Continue aggregating plain text until we hit a potential structure start
        if (nt.type === TokenType.TEXT || nt.type === TokenType.SPACE || nt.type === TokenType.TAB || nt.type === TokenType.NEWLINE || nt.type === TokenType.DIGIT_SEQUENCE || nt.type === TokenType.PERIOD) { text += nt.content; k++; continue; }
        // Also aggregate unmatched literal punctuation
        if (!(nt.type === TokenType.ASTERISK || (nt as any).type === (TokenType as any).UNDERSCORE || nt.type === TokenType.DOUBLE_ASTERISK || (nt as any).type === (TokenType as any).DOUBLE_UNDERSCORE || (nt as any).type === (TokenType as any).DOUBLE_TILDE || nt.type === TokenType.BACKTICK || nt.type === TokenType.BRACKET_OPEN)) { text += nt.content; k++; continue; }
        break;
      }
      if (text !== '') out.push({ type: 'text', content: text });
      i = k;
    }
    return this.mergeAdjacentTextNodes(out);
  }

  private mergeAdjacentTextNodes(nodes: MarkdownASTNode[]): MarkdownASTNode[] {
    if (nodes.length === 0) return nodes;
    const merged: MarkdownASTNode[] = [];
    for (const node of nodes) {
      const last = merged[merged.length - 1];
      if (last && last.type === 'text' && node.type === 'text') {
        last.content += node.content;
      } else {
        merged.push(node);
      }
    }
    return merged;
  }

  // Strip trailing SPACE tokens from current inline buffer (to avoid extra spaces at line ends)
  private stripTrailingSpacesFromCurrentInline(): void {
    if (!this.currentInline || this.currentInline.length === 0) return;
    let i = this.currentInline.length - 1;
    while (i >= 0 && this.currentInline[i].type === TokenType.SPACE) i--;
    if (i < this.currentInline.length - 1) this.currentInline = this.currentInline.slice(0, i + 1);
  }

  // Remove trailing hr-like characters from the current inline token buffer
  private stripTrailingHrFromCurrentInline(): void {
    if (this.currentInline.length === 0) return;
    // Walk back while tokens are DASH or ASTERISK (or TRIPLE_ASTERISK token) or SPACE/TAB
    let i = this.currentInline.length - 1;
    while (i >= 0) {
      const t = this.currentInline[i];
      if (
        t.type === TokenType.SPACE ||
        t.type === TokenType.TAB ||
        t.type === TokenType.DASH ||
        t.type === TokenType.ASTERISK ||
        (t as any).type === (TokenType as any).TRIPLE_ASTERISK
      ) {
        i--;
        continue;
      }
      break;
    }
    // If we removed anything, slice the array to i+1
    if (i < this.currentInline.length - 1) {
      this.currentInline = this.currentInline.slice(0, i + 1);
    }
  }

  // Remove a trailing paragraph node that only contains hr-like text (e.g., '***' or '---')
  private removeTrailingHrOnlyParagraph(): void {
    const last = this.ast.children[this.ast.children.length - 1];
    if (!last || last.type !== 'paragraph') return;
    const children = (last as any).children as MarkdownASTNode[] | undefined;
    if (!children || children.length !== 1 || children[0].type !== 'text') return;
    const text = (children[0] as any).content as string;
    const trimmed = text.trim();
    if (/^(?:\*{3,}|-{3,})$/.test(trimmed)) {
      this.ast.children.pop();
    }
  }

  private tryParseLink(tokens: Token[], start: number): { node: MarkdownASTNode; nextIndex: number } | null {
    let rb = -1; // find matching ] while allowing nested inline inside text
    for (let i = start + 1; i < tokens.length; i++) {
      if (tokens[i].type === TokenType.BRACKET_CLOSE) { rb = i; break; }
    }
    if (rb === -1) return null;
    if (rb + 1 >= tokens.length || tokens[rb + 1].type !== TokenType.PAREN_OPEN) return null;
    let rp = -1;
    // Support escaped parentheses in URL by skipping a PAREN_CLOSE that is immediately preceded by a backslash in content aggregation
    for (let i = rb + 2; i < tokens.length; i++) {
      if (tokens[i].type === TokenType.PAREN_CLOSE) { rp = i; break; }
    }
    if (rp === -1) return null;
    const textTokens = tokens.slice(start + 1, rb);
    // Reconstruct URL while honoring escapes (tokenizer already collapses escapes into TEXT)
    const url = tokens.slice(rb + 2, rp).map(t => t.content).join('');
    const children = this.parseInline(textTokens);
    return { node: { type: 'link', children, metadata: { url } }, nextIndex: rp + 1 };
  }

  private findNext(tokens: Token[], from: number, type: TokenType): number {
    for (let i = from; i < tokens.length; i++) if (tokens[i].type === type) return i;
    return -1;
  }

  private isStartOfLine(): boolean { return this.lineTokens.length === 0; }

  private isOnlyIndentation(tokens: Token[]): boolean {
    if (!tokens || tokens.length === 0) return false;
    return tokens.every(t => t.type === TokenType.SPACE || t.type === TokenType.TAB);
  }

  private getIndentationColumns(tokens: Token[]): number {
    let cols = 0;
    for (const t of tokens) cols += (t.type === TokenType.TAB ? 4 : 1);
    return cols;
  }

  private extractListMarkerWithPendingSpace(spaceToken: Token): { depth: number; ordered: boolean; number?: number } | null {
    // Consider the current line tokens plus this incoming space
    const tokens = [...this.lineTokens, spaceToken];
    let indent = 0;
    let idx = 0;
    while (idx < tokens.length && (tokens[idx].type === TokenType.SPACE || tokens[idx].type === TokenType.TAB)) {
      indent += tokens[idx].type === TokenType.TAB ? 4 : 1;
      idx++;
    }
    if (idx >= tokens.length) return null;
    const depth = 1 + Math.floor(indent / 2);
    const t = tokens[idx];
    if ((t.type === TokenType.DASH || t.type === TokenType.PLUS || t.type === TokenType.ASTERISK) && idx + 1 < tokens.length && tokens[idx + 1].type === TokenType.SPACE) return { depth: Math.max(1, depth), ordered: false };
    if (t.type === TokenType.DIGIT_SEQUENCE && idx + 2 < tokens.length && tokens[idx + 1].type === TokenType.PERIOD && tokens[idx + 2].type === TokenType.SPACE) {
      const n = parseInt(t.content, 10); return { depth: Math.max(1, depth), ordered: true, number: isNaN(n) ? undefined : n };
    }
    return null;
  }

  private extractListMarkerFromLine(): { depth: number; ordered: boolean; number?: number } | null {
    const tokens = this.lineTokens; let indent = 0; let idx = 0;
    while (idx < tokens.length && (tokens[idx].type === TokenType.SPACE || tokens[idx].type === TokenType.TAB)) { indent += tokens[idx].type === TokenType.TAB ? 4 : 1; idx++; }
    if (idx >= tokens.length) return null;
    const depth = 1 + Math.floor(indent / 2);
    const t = tokens[idx];
    if ((t.type === TokenType.DASH || t.type === TokenType.PLUS || t.type === TokenType.ASTERISK) && idx + 1 < tokens.length && tokens[idx + 1].type === TokenType.SPACE) return { depth, ordered: false };
    if (t.type === TokenType.DIGIT_SEQUENCE && idx + 2 < tokens.length && tokens[idx + 1].type === TokenType.PERIOD && tokens[idx + 2].type === TokenType.SPACE) {
      const n = parseInt(t.content, 10); return { depth, ordered: true, number: isNaN(n) ? undefined : n };
    }
    return null;
  }

  private detectListMarkerFromTokens(tokens: Token[]): { depth: number; ordered: boolean; number?: number } | null {
    let indent = 0; let idx = 0;
    while (idx < tokens.length && (tokens[idx].type === TokenType.SPACE || tokens[idx].type === TokenType.TAB)) { indent += tokens[idx].type === TokenType.TAB ? 4 : 1; idx++; }
    if (idx >= tokens.length) return null;
    const depth = 1 + Math.floor(indent / 2);
    const t = tokens[idx];
    if ((t.type === TokenType.DASH || t.type === TokenType.PLUS || t.type === TokenType.ASTERISK) && idx + 1 < tokens.length && tokens[idx + 1].type === TokenType.SPACE) return { depth, ordered: false };
    if (t.type === TokenType.DIGIT_SEQUENCE && idx + 2 < tokens.length && tokens[idx + 1].type === TokenType.PERIOD && tokens[idx + 2].type === TokenType.SPACE) {
      const n = parseInt(t.content, 10); return { depth, ordered: true, number: isNaN(n) ? undefined : n };
    }
    return null;
  }

  private startParagraphUnderActiveListItem(): void {
    if (!this.activeListItem) return;
    const para: MarkdownASTNode = { type: 'paragraph', children: [] } as any;
    (this.activeListItem as any).children.push(para);
    this.currentContainer = para;
    this.blockState = BlockState.ListItem;
    this.currentInline = [];
    this.lineTokens = [];
  }

  private isSetextUnderlineLine(tokens: Token[]): 0 | 1 | 2 {
    if (!tokens || tokens.length === 0) return 0;
    let eq = 0; let dash = 0;
    for (const t of tokens) {
      if (t.type === TokenType.SPACE || t.type === TokenType.TAB) continue;
      if (t.type === TokenType.TEXT) {
        if (/^=+$/.test(t.content)) { eq += t.content.length; continue; }
        if (/^-+$/.test(t.content)) { dash += t.content.length; continue; }
        return 0;
      }
      return 0;
    }
    if (eq > 0 && dash === 0) return 1;
    if (dash > 0 && eq === 0) return 2;
    return 0;
  }

  private findNextBacktickRun(tokens: Token[], from: number, runLen: number): number {
    let i = from;
    while (i < tokens.length) {
      if (tokens[i].type === TokenType.BACKTICK) {
        let k = 0;
        while (i + k < tokens.length && tokens[i + k].type === TokenType.BACKTICK) k++;
        if (k === runLen) return i;
        i += k;
      }
      i++;
    }
    return -1;
  }
}


