import React from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
  insets: EdgeInsets;
};

const InputBar: React.FC<Props> = ({ value, onChangeText, onSend, disabled, insets }) => {
  return (
    <View style={[styles.container, { paddingTop: 10, paddingBottom: insets.bottom, paddingHorizontal: Math.max(16, insets.left + 12, insets.right + 12) }]}>
      <TextInput
        style={[styles.textInput, { paddingHorizontal: 14 }]}
        value={value}
        onChangeText={onChangeText}
        placeholder="Type a message..."
        multiline
        maxLength={2000}
        editable={!disabled}
      />
      <TouchableOpacity
        style={[styles.sendButton, { paddingHorizontal: 18, paddingVertical: 10 }, (!value.trim() || disabled) && styles.sendButtonDisabled]}
        onPress={onSend}
        disabled={!value.trim() || !!disabled}
      >
        <Text style={styles.sendButtonText}>Send</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
});

export default InputBar;


