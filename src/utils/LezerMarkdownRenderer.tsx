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
import { Tree, NodeType, TreeFragment, TreeCursor, SyntaxNodeRef } from '@lezer/common';

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
    const root = this.renderUsingIterate(tree, text, baseStyle);
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

  private renderUsingIterate(tree: Tree, text: string, baseStyle: any): React.ReactNode {
    type Frame = {
      name: string;
      from: number;
      to: number;
      children: React.ReactNode[];
      lastEnd: number;
      prevChildName: string | null;
      styleForChildren: any;
      parentName?: string;
      listDepth: number;
    };

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

    const normalizeGapForParent = (parentName: string | undefined, prevChildName: string | null, s: string) => {
      if (!s) return s;
          if (parentName === 'Paragraph') return s.replace(/\n/g, ' ');
      if (parentName === 'BulletList' || parentName === 'OrderedList' || parentName === 'Document' || parentName === 'ListItem') return '';
      if (
        parentName && (
          parentName.startsWith('ATXHeading') ||
          parentName === 'SetextHeading1' ||
          parentName === 'SetextHeading2'
        )
      ) {
        // Drop whitespace-only gaps in headings
        let out = /\S/.test(s) ? s : '';
        // Also drop leading spaces right after header mark
        if (prevChildName === 'HeaderMark') out = out.replace(/^\s+/, '');
        return out;
      }
      return s;
    };

    const pushGap = (parent: Frame | undefined, nextFrom: number) => {
      if (!parent) return;
      if (nextFrom > parent.lastEnd) {
        let gap = text.slice(parent.lastEnd, nextFrom);
        gap = normalizeGapForParent(parent.name, parent.prevChildName, gap);
        if (gap.length > 0) {
          // Push raw string to keep inline text simple
          parent.children.push(gap);
        }
      }
    };

    const flattenText = (el: any): string => {
      if (el == null) return '';
      if (typeof el === 'string') return el;
      if (typeof el === 'number') return String(el);
      const ch = el.props?.children;
      if (typeof ch === 'string') return ch;
      if (Array.isArray(ch)) return ch.map(flattenText).join('');
      return flattenText(ch);
    };

    const getHeadingLevel = (nodeName: string): number => this.getHeadingLevel(nodeName);

    const getCodeLanguageFromNode = (node: SyntaxNodeRef): string | undefined => {
      const info = node.node.getChild('CodeInfo');
      if (info) return text.slice(info.from, info.to).trim();
      return undefined;
    };

    const getCodeBlockContentFromNode = (node: SyntaxNodeRef): string => {
      const ct = node.node.getChild('CodeText');
      if (ct) return text.slice(ct.from, ct.to);
      return text.slice(node.from, node.to);
    };

    const getInlineCodeContentFromNode = (node: SyntaxNodeRef): string => {
      const segment = text.slice(node.from, node.to);
      return segment.replace(/^`+/, '').replace(/`+$/, '');
    };

    const getLinkUrlFromNode = (node: SyntaxNodeRef): string => {
      const urlNode = node.node.getChild('URL');
      if (urlNode) return text.slice(urlNode.from, urlNode.to);
      return '#';
    };

    const getImageAltFromNode = (node: SyntaxNodeRef): string | undefined => {
      const segment = text.slice(node.from, node.to);
      const m = segment.match(/!\[(.*?)\]/);
      const alt = m ? m[1].trim() : '';
      return alt.length > 0 ? alt : undefined;
    };

    const getImageUrlFromNode = (node: SyntaxNodeRef): string => {
      const urlNode = node.node.getChild('URL');
      if (urlNode) return text.slice(urlNode.from, urlNode.to).trim();
      const segment = text.slice(node.from, node.to);
      const m = segment.match(/\(([^)]+)\)/);
      return (m ? m[1].trim() : '#');
    };

    const extractListItemNumberFromNode = (node: SyntaxNodeRef): number => {
      const listMark = node.node.getChild('ListMark');
      if (listMark) {
        const mark = text.slice(listMark.from, listMark.to);
        const m = mark.match(/^(\d+)\./);
        if (m) return parseInt(m[1], 10);
      }
      return 1;
    };

    const IGNORED = new Set([
      'EmphasisMark',
      'CodeMark',
      'LinkMark',
      'ImageMark',
      'HeaderMark',
      'ListMark',
      'CodeInfo',
      'QuoteMark',
      'URL',
    ]);

    const stack: Frame[] = [];
    let root: React.ReactNode | null = null;

    tree.iterate({
      enter: (node: SyntaxNodeRef) => {
        const parent = stack[stack.length - 1];
        // Push gap before this node under its parent
        pushGap(parent, node.from);

        const name = node.name;

        // Ignored structural/mark nodes
        if (IGNORED.has(name)) {
          if (parent) {
            parent.prevChildName = name;
            parent.lastEnd = Math.max(parent.lastEnd, node.to);
          }
          return false;
        }

        // Leaf helper shortcut
        const pushLeaf = (element: React.ReactNode) => {
          if (!parent) return;
          parent.children.push(
            React.cloneElement(element as React.ReactElement, { key: `leaf-${name}-${node.from}-${node.to}` })
          );
          parent.prevChildName = name;
          parent.lastEnd = Math.max(parent.lastEnd, node.to);
        };

        switch (name) {
          case 'Text': {
            const content = text.slice(node.from, node.to);
            if (content.length > 0 && parent) {
              parent.children.push(content);
              parent.prevChildName = name;
              parent.lastEnd = Math.max(parent.lastEnd, node.to);
            } else {
              if (parent) parent.prevChildName = name;
            }
            return false;
          }
          case 'ATXHeading1':
          case 'ATXHeading2':
          case 'ATXHeading3':
          case 'ATXHeading4':
          case 'ATXHeading5':
          case 'ATXHeading6':
          case 'SetextHeading1':
          case 'SetextHeading2':
            break;
          case 'HardBreak': {
            if (parent) {
              parent.children.push('\n');
              parent.prevChildName = name;
              parent.lastEnd = Math.max(parent.lastEnd, node.to);
            }
            return false;
          }
          case 'SoftBreak': {
            if (parent) {
              parent.children.push(' ');
              parent.prevChildName = name;
              parent.lastEnd = Math.max(parent.lastEnd, node.to);
            }
            return false;
          }
          case 'Escape': {
            const segment = text.slice(node.from, node.to);
            const literal = segment.startsWith('\\') ? segment.slice(1) : segment;
            if (parent) {
              parent.children.push(literal);
              parent.prevChildName = name;
              parent.lastEnd = Math.max(parent.lastEnd, node.to);
            }
            return false;
          }
          case 'InlineCode': {
            const inlineCodeStyle = normalizeTextStyle([
              parent?.styleForChildren,
              {
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                backgroundColor: 'rgba(0,0,0,0.1)',
                paddingHorizontal: 4,
                borderRadius: 3,
                fontSize: ((parent?.styleForChildren?.fontSize) || baseFontSize) * 0.9,
              },
            ]);
            const content = getInlineCodeContentFromNode(node);
            pushLeaf(<Text style={inlineCodeStyle}>{content}</Text>);
            return false;
          }
          case 'CodeBlock':
          case 'FencedCode': {
            const content = getCodeBlockContentFromNode(node);
            const language = getCodeLanguageFromNode(node);
            const el = (
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
            pushLeaf(el);
            return false;
          }
          case 'HTMLTag': {
            const segment = text.slice(node.from, node.to);
            const openMatch = segment.match(/<\s*([A-Za-z][\w-]*)[^>]*>/);
            const tagName = openMatch ? openMatch[1] : 'html';
            const isSelfClosing = /<[^>]*\/>\s*$/.test(segment);
            let inner: string | null = null;
            if (!isSelfClosing) {
              const innerMatch = segment.match(/<[^>]*>([\s\S]*)<\/\s*([A-Za-z][\w-]*)\s*>/);
              inner = innerMatch ? innerMatch[1] : null;
            }
            const elements: React.ReactNode[] = [];
            elements.push(
              <Text key={`htmltag-open-${node.from}`} style={normalizeTextStyle(parent?.styleForChildren)}>{`<${tagName}>`}</Text>
            );
            if (inner && inner.length > 0) {
              elements.push(
                <Text key={`htmltag-inner-${node.from}`} style={normalizeTextStyle(parent?.styleForChildren)}>{inner}</Text>
              );
            }
            if (!isSelfClosing) {
              elements.push(
                <Text key={`htmltag-close-${node.from}`} style={normalizeTextStyle(parent?.styleForChildren)}>{`</${tagName}>`}</Text>
              );
            }
            pushLeaf(<Text style={normalizeTextStyle(parent?.styleForChildren)}>{elements}</Text>);
            return false;
          }
          case 'HorizontalRule': {
            pushLeaf(<View style={{ height: 1, backgroundColor: '#C7C7CC', marginVertical: 8 }} />);
            return false;
          }
          case 'Image': {
            const altText = getImageAltFromNode(node) || 'Image';
            const src = getImageUrlFromNode(node);
            pushLeaf(
              <Image
                accessibilityLabel={altText}
                source={{ uri: src }}
                style={{ width: 200, height: 200, resizeMode: 'contain', marginVertical: 6 }}
              />
            );
            return false;
          }
        }

        // Containers: push frame
        let styleForChildren = parent?.styleForChildren ?? baseStyle;
        switch (name) {
          case 'Document':
            styleForChildren = baseStyle;
            break;
          case 'Paragraph':
            // Inherit
            break;
          case 'Emphasis':
            styleForChildren = [styleForChildren, { fontStyle: 'italic' }];
            break;
          case 'StrongEmphasis':
            styleForChildren = [styleForChildren, { fontWeight: 'bold' }];
            break;
          case 'Strikethrough':
            styleForChildren = [styleForChildren, { textDecorationLine: 'line-through' }];
            break;
          case 'ATXHeading1':
          case 'ATXHeading2':
          case 'ATXHeading3':
          case 'ATXHeading4':
          case 'ATXHeading5':
          case 'ATXHeading6':
          case 'SetextHeading1':
          case 'SetextHeading2': {
            const level = getHeadingLevel(name);
            const headingScales = [1.6, 1.4, 1.2, 1.1, 1.05, 1.0];
            const headingScale = headingScales[Math.max(0, Math.min(5, level - 1))];
            styleForChildren = [styleForChildren, {
              fontSize: baseFontSize * headingScale,
              lineHeight: Math.round(baseLineHeight * headingScale),
              fontWeight: 'bold',
            }];
            break;
          }
          case 'Link':
            styleForChildren = [styleForChildren, { color: '#007AFF', textDecorationLine: 'underline' }];
            break;
          case 'Blockquote':
            // Keep inherited; color applied at wrap time
            break;
          case 'BulletList':
          case 'OrderedList':
          case 'ListItem':
            // Inherit
            break;
        }

        // Compute list depth based on ancestors
        const parentListDepth = parent?.listDepth ?? 0;
        const currentListDepth = name === 'ListItem' ? parentListDepth + 1 : parentListDepth;

        stack.push({
          name,
          from: node.from,
          to: node.to,
          children: [],
          lastEnd: node.from,
          prevChildName: null,
          styleForChildren,
          parentName: parent?.name,
          listDepth: currentListDepth,
        });
      },
      leave: (node: SyntaxNodeRef) => {
        const frame = stack.pop();
        if (!frame) return;

        // Append trailing gap within this node
        if (frame.lastEnd < frame.to) {
          let trailing = text.slice(frame.lastEnd, frame.to);
          trailing = normalizeGapForParent(frame.name, frame.prevChildName, trailing);
          if (trailing.length > 0) {
            // Push as raw string to keep simple paragraphs as a single text node
            frame.children.push(trailing);
          }
        }

        // Build element for this frame
        let built: React.ReactNode | null = null;
        switch (frame.name) {
          case 'Document':
            // Ensure the root content expands to the bubble width; avoid collapsing to marker width
            built = <View style={[baseStyle, { width: '100%', maxWidth: '100%', alignSelf: 'stretch' }]}>{frame.children}</View>;
            break;
          case 'Paragraph': {
            if (!frame.children || frame.children.length === 0) {
              let content = text.slice(frame.from, frame.to).replace(/\n/g, ' ');
              const pStyle = normalizeTextStyle([frame.styleForChildren, { marginVertical: 4, flex: 1, minWidth: 0, flexShrink: 1 }]);
              built = <Text style={pStyle}>{content}</Text>;
              break;
            }
            const containsNonText = frame.children.some((el: any) => {
              if (typeof el === 'string' || typeof el === 'number') return false;
              if (!el || typeof el !== 'object') return false;
              const t = (el as any).type;
              const isText = t === Text || (typeof t === 'string' && String(t).toLowerCase() === 'text');
              return !isText;
            });
            if (containsNonText) {
              const normalizedChildren = frame.children.map((ch, i) => {
                if (typeof ch === 'string' || typeof ch === 'number') {
                  return <Text key={`pvseg-${i}`} style={normalizeTextStyle([frame.styleForChildren, { flexShrink: 1 }])}>{ch}</Text>;
                }
                return ch;
              });
              built = <View style={{ marginVertical: 4, width: '100%', maxWidth: '100%', alignSelf: 'stretch', flexShrink: 1 }}>{normalizedChildren}</View>;
            } else {
              const pStyle = normalizeTextStyle([frame.styleForChildren, { marginVertical: 4, flexShrink: 1 }]);
              const onlyStrings = frame.children.every(ch => typeof ch === 'string');
              if (onlyStrings && frame.children.length === 1) {
                built = <Text style={pStyle}>{frame.children[0] as string}</Text>;
              } else {
                const normalizedChildren = frame.children.map((ch, i) => {
                  if (typeof ch === 'string' || typeof ch === 'number') {
                    return <Text key={`pseg-${i}`} style={normalizeTextStyle([frame.styleForChildren, { flexShrink: 1 }])}>{ch}</Text>;
                  }
                  return ch;
                });
                built = <Text style={pStyle}>{normalizedChildren}</Text>;
              }
            }
            break;
          }
          case 'ATXHeading1':
          case 'ATXHeading2':
          case 'ATXHeading3':
          case 'ATXHeading4':
          case 'ATXHeading5':
          case 'ATXHeading6':
          case 'SetextHeading1':
          case 'SetextHeading2': {
            built = <Text style={[frame.styleForChildren, { marginVertical: 8 }]}>{frame.children}</Text>;
            break;
          }
          case 'BulletList':
          case 'OrderedList': {
            const topLevel = (stack[stack.length - 1]?.name === 'Document');
            built = <View style={{ marginVertical: 0, width: '100%', maxWidth: '100%', alignSelf: 'stretch', marginLeft: topLevel ? 0 : 0 }}>{frame.children}</View>;
            break;
          }
          case 'ListItem': {
            const isOrdered = frame.parentName === 'OrderedList';
            const num = isOrdered ? extractListItemNumberFromNode(node) : undefined;
            const digits = isOrdered ? String(num || 1).length : 1;
            const markerWidth = isOrdered ? (digits >= 3 ? 24 : digits === 2 ? 18 : 14) : 14;
            const markerStyle = normalizeTextStyle([
              frame.styleForChildren,
              { width: markerWidth, marginRight: 4, marginVertical: 4, textAlign: 'right', flexShrink: 0, alignSelf: 'flex-start' }
            ]);
            const indent = 0;
            built = (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginLeft: indent, marginVertical: 0, width: '100%', maxWidth: '100%', alignSelf: 'stretch', marginRight: 4 }}>
                <Text style={markerStyle}>{isOrdered ? `${num || '1'}.` : '•'}</Text>
                <View style={{ flex: 1, minWidth: 0, flexShrink: 1, maxWidth: '100%' }}>{frame.children}</View>
              </View>
            );
            break;
          }
          case 'Emphasis':
          case 'StrongEmphasis':
          case 'Strikethrough': {
            const normalizedChildren = frame.children.map((ch, i) => {
              if (typeof ch === 'string' || typeof ch === 'number') {
                return <Text key={`is-${i}`} style={normalizeTextStyle(frame.styleForChildren)}>{ch}</Text>;
              }
              return ch;
            });
            built = <Text style={normalizeTextStyle(frame.styleForChildren)}>{normalizedChildren}</Text>;
            break;
          }
          case 'Link': {
            const url = getLinkUrlFromNode(node);
            const label = frame.children.map(flattenText).join('');
            built = (
              <Text
                style={normalizeTextStyle(frame.styleForChildren)}
                accessibilityRole="link"
                accessibilityLabel={label}
                onPress={() => { if (url) { try { Linking.openURL(url); } catch {} } }}
              >
                {frame.children}
              </Text>
            );
            break;
          }
          case 'Blockquote':
            built = (
              <View style={{ borderLeftWidth: 3, borderLeftColor: '#C7C7CC', paddingLeft: 10, marginVertical: 6 }}>
                <Text style={normalizeTextStyle([frame.styleForChildren, { color: '#333' }])}>{frame.children}</Text>
              </View>
            );
            break;
          default:
            // Unknown containers: render their children inline
            built = <Text style={normalizeTextStyle(frame.styleForChildren)}>{frame.children}</Text>;
            break;
        }

        // Attach to parent or set as root
        const parent = stack[stack.length - 1];
        if (parent) {
          parent.children.push(
            React.cloneElement(built as React.ReactElement, { key: `node-${frame.name}-${frame.from}-${frame.to}` })
          );
          parent.prevChildName = frame.name;
          parent.lastEnd = Math.max(parent.lastEnd, frame.to);
        } else {
          root = built;
        }
      }
    });

    // Fallback if no root built
    if (!root) {
      root = <Text style={baseStyle}>{text}</Text>;
    }
    return root;
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
            <View key={index} style={{ marginVertical: 6, width: '100%', maxWidth: '100%', alignSelf: 'stretch' }}>
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
                width: '100%',
                maxWidth: '100%',
              }}
            >
              <Text style={[inheritedStyle, { width: 20, marginRight: 4 }]}>
                {isOrdered ? `${number || '1'}.` : '•'}
              </Text>
              <View style={{ flex: 1, minWidth: 0, flexShrink: 1 }}>
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
