import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useApp } from '../context/AppContext';
import { NavigationParams } from '../types';
import { SecureStorage } from '../services/SecureStorage';

type SettingsNavigationProp = StackNavigationProp<NavigationParams, 'Settings'>;

interface Props {
  navigation: SettingsNavigationProp;
}

const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { state, actions, threadService } = useApp();
  const [apiKey, setApiKey] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadCurrentApiKey();
  }, []);

  const loadCurrentApiKey = async () => {
    try {
      const currentKey = await SecureStorage.getApiKey();
      if (currentKey) {
        setApiKey(currentKey);
      }
    } catch (error) {
      console.error('Failed to load API key:', error);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Please enter a valid API key');
      return;
    }

    if (!apiKey.startsWith('sk-')) {
      Alert.alert('Error', 'OpenAI API key should start with "sk-"');
      return;
    }

    setIsSaving(true);
    try {
      await actions.setApiKey(apiKey.trim());
      setIsEditing(false);
      Alert.alert('Success', 'API key saved successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveApiKey = () => {
    Alert.alert(
      'Remove API Key',
      'Are you sure you want to remove your API key? You won\'t be able to chat until you add a new one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await SecureStorage.removeApiKey();
              setApiKey('');
              setIsEditing(false);
              // Update app state
              await actions.setApiKey('');
              Alert.alert('Success', 'API key removed');
            } catch (error) {
              Alert.alert('Error', 'Failed to remove API key');
            }
          },
        },
      ]
    );
  };

  const handleClearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all your conversation history. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await threadService.clearAllThreads();
              await actions.loadThreads();
              Alert.alert('Success', 'All conversation history cleared');
              navigation.navigate('Chat', {});
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data');
            }
          },
        },
      ]
    );
  };

  const maskedApiKey = apiKey ? `${apiKey.substring(0, 7)}${'*'.repeat(Math.max(0, apiKey.length - 7))}` : '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>OpenAI API Key</Text>
        <Text style={styles.sectionDescription}>
          Enter your OpenAI API key to start chatting. Your key is stored securely on your device.
        </Text>

        {state.apiKey && !isEditing ? (
          <View style={styles.apiKeyContainer}>
            <Text style={styles.apiKeyLabel}>Current API Key:</Text>
            <Text style={styles.apiKeyValue}>
              {showApiKey ? apiKey : maskedApiKey}
            </Text>
            <View style={styles.apiKeyActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setShowApiKey(!showApiKey)}
              >
                <Text style={styles.secondaryButtonText}>
                  {showApiKey ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setIsEditing(true)}
              >
                <Text style={styles.secondaryButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dangerButton}
                onPress={handleRemoveApiKey}
              >
                <Text style={styles.dangerButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="sk-..."
              secureTextEntry={!showApiKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.inputActions}>
              <View style={styles.showKeyContainer}>
                <Switch
                  value={showApiKey}
                  onValueChange={setShowApiKey}
                />
                <Text style={styles.showKeyLabel}>Show key</Text>
              </View>
              <TouchableOpacity
                style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
                onPress={handleSaveApiKey}
                disabled={isSaving}
              >
                <Text style={styles.primaryButtonText}>
                  {isSaving ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
              {isEditing && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setIsEditing(false);
                    loadCurrentApiKey();
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Conversations:</Text>
          <Text style={styles.infoValue}>
            {state.threads.filter(t => !t.isEmpty).length}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Total Messages:</Text>
          <Text style={styles.infoValue}>
            {state.threads.reduce((sum, thread) => sum + thread.messages.length, 0)}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Management</Text>
        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleClearAllData}
        >
          <Text style={styles.dangerButtonText}>Clear All Conversation History</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.aboutText}>
          This is a ChatGPT-like app that uses your OpenAI API key to provide AI-powered conversations.
          All data is stored locally on your device for privacy and security.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    marginBottom: 16,
  },
  apiKeyContainer: {
    backgroundColor: '#F2F2F7',
    padding: 16,
    borderRadius: 8,
  },
  apiKeyLabel: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 4,
  },
  apiKeyValue: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  apiKeyActions: {
    flexDirection: 'row',
    gap: 8,
  },
  inputContainer: {
    gap: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'monospace',
  },
  inputActions: {
    gap: 12,
  },
  showKeyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  showKeyLabel: {
    fontSize: 16,
    color: '#000000',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  primaryButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  dangerButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 16,
    color: '#000000',
  },
  infoValue: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '500',
  },
  aboutText: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
  },
});

export default SettingsScreen;
