import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ModelSelectionModalProps {
  visible: boolean;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  onClose: () => void;
}

const AVAILABLE_MODELS = [
  {
    id: 'gpt-5-chat-latest',
    name: 'GPT-5 Chat (Latest)',
    description: 'Most advanced model for conversations',
    isDefault: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Multimodal flagship model',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast and efficient',
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'High performance model',
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'Fast and cost-effective',
  },
];

const ModelSelectionModal: React.FC<ModelSelectionModalProps> = ({
  visible,
  selectedModel,
  onSelectModel,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  const handleSelectModel = (modelId: string) => {
    onSelectModel(modelId);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTouchable}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={[styles.modal, { paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Model</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
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
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
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

export default ModelSelectionModal;
