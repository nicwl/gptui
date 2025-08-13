/**
 * Lezer-based Markdown Renderer
 * 
 * Replaces the custom incremental markdown parser system with @lezer/markdown
 * for more robust and standard markdown parsing.
 */

import React from 'react';
import { Text, View, Platform, Image, Linking } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { parser } from '@lezer/markdown';
import { Tree, NodeType, TreeFragment, TreeCursor } from '@lezer/common';

// Types for our rendered components
export interface MarkdownStyleConfig {
  fontSize: number;
  lineHeight: number;
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
}

export interface LezerRenderNode {
  type: string;
  name: string;
  from: number;
  to: number;
  content?: string;
  children: LezerRenderNode[];
}

// Horizontal code block component for better layout
const HorizontalCodeBlock: React.FC<{
  content: string;
  baseFontSize: number;
  baseLineHeight: number;
  unicodeStyle: any;
}> = ({ content, baseFontSize, baseLineHeight, unicodeStyle }) => {
  const lines = React.useMemo(() => String(content).split('\n'), [content]);

  return (
    <View style={{ flexDirection: 'column', alignSelf: 'flex-start' }}>
      {lines.map((ln, i) => (
        <Text
          key={i}
          style={[
            unicodeStyle,
            {
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              fontSize: baseFontSize * 0.9,
              lineHeight: baseLineHeight,
              includeFontPadding: false
            }
          ]}
        >
          {ln.length === 0 ? ' ' : ln}
        </Text>
      ))}
    </View>
  );
};

export class LezerMarkdownRenderer {
  private styleConfig: MarkdownStyleConfig;
  // Cache for incremental parsing
  private lastText: string = '';
  private lastTree: Tree | null = null;
  
  constructor(styleConfig: MarkdownStyleConfig) {
    this.styleConfig = styleConfig;
  }

  /**
   * Parse markdown text and render as React components
   */
  render(text: string, baseStyle: any): React.ReactNode {
    const tree = this.parseIncremental(text);
    const cursor = tree.cursor();
    // Always render from the root cursor; the parser should not throw
    if (cursor.name !== 'Document') {
      return [<Text key="root-fallback" style={baseStyle}>{text}</Text>];
    }
    const root = this.renderNodeAtCursor(cursor, text, baseStyle, undefined);
    return [root];
  }

  // Incremental parsing: reuse previous tree when text grows by appending
  private parseIncremental(text: string): Tree {
    let nextTree: Tree;
    if (this.lastTree && text.startsWith(this.lastText)) {
      // Reuse previous tree fragments for incremental parsing
      const fragments = TreeFragment.addTree(this.lastTree);
      nextTree = parser.parse(text, fragments);
    } else {
      nextTree = parser.parse(text);
    }
    this.lastText = text;
    this.lastTree = nextTree;
    return nextTree;
  }

