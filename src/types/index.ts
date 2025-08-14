export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelId?: string; // App-provided model identifier (e.g., 'gpt-4o')
  modelName?: string; // OpenAI-returned model name (e.g., 'gpt-4o-2024-08-06')
  isStreaming?: boolean; // Whether this message is currently being streamed
}

export interface Thread {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ThreadSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: Message; // content is truncated for storage/display
}

export interface AppState {
  threads: ThreadSummary[];
  currentThreadId: string | null;
  apiKey: string | null;
  isLoading: boolean;
  selectedModel: string;
  // Only keep the active thread's full message history in memory
  currentThreadMessages: Message[];
}

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type NavigationParams = {
  Chat: { threadId?: string };
  ThreadList: undefined;
  Settings: undefined;
};
