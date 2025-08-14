import React, { createContext, useContext, useReducer, useEffect, ReactNode, useMemo } from 'react';
import { Thread, ThreadSummary, AppState, Message } from '../types';
import uuid from 'react-native-uuid';
import { SecureStorage } from '../services/SecureStorage';
import { StorageService } from '../services/StorageService';
import { OpenAIService } from '../services/OpenAIService';
import { ThreadService } from '../services/ThreadService';

interface AppContextType {
  state: AppState;
  openAIService: OpenAIService;
  threadService: ThreadService;
  actions: {
    setApiKey: (apiKey: string) => Promise<void>;
    loadThreads: () => Promise<void>;
    createNewThread: () => void;
    setCurrentThread: (threadId: string | null) => Promise<void>;
    sendMessage: (message: string) => Promise<void>;
    deleteThread: (threadId: string) => Promise<void>;
    updateStreamingMessage: (threadId: string, messageId: string, content: string, done: boolean, model?: string) => void;
    setLoading: (loading: boolean) => void;
    setModel: (model: string) => void;
  };
}

type AppAction =
  | { type: 'SET_API_KEY'; payload: string | null }
  | { type: 'SET_THREADS'; payload: ThreadSummary[] }
  | { type: 'SET_CURRENT_THREAD'; payload: string | null }
  | { type: 'UPSERT_THREAD_META'; payload: ThreadSummary }
  | { type: 'DELETE_THREAD'; payload: string }
  | { type: 'UPDATE_STREAMING_MESSAGE'; payload: { threadId: string; messageId: string; content: string; done: boolean; model?: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_MODEL'; payload: string }
  | { type: 'CREATE_THREAD_WITH_MESSAGE'; payload: { thread: Thread; message: Message } }
  | { type: 'SET_CURRENT_THREAD_MESSAGES'; payload: Message[] };

const initialState: AppState = {
  threads: [],
  currentThreadId: null,
  apiKey: null,
  isLoading: false,
  selectedModel: 'gpt-5-chat-latest',
  currentThreadMessages: [],
};

// Debug flag to disable AI responses (useful for UI testing Markdown rendering)
const DISABLE_AI_RESPONSES = false;

function appReducer(state: AppState, action: AppAction): AppState {
  console.log('🔄 AppContext: Reducer action:', action.type, action.payload);
  
  switch (action.type) {
    case 'SET_API_KEY':
      return { ...state, apiKey: action.payload };
    case 'SET_THREADS':
      return { ...state, threads: action.payload };
    case 'SET_CURRENT_THREAD':
      console.log('🎯 AppContext: Setting current thread to:', action.payload);
      return { ...state, currentThreadId: action.payload, currentThreadMessages: [] };
    case 'UPSERT_THREAD_META':
      const updatedThreads = state.threads.map(thread =>
        thread.id === action.payload.id ? action.payload : thread
      );
      if (!state.threads.find(t => t.id === action.payload.id)) {
        console.log('➕ AppContext: Adding new thread to state:', action.payload.id);
        updatedThreads.push(action.payload);
      }
      updatedThreads.sort((a, b) => b.updatedAt - a.updatedAt);
      console.log('📊 AppContext: State now has', updatedThreads.length, 'threads');
      return { ...state, threads: updatedThreads };
    case 'DELETE_THREAD':
      return {
        ...state,
        threads: state.threads.filter(t => t.id !== action.payload),
        currentThreadId: state.currentThreadId === action.payload ? null : state.currentThreadId,
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_MODEL':
      return { ...state, selectedModel: action.payload };
    case 'CREATE_THREAD_WITH_MESSAGE':
      const { thread, message } = action.payload;
      const threadWithMessage: Thread = {
        ...thread,
        messages: [message],
        updatedAt: Date.now(),
      };
      const threadSummary: ThreadSummary = {
        id: threadWithMessage.id,
        name: threadWithMessage.name,
        createdAt: threadWithMessage.createdAt,
        updatedAt: threadWithMessage.updatedAt,
        messageCount: 1,
        lastMessage: { ...message },
      };
      const allThreads = [...state.threads, threadSummary].sort((a, b) => b.updatedAt - a.updatedAt);
      console.log('🆕 AppContext: Created thread with message atomically:', threadWithMessage.id);
      return {
        ...state,
        threads: allThreads,
        currentThreadId: threadWithMessage.id,
        currentThreadMessages: [message],
      };
    case 'UPDATE_STREAMING_MESSAGE':
      const { threadId, messageId, content, done, model } = action.payload;
      // If update is for the active thread, update currentThreadMessages; otherwise leave them
      const isActiveThread = state.currentThreadId === threadId;
      const updatedCurrentMessages = isActiveThread
        ? state.currentThreadMessages.map(msg => {
            if (msg.id !== messageId) return msg;
            const updatedMsg = { ...msg, content, isStreaming: !done } as Message;
            if (done && model) {
              (updatedMsg as any).modelName = model;
            }
            return updatedMsg;
          })
        : state.currentThreadMessages;
      // Update thread meta list (keep last message only)
      const threadsForStreaming = state.threads.map(thread => {
        if (thread.id !== threadId) return thread;
        const updatedAt = done ? Date.now() : thread.updatedAt;
        if (isActiveThread) {
          const lastMsg = updatedCurrentMessages[updatedCurrentMessages.length - 1];
          return { ...thread, lastMessage: lastMsg, updatedAt } as ThreadSummary;
        }
        // Non-active thread: update lastMessage if same message id
        const updatedLast = thread.lastMessage && thread.lastMessage.id === messageId
          ? { ...thread.lastMessage, content, isStreaming: !done, modelName: done ? model : thread.lastMessage.modelName }
          : thread.lastMessage;
        return { ...thread, lastMessage: updatedLast, updatedAt } as ThreadSummary;
      });
      if (done) {
        threadsForStreaming.sort((a, b) => b.updatedAt - a.updatedAt);
      }
      return {
        ...state,
        currentThreadMessages: updatedCurrentMessages,
        threads: threadsForStreaming,
      };
    case 'SET_CURRENT_THREAD_MESSAGES':
      return { ...state, currentThreadMessages: action.payload };
    default:
      return state;
  }
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  // Create services only once using useMemo
  const { openAIService, threadService } = useMemo(() => {
    const openAIService = new OpenAIService();
    const streamingCallback = (threadId: string, messageId: string, content: string, done: boolean, model?: string) => {
      dispatch({ 
        type: 'UPDATE_STREAMING_MESSAGE', 
        payload: { threadId, messageId, content, done, model } 
      });
    };
    const threadService = new ThreadService(openAIService, streamingCallback);
    return { openAIService, threadService };
  }, []); // Empty dependency array means this only runs once

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    
    try {
      // Load API key
      const apiKey = await SecureStorage.getApiKey();
      if (apiKey) {
        console.log('🔑 AppContext: Loading API key from storage');
        dispatch({ type: 'SET_API_KEY', payload: apiKey });
        openAIService.setApiKey(apiKey);
        console.log('🔑 AppContext: API key set on OpenAIService');
      }

      // Load threads
      const threads = await threadService.loadAllThreads();
      dispatch({ type: 'SET_THREADS', payload: threads });
      
      // Don't set a current thread - let user start fresh
      console.log('🚀 AppContext: App initialized with no current thread');
    } catch (error) {
      console.error('Failed to initialize app:', error);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const actions = {
    setApiKey: async (apiKey: string) => {
      try {
        await SecureStorage.storeApiKey(apiKey);
        dispatch({ type: 'SET_API_KEY', payload: apiKey });
        openAIService.setApiKey(apiKey);
      } catch (error) {
        console.error('Failed to set API key:', error);
        throw error;
      }
    },

    loadThreads: async () => {
      try {
        const threads = await threadService.loadAllThreads();
        // Ensure only last message is kept in memory for each thread
        dispatch({ type: 'SET_THREADS', payload: threads });
      } catch (error) {
        console.error('Failed to load threads:', error);
        throw error;
      }
    },

    createNewThread: () => {
      // Just set current thread to null - a new thread will be created when user sends first message
      dispatch({ type: 'SET_CURRENT_THREAD', payload: null });
      console.log('🆕 AppContext: Set current thread to null (new chat)');
    },

    setCurrentThread: async (threadId: string | null) => {
      dispatch({ type: 'SET_CURRENT_THREAD', payload: threadId });
      if (threadId) {
        try {
          dispatch({ type: 'SET_LOADING', payload: true });
          const full = await threadService.loadThreadById(threadId);
          dispatch({ type: 'SET_CURRENT_THREAD_MESSAGES', payload: full?.messages || [] });
        } catch (e) {
          console.error('Failed to load thread messages:', e);
          dispatch({ type: 'SET_CURRENT_THREAD_MESSAGES', payload: [] });
        } finally {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } else {
        dispatch({ type: 'SET_CURRENT_THREAD_MESSAGES', payload: [] });
      }
    },

    sendMessage: async (message: string) => {
      console.log('💬 AppContext: sendMessage called with:', message);
      console.log('🔗 AppContext: Current thread ID:', state.currentThreadId);
      console.log('📋 AppContext: Available threads:', state.threads.map(t => ({ id: t.id, name: t.name })));
      console.log('🔑 AppContext: API key available:', !!state.apiKey);
      
      if (!state.apiKey) {
        console.error('❌ AppContext: No API key configured');
        throw new Error('API key not configured');
      }
      let currentThreadSummary = state.threads.find(t => t.id === state.currentThreadId);
      
      // Create user message
      const userMsg: Message = {
        id: uuid.v4() as string,
        role: 'user',
        content: message,
        timestamp: Date.now(),
      };

      // Prepare a full thread object and update UI/summary/persistence
      let baseMessages: Message[] = state.currentThreadMessages;
      let threadId: string = state.currentThreadId || '';
      let threadName: string = currentThreadSummary?.name || 'New Chat';
      let threadCreatedAt: number = currentThreadSummary?.createdAt || Date.now();
      if (!state.currentThreadId || !currentThreadSummary) {
        console.log('🆕 AppContext: Creating new thread with first message atomically');
        const newThread = threadService.createNewThread();
        dispatch({ type: 'CREATE_THREAD_WITH_MESSAGE', payload: { thread: newThread, message: userMsg } });
        baseMessages = [userMsg];
        threadId = newThread.id;
        threadName = newThread.name;
        threadCreatedAt = newThread.createdAt;
        const newFullThread = { ...newThread, messages: baseMessages, updatedAt: Date.now() } as Thread;
        try { await StorageService.saveThread(newFullThread); } catch {}
      } else {
        // Ensure full history is loaded if needed
        if (baseMessages.length === 0) {
          const loaded = await threadService.loadThreadById(currentThreadSummary.id);
          baseMessages = loaded?.messages ?? [];
        }
        const updatedAt = Date.now();
        const newCount = currentThreadSummary.messageCount + 1;
        const optimisticMeta: ThreadSummary = {
          id: currentThreadSummary.id,
          name: currentThreadSummary.name,
          createdAt: currentThreadSummary.createdAt,
          updatedAt,
          messageCount: newCount,
          lastMessage: userMsg,
        };
        dispatch({ type: 'UPSERT_THREAD_META', payload: optimisticMeta });
        const nextUserMessages = [...baseMessages, userMsg];
        dispatch({ type: 'SET_CURRENT_THREAD_MESSAGES', payload: nextUserMessages });
        threadId = currentThreadSummary.id;
        threadName = currentThreadSummary.name;
        threadCreatedAt = currentThreadSummary.createdAt;
        const fullThreadNow = { id: currentThreadSummary.id, name: currentThreadSummary.name, createdAt: currentThreadSummary.createdAt, updatedAt, messages: nextUserMessages } as Thread;
        try { await StorageService.saveThread(fullThreadNow); } catch {}
        baseMessages = nextUserMessages;
      }

      // If AI responses are disabled, stop here (only show user's Markdown message)
      if (DISABLE_AI_RESPONSES) {
        return;
      }

      // 3) Add initial streaming AI message to state
      const aiMsg: Message = {
        id: uuid.v4() as string,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        modelId: state.selectedModel,
        modelName: undefined,
        isStreaming: true,
      };
      
      console.log('🤖 AppContext: Adding initial streaming AI message to state');
      // Always use baseMessages, which we ensured includes the newly added user message
      const nextMessages = [...baseMessages, aiMsg];
      dispatch({ type: 'SET_CURRENT_THREAD_MESSAGES', payload: nextMessages });
      const lastForMeta = aiMsg;
      const metaForAI: ThreadSummary = {
        id: threadId,
        name: threadName,
        createdAt: threadCreatedAt,
        updatedAt: Date.now(),
        messageCount: (currentThreadSummary ? currentThreadSummary.messageCount + 1 : nextMessages.length),
        lastMessage: lastForMeta,
      };
      dispatch({ type: 'UPSERT_THREAD_META', payload: metaForAI });
      const currentForStreaming = { id: threadId, name: metaForAI.name, createdAt: metaForAI.createdAt, updatedAt: metaForAI.updatedAt, messages: nextMessages } as Thread;

      // 4) Request AI response with streaming
      console.log('🔄 AppContext: Setting loading to true');
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const finalThread = await threadService.continueConversationStreaming(currentForStreaming, state.selectedModel, aiMsg.id);
        console.log('✅ AppContext: Received AI response; updating thread');
        // Update messages for current thread and meta list
        dispatch({ type: 'SET_CURRENT_THREAD_MESSAGES', payload: finalThread.messages });
        // Persist the final thread state
        try { await StorageService.saveThread(finalThread); } catch {}
        const last = finalThread.messages[finalThread.messages.length - 1];
        const finalMeta: ThreadSummary = {
          id: finalThread.id,
          name: finalThread.name,
          createdAt: finalThread.createdAt,
          updatedAt: finalThread.updatedAt,
          messageCount: finalThread.messages.length,
          lastMessage: last,
        };
        dispatch({ type: 'UPSERT_THREAD_META', payload: finalMeta });
      } catch (error) {
        console.error('❌ AppContext: Failed to get AI response:', error);
        // Error already handled inside service with assistant error message; state may already be updated
      } finally {
        console.log('🔄 AppContext: Setting loading to false');
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },

    deleteThread: async (threadId: string) => {
      try {
        await threadService.deleteThread(threadId);
        dispatch({ type: 'DELETE_THREAD', payload: threadId });
        if (state.currentThreadId === threadId) {
          dispatch({ type: 'SET_CURRENT_THREAD_MESSAGES', payload: [] });
        }
      } catch (error) {
        console.error('Failed to delete thread:', error);
        throw error;
      }
    },

    updateStreamingMessage: (threadId: string, messageId: string, content: string, done: boolean, model?: string) => {
      dispatch({ 
        type: 'UPDATE_STREAMING_MESSAGE', 
        payload: { threadId, messageId, content, done, model } 
      });
    },

    setLoading: (loading: boolean) => {
      dispatch({ type: 'SET_LOADING', payload: loading });
    },

    setModel: (model: string) => {
      dispatch({ type: 'SET_MODEL', payload: model });
    },
  };

  return (
    <AppContext.Provider value={{ state, openAIService, threadService, actions }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
