import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, KeyboardAvoidingView, Platform, useWindowDimensions, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { RouteProp } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { NavigationParams, Message } from '../types';
import ChatSidebar from '../components/ChatSidebar';

type ChatScreenNavigationProp = StackNavigationProp<NavigationParams, 'Chat'>;
type ChatScreenRouteProp = RouteProp<NavigationParams, 'Chat'>;

interface Props {
  navigation: ChatScreenNavigationProp;
  route: ChatScreenRouteProp;
}

const ChatScreen: React.FC<Props> = ({ navigation, route }) => {
  const { state, actions } = useApp();
  const headerHeight = useHeaderHeight();
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const currentThread = state.currentThreadId ? state.threads.find(t => t.id === state.currentThreadId) : null;

  const toggleSidebar = () => {
    Keyboard.dismiss();
    setIsSidebarVisible(prev => !prev);
  };
  const hideSidebar = () => setIsSidebarVisible(false);

  useEffect(() => {
    // Set up navigation header
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.headerButton} onPress={handleNewChat}>
            <Text style={styles.headerButtonText}>New Chat</Text>
          </TouchableOpacity>
        </View>
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
  }, [navigation]);

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

  // Derived flags/data for list behavior
  const hasMessages = !!(currentThread && currentThread.messages && currentThread.messages.length > 0);
  const messagesData = hasMessages
    ? [...(currentThread?.messages || [])].reverse()
    : [];

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = Keyboard.addListener('keyboardWillShow', () => {
      // Use non-animated scroll here and let the keyboard animate; then do a gentle finalize after a short delay
      if (!flatListRef.current) return;
      if (hasMessages) {
        flatListRef.current.scrollToOffset({ offset: 0, animated: true });
      } else {
        flatListRef.current.scrollToEnd({ animated: true });
      }
      //setTimeout(() => scrollToBottom(), 120);
    });
    return () => sub.remove();
  }, [hasMessages]);

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[
      styles.messageContainer,
      item.role === 'user' ? styles.userMessage : styles.assistantMessage
    ]}>
      <Text style={[
        styles.messageText,
        item.role === 'user' ? styles.userMessageText : styles.assistantMessageText
      ]}>
        {item.content}
      </Text>
      <Text style={styles.messageTime}>
        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
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
        maintainVisibleContentPosition={hasMessages ? { minIndexForVisible: 1, autoscrollToTopThreshold: 50 } : undefined}
        contentContainerStyle={[
          styles.messagesContainer,
          { padding: 0, paddingHorizontal: 12 },
          hasMessages
            ? { paddingTop: 8, flexGrow: 0 } // inverted: visual bottom space only safe area, no extra growth
            : { paddingBottom: 0, flexGrow: 1 }
        ]}
        ListEmptyComponent={renderEmptyState}
      />

      {isTyping && (
        <View style={styles.typingIndicator}>
          <Text style={styles.typingText}>AI is typing...</Text>
        </View>
      )}

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
  messageTime: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.6,
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
