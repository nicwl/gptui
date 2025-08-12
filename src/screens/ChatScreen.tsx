import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, KeyboardAvoidingView, Platform, Keyboard, Modal } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Clipboard from '@react-native-clipboard/clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { RouteProp } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { NavigationParams, Message } from '../types';
import ChatSidebar from '../components/ChatSidebar';
import { ModelSelectionModal, AVAILABLE_MODELS } from '../components/ModelSelectionModal.tsx';
import Haptics from '../utils/Haptics';
import { LezerStreamingText } from '../utils/LezerStreamingRenderer';


type ChatScreenNavigationProp = StackNavigationProp<NavigationParams, 'Chat'>;
type ChatScreenRouteProp = RouteProp<NavigationParams, 'Chat'>;

interface Props {
  navigation: ChatScreenNavigationProp;
  route: ChatScreenRouteProp;
}

// Dedicated code block component to handle accurate content width and indicator spacing
const HorizontalCodeBlock: React.FC<{
  content: string;
  baseFontSize: number;
  baseLineHeight: number;
  unicodeStyle: any;
}> = ({ content, baseFontSize, baseLineHeight, unicodeStyle }) => {
  const [maxLineWidth, setMaxLineWidth] = useState(0);

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

// The StreamingText component is now replaced by LezerStreamingText

const ChatScreen: React.FC<Props> = ({ navigation, route }) => {
  const { state, actions } = useApp();
  const headerHeight = useHeaderHeight();
  const [inputText, setInputText] = useState('');
  const [_isTyping, setIsTyping] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isModelModalVisible, setIsModelModalVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; message: Message | null }>({ visible: false, message: null });
  const flatListRef = useRef<FlatList>(null);

  // Find current thread, but handle race conditions during thread creation
  const currentThread = React.useMemo(() => {
    if (!state.currentThreadId) return null;
    return state.threads.find(t => t.id === state.currentThreadId) || null;
  }, [state.currentThreadId, state.threads]);

  const toggleSidebar = () => {
    Keyboard.dismiss();
    setIsSidebarVisible(prev => {
      Haptics.selection();
      return !prev;
    });
  };
  const hideSidebar = () => setIsSidebarVisible(false);

  const getModelDisplayName = (modelId: string) => {
    const model = AVAILABLE_MODELS.find((m: any) => m.id === modelId);
    return model?.name || modelId;
  };

  const handleModelSelection = () => {
    Haptics.selection();
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
    Haptics.selection();
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
    Haptics.impactLight();
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


  const handleLongPressMessage = (message: Message) => {
    Haptics.selection();
    setContextMenu({ visible: true, message });
  };

  const handleCopyMessage = () => {
    if (contextMenu.message) {
      Clipboard.setString(contextMenu.message.content);
      Haptics.success();
      setContextMenu({ visible: false, message: null });
    }
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, message: null });
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <TouchableOpacity
      style={[
        styles.messageContainer,
        item.role === 'user' ? styles.userMessage : styles.assistantMessage
      ]}
      onLongPress={() => handleLongPressMessage(item)}
      delayLongPress={350}
      activeOpacity={0.7}
    >
      <LezerStreamingText
        content={item.content}
        isStreaming={item.isStreaming || false}
        isAssistant={item.role === 'assistant'}
        messageId={item.id}
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
    </TouchableOpacity>
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
          onPress={() => {
            Haptics.selection();
            navigation.navigate('Settings');
          }}
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
            } catch { }
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

      {/* Context Menu Modal */}
      <Modal
        visible={contextMenu.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeContextMenu}
      >
        <TouchableOpacity
          style={styles.contextMenuBackdrop}
          activeOpacity={1}
          onPress={closeContextMenu}
        >
          <View style={styles.contextMenuContainer}>
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={handleCopyMessage}
            >
              <Text style={styles.contextMenuItemText}>Copy Message</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  contextMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenuContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  contextMenuItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  contextMenuItemText: {
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
  },
});

export default ChatScreen;
