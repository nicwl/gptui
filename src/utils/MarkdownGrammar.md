# Comprehensive Streaming Markdown Grammar

Based on research showing that markdown lacks formal grammar due to context-sensitivity, this is a comprehensive practical grammar for our streaming parser covering all major markdown elements.

## Design Principles

1. **Left-to-right parsing** - suitable for streaming
2. **Greedy tokenization** - commit to tokens as soon as possible
3. **Context-sensitive disambiguation** - handle ambiguous cases with simple rules
4. **Comprehensive coverage** - support all major markdown constructs

## Token Types

### Inline Formatting Delimiters
- `**` - Bold delimiter (context determines open/close)
- `*` - Italic delimiter or list bullet (context determines)
- `` ` `` - Inline code delimiter
- `[` - Link text start
- `]` - Link text end
- `(` - Link URL start (only after `]`)
- `)` - Link URL end

### Block Delimiters
- `#` - ATX heading marker (line start + space)
- `=` - Setext heading underline (H1)
- `-` - Setext heading underline (H2), list item, or horizontal rule
- `+` - List bullet
- `>` - Blockquote marker
- `` ``` `` - Fenced code block delimiter
- `|` - Table cell delimiter

### List Markers
- `1.`, `2.`, etc. - Ordered list (numbers)
- `a.`, `b.`, etc. - Ordered list (letters)
- `i.`, `ii.`, etc. - Ordered list (roman numerals)
- `-`, `*`, `+` - Unordered list bullets

### Content Tokens
- `TEXT` - Regular text content
- `NEWLINE` - Line break
- `SPACE` - Whitespace (significant for indentation/lists)
- `TAB` - Tab character (significant for indentation)
- `EOF` - End of input

## Parsing Rules

### Inline Elements

```
inline_element → bold | italic | inline_code | link | text

bold → "**" inline_content* "**"
italic → "*" inline_content* "*" 
inline_code → "`" text_content* "`"
link → "[" text_content* "]" "(" url_content* ")"
```

### Block Elements

```
document → block_element*

block_element → atx_heading | setext_heading | fenced_code_block | 
                blockquote | list | table | horizontal_rule | paragraph

atx_heading → HASH{1,6} SPACE inline_content* NEWLINE
setext_heading → inline_content+ NEWLINE ("="+ | "-"+) NEWLINE

fenced_code_block → CODE_FENCE language_info? NEWLINE
                   code_content*
                   CODE_FENCE NEWLINE

blockquote → (">" SPACE? inline_content* NEWLINE)+

list → list_item+
list_item → list_marker SPACE inline_content* NEWLINE
           (INDENT list_item)*  // nested lists

table → table_header table_separator table_row*
table_header → "|"? table_cell ("|" table_cell)* "|"? NEWLINE
table_separator → "|"? table_align ("|" table_align)* "|"? NEWLINE  
table_row → "|"? table_cell ("|" table_cell)* "|"? NEWLINE

horizontal_rule → ("-"{3,} | "*"{3,} | "_"{3,}) NEWLINE

paragraph → inline_content+ NEWLINE
```

### Tokens Detail

```
HASH → "#"
SPACE → " "
TAB → "\t"
NEWLINE → "\n"
INDENT → "    " | TAB

list_marker → ordered_marker | unordered_marker
ordered_marker → DIGIT+ "." | LETTER+ "." | ROMAN+ "."
unordered_marker → "-" | "*" | "+"

CODE_FENCE → "```" | "~~~"
language_info → [a-zA-Z0-9_+-]+

table_cell → inline_content*
table_align → SPACE* ":"? "-"+ ":"? SPACE*
```

## Context-Sensitive Rules

### Character Disambiguation (depends on position/context)

**`*` Character:**
- At line start + space = unordered list bullet
- After whitespace + before non-whitespace = emphasis/bold start
- After non-whitespace + before whitespace = emphasis/bold end
- `**` = always bold delimiter
- `***` = bold + italic start/end

**`-` Character:**
- At line start + space = unordered list bullet  
- At line start, 3+ in row = horizontal rule
- After paragraph on next line = setext H2 underline
- After digit/letter + `.` + space = continuation of ordered list

**`#` Character:**
- At line start + space = ATX heading
- Elsewhere = regular text

