import AsyncStorage from '@react-native-async-storage/async-storage';
import { Thread, Message, ThreadSummary } from '../types';

// Legacy combined storage (pre-migration)
const THREADS_KEY = 'gptui_threads';

// New per-thread storage
const INDEX_KEY = 'gptui_threads_index';
const THREAD_KEY_PREFIX = 'gptui_thread_';

type ThreadIndexEntry = ThreadSummary;

const MAX_LAST_MESSAGE_CHARS = 2000;

function truncateMessage(msg?: Message): Message | undefined {
  if (!msg) return undefined;
  if (typeof msg.content !== 'string') return msg;
  if (msg.content.length <= MAX_LAST_MESSAGE_CHARS) return msg;
  return { ...msg, content: msg.content.slice(0, MAX_LAST_MESSAGE_CHARS) };
}

export class StorageService {
  static threadKey(threadId: string): string {
    return `${THREAD_KEY_PREFIX}${threadId}`;
  }

  static async migrateLegacyIfNeeded(): Promise<void> {
    try {
      const indexExists = await AsyncStorage.getItem(INDEX_KEY);
      if (indexExists) return; // already migrated

      const legacy = await AsyncStorage.getItem(THREADS_KEY);
      if (!legacy) return; // nothing to migrate

      const legacyThreads = JSON.parse(legacy) as Thread[];
      const index: ThreadIndexEntry[] = [];

      for (const t of legacyThreads) {
        const messageCount = t.messages?.length ?? 0;
        const lastMessage = messageCount > 0 ? t.messages[messageCount - 1] : undefined;
        const entry: ThreadIndexEntry = {
          id: t.id,
          name: t.name,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          messageCount,
          lastMessage: truncateMessage(lastMessage),
        };
        index.push(entry);
        // Save full thread under per-thread key
        await AsyncStorage.setItem(this.threadKey(t.id), JSON.stringify(t));
      }

      // Save index and remove legacy blob
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index.sort((a, b) => b.updatedAt - a.updatedAt)));
      await AsyncStorage.removeItem(THREADS_KEY);
    } catch (error) {
      console.warn('Migration from legacy storage failed or was incomplete:', error);
    }
  }

  static async loadThreads(): Promise<ThreadSummary[]> {
    try {
      // Ensure migration
      await this.migrateLegacyIfNeeded();

      const indexStr = await AsyncStorage.getItem(INDEX_KEY);
      if (!indexStr) {
        // Nothing stored yet
        return [];
      }
      const index = JSON.parse(indexStr) as ThreadIndexEntry[];
      const summaries: ThreadSummary[] = index.map((e) => ({
        id: e.id,
        name: e.name,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        messageCount: e.messageCount,
        lastMessage: e.lastMessage,
      }));
      return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('Failed to load threads:', error);
      return [];
    }
  }

  static async loadThreadById(threadId: string): Promise<Thread | null> {
    try {
      // Ensure migration
      await this.migrateLegacyIfNeeded();

      const key = this.threadKey(threadId);
      const json = await AsyncStorage.getItem(key);
      if (json) {
        return JSON.parse(json) as Thread;
      }
      // Fallback: should not happen after migration, but try legacy store
      const legacy = await AsyncStorage.getItem(THREADS_KEY);
      if (!legacy) return null;
      const threads = JSON.parse(legacy) as Thread[];
      const found = threads.find((t) => t.id === threadId) || null;
      if (found) {
        // Save to new storage for future
        await AsyncStorage.setItem(key, JSON.stringify(found));
      }
      return found;
    } catch (error) {
      console.error('Failed to load thread by id:', error);
      return null;
    }
  }

  static async saveThread(thread: Thread): Promise<void> {
    try {
      // Save full thread under per-thread key
      await AsyncStorage.setItem(this.threadKey(thread.id), JSON.stringify(thread));

      // Update index entry
      const indexStr = await AsyncStorage.getItem(INDEX_KEY);
      const index: ThreadIndexEntry[] = indexStr ? JSON.parse(indexStr) : [];
      const existingIdx = index.findIndex((e) => e.id === thread.id);
      const messageCount = thread.messages?.length ?? 0;
      const lastMessage = messageCount > 0 ? thread.messages[messageCount - 1] : undefined;
      const entry: ThreadIndexEntry = {
        id: thread.id,
        name: thread.name,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        messageCount,
        lastMessage: truncateMessage(lastMessage),
      };
      if (existingIdx >= 0) index[existingIdx] = entry; else index.push(entry);
      index.sort((a, b) => b.updatedAt - a.updatedAt);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch (error) {
      console.error('Failed to save thread:', error);
      throw new Error('Failed to save conversation');
    }
  }

  static async deleteThread(threadId: string): Promise<void> {
    try {
      // Remove per-thread data
      await AsyncStorage.removeItem(this.threadKey(threadId));
      // Update index
      const indexStr = await AsyncStorage.getItem(INDEX_KEY);
      const index: ThreadIndexEntry[] = indexStr ? JSON.parse(indexStr) : [];
      const filtered = index.filter((e) => e.id !== threadId);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(filtered));

      // Remove from legacy blob if present
      const legacy = await AsyncStorage.getItem(THREADS_KEY);
      if (legacy) {
        try {
          const threads = JSON.parse(legacy) as Thread[];
          const next = threads.filter((t) => t.id !== threadId);
          await AsyncStorage.setItem(THREADS_KEY, JSON.stringify(next));
        } catch {}
      }
    } catch (error) {
      console.error('Failed to delete thread:', error);
      throw new Error('Failed to delete conversation');
    }
  }

  static async clearAllData(): Promise<void> {
    try {
      // Remove index and all per-thread items
      const indexStr = await AsyncStorage.getItem(INDEX_KEY);
      if (indexStr) {
        const index = JSON.parse(indexStr) as ThreadIndexEntry[];
        for (const entry of index) {
          await AsyncStorage.removeItem(this.threadKey(entry.id));
        }
      }
      await AsyncStorage.removeItem(INDEX_KEY);
      await AsyncStorage.removeItem(THREADS_KEY); // legacy
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw new Error('Failed to clear data');
    }
  }
}
