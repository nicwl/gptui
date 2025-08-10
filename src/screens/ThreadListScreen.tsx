import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useApp } from '../context/AppContext';
import { NavigationParams, Thread } from '../types';

type ThreadListNavigationProp = StackNavigationProp<NavigationParams, 'ThreadList'>;

interface Props {
  navigation: ThreadListNavigationProp;
}

const ThreadListScreen: React.FC<Props> = ({ navigation }) => {
  const { state, actions } = useApp();

  const handleThreadSelect = (thread: Thread) => {
    actions.setCurrentThread(thread.id);
    navigation.navigate('Chat', { threadId: thread.id });
  };

  const handleDeleteThread = (thread: Thread) => {
    Alert.alert(
      'Delete Conversation',
      `Are you sure you want to delete "${thread.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => actions.deleteThread(thread.id),
        },
      ]
    );
  };

  const handleNewChat = () => {
    actions.createNewThread();
    navigation.navigate('Chat', {});
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return 'Today';
    } else if (diffDays === 2) {
      return 'Yesterday';
    } else if (diffDays <= 7) {
      return `${diffDays - 1} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const renderThread = ({ item }: { item: Thread }) => (
    <TouchableOpacity
      style={styles.threadItem}
      onPress={() => handleThreadSelect(item)}
      onLongPress={() => handleDeleteThread(item)}
    >
      <View style={styles.threadHeader}>
        <Text style={styles.threadName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.threadDate}>
          {formatDate(item.updatedAt)}
        </Text>
      </View>
      <Text style={styles.threadPreview} numberOfLines={2}>
        {item.messages.length > 0
          ? item.messages[item.messages.length - 1].content
          : 'No messages yet'}
      </Text>
      <Text style={styles.messageCount}>
        {item.messages.length} message{item.messages.length !== 1 ? 's' : ''}
      </Text>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>No Conversations Yet</Text>
      <Text style={styles.emptyStateText}>
        Start your first conversation to see it appear here.
      </Text>
      <TouchableOpacity style={styles.newChatButton} onPress={handleNewChat}>
        <Text style={styles.newChatButtonText}>Start New Chat</Text>
      </TouchableOpacity>
    </View>
  );

  // Filter out empty threads for display
  const visibleThreads = state.threads.filter(thread => !thread.isEmpty);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.newChatHeaderButton} onPress={handleNewChat}>
          <Text style={styles.newChatHeaderButtonText}>+ New Chat</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={visibleThreads}
        renderItem={renderThread}
        keyExtractor={(item) => item.id}
        style={styles.threadsList}
        contentContainerStyle={styles.threadsContainer}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  newChatHeaderButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  newChatHeaderButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  threadsList: {
    flex: 1,
  },
  threadsContainer: {
    flexGrow: 1,
  },
  threadItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  threadName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginRight: 12,
  },
  threadDate: {
    fontSize: 12,
    color: '#666666',
  },
  threadPreview: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    marginBottom: 8,
  },
  messageCount: {
    fontSize: 12,
    color: '#999999',
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
    marginBottom: 24,
  },
  newChatButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  newChatButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ThreadListScreen;