  /**
   * Render directly from the Lezer cursor without constructing an intermediate render tree
   */
  private renderNodeAtCursor(cursor: TreeCursor, text: string, inheritedStyle: any, parentNodeName?: string): React.ReactNode {
    const nodeName: string = cursor.name;
    const nodeFrom: number = cursor.from;
    const nodeTo: number = cursor.to;
    const baseFontSize = this.styleConfig.fontSize;
    const baseLineHeight = this.styleConfig.lineHeight;
    const unicodeStyle = {} as const;

    const normalizeTextStyle = (style: any): any => {
      if (!style) return style;
      if (!Array.isArray(style)) return style;
      const flat: any[] = [];
      const flatten = (s: any) => {
        if (!s) return;
        if (Array.isArray(s)) s.forEach(flatten);
        else flat.push(s);
      };
      flatten(style);
      return flat;
    };

    const renderChildren = (childParentName?: string, childStyle?: any): React.ReactNode[] => {
      const elements: React.ReactNode[] = [];
      const c = cursor.node.cursor();
      const parentFrom = nodeFrom;
      const parentTo = nodeTo;
      let lastEnd = parentFrom;
      let prevChildName: string | null = null;
      const normalizeGap = (s: string) => {
        if (childParentName === 'Paragraph') return s.replace(/\n/g, ' ');
        if (
          childParentName === 'BulletList' ||
          childParentName === 'OrderedList' ||
          childParentName === 'Document'
        ) return '';
        if (
          (childParentName && childParentName.startsWith('ATXHeading')) ||
          childParentName === 'SetextHeading1' ||
          childParentName === 'SetextHeading2'
        ) {
          // Suppress whitespace-only gaps inside headings (e.g. after '#' marks or trailing spaces)
          return /\S/.test(s) ? s : '';
        }
        return s;
      };
      if (!c.firstChild()) return elements;
      do {
        if (c.from > lastEnd) {
          let gap = text.slice(lastEnd, c.from);
          // Special-case: inside headings, drop leading spaces immediately after the header mark
          const isHeading = !!(childParentName && (childParentName.startsWith('ATXHeading') || childParentName === 'SetextHeading1' || childParentName === 'SetextHeading2'));
          if (isHeading && prevChildName === 'HeaderMark') {
            gap = gap.replace(/^\s+/, '');
          }
          gap = normalizeGap(gap);
          if (gap.length > 0) {
            elements.push(
              <Text key={`gap-${childParentName}-${lastEnd}-${c.from}`} style={childStyle ?? inheritedStyle}>{gap}</Text>
            );
          }
        }
        const rendered = this.renderNodeAtCursor(c, text, childStyle ?? inheritedStyle, childParentName);
        if (rendered !== null && rendered !== undefined) {
          elements.push(
            React.cloneElement(rendered as React.ReactElement, {
              key: `childof-${childParentName}-${c.from}-${c.to}`,
            })
          );
        }
        prevChildName = c.name;
        lastEnd = c.to;
      } while (c.nextSibling());
      if (lastEnd < parentTo) {
        const trailing = normalizeGap(text.slice(lastEnd, parentTo));
        if (trailing.length > 0) {
          elements.push(
            <Text key={`trail-${childParentName}-${lastEnd}-${parentTo}`} style={childStyle ?? inheritedStyle}>{trailing}</Text>
          );
        }
      }
      return elements.filter(Boolean);
    };

    switch (nodeName) {
      case 'Document':
        return <View style={inheritedStyle}>{renderChildren('Document')}</View>;

      case 'Paragraph': {
        // Render children and decide container based on whether they include non-Text elements
        const childrenEls = renderChildren('Paragraph', inheritedStyle);
        if (!childrenEls || childrenEls.length === 0) {
          // No inline children: render full paragraph content directly
          let content = text.slice(nodeFrom, nodeTo);
          content = content.replace(/\n/g, ' ');
          const pStyle = normalizeTextStyle([inheritedStyle, { marginVertical: 4 }]);
          return <Text style={pStyle}>{content}</Text>;
        }
        const containsNonText = childrenEls.some((el: any) => {
          if (!el || !('type' in el)) return false;
          const t = (el as any).type;
          const isText = t === Text || (typeof t === 'string' && String(t).toLowerCase() === 'text');
          return !isText;
        });
        if (containsNonText) {
          // Use a View to allow non-Text children (e.g., Image) inside the paragraph
          return <View style={{ marginVertical: 4 }}>{childrenEls}</View>;
        }
        // Only Text children → safe to wrap with Text
        const pStyle = normalizeTextStyle([inheritedStyle, { marginVertical: 4 }]);
        return <Text style={pStyle}>{childrenEls}</Text>;
      }

      case 'ATXHeading1':
      case 'ATXHeading2':
      case 'ATXHeading3':
      case 'ATXHeading4':
      case 'ATXHeading5':
      case 'ATXHeading6':
      case 'SetextHeading1':
      case 'SetextHeading2': {
        const level = this.getHeadingLevel(nodeName);
        const headingScales = [1.6, 1.4, 1.2, 1.1, 1.05, 1.0];
        const headingScale = headingScales[Math.max(0, Math.min(5, level - 1))];
        const headingStyle = [
          inheritedStyle,
          {
            fontSize: baseFontSize * headingScale,
            lineHeight: Math.round(baseLineHeight * headingScale),
            fontWeight: 'bold',
          },
        ];
        return (
          <Text style={[headingStyle, { marginVertical: 8 }]}> 
            {renderChildren(nodeName, headingStyle)}
          </Text>
        );
      }

      case 'BulletList':
      case 'OrderedList':
        return <View style={{ marginVertical: 6 }}>{renderChildren(nodeName, inheritedStyle)}</View>;

      case 'ListItem': {
        const isOrdered = parentNodeName === 'OrderedList';
        const number = isOrdered ? this.extractListItemNumberFromCursor(cursor, text) : undefined;
        // Render the content inside a side-by-side layout
        // We need to render children but skip ListMark nodes (handled by marker)
        const contentNodes: React.ReactNode[] = [];
        {
          const c = cursor.node.cursor();
          if (c.firstChild()) {
            do {
              if (c.name === 'ListMark') continue;
              const rendered = this.renderNodeAtCursor(c, text, inheritedStyle, 'ListItem');
              if (rendered !== null && rendered !== undefined) {
                contentNodes.push(
                  React.cloneElement(rendered as React.ReactElement, {
                    key: `listitem-${c.from}-${c.to}`,
                  })
                );
              }
            } while (c.nextSibling());
          }
        }
        const markerStyle = normalizeTextStyle([inheritedStyle, { width: 16, marginVertical: 4 }]);
        return (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginLeft: 12, marginVertical: 2 }}>
            <Text style={markerStyle}>
              {isOrdered ? `${number || '1'}.` : '•'}
            </Text>
            <View style={{ flex: 1 }}>{contentNodes}</View>
          </View>
        );
      }

