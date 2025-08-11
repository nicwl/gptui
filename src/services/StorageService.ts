import AsyncStorage from '@react-native-async-storage/async-storage';
import { Thread } from '../types';

const THREADS_KEY = 'gptui_threads';

export class StorageService {
  static async saveThreads(threads: Thread[]): Promise<void> {
    try {
      // Filter out empty threads before saving
      const nonEmptyThreads = threads.filter(thread => thread.messages.length > 0);
      const jsonValue = JSON.stringify(nonEmptyThreads);
      await AsyncStorage.setItem(THREADS_KEY, jsonValue);
    } catch (error) {
      console.error('Failed to save threads:', error);
      throw new Error('Failed to save conversation history');
    }
  }

  static async loadThreads(): Promise<Thread[]> {
    try {
      const jsonValue = await AsyncStorage.getItem(THREADS_KEY);
      if (jsonValue === null) {
        return [];
      }
      const threads = JSON.parse(jsonValue) as Thread[];
      return threads.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('Failed to load threads:', error);
      return [];
    }
  }

  static async saveThread(thread: Thread): Promise<void> {
    try {
      const threads = await this.loadThreads();
      const existingIndex = threads.findIndex(t => t.id === thread.id);
      
      if (existingIndex >= 0) {
        threads[existingIndex] = thread;
      } else {
        threads.push(thread);
      }

      await this.saveThreads(threads);
    } catch (error) {
      console.error('Failed to save thread:', error);
      throw new Error('Failed to save conversation');
    }
  }

  static async deleteThread(threadId: string): Promise<void> {
    try {
      const threads = await this.loadThreads();
      const filteredThreads = threads.filter(t => t.id !== threadId);
      await this.saveThreads(filteredThreads);
    } catch (error) {
      console.error('Failed to delete thread:', error);
      throw new Error('Failed to delete conversation');
    }
  }

  static async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(THREADS_KEY);
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw new Error('Failed to clear data');
    }
  }
}
