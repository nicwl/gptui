import uuid from 'react-native-uuid';
import { Thread, Message, ThreadSummary } from '../types';
import { StorageService } from './StorageService';
import { OpenAIService } from './OpenAIService';

export class ThreadService {
  private openAIService: OpenAIService;
  private onStreamingUpdate?: (threadId: string, messageId: string, content: string, done: boolean, model?: string) => void;

  constructor(openAIService: OpenAIService, onStreamingUpdate?: (threadId: string, messageId: string, content: string, done: boolean, model?: string) => void) {
    console.log('🔧 ThreadService: Constructor called with OpenAIService:', openAIService);
    this.openAIService = openAIService;
    this.onStreamingUpdate = onStreamingUpdate;
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

  async continueConversationStreaming(thread: Thread, selectedModel: string = 'gpt-5-chat-latest', existingAiMessageId?: string): Promise<Thread> {
    console.log('🔄 ThreadService: Starting streaming conversation for thread:', thread.id);
    console.log('🔄 ThreadService: Thread currently has', thread.messages.length, 'messages');
    
    let updatedThread = thread;
    let aiMsg: Message;

    try {
      if (existingAiMessageId) {
        // Use existing AI message that should already be in the thread
        console.log('🔄 ThreadService: Using existing AI message ID:', existingAiMessageId);
        const existingMsg = thread.messages.find(m => m.id === existingAiMessageId);
        if (!existingMsg) {
          throw new Error('Existing AI message not found in thread');
        }
        aiMsg = existingMsg;
      } else {
        // Create initial AI message for streaming (fallback)
        aiMsg = {
          id: uuid.v4() as string,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          modelId: selectedModel,
          modelName: undefined,
          isStreaming: true,
        };

        // Add the empty streaming message to thread
        console.log('📝 ThreadService: Adding initial streaming message to thread');
        updatedThread = await this.addMessage(updatedThread, aiMsg);
      }

      // Start streaming
      console.log('🤖 ThreadService: Starting streaming...');
      // Check if this is the first exchange (1 user message + 1 empty AI message)
      const isFirstExchange = thread.messages.length === 2 && 
                             thread.messages[0].role === 'user' && 
                             thread.messages[1].role === 'assistant' && 
                             thread.messages[1].content === '';
      const userFirstMessage = isFirstExchange ? thread.messages[0].content : null;
      
      const response = await this.openAIService.sendMessageStream(
        thread.messages, 
        selectedModel,
        (chunk) => {
          // Update the streaming message via callback
          if (this.onStreamingUpdate) {
            this.onStreamingUpdate(updatedThread.id, aiMsg.id, chunk.content, chunk.done, chunk.model);
          }
        }
      );

      // Handle final processing after streaming is complete
      const finalMsg = {
        ...aiMsg,
        content: response.content,
        modelName: response.model,
        isStreaming: false,
      };
      
      // Update the message in the thread
      updatedThread = {
        ...updatedThread,
        messages: updatedThread.messages.map(msg => 
          msg.id === aiMsg.id ? finalMsg : msg
        ),
        updatedAt: Date.now(),
      };

      // Save final state
      await StorageService.saveThread(updatedThread);

      // Check milestone renaming
      if (this.openAIService.hasApiKey()) {
        const messageCount = updatedThread.messages.length;
        if ([2, 4, 8, 16, 32, 64, 128].includes(messageCount)) {
          try {
            console.log(`🏷️ ThreadService: Re-evaluating thread name at ${messageCount} messages`);
            const newName = await this.openAIService.generateThreadNameFromHistory(updatedThread.messages);
            updatedThread = { ...updatedThread, name: newName };
            await StorageService.saveThread(updatedThread);
            console.log('✅ ThreadService: Thread name updated to:', newName);
          } catch (e) {
            console.warn('Failed to re-evaluate thread name:', e);
          }
        }
      }

      console.log('✅ ThreadService: Streaming complete');
    } catch (error) {
      console.error('❌ ThreadService: Failed to stream conversation:', error);

      // Add error message
      const errorMsg: Message = {
        id: uuid.v4() as string,
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request. Please check your API key and try again.',
        timestamp: Date.now(),
        modelId: 'error',
        modelName: 'error',
      };

      console.log('📝 ThreadService: Adding error message to thread');
      updatedThread = await this.addMessage(updatedThread, errorMsg);
    }

    return updatedThread;
  }

  async loadAllThreads(): Promise<ThreadSummary[]> {
    return await StorageService.loadThreads();
  }

  async deleteThread(threadId: string): Promise<void> {
    await StorageService.deleteThread(threadId);
  }

  async clearAllThreads(): Promise<void> {
    await StorageService.clearAllData();
  }

  async loadThreadById(threadId: string): Promise<Thread | null> {
    return await StorageService.loadThreadById(threadId);
  }
}