      case 'CodeBlock':
      case 'FencedCode': {
        const content = this.getCodeBlockContentFromCursor(cursor, text);
        const language = this.getCodeLanguageFromCursor(cursor, text);
        return (
          <View style={{ marginVertical: 8 }}>
            <View
              style={{
                backgroundColor: 'rgba(0,0,0,0.05)',
                borderRadius: 6,
                borderLeftWidth: 3,
                borderLeftColor: '#007AFF',
              }}
            >
              {language && language.toLowerCase() === 'markdown' ? (
                <Text
                  style={[
                    unicodeStyle,
                    {
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      fontSize: baseFontSize * 0.9,
                      lineHeight: baseLineHeight,
                      padding: 12,
                    },
                  ]}
                >
                  {content}
                </Text>
              ) : (
                <GHScrollView
                  horizontal
                  bounces={false}
                  showsHorizontalScrollIndicator
                  nestedScrollEnabled
                  directionalLockEnabled
                  keyboardShouldPersistTaps="handled"
                  onStartShouldSetResponderCapture={() => true}
                  onMoveShouldSetResponderCapture={() => true}
                  style={{ maxWidth: '100%', flexGrow: 0, flexShrink: 0 }}
                  contentContainerStyle={{ flexGrow: 0, paddingBottom: 12, paddingLeft: 12, paddingTop: 9, paddingRight: 6 }}
                  scrollEventThrottle={16}
                >
                  <HorizontalCodeBlock content={content} baseFontSize={baseFontSize} baseLineHeight={baseLineHeight} unicodeStyle={unicodeStyle} />
                </GHScrollView>
              )}
            </View>
          </View>
        );
      }

      case 'InlineCode':
        const inlineCodeStyle = normalizeTextStyle([
          inheritedStyle,
          {
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            backgroundColor: 'rgba(0,0,0,0.1)',
            paddingHorizontal: 4,
            borderRadius: 3,
            fontSize: (inheritedStyle?.fontSize || baseFontSize) * 0.9,
          },
        ]);
        return (
          <Text style={inlineCodeStyle}>
            {this.getInlineCodeContentFromCursor(cursor, text)}
          </Text>
        );

      case 'HardBreak':
        // Render a newline within the current paragraph context
        return <Text style={normalizeTextStyle(inheritedStyle)}>{'\n'}</Text>;

      case 'SoftBreak':
        // Render a space for soft line breaks
        return <Text style={normalizeTextStyle(inheritedStyle)}>{' '}</Text>;

