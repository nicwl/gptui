import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Message } from '../types';
import { LezerStreamingText } from '../utils/LezerStreamingRenderer';

type Props = {
  message: Message;
  modelDisplayName?: string;
  onLongPress: (message: Message) => void;
};

const MessageBubble: React.FC<Props> = ({ message, modelDisplayName, onLongPress }) => {
  const isUser = message.role === 'user';

  return (
    <TouchableOpacity
      style={[
        styles.messageContainer,
        isUser ? styles.userMessage : styles.assistantMessage,
      ]}
      onLongPress={() => onLongPress(message)}
      delayLongPress={350}
      activeOpacity={0.7}
    >
      <LezerStreamingText
        content={message.content}
        isStreaming={message.isStreaming || false}
        isAssistant={!isUser}
        messageId={message.id}
        style={[
          styles.messageText,
          isUser ? styles.userMessageText : styles.assistantMessageText,
        ]}
      />
      <View style={styles.messageFooter}>
        <Text style={styles.messageTime}>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
        {message.modelId && !isUser && !message.isStreaming && (
          <Text style={styles.messageModel}>{modelDisplayName || message.modelId}</Text>
        )}
        {message.isStreaming && (
          <Text style={styles.streamingIndicator}>Typing...</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
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
});

export default MessageBubble;


