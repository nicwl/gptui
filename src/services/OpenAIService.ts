import OpenAI from 'openai';
import { Message } from '../types';

export class OpenAIService {
  private openai: OpenAI | null = null;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.setApiKey(apiKey);
    }
  }

  setApiKey(apiKey: string): void {
    this.openai = new OpenAI({
      apiKey,
      // Explicitly set the correct base URL for React Native
      baseURL: 'https://api.openai.com/v1',
      dangerouslyAllowBrowser: true,
    });
  }

  hasApiKey(): boolean {
    return this.openai !== null;
  }

  async sendMessage(messages: Message[]): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('📤 Sending message to OpenAI with', messages.length, 'messages');
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: 0.7,
        max_tokens: 1000,
      });

      console.log('📥 Received OpenAI response:', response);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received');
      }

      console.log('✅ OpenAI response content:', content);
      return content;
    } catch (error) {
      console.error('❌ OpenAI API error:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      if (error instanceof Error) {
        throw new Error(`AI service error: ${error.message}`);
      }
      throw new Error('Unknown AI service error occurred');
    }
  }

  async generateThreadName(firstMessage: string): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Generate a short, descriptive title (3-6 words) for a conversation that starts with the following message. Only return the title, nothing else.',
          },
          {
            role: 'user',
            content: firstMessage,
          },
        ],
        temperature: 0.5,
        max_tokens: 20,
      });

      const title = response.choices[0]?.message?.content?.trim();
      if (!title) {
        throw new Error('No title generated');
      }

      return title;
    } catch (error) {
      console.error('Failed to generate thread name:', error);
      // Fallback to a simple title based on the first few words
      const words = firstMessage.split(' ').slice(0, 4).join(' ');
      return words.length > 30 ? words.substring(0, 30) + '...' : words;
    }
  }

  async generateThreadNameFromPair(userFirst: string, aiFirst: string): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              'Generate a short, descriptive conversation title (3-6 words) using BOTH the user\'s first message and the assistant\'s first reply. Only return the title text.',
          },
          {
            role: 'user',
            content: `User: ${userFirst}\nAssistant: ${aiFirst}`,
          },
        ],
        temperature: 0.5,
        max_tokens: 20,
      });

      const title = response.choices[0]?.message?.content?.trim();
      if (!title) {
        throw new Error('No title generated');
      }

      return title;
    } catch (error) {
      console.error('Failed to generate thread name from pair:', error);
      const combined = `${userFirst} · ${aiFirst}`.slice(0, 30);
      return combined.length >= 30 ? combined + '...' : combined;
    }
  }
}