      case 'HTMLTag': {
        const segment = text.slice(nodeFrom, nodeTo);
        // Extract tag name from opening tag
        const openMatch = segment.match(/<\s*([A-Za-z][\w-]*)[^>]*>/);
        const tagName = openMatch ? openMatch[1] : 'html';
        const isSelfClosing = /<[^>]*\/>\s*$/.test(segment);
        let inner: string | null = null;
        if (!isSelfClosing) {
          // Try to extract inner content between first opening and last closing tag
          const innerMatch = segment.match(/<[^>]*>([\s\S]*)<\/\s*([A-Za-z][\w-]*)\s*>/);
          inner = innerMatch ? innerMatch[1] : null;
        }
        const elements: React.ReactNode[] = [];
        elements.push(
          <Text key={`htmltag-open-${nodeFrom}`} style={normalizeTextStyle(inheritedStyle)}>{`<${tagName}>`}</Text>
        );
        if (inner && inner.length > 0) {
          elements.push(
            <Text key={`htmltag-inner-${nodeFrom}`} style={normalizeTextStyle(inheritedStyle)}>{inner}</Text>
          );
        }
        if (!isSelfClosing) {
          elements.push(
            <Text key={`htmltag-close-${nodeFrom}`} style={normalizeTextStyle(inheritedStyle)}>{`</${tagName}>`}</Text>
          );
        }
        return <Text style={normalizeTextStyle(inheritedStyle)}>{elements}</Text>;
      }

      case 'Escape': {
        // Render escaped character literally (drop leading backslash if present)
        const segment = text.slice(nodeFrom, nodeTo);
        const literal = segment.startsWith('\\') ? segment.slice(1) : segment;
        return <Text style={normalizeTextStyle(inheritedStyle)}>{literal}</Text>;
      }

      case 'Emphasis': {
        const styleWithItalic = [inheritedStyle, { fontStyle: 'italic' }];
        const tStyle = normalizeTextStyle(styleWithItalic);
        return <Text style={tStyle}>{renderChildren('Emphasis', styleWithItalic)}</Text>;
      }

      case 'StrongEmphasis': {
        const styleWithBold = [inheritedStyle, { fontWeight: 'bold' }];
        const tStyle = normalizeTextStyle(styleWithBold);
        return <Text style={tStyle}>{renderChildren('StrongEmphasis', styleWithBold)}</Text>;
      }

      case 'Strikethrough': {
        const styleWithStrike = [inheritedStyle, { textDecorationLine: 'line-through' }];
        const tStyle = normalizeTextStyle(styleWithStrike);
        return <Text style={tStyle}>{renderChildren('Strikethrough', styleWithStrike)}</Text>;
      }

      case 'Link': {
        // Only render the visible link text, not the URL
        const url = this.getLinkUrlFromCursor(cursor, text);
        const linkText = this.getLinkTextFromCursor(cursor, text);
        return (
          <Text
            style={normalizeTextStyle([inheritedStyle, { color: '#007AFF', textDecorationLine: 'underline' }])}
            accessibilityRole="link"
            accessibilityLabel={linkText}
            onPress={() => {
              if (url) {
                try { Linking.openURL(url); } catch {}
              }
            }}
          >
            {linkText}
          </Text>
        );
      }

      case 'Image': {
        const altText = this.getImageAltFromCursor(cursor, text) || 'Image';
        const src = this.getImageUrlFromCursor(cursor, text);
        // Render functional image with accessible alt text
        return (
          <Image
            accessibilityLabel={altText}
            source={{ uri: src }}
            style={{ width: 200, height: 200, resizeMode: 'contain', marginVertical: 6 }}
          />
        );
      }

      case 'Blockquote':
        return (
          <View style={{ borderLeftWidth: 3, borderLeftColor: '#C7C7CC', paddingLeft: 10, marginVertical: 6 }}>
            <Text style={normalizeTextStyle([inheritedStyle, { color: '#333' }])}>{renderChildren('Blockquote', inheritedStyle)}</Text>
          </View>
        );

      case 'HorizontalRule':
        return <View style={{ height: 1, backgroundColor: '#C7C7CC', marginVertical: 8 }} />;

      case 'Text': {
        const content = text.slice(nodeFrom, nodeTo);
        if (!content) return null;
        return <Text style={normalizeTextStyle(inheritedStyle)}>{content}</Text>;
      }

