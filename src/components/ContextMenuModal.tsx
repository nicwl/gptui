import React from 'react';
import { Modal, TouchableOpacity, View, Text, StyleSheet } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCopy: () => void;
};

const ContextMenuModal: React.FC<Props> = ({ visible, onClose, onCopy }) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.item} onPress={onCopy}>
            <Text style={styles.itemText}>Copy Message</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  item: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  itemText: {
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
  },
});

export default ContextMenuModal;


