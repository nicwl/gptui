import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
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
import MessageList from '../components/MessageList';
import InputBar from '../components/InputBar';
import ContextMenuModal from '../components/ContextMenuModal';
import ModelButton from '../components/ModelButton';
import EmptyState from '../components/EmptyState';


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
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isModelModalVisible, setIsModelModalVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; message: Message | null }>({ visible: false, message: null });

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
        <ModelButton label={getModelDisplayName(state.selectedModel)} onPress={handleModelSelection} />
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
          testID="menuButton"
          accessibilityLabel="Open Menu"
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

    try {
      await actions.sendMessage(message);
    } catch (error) {
      Alert.alert('Error', 'Failed to send message. Please check your API key and try again.');
    } finally {
      // no-op
    }
  };


  // Use messages from app state for the active thread only
  const messages = React.useMemo(() => {
    return state.currentThreadMessages;
  }, [state.currentThreadMessages]);


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

  const renderEmptyState = () => (
    <EmptyState
      showSetupButton={!state.apiKey}
      onPressSetup={() => {
        Haptics.selection();
        navigation.navigate('Settings');
      }}
    />
  );

  const insets = useSafeAreaInsets();
  const keyboardOffset = headerHeight - insets.bottom + 10

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardOffset}
    >
      <MessageList
        messages={messages}
        getModelDisplayName={getModelDisplayName}
        onLongPressMessage={handleLongPressMessage}
        emptyComponent={renderEmptyState()}
        activeThreadId={state.currentThreadId}
      />

      <InputBar
        value={inputText}
        onChangeText={setInputText}
        onSend={handleSend}
        disabled={state.isLoading}
        insets={insets}
      />

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
      <ContextMenuModal
        visible={contextMenu.visible}
        onClose={closeContextMenu}
        onCopy={handleCopyMessage}
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
  headerButton: {
    marginHorizontal: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
});

export default ChatScreen;
