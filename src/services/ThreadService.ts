import uuid from 'react-native-uuid';
import { Thread, Message } from '../types';
import { StorageService } from './StorageService';
import { OpenAIService } from './OpenAIService';

export class ThreadService {
  private openAIService: OpenAIService;

  constructor(openAIService: OpenAIService) {
    console.log('🔧 ThreadService: Constructor called with OpenAIService:', openAIService);
    this.openAIService = openAIService;
    console.log('🔧 ThreadService: OpenAIService instance stored:', this.openAIService);
  }

  createNewThread(): Thread {
    return {
      id: uuid.v4() as string,
      name: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  async addMessage(thread: Thread, message: Message): Promise<Thread> {
    const updatedThread: Thread = {
      ...thread,
      messages: [...thread.messages, message],
      updatedAt: Date.now(),
    };

    // Save to storage; StorageService will sort on load,
    // but we keep updatedAt accurate here for proper ordering
    await StorageService.saveThread(updatedThread);

    return updatedThread;
  }

  async continueConversation(thread: Thread, selectedModel: string = 'gpt-5-chat-latest'): Promise<Thread> {
    // Assumes the latest message in the thread is from the user
    let updatedThread = thread;
    try {
      // Get AI response based on current thread messages
      console.log('🤖 ThreadService: Continuing conversation...');
      const preAiUserOnly = updatedThread.messages.length === 1 && updatedThread.messages[0].role === 'user';
      const userFirstMessage = preAiUserOnly ? updatedThread.messages[0].content : null;
      const aiResponse = await this.openAIService.sendMessage(updatedThread.messages, selectedModel);
      console.log('✅ ThreadService: Received AI response:', aiResponse);

      const aiMsg: Message = {
        id: uuid.v4() as string,
        role: 'assistant',
        content: aiResponse.content,
        timestamp: Date.now(),
        model: aiResponse.model,
      };

      // Add AI message
      console.log('📝 ThreadService: Adding AI message to thread');
      updatedThread = await this.addMessage(updatedThread, aiMsg);
      console.log('✅ ThreadService: AI message added, final thread has', updatedThread.messages.length, 'messages');

      // If this is the very first exchange, name the thread using both sides
      if (preAiUserOnly && userFirstMessage && this.openAIService.hasApiKey()) {
        try {
          const generatedName = await this.openAIService.generateThreadNameFromPair(
            userFirstMessage,
            aiMsg.content
          );
          updatedThread = { ...updatedThread, name: generatedName };
          await StorageService.saveThread(updatedThread);
        } catch (e) {
          console.warn('Failed to generate thread name from pair:', e);
        }
      }

      // Milestones: re-evaluate name at 4, 8, 16, 32, 64, 128 messages
      const milestones = new Set([4, 8, 16, 32, 64, 128]);
      if (this.openAIService.hasApiKey() && milestones.has(updatedThread.messages.length)) {
        try {
          const newName = await this.openAIService.generateThreadNameFromHistory(updatedThread.messages);
          updatedThread = { ...updatedThread, name: newName };
          await StorageService.saveThread(updatedThread);
        } catch (e) {
          console.warn('Failed to regenerate thread name from history:', e);
        }
      }
    } catch (error) {
      console.error('❌ ThreadService: Failed to continue conversation:', error);

      // Add error message
      const errorMsg: Message = {
        id: uuid.v4() as string,
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request. Please check your API key and try again.',
        timestamp: Date.now(),
        model: 'error',
      };

      console.log('📝 ThreadService: Adding error message to thread');
      updatedThread = await this.addMessage(updatedThread, errorMsg);
    }

    console.log('🏁 ThreadService: Returning updated thread with', updatedThread.messages.length, 'messages');
    return updatedThread;
  }

  async sendUserMessage(thread: Thread, userMessage: string): Promise<Thread> {
    console.log('🚀 ThreadService: Sending user message:', userMessage);
    console.log('🔧 ThreadService: Using OpenAIService instance:', this.openAIService);
    
    const userMsg: Message = {
      id: uuid.v4() as string,
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };

    // Add user message
    console.log('📝 ThreadService: Adding user message to thread');
    let updatedThread = await this.addMessage(thread, userMsg);
    console.log('✅ ThreadService: User message added, thread now has', updatedThread.messages.length, 'messages');

    try {
      // Get AI response
      console.log('🤖 ThreadService: Requesting AI response...');
      console.log('🔧 ThreadService: About to call sendMessage on OpenAIService:', this.openAIService);
      const aiResponse = await this.openAIService.sendMessage(updatedThread.messages, 'gpt-5-chat-latest');
      console.log('✅ ThreadService: Received AI response:', aiResponse);
      
      const aiMsg: Message = {
        id: uuid.v4() as string,
        role: 'assistant',
        content: aiResponse.content,
        timestamp: Date.now(),
        model: aiResponse.model,
      };

      // Add AI message
      console.log('📝 ThreadService: Adding AI message to thread');
      updatedThread = await this.addMessage(updatedThread, aiMsg);
      console.log('✅ ThreadService: AI message added, final thread has', updatedThread.messages.length, 'messages');
    } catch (error) {
      console.error('❌ ThreadService: Failed to get AI response:', error);
      
      // Add error message
      const errorMsg: Message = {
        id: uuid.v4() as string,
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request. Please check your API key and try again.',
        timestamp: Date.now(),
      };

      console.log('📝 ThreadService: Adding error message to thread');
      updatedThread = await this.addMessage(updatedThread, errorMsg);
    }

    console.log('🏁 ThreadService: Returning updated thread with', updatedThread.messages.length, 'messages');
    return updatedThread;
  }

  async loadAllThreads(): Promise<Thread[]> {
    return await StorageService.loadThreads();
  }

  async deleteThread(threadId: string): Promise<void> {
    await StorageService.deleteThread(threadId);
  }

  async clearAllThreads(): Promise<void> {
    await StorageService.clearAllData();
  }
}
