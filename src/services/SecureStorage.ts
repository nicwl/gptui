import * as Keychain from 'react-native-keychain';

const API_KEY_SERVICE = 'gptui_openai_key';

export class SecureStorage {
  static async storeApiKey(apiKey: string): Promise<void> {
    try {
      await Keychain.setInternetCredentials(
        API_KEY_SERVICE,
        'openai',
        apiKey
      );
    } catch (error) {
      console.error('Failed to store API key:', error);
      throw new Error('Failed to store API key securely');
    }
  }

  static async getApiKey(): Promise<string | null> {
    try {
      const credentials = await Keychain.getInternetCredentials(API_KEY_SERVICE);
      if (credentials && credentials.password) {
        return credentials.password;
      }
      return null;
    } catch (error) {
      console.error('Failed to retrieve API key:', error);
      return null;
    }
  }

  static async removeApiKey(): Promise<void> {
    try {
      await Keychain.resetGenericPassword({ service: API_KEY_SERVICE });
    } catch (error) {
      console.error('Failed to remove API key:', error);
      throw new Error('Failed to remove API key');
    }
  }

  static async hasApiKey(): Promise<boolean> {
    try {
      const credentials = await Keychain.getInternetCredentials(API_KEY_SERVICE);
      return !!(credentials && credentials.password);
    } catch (error) {
      console.error('Failed to check API key existence:', error);
      return false;
    }
  }
}