**`>` Character:**
- At line start (optionally after whitespace) = blockquote
- Elsewhere = regular text

**`` ` `` Character:**
- Single = inline code delimiter
- Triple at line start = fenced code block start/end

**`|` Character:**
- If table context active = table cell delimiter
- Elsewhere = regular text

### Block vs Inline Context
- **Block level**: determined by line start position and previous content
- **Inline level**: within block elements, different parsing rules apply
- **List nesting**: determined by indentation level (4 spaces or 1 tab per level)

## State Machine States

### Tokenizer States
- `LINE_START` - Beginning of new line, determines block type
- `TEXT` - Default state, accumulating text content
- `EMPHASIS_SINGLE` - Seen single `*`, determining context  
- `EMPHASIS_DOUBLE` - Seen `**`, confirming bold delimiter
- `HASH_SEQUENCE` - Building ATX heading level (`#`, `##`, etc.)
- `LIST_MARKER` - Building list marker (`1.`, `a.`, `-`, etc.)
- `BACKTICK_SINGLE` - Seen single `` ` ``, inline code delimiter
- `BACKTICK_TRIPLE` - Building fenced code block (`` ``` ``)
- `BRACKET_LINK` - Inside link text `[...]`
- `PAREN_URL` - Inside link URL `(...)`
- `BLOCKQUOTE` - Processing blockquote content after `>`
- `TABLE_CELL` - Inside table cell content
- `CODE_BLOCK` - Inside fenced code block
- `SETEXT_UNDERLINE` - Checking for setext heading underline

### Parser States (Pushdown Automaton)
```
ParserState {
  stack: ContextFrame[]  // open formatting contexts
  currentBlock: BlockType | null
  listStack: ListContext[]  // nested list tracking
  tableState: TableState | null
}

ContextFrame {
  type: "bold" | "italic" | "code" | "link_text" | "link_url"
  startPosition: number
  delimiter: string
}

ListContext {
  type: "ordered" | "unordered"
  marker: string
  indentLevel: number
}

BlockType = "paragraph" | "heading" | "code_block" | "blockquote" | "list" | "table" | "horizontal_rule"
```

## Parsing Precedence Rules

1. **Block elements** take precedence over inline elements
2. **Code blocks** (fenced) suppress all other parsing inside
3. **Inline code** suppresses emphasis/bold parsing inside  
4. **Link text** allows emphasis/bold inside, but not other links
5. **Link URL** treats everything as literal text
6. **Nested lists** determined by indentation (4-space rule)

## Error Recovery Strategies

### Unmatched Delimiters
- Unmatched `**` becomes literal text
- Unmatched `[` without matching `](` becomes literal text
- Unclosed fenced code blocks auto-close at EOF

### Invalid Structures  
- Invalid list markers become regular text
- Malformed tables fall back to paragraph text
- Invalid heading sequences become regular text

### Ambiguous Cases
- `*` at word boundary defaults to emphasis
- `-` defaults to list item unless 3+ consecutive
- `|` defaults to text unless in table context

## Streaming Behavior

### Tokenizer Buffer Management
- Emit tokens as soon as they're unambiguous
- Buffer characters when multiple interpretations possible
- Flush buffer on line break or EOF
- Maximum lookahead: 1 line for setext headings

### Parser State Tracking
- Maintain stack of open inline contexts
- Track current block type and list nesting
- Buffer tokens that could be part of multi-token structures
- Provide tentative AST with buffered content for rendering

### Tentative Rendering Rules
- Show buffered tokens with their most likely interpretation
- Update interpretation as more context arrives
- Minimize visual flickering during re-interpretation
