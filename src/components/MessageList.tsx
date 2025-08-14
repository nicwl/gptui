import React, { useEffect, useMemo, useRef } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { Message } from '../types';
import MessageBubble from './MessageBubble';

type Props = {
  messages: Message[];
  getModelDisplayName: (modelId: string) => string;
  onLongPressMessage: (message: Message) => void;
  emptyComponent?: React.ReactElement;
  activeThreadId?: string | null;
};

const MessageList: React.FC<Props> = ({ messages, getModelDisplayName, onLongPressMessage, emptyComponent, activeThreadId }) => {
  const hasMessages = messages.length > 0;
  const data = useMemo(() => (hasMessages ? [...messages].reverse() : []), [messages, hasMessages]);
  const flatListRef = useRef<FlatList>(null);
  const previousThreadIdRef = useRef<string | null>(null);
  const shouldAutoScrollRef = useRef(false);

  // When the active thread changes, schedule an auto-scroll to bottom
  useEffect(() => {
    if (activeThreadId !== previousThreadIdRef.current) {
      previousThreadIdRef.current = activeThreadId ?? null;
      shouldAutoScrollRef.current = true;
    }
  }, [activeThreadId]);

  return (
    <FlatList
      ref={flatListRef}
      key={activeThreadId || 'no-thread'}
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <MessageBubble
          message={item}
          modelDisplayName={item.modelId ? getModelDisplayName(item.modelId) : undefined}
          onLongPress={onLongPressMessage}
        />
      )}
      style={styles.list}
      inverted={hasMessages}
      maintainVisibleContentPosition={hasMessages ? { minIndexForVisible: 0, autoscrollToTopThreshold: 50 } : undefined}
      contentContainerStyle={[
        styles.container,
        hasMessages ? { paddingTop: 8, flexGrow: 0 } : { paddingBottom: 0, flexGrow: 1 },
      ]}
      ListEmptyComponent={emptyComponent}
      onContentSizeChange={() => {
        if (hasMessages && shouldAutoScrollRef.current && flatListRef.current) {
          try {
            flatListRef.current.scrollToOffset({ offset: 0, animated: false });
          } catch {}
          shouldAutoScrollRef.current = false;
        }
      }}
    />
  );
};

const styles = StyleSheet.create({
  list: {
    flex: 1,
    paddingBottom: 0,
  },
  container: {
    flexGrow: 1,
    padding: 0,
    margin: 0,
    paddingHorizontal: 12,
  },
});

export default MessageList;


