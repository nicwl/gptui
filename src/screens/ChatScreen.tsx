import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, KeyboardAvoidingView, Platform, useWindowDimensions, Keyboard, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { RouteProp } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { NavigationParams, Message } from '../types';
import ChatSidebar from '../components/ChatSidebar';
import { ModelSelectionModal, AVAILABLE_MODELS } from '../components/ModelSelectionModal.tsx';
import Markdown from 'react-native-markdown-display';

type ChatScreenNavigationProp = StackNavigationProp<NavigationParams, 'Chat'>;
type ChatScreenRouteProp = RouteProp<NavigationParams, 'Chat'>;

interface Props {
  navigation: ChatScreenNavigationProp;
  route: ChatScreenRouteProp;
}

// Helper component to render streaming text with character-by-character reveal
const StreamingText = ({ content, isStreaming, style, isAssistant }: { content: string, isStreaming: boolean, style: any, isAssistant?: boolean }) => {
  const [revealedLength, setRevealedLength] = useState(0);
  const [hasStartedRevealing, setHasStartedRevealing] = useState(false);
  const [targetEndTime, setTargetEndTime] = useState<number | null>(null);
  const [wasStreaming, setWasStreaming] = useState(false);
  
  useEffect(() => {
    // Lock in the target end time when streaming transitions from true to false
    if (wasStreaming && !isStreaming) {
      const endTime = performance.now() + 10000; // 10 seconds from now
      setTargetEndTime(endTime);
    }
    setWasStreaming(isStreaming);
  }, [isStreaming, wasStreaming]);
  
  useEffect(() => {
    // Start revealing when streaming begins or continue if there's more content to reveal
    if ((isStreaming || revealedLength < content.length) && content.length > revealedLength) {
      if (isStreaming && !hasStartedRevealing) {
        setHasStartedRevealing(true);
        setRevealedLength(0);
        setTargetEndTime(null); // Reset target time for new streaming
      }
      
      let lastUpdateTime = performance.now();
      let animationId: number;
      
      const updateReveal = () => {
        const now = performance.now();
        const deltaTime = now - lastUpdateTime;
        
        if (isStreaming) {
          // During streaming: reveal 1 character every 2ms
          if (deltaTime >= 2) {
            setRevealedLength(prev => Math.min(prev + 1, content.length));
            lastUpdateTime = now;
          }
        } else if (targetEndTime) {
          // After streaming: maintain or increase speed, never slow down
          const remainingTime = Math.max(1, targetEndTime - now);
          const remainingChars = content.length - revealedLength;
          
          if (remainingChars > 0) {
            // Only reveal if enough time has passed (maintain 3ms minimum interval)
            if (deltaTime >= 2) {
              // Calculate minimum characters per frame to finish on time
              const framesRemaining = Math.max(1, Math.ceil(remainingTime / 16)); // ~60fps
              const minCharsPerFrame = Math.ceil(remainingChars / framesRemaining);
              
              // At streaming speed, reveal 1 char per 2ms interval
              const streamingSpeedChars = 1;
              const charsToReveal = Math.max(streamingSpeedChars, minCharsPerFrame);
              
              setRevealedLength(prev => Math.min(prev + charsToReveal, content.length));
              lastUpdateTime = now;
            }
          }
        }
        
        // Continue animation if there's more to reveal AND component is still mounted
        const shouldContinue = revealedLength < content.length && (isStreaming || targetEndTime);
        if (shouldContinue) {
          animationId = requestAnimationFrame(updateReveal);
        } else {
          // Animation complete - clean up
          if (!isStreaming && revealedLength >= content.length) {
            setTargetEndTime(null);
            setHasStartedRevealing(false);
          }
        }
      };
      
      animationId = requestAnimationFrame(updateReveal);
      
      return () => {
        if (animationId) {
          cancelAnimationFrame(animationId);
        }
      };
    }
  }, [content, isStreaming, revealedLength, hasStartedRevealing, targetEndTime]);
  
  useEffect(() => {
    // Reset when component receives new content and streaming starts
    if (isStreaming && !hasStartedRevealing) {
      setRevealedLength(0);
      setHasStartedRevealing(true);
    }
  }, [isStreaming, hasStartedRevealing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Component is unmounting, ensure any running animations are stopped
      if (hasStartedRevealing) {
        setHasStartedRevealing(false);
        setTargetEndTime(null);
      }
    };
  }, []);
  
  // Memoize markdown styles to prevent recreation on every render
  const markdownStyles = React.useMemo(() => ({
    body: style,
    code_inline: {
      backgroundColor: 'rgba(0,0,0,0.1)',
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 3,
      fontFamily: 'Menlo',
      fontSize: style.fontSize * 0.9,
    },
    code_block: {
      backgroundColor: 'rgba(0,0,0,0.1)',
      padding: 8,
      borderRadius: 6,
      fontFamily: 'Menlo',
      fontSize: style.fontSize * 0.9,
    },
    heading1: { ...style, fontSize: style.fontSize * 1.3, fontWeight: 'bold', marginVertical: 4 },
    heading2: { ...style, fontSize: style.fontSize * 1.2, fontWeight: 'bold', marginVertical: 3 },
    heading3: { ...style, fontSize: style.fontSize * 1.1, fontWeight: 'bold', marginVertical: 2 },
    strong: { ...style, fontWeight: 'bold' },
    em: { ...style, fontStyle: 'italic' },
    list_item: { ...style, marginVertical: 1 },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
  }), [style]);

  // If we haven't started revealing yet (before streaming begins), show full content
  if (!hasStartedRevealing) {
    if (isAssistant) {
      return <Markdown style={markdownStyles}>{content}</Markdown>;
    }
    return <Text style={style}>{content}</Text>;
  }

  // Show only the revealed portion of the content
  const visibleContent = content.slice(0, revealedLength);
  
  if (isAssistant) {
    return <Markdown style={markdownStyles}>{visibleContent}</Markdown>;
  }
  
  return (
    <Text style={style}>
      {visibleContent}
    </Text>
  );
};

