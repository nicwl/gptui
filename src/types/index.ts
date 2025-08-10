export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Thread {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  isEmpty: boolean;
}

export interface AppState {
  threads: Thread[];
  currentThreadId: string | null;
  apiKey: string | null;
  isLoading: boolean;
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