      // Ignore markup delimiters and metadata
      case 'EmphasisMark':
      case 'CodeMark':
      case 'LinkMark':
      case 'ImageMark':
      case 'HeaderMark':
      case 'ListMark':
      case 'CodeInfo':
      case 'QuoteMark':
      case 'URL':
        return null;

      case 'CodeText': {
        const content = text.slice(nodeFrom, nodeTo);
        return <Text style={normalizeTextStyle(inheritedStyle)}>{content}</Text>;
      }

      default:
        throw new Error(`Unhandled Lezer node: ${nodeName}`);
    }
  }

  /**
   * Render nodes to React components
   */
  // Legacy helper retained for compatibility (unused in new cursor-driven path)
  private renderNodes(nodes: LezerRenderNode[], inheritedStyle: any, parentNodeName?: string): React.ReactNode[] {
    const unicodeStyle = {} as const;
    const baseFontSize = this.styleConfig.fontSize;
    const baseLineHeight = this.styleConfig.lineHeight;

    return nodes.map((node, index) => {
      switch (node.name) {
        case 'Document':
          return (
            <View key={index} style={inheritedStyle}>
              {this.renderNodes(node.children, inheritedStyle, 'Document')}
            </View>
          );

        case 'Paragraph':
          // If paragraph has no children, it's a leaf with text content
          if (node.children.length === 0 && node.content) {
            return (
              <Text key={index} style={[inheritedStyle, { marginVertical: 4 }]}>
                {node.content}
              </Text>
            );
          }
          return (
            <Text key={index} style={[inheritedStyle, { marginVertical: 4 }]}>
              {this.renderNodes(node.children, inheritedStyle, 'Paragraph')}
            </Text>
          );

        case 'ATXHeading1':
        case 'ATXHeading2':
        case 'ATXHeading3':
        case 'ATXHeading4':
        case 'ATXHeading5':
        case 'ATXHeading6':
        case 'SetextHeading1':
        case 'SetextHeading2': {
          const level = this.getHeadingLevel(node.name);
          const headingScales = [1.6, 1.4, 1.2, 1.1, 1.05, 1.0];
          const headingScale = headingScales[Math.max(0, Math.min(5, level - 1))];
          const headingStyle = [
            inheritedStyle,
            {
              fontSize: baseFontSize * headingScale,
              lineHeight: Math.round(baseLineHeight * headingScale),
              fontWeight: 'bold',
            },
          ];
          return (
            <Text key={index} style={[headingStyle, { marginVertical: 8, marginTop: index === 0 ? 0 : 12 }]}>
              {this.renderNodes(node.children, headingStyle, node.name)}
            </Text>
          );
        }

        case 'BulletList':
        case 'OrderedList':
          return (
            <View key={index} style={{ marginVertical: 6 }}>
              {this.renderNodes(node.children, inheritedStyle, node.name)}
            </View>
          );

        case 'ListItem': {
          const isOrdered = parentNodeName === 'OrderedList';
          const depth = this.getListDepth(node);
          const number = isOrdered ? this.extractListItemNumber(node) : undefined;
          
          return (
            <View
              key={index}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                marginLeft: depth * 12,
                marginVertical: 2,
              }}
            >
              <Text style={[inheritedStyle, { width: 20, marginRight: 4 }]}>
                {isOrdered ? `${number || '1'}.` : '•'}
              </Text>
              <View style={{ flex: 1 }}>
                {this.renderNodes(node.children, inheritedStyle, 'ListItem')}
              </View>
            </View>
          );
        }

        case 'CodeBlock':
        case 'FencedCode': {
          const content = this.getCodeBlockContent(node);
          const language = this.getCodeLanguage(node);
          
          return (
            <View key={index} style={{ marginVertical: 8 }}>
              <View
                style={{
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  borderRadius: 6,
                  borderLeftWidth: 3,
                  borderLeftColor: '#007AFF',
                }}
              >
                {language && language.toLowerCase() === 'markdown' ? (
                  <Text
                    style={[
                      unicodeStyle,
                      {
                        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                        fontSize: baseFontSize * 0.9,
                        lineHeight: baseLineHeight,
                        padding: 12,
                      },
                    ]}
                  >
                    {content}
                  </Text>
                ) : (
                  <GHScrollView
                    horizontal
                    bounces={false}
                    showsHorizontalScrollIndicator
                    nestedScrollEnabled
                    directionalLockEnabled
                    keyboardShouldPersistTaps="handled"
                    onStartShouldSetResponderCapture={() => true}
                    onMoveShouldSetResponderCapture={() => true}
                    style={{ maxWidth: '100%', flexGrow: 0, flexShrink: 0 }}
                    contentContainerStyle={{ flexGrow: 0, paddingBottom: 12, paddingLeft: 12, paddingTop: 9, paddingRight: 6 }}
                    scrollEventThrottle={16}
                  >
                    <HorizontalCodeBlock
                      content={content}
                      baseFontSize={baseFontSize}
                      baseLineHeight={baseLineHeight}
                      unicodeStyle={unicodeStyle}
                    />
                  </GHScrollView>
                )}
              </View>
            </View>
          );
        }

        case 'InlineCode':
          return (
            <Text
              key={index}
              style={[
                inheritedStyle,
                {
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  backgroundColor: 'rgba(0,0,0,0.1)',
                  paddingHorizontal: 4,
                  borderRadius: 3,
                  fontSize: (inheritedStyle?.fontSize || baseFontSize) * 0.9,
                },
              ]}
            >
              {this.getInlineCodeContent(node)}
            </Text>
          );

        case 'Emphasis':
          return (
            <Text key={index} style={[inheritedStyle, { fontStyle: 'italic' }]}>
              {this.renderNodes(node.children, inheritedStyle, 'Emphasis')}
            </Text>
          );

        case 'StrongEmphasis':
          return (
            <Text key={index} style={[inheritedStyle, { fontWeight: 'bold' }]}>
              {this.renderNodes(node.children, inheritedStyle, 'StrongEmphasis')}
            </Text>
          );

        case 'Strikethrough':
          return (
            <Text key={index} style={[inheritedStyle, { textDecorationLine: 'line-through' }]}>
              {this.renderNodes(node.children, inheritedStyle, 'Strikethrough')}
            </Text>
          );

        case 'Link': {
          const url = this.getLinkUrl(node);
          const linkText = this.getLinkText(node);
          return (
            <Text
              key={index}
              style={[
                inheritedStyle,
                {
                  color: '#007AFF',
                  textDecorationLine: 'underline',
                },
              ]}
            >
              {linkText}
            </Text>
          );
        }

        case 'Blockquote':
          return (
            <View key={index} style={{ borderLeftWidth: 3, borderLeftColor: '#C7C7CC', paddingLeft: 10, marginVertical: 6 }}>
              <Text style={[inheritedStyle, { color: '#333' }]}>
                {this.renderNodes(node.children, inheritedStyle, 'Blockquote')}
              </Text>
            </View>
          );

        case 'HorizontalRule':
          return <View key={index} style={{ height: 1, backgroundColor: '#C7C7CC', marginVertical: 8 }} />;

        case 'Text':
          return (
            <Text key={index} style={inheritedStyle}>
              {node.content}
            </Text>
          );

        case 'EmphasisMark':
        case 'CodeMark':
        case 'LinkMark':
        case 'HeaderMark':
        case 'ListMark':
        case 'CodeInfo':
        case 'QuoteMark':
        case 'URL':
          // These are markup delimiters and metadata, don't render them directly
          return null;
          
        case 'CodeText':
          // CodeText should render its content (this gets handled by parent CodeBlock/FencedCode)
          // But if it's being rendered directly, show the content
          return (
            <Text key={index} style={inheritedStyle}>
              {node.content || this.getTextContent(node)}
            </Text>
          );

        default:
          // For text nodes and unknown nodes, render as text
          if (node.content !== undefined && node.content.length > 0) {
            return (
              <Text key={index} style={inheritedStyle}>
                {node.content}
              </Text>
            );
          }
          
          // For container nodes we don't recognize, just render children
          if (node.children.length > 0) {
            return (
              <Text key={index} style={inheritedStyle}>
                {this.renderNodes(node.children, inheritedStyle, 'Unknown')}
              </Text>
            );
          }
          
          return null;
      }
    }).filter(Boolean);
  }

  // Cursor-based helpers
  private getCodeLanguageFromCursor(cursor: any, text: string): string | undefined {
    // Use a cloned cursor to avoid mutating the current one
    const c = cursor.node.cursor();
    let lang: string | undefined;
    if (c.firstChild()) {
      do {
        if (c.name === 'CodeInfo') {
          lang = text.slice(c.from, c.to).trim();
          break;
        }
      } while (c.nextSibling());
    }
    return lang;
  }

  private getCodeBlockContentFromCursor(cursor: any, text: string): string {
    // Prefer CodeText child content using a cloned cursor
    const c = cursor.node.cursor();
    let content = '';
    if (c.firstChild()) {
      do {
        if (c.name === 'CodeText') {
          content = text.slice(c.from, c.to);
          break;
        }
      } while (c.nextSibling());
    }
    if (content) return content;
    return text.slice(cursor.from, cursor.to);
  }

  private getInlineCodeContentFromCursor(cursor: any, text: string): string {
    // InlineCode typically has only CodeMark children; take content between the first and last marks
    const c = cursor.node.cursor();
    let leftEnd: number | null = null;
    let rightStart: number | null = null;
    if (c.firstChild()) {
      do {
        if (c.name === 'CodeMark') {
          const mark = text.slice(c.from, c.to);
          if (mark.trim().startsWith('`')) {
            if (leftEnd == null) leftEnd = c.to;
            rightStart = c.from; // keep updating so we end with the last mark
          }
        }
      } while (c.nextSibling());
    }
    if (leftEnd != null && rightStart != null && rightStart >= leftEnd) {
      return text.slice(leftEnd, rightStart);
    }
    return '';
  }

  private getLinkUrlFromCursor(cursor: any, text: string): string {
    const c = cursor.node.cursor();
    let url = '#';
    if (c.firstChild()) {
      do {
        if (c.name === 'URL') {
          url = text.slice(c.from, c.to);
          break;
        }
      } while (c.nextSibling());
    }
    return url;
  }

  private getLinkTextFromCursor(cursor: any, text: string): string {
    // Link label is not represented as a child node; compute slice between '[' and ']'
    const c = cursor.node.cursor();
    let leftEnd: number | null = null;
    let rightStart: number | null = null;
    if (c.firstChild()) {
      do {
        if (c.name === 'LinkMark') {
          const s = text.slice(c.from, c.to);
          if (s === '[') leftEnd = c.to;
          if (s === ']') rightStart = c.from;
        }
      } while (c.nextSibling());
    }
    if (leftEnd != null && rightStart != null && rightStart >= leftEnd) {
      return text.slice(leftEnd, rightStart).trim();
    }
    return '';
  }

  private getImageAltFromCursor(cursor: any, text: string): string | undefined {
    // Image alt text is between '![' and ']'
    const c = cursor.node.cursor();
    let leftEnd: number | null = null;
    let rightStart: number | null = null;
    if (c.firstChild()) {
      do {
        if (c.name === 'LinkMark') {
          const s = text.slice(c.from, c.to);
          if (s === '![') leftEnd = c.to;
          if (s === ']') rightStart = c.from;
        }
      } while (c.nextSibling());
    }
    if (leftEnd != null && rightStart != null && rightStart >= leftEnd) {
      const label = text.slice(leftEnd, rightStart).trim();
      return label.length > 0 ? label : undefined;
    }
    return undefined;
  }

  private getImageUrlFromCursor(cursor: any, text: string): string {
    // Find URL child or parse from source
    const c = cursor.node.cursor();
    let url: string | undefined;
    if (c.firstChild()) {
      do {
        if (c.name === 'URL') {
          url = text.slice(c.from, c.to).trim();
          break;
        }
      } while (c.nextSibling());
    }
    if (url) return url;
    const segment = text.slice(cursor.from, cursor.to);
    const m = segment.match(/\(([^)]+)\)/);
    return (m ? m[1].trim() : '#');
  }

  private extractListItemNumberFromCursor(cursor: any, text: string): number {
    const c = cursor.node.cursor();
    let num = 1;
    if (c.firstChild()) {
      do {
        if (c.name === 'ListMark') {
          const mark = text.slice(c.from, c.to);
          const m = mark.match(/^(\d+)\./);
          if (m) {
            num = parseInt(m[1], 10);
            break;
          }
        }
      } while (c.nextSibling());
    }
    return num;
  }
  private getHeadingLevel(nodeName: string): number {
    if (nodeName.includes('1') || nodeName === 'SetextHeading1') return 1;
    if (nodeName.includes('2') || nodeName === 'SetextHeading2') return 2;
    if (nodeName.includes('3')) return 3;
    if (nodeName.includes('4')) return 4;
    if (nodeName.includes('5')) return 5;
    if (nodeName.includes('6')) return 6;
    return 1;
  }

  private isOrderedListItem(node: LezerRenderNode): boolean {
    // Look for parent OrderedList in the tree structure
    // This is a simplified approach - in a real implementation you might want to track parent context
    return false; // For now, we'll default to bullet lists
  }

  private getListDepth(node: LezerRenderNode): number {
    // For now, return depth 1. In a more complete implementation,
    // you'd track nesting depth through the parent chain
    return 1;
  }



  private getTextContent(node: LezerRenderNode): string {
    if (node.content !== undefined) {
      return node.content;
    }
    
    // Recursively collect text from all children
    return node.children
      .map(child => this.getTextContent(child))
      .join('');
  }

  private getCodeLanguage(node: LezerRenderNode): string | undefined {
    // Look for language info node in fenced code blocks
    const infoNode = node.children.find(child => child.name === 'CodeInfo');
    if (infoNode) {
      return this.getTextContent(infoNode).trim();
    }
    return undefined;
  }

  private getLinkUrl(node: LezerRenderNode): string {
    // Look for URL in link node structure
    const urlNode = node.children.find(child => child.name === 'URL');
    if (urlNode) {
      return this.getTextContent(urlNode);
    }
    return '#';
  }



  private extractListItemNumber(node: LezerRenderNode): number {
    // Look for ListMark child and extract number
    const listMark = node.children.find(child => child.name === 'ListMark');
    if (listMark && listMark.content) {
      const match = listMark.content.match(/^(\d+)\./);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return 1;
  }

  private getLinkText(node: LezerRenderNode): string {
    // Extract text content between LinkMark delimiters
    let text = '';
    let inLinkText = false;
    
    for (const child of node.children) {
      if (child.name === 'LinkMark' && child.content === '[') {
        inLinkText = true;
      } else if (child.name === 'LinkMark' && child.content === ']') {
        inLinkText = false;
      } else if (inLinkText && child.content) {
        text += child.content;
      }
    }
    
    return text || 'Link';
  }

  private getCodeBlockContent(node: LezerRenderNode): string {
    // For FencedCode nodes, look for CodeText child
    const codeTextNode = node.children.find(child => child.name === 'CodeText');
    if (codeTextNode && codeTextNode.content) {
      return codeTextNode.content;
    }
    
    // Fallback to full content extraction excluding markup
    return this.getTextContent(node);
  }

  private getInlineCodeContent(node: LezerRenderNode): string {
    // For InlineCode, extract content between the CodeMark delimiters
    if (node.children.length === 0 && node.content) {
      // Remove surrounding backticks
      const content = node.content;
      if (content.startsWith('`') && content.endsWith('`')) {
        return content.slice(1, -1);
      }
      return content;
    }
    
    // Extract text content between CodeMark nodes
    let content = '';
    for (const child of node.children) {
      if (child.name !== 'CodeMark' && child.content) {
        content += child.content;
      }
    }
    return content;
  }
}

/**
 * Hook for using Lezer markdown renderer with streaming support
 */
export const useLezerMarkdownRenderer = (styleConfig: MarkdownStyleConfig) => {
  const renderer = React.useMemo(() => new LezerMarkdownRenderer(styleConfig), [styleConfig]);
  
  return React.useCallback((text: string, baseStyle: any) => {
    return renderer.render(text, baseStyle);
  }, [renderer]);
};
