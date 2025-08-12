/**
 * Tests for LezerStreamingRenderer
 */

import { LezerStreamingText } from '../LezerStreamingRenderer';

// Mock react-native components
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Text: 'Text',
  View: 'View',
  StyleSheet: { hairlineWidth: 1 },
}));

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => ({
  ScrollView: 'ScrollView',
}));

// Mock React since we're not actually rendering
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useMemo: (fn: any) => fn(),
  useCallback: (fn: any) => fn,
  useRef: () => ({ current: undefined }),
  useEffect: () => {},
  useState: (initial: any) => [initial, () => {}],
}));

describe('LezerStreamingText', () => {
  const defaultStyle = {
    fontSize: 16,
    lineHeight: 22,
    color: '#000000',
  };

  it('should be importable', () => {
    expect(LezerStreamingText).toBeDefined();
    expect(typeof LezerStreamingText).toBe('function');
  });

  it('should accept required props without throwing', () => {
    expect(() => {
      LezerStreamingText({
        content: "Hello world",
        isStreaming: false,
        style: defaultStyle,
        isAssistant: false,
        messageId: "test-msg-1"
      });
    }).not.toThrow();
  });

  it('should handle assistant messages', () => {
    expect(() => {
      LezerStreamingText({
        content: "# Hello\nThis is **bold** text",
        isStreaming: false,
        style: defaultStyle,
        isAssistant: true,
        messageId: "test-msg-2"
      });
    }).not.toThrow();
  });

  it('should handle empty content', () => {
    expect(() => {
      LezerStreamingText({
        content: "",
        isStreaming: false,
        style: defaultStyle,
        isAssistant: true,
        messageId: "test-msg-3"
      });
    }).not.toThrow();
  });

  it('should handle streaming state', () => {
    expect(() => {
      LezerStreamingText({
        content: "Streaming content...",
        isStreaming: true,
        style: defaultStyle,
        isAssistant: true,
        messageId: "test-msg-4"
      });
    }).not.toThrow();
  });

  it('should handle the specific problematic example', () => {
    expect(() => {
      LezerStreamingText({
        content: "Hi there! 👋 How's your day going?",
        isStreaming: false,
        style: defaultStyle,
        isAssistant: true,
        messageId: "test-msg-5"
      });
    }).not.toThrow();
  });
});
