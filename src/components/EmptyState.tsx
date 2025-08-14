import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Props = {
  showSetupButton: boolean;
  onPressSetup: () => void;
};

const EmptyState: React.FC<Props> = ({ showSetupButton, onPressSetup }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to GPT Chat</Text>
      <Text style={styles.text}>Start a conversation by typing a message below.</Text>
      {showSetupButton && (
        <TouchableOpacity style={styles.button} onPress={onPressSetup}>
          <Text style={styles.buttonText}>Setup API Key</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  text: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default EmptyState;


