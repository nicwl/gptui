import React, { createContext, useContext, useReducer, useEffect, ReactNode, useMemo } from 'react';
import { Thread, AppState, Message } from '../types';
import uuid from 'react-native-uuid';
import { SecureStorage } from '../services/SecureStorage';
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
    setCurrentThread: (threadId: string | null) => void;
    sendMessage: (message: string) => Promise<void>;
    deleteThread: (threadId: string) => Promise<void>;
    setLoading: (loading: boolean) => void;
  };
}

type AppAction =
  | { type: 'SET_API_KEY'; payload: string | null }
  | { type: 'SET_THREADS'; payload: Thread[] }
  | { type: 'SET_CURRENT_THREAD'; payload: string | null }
  | { type: 'UPDATE_THREAD'; payload: Thread }
  | { type: 'DELETE_THREAD'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean };

const initialState: AppState = {
  threads: [],
  currentThreadId: null,
  apiKey: null,
  isLoading: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  console.log('🔄 AppContext: Reducer action:', action.type, action.payload);
  
  switch (action.type) {
    case 'SET_API_KEY':
      return { ...state, apiKey: action.payload };
    case 'SET_THREADS':
      return { ...state, threads: action.payload };
    case 'SET_CURRENT_THREAD':
      console.log('🎯 AppContext: Setting current thread to:', action.payload);
      return { ...state, currentThreadId: action.payload };
    case 'UPDATE_THREAD':
      const updatedThreads = state.threads.map(thread =>
        thread.id === action.payload.id ? action.payload : thread
      );
      // Add thread if it doesn't exist
      if (!state.threads.find(t => t.id === action.payload.id)) {
        console.log('➕ AppContext: Adding new thread to state:', action.payload.id);
        updatedThreads.push(action.payload);
      }
      // Always keep most-recently-active threads first
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
    const threadService = new ThreadService(openAIService);
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

    setCurrentThread: (threadId: string | null) => {
      dispatch({ type: 'SET_CURRENT_THREAD', payload: threadId });
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

      let currentThread = state.threads.find(t => t.id === state.currentThreadId);
      
      // If no current thread, create a new one
      if (!state.currentThreadId || !currentThread) {
        console.log('🆕 AppContext: Creating new thread for first message');
        const newThread = threadService.createNewThread();
        dispatch({ type: 'UPDATE_THREAD', payload: newThread });
        dispatch({ type: 'SET_CURRENT_THREAD', payload: newThread.id });
        currentThread = newThread;
      }

      console.log('🎯 AppContext: Found current thread with', currentThread.messages.length, 'messages');

      // 1) Optimistically add user's message to UI immediately
      const userMsg: Message = {
        id: uuid.v4() as string,
        role: 'user',
        content: message,
        timestamp: Date.now(),
      };
      const optimisticThread: Thread = {
        ...currentThread,
        messages: [...currentThread.messages, userMsg],
        updatedAt: Date.now(),
        isEmpty: false,
      };
      console.log('⚡ AppContext: Optimistically updating thread with user message');
      dispatch({ type: 'UPDATE_THREAD', payload: optimisticThread });

      // 2) Persist user message and possibly update thread name
      let savedThread: Thread = optimisticThread;
      try {
        savedThread = await threadService.addMessage(currentThread, userMsg);
        console.log('💾 AppContext: Persisted user message; updating thread state');
        dispatch({ type: 'UPDATE_THREAD', payload: savedThread });
      } catch (error) {
        console.error('❌ AppContext: Failed to persist user message:', error);
        // Keep optimistic state even if persistence fails for now
      }

      // 3) Request AI response
      console.log('🔄 AppContext: Setting loading to true');
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const finalThread = await threadService.continueConversation(savedThread);
        console.log('✅ AppContext: Received AI response; updating thread');
        dispatch({ type: 'UPDATE_THREAD', payload: finalThread });
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
      } catch (error) {
        console.error('Failed to delete thread:', error);
        throw error;
      }
    },

    setLoading: (loading: boolean) => {
      dispatch({ type: 'SET_LOADING', payload: loading });
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
