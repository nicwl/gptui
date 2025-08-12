/**
 * Lezer-based Markdown Renderer
 * 
 * Replaces the custom incremental markdown parser system with @lezer/markdown
 * for more robust and standard markdown parsing.
 */

import React from 'react';
import { Text, View, Platform } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { parser } from '@lezer/markdown';
import { Tree, NodeType } from '@lezer/common';

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
  const [maxLineWidth, setMaxLineWidth] = React.useState(0);

  const onLineLayout = (e: any) => {
    const w = e?.nativeEvent?.layout?.width ?? 0;
    if (w > maxLineWidth) setMaxLineWidth(w);
  };

  const lines = React.useMemo(() => String(content).split('\n'), [content]);

  return (
    <View style={{ flexDirection: 'column', alignSelf: 'flex-start', width: maxLineWidth > 0 ? maxLineWidth : undefined }}>
      {lines.map((ln, i) => (
        <Text
          key={i}
          numberOfLines={1}
          onLayout={onLineLayout}
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
  
  constructor(styleConfig: MarkdownStyleConfig) {
    this.styleConfig = styleConfig;
  }

  /**
   * Parse markdown text and render as React components
   */
  render(text: string, baseStyle: any): React.ReactNode {
    try {
      const tree = parser.parse(text);
      const renderTree = this.lezerTreeToRenderTree(tree, text);
      return this.renderNodes([renderTree], baseStyle);
    } catch (error) {
      console.warn('Lezer markdown parsing failed, falling back to plain text:', error);
      return <Text style={baseStyle}>{text}</Text>;
    }
  }

  /**
   * Convert Lezer tree to our render tree structure
   */
  private lezerTreeToRenderTree(tree: Tree, text: string): LezerRenderNode {
    const buildNode = (cursor: any): LezerRenderNode => {
      const node: LezerRenderNode = {
        type: cursor.type.id.toString(),
        name: cursor.type.name,
        from: cursor.from,
        to: cursor.to,
        children: []
      };

      // Check if this node has children
      if (cursor.firstChild()) {
        let lastEnd = node.from; // Use the parent node's start position
        
        do {
          // Add text content before this child if there's a gap
          if (cursor.from > lastEnd) {
            const textContent = text.slice(lastEnd, cursor.from);
            if (textContent.length > 0) {
              node.children.push({
                type: 'text',
                name: 'Text',
                from: lastEnd,
                to: cursor.from,
                content: textContent,
                children: []
              });
            }
          }
          
          // Add the child node
          node.children.push(buildNode(cursor));
          lastEnd = cursor.to;
        } while (cursor.nextSibling());
        
        // Add any remaining text after the last child
        if (lastEnd < node.to) {
          const textContent = text.slice(lastEnd, node.to);
          if (textContent.length > 0) {
            node.children.push({
              type: 'text',
              name: 'Text',
              from: lastEnd,
              to: node.to,
              content: textContent,
              children: []
            });
          }
        }
        
        cursor.parent();
      } else {
        // Leaf node - add content directly
        node.content = text.slice(cursor.from, cursor.to);
      }
      
      // For certain nodes that should always have content extracted, even if they have children
      if (['CodeText'].includes(node.name) && !node.content) {
        node.content = text.slice(cursor.from, cursor.to);
      }

      return node;
    };

    const cursor = tree.cursor();
    return buildNode(cursor);
  }

  /**
   * Render nodes to React components
   */
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
