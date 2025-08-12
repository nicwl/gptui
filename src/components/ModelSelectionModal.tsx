import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Haptics from '../utils/Haptics';

interface ModelSelectionModalProps {
  visible: boolean;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  onClose: () => void;
}

const AVAILABLE_MODELS = [
  {
    id: 'gpt-5-chat-latest',
    name: 'GPT-5 Chat',
    description: 'Most advanced model for conversations',
    isDefault: true,
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'The latest model from OpenAI',
    isDefault: false,
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    description: 'Good at instruction-following',
    isDefault: false,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Multimodal flagship model',
  },
];

const ModelSelectionModal: React.FC<ModelSelectionModalProps> = ({
  visible,
  selectedModel,
  onSelectModel,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(300)).current; // Start 300px below
  const wasVisible = useRef(false);
  const [modalVisible, setModalVisible] = React.useState(false);

  useEffect(() => {
    if (visible) {
      Haptics.selection();
      // Show modal immediately when we want to open it
      setModalVisible(true);
      
      // Reset to starting position first, then animate in
      backdropOpacity.setValue(0);
      slideAnim.setValue(300);
      
      // Animate in: fade backdrop and slide modal up
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      
      wasVisible.current = true;
    } else if (!visible && wasVisible.current) {
      // Only animate out if we were previously visible (avoid animating on initial render)
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 300,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Hide modal only after animation completes
        setModalVisible(false);
        wasVisible.current = false;
      });
    }
  }, [visible, backdropOpacity, slideAnim]);

  const handleSelectModel = (modelId: string) => {
    Haptics.selection();
    onSelectModel(modelId);
    onClose();
  };

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <TouchableOpacity
            style={styles.backdropTouchable}
            onPress={() => {
              Haptics.selection();
              onClose();
            }}
            activeOpacity={1}
          />
        </Animated.View>
        <Animated.View 
          style={[
            styles.modal, 
            { 
              paddingBottom: insets.bottom,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Select Model</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.selection();
                onClose();
              }}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.content}>
            {AVAILABLE_MODELS.map((model) => (
              <TouchableOpacity
                key={model.id}
                style={[
                  styles.modelItem,
                  selectedModel === model.id && styles.modelItemSelected,
                ]}
                onPress={() => handleSelectModel(model.id)}
              >
                <View style={styles.modelInfo}>
                  <View style={styles.modelNameRow}>
                    <Text style={styles.modelName}>{model.name}</Text>
                    {model.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Default</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.modelDescription}>{model.description}</Text>
                </View>
                {selectedModel === model.id && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdropTouchable: {
    flex: 1,
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    minHeight: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
  },
  content: {
    paddingVertical: 8,
  },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    minHeight: 60,
  },
  modelItemSelected: {
    backgroundColor: '#F0F8FF',
  },
  modelInfo: {
    flex: 1,
  },
  modelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginRight: 8,
  },
  defaultBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  modelDescription: {
    fontSize: 13,
    color: '#666',
  },
  checkmark: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '600',
  },
});

export {ModelSelectionModal, AVAILABLE_MODELS};