const ChatScreen: React.FC<Props> = ({ navigation, route }) => {
  const { state, actions } = useApp();
  const headerHeight = useHeaderHeight();
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isModelModalVisible, setIsModelModalVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Find current thread, but handle race conditions during thread creation
  const currentThread = React.useMemo(() => {
    if (!state.currentThreadId) return null;
    return state.threads.find(t => t.id === state.currentThreadId) || null;
  }, [state.currentThreadId, state.threads]);

  const toggleSidebar = () => {
    Keyboard.dismiss();
    setIsSidebarVisible(prev => !prev);
  };
  const hideSidebar = () => setIsSidebarVisible(false);

      const getModelDisplayName = (modelId: string) => {
      const model = AVAILABLE_MODELS.find((m: any) => m.id === modelId);
      return model?.name || modelId;
    };

  const handleModelSelection = () => {
    setIsModelModalVisible(true);
  };

  useEffect(() => {
    // Set up navigation header
    navigation.setOptions({
      title: '', // Remove title
      headerTitle: () => (
        <TouchableOpacity
          style={styles.centerModelButton}
          onPress={handleModelSelection}
          accessibilityLabel="Select Model"
        >
          <Text style={styles.centerModelButtonText}>
            {getModelDisplayName(state.selectedModel)}
          </Text>
          <Text style={styles.centerModelButtonArrow}>▼</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleNewChat}
          accessibilityLabel="New Chat"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.headerButtonText, { fontSize: 20 }]}>＋</Text>
        </TouchableOpacity>
      ),
      headerLeft: () => (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={toggleSidebar}
        >
          <Text style={styles.headerButtonText}>☰</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, state.selectedModel]);

  // Sidebar animations handled in ChatSidebar component

  useEffect(() => {
    // Handle thread ID from navigation params
    const { threadId } = route.params || {};
    if (threadId && threadId !== state.currentThreadId) {
      actions.setCurrentThread(threadId);
    }
  }, [route.params, state.currentThreadId]);

  // Inverted list keeps bottom anchored; no manual auto-scroll needed

  const handleNewChat = () => {
    actions.createNewThread();
  };

  const handleSelectThread = (threadId: string) => {
    actions.setCurrentThread(threadId);
    hideSidebar();
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    if (!state.apiKey) {
      Alert.alert(
        'API Key Required',
        'Please configure your OpenAI API key in Settings to start chatting.',
        [{ text: 'OK', onPress: () => navigation.navigate('Settings') }]
      );
      return;
    }

    // No need to check for currentThreadId - it will be created automatically when sending first message

    const message = inputText.trim();
    setInputText('');
    setIsTyping(true);

    try {
      await actions.sendMessage(message);
    } catch (error) {
      Alert.alert('Error', 'Failed to send message. Please check your API key and try again.');
    } finally {
      setIsTyping(false);
    }
  };


  // Memoize message-related state to ensure proper re-renders during streaming
  const messages = React.useMemo(() => {
    return currentThread?.messages || [];
  }, [currentThread?.messages]);

  const hasMessages = React.useMemo(() => {
    return messages.length > 0;
  }, [messages.length]);

  const messagesData = React.useMemo(() => {
    return hasMessages ? [...messages].reverse() : [];
  }, [messages, hasMessages]);


  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[
      styles.messageContainer,
      item.role === 'user' ? styles.userMessage : styles.assistantMessage
    ]}>
      <StreamingText 
        content={item.content}
        isStreaming={item.isStreaming || false}
        isAssistant={item.role === 'assistant'}
        style={[
          styles.messageText,
          item.role === 'user' ? styles.userMessageText : styles.assistantMessageText
        ]}
      />
      <View style={styles.messageFooter}>
        <Text style={styles.messageTime}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {item.modelId && item.role === 'assistant' && !item.isStreaming && (
          <Text style={styles.messageModel}>
            {getModelDisplayName(item.modelId)}
          </Text>
        )}
        {item.isStreaming && (
          <Text style={styles.streamingIndicator}>Typing...</Text>
        )}
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>Welcome to GPT Chat</Text>
      <Text style={styles.emptyStateText}>
        Start a conversation by typing a message below.
      </Text>
      {!state.apiKey && (
        <TouchableOpacity
          style={styles.setupButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.setupButtonText}>Setup API Key</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const insets = useSafeAreaInsets();
  const keyboardOffset = headerHeight - insets.bottom + 10

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardOffset}
    >
      <FlatList
        ref={flatListRef}
        data={messagesData}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        inverted={hasMessages}
        maintainVisibleContentPosition={hasMessages ? { minIndexForVisible: 0, autoscrollToTopThreshold: 50 } : undefined}
        contentContainerStyle={[
          styles.messagesContainer,
          { padding: 0, paddingHorizontal: 12 },
          hasMessages
            ? { paddingTop: 8, flexGrow: 0 } // inverted: visual bottom space only safe area, no extra growth
            : { paddingBottom: 0, flexGrow: 1 }
        ]}
        ListEmptyComponent={renderEmptyState}
      />

      <View style={[styles.inputContainer, { paddingTop: 10, paddingBottom: insets.bottom, paddingHorizontal: Math.max(16, insets.left + 12, insets.right + 12) }]}>
        <TextInput
          style={[styles.textInput, { paddingHorizontal: 14 }]}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          multiline
          maxLength={2000}
          editable={!state.isLoading}
        />
        <TouchableOpacity
          style={[styles.sendButton, { paddingHorizontal: 18, paddingVertical: 10 }, (!inputText.trim() || state.isLoading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || state.isLoading}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>

      {/* Sidebar overlay */}
      <ChatSidebar
        visible={isSidebarVisible}
        threads={state.threads}
        currentThreadId={state.currentThreadId}
        onSelectThread={handleSelectThread}
        onClose={hideSidebar}
        onSettingsPress={() => navigation.navigate('Settings')}
        onDeleteSelected={async (ids) => {
          for (const id of ids) {
            try {
              await actions.deleteThread(id);
            } catch {}
          }
        }}
      />

      {/* Model Selection Modal */}
      <ModelSelectionModal
        visible={isModelModalVisible}
        selectedModel={state.selectedModel}
        onSelectModel={actions.setModel}
        onClose={() => setIsModelModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 0,
  },
  headerButtons: {
    flexDirection: 'row',
  },
  headerButton: {
    marginHorizontal: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  modelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
  },
  modelButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  modelButtonArrow: {
    color: '#007AFF',
    fontSize: 10,
  },
  centerModelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
  },
  centerModelButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 4,
  },
  centerModelButtonArrow: {
    color: '#007AFF',
    fontSize: 12,
  },
  messagesList: {
    flex: 1,
    paddingBottom: 0
  },
  messagesContainer: {
    flexGrow: 1,
    padding: 0,
    margin: 0,
  },
  messageContainer: {
    marginTop: 8,
    marginBottom: 0,
    marginHorizontal: 0,
    padding: 12,
    paddingTop: 12,
    borderRadius: 12,
    maxWidth: '85%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#F2F2F7',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#ffffff',
  },
  assistantMessageText: {
    color: '#000000',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 12,
    opacity: 0.6,
  },
  messageModel: {
    fontSize: 10,
    opacity: 0.5,
    marginLeft: 8,
    fontStyle: 'italic',
  },

  streamingIndicator: {
    fontSize: 10,
    color: '#007AFF',
    fontStyle: 'italic',
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
  },
  setupButton: {
    marginTop: 24,
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  setupButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  typingIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  typingText: {
    fontSize: 14,
    color: '#666666',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  sendButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  sidebarBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  sidebarBackdropDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  sidebar: {
    height: '100%',
    backgroundColor: '#fff',
    paddingTop: 12,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  sidebarContent: {
    flex: 1,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  sidebarTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sidebarClose: {
    fontSize: 18,
    color: '#007AFF',
    padding: 8,
  },
  threadListContent: {
    paddingVertical: 8,
  },
  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingVertical: 10,
  },
  sidebarSettingsBtn: {
    paddingVertical: 10,
  },
  sidebarSettingsText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  threadItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  threadItemActive: {
    backgroundColor: '#F2F2F7',
  },
  threadName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  threadSnippet: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  threadSeparator: {
    height: 8,
  },
});

export default ChatScreen;
