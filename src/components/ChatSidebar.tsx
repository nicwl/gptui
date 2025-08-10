import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Thread } from '../types';

type Props = {
  visible: boolean;
  threads: Thread[];
  currentThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onClose: () => void;
  onSettingsPress: () => void;
  onDeleteSelected: (threadIds: string[]) => Promise<void> | void;
};

export const ChatSidebar: React.FC<Props> = ({
  visible,
  threads,
  currentThreadId,
  onSelectThread,
  onClose,
  onSettingsPress,
  onDeleteSelected,
}) => {
  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sidebarWidth = useMemo(
    () => (width >= 768 ? Math.min(400, width * 0.4) : Math.min(320, width * 0.85)),
    [width]
  );

  const [mounted, setMounted] = useState(false);
  const slideX = useRef(new Animated.Value(-sidebarWidth)).current;
  const dimOpacity = useRef(new Animated.Value(0)).current; // 0..0.3
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAnim = useRef(new Animated.Value(0)).current;

  const animateLayout = () => {
    LayoutAnimation.configureNext({
      duration: 220,
      create: {
        type: LayoutAnimation.Types.easeIn,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
  };

  useEffect(() => {
    Animated.timing(selectAnim, {
      toValue: isSelecting ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isSelecting]);

  useEffect(() => {
    if (visible && !mounted) setMounted(true);
    const toX = visible ? 0 : -sidebarWidth;
    const toOpacity = visible ? 0.3 : 0;
    const opacityDuration = visible ? 1000 : 300;
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: toX,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(dimOpacity, {
        toValue: toOpacity,
        duration: opacityDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, sidebarWidth]);

  if (!visible && !mounted) return null;

  return (
    <View style={styles.absoluteFill} pointerEvents="box-none">
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.absoluteFill}>
        <Animated.View style={[styles.dim, { opacity: dimOpacity }]} />
        <Animated.View
          style={[
            styles.panel,
            { width: sidebarWidth, transform: [{ translateX: slideX }] },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Chats</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => {
                if (isSelecting) {
                  setIsSelecting(false);
                  setSelectedIds(new Set());
                } else {
                  setIsSelecting(true);
                }
              }}>
                <Text style={styles.edit}>{isSelecting ? 'Cancel' : 'Edit'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.close}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.content}> 
            <FlatList
              data={threads}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.threadItem,
                    item.id === currentThreadId && !isSelecting && styles.threadItemActive,
                  ]}
                  onPress={() => {
                    if (isSelecting) {
                      const next = new Set(selectedIds);
                      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                      setSelectedIds(next);
                    } else {
                      onSelectThread(item.id);
                    }
                  }}
                  onLongPress={() => {
                    if (!isSelecting) {
                      setIsSelecting(true);
                      const next = new Set<string>();
                      next.add(item.id);
                      setSelectedIds(next);
                    }
                  }}
                >
                  <View style={styles.threadRow}>
                    <Animated.View style={{ opacity: selectAnim, transform: [{ scale: selectAnim.interpolate({ inputRange: [0,1], outputRange: [0.9, 1] }) }] }}>
                      {isSelecting ? (
                        <View style={[styles.checkbox, selectedIds.has(item.id) && styles.checkboxSelected]}>
                          {selectedIds.has(item.id) && <Text style={styles.checkboxTick}>✓</Text>}
                        </View>
                      ) : (
                        <View style={{ width: 0, height: 22 }} />
                      )}
                    </Animated.View>
                    <Animated.View style={{ flex: 1, transform: [{ translateX: selectAnim.interpolate({ inputRange: [0,1], outputRange: [0, 10] }) }] }}>
                      <Text style={styles.threadName} numberOfLines={1}>
                        {item.name || 'New Chat'}
                      </Text>
                      {item.messages[0] && (
                        <Text style={styles.threadSnippet} numberOfLines={1}>
                          {item.messages[item.messages.length - 1]?.content || ''}
                        </Text>
                      )}
                    </Animated.View>
                  </View>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              contentContainerStyle={{ paddingVertical: 8 }}
            />
            <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
              {isSelecting ? (
                <TouchableOpacity
                  onPress={async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;
                    animateLayout();
                    await onDeleteSelected(ids);
                    setSelectedIds(new Set());
                    setIsSelecting(false);
                  }}
                  style={[styles.deleteBtn, Array.from(selectedIds).length === 0 && { opacity: 0.5 }]}
                  disabled={Array.from(selectedIds).length === 0}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={onSettingsPress} style={styles.settingsBtn}>
                  <Text style={styles.settingsText}>Settings</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  panel: {
    height: '100%',
    backgroundColor: '#fff',
    paddingTop: 12,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  close: {
    fontSize: 18,
    color: '#007AFF',
    padding: 8,
  },
  edit: {
    fontSize: 16,
    color: '#007AFF',
    padding: 8,
    marginRight: 4,
  },
  content: {
    flex: 1,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingVertical: 10,
  },
  deleteBtn: {
    paddingVertical: 10,
  },
  deleteText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  settingsBtn: {
    paddingVertical: 10,
  },
  settingsText: {
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
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkboxTick: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 14,
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
});

export default ChatSidebar;


