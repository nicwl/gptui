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

  async sendMessage(messages: Message[], model: string = 'gpt-5-chat-latest'): Promise<{ content: string; model: string }> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('📤 Sending message to OpenAI with', messages.length, 'messages using model:', model);
    
    try {
      const response = await this.openai.chat.completions.create({
        model,
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
      return { content, model: response.model || model };
    } catch (error) {
      console.error('❌ OpenAI API error:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      if (error instanceof Error) {
        throw new Error(`AI service error: ${error.message}`);
      }
      throw new Error('Unknown AI service error occurred');
    }
  }

  async sendMessageStream(
    messages: Message[], 
    model: string = 'gpt-5-chat-latest',
    onChunk: (chunk: { content: string; done: boolean; model?: string }) => void
  ): Promise<{ content: string; model: string }> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('📤 Sending streaming message to OpenAI with', messages.length, 'messages using model:', model);
    
    try {
      // Use XMLHttpRequest for React Native streaming compatibility
      return new Promise<{ content: string; model: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let fullContent = '';
        let responseModel = model;
        let lastProcessedLength = 0;

        xhr.open('POST', 'https://api.openai.com/v1/chat/completions');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', `Bearer ${(this.openai as any).apiKey}`);
        
        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
            // Process only new data since last check
            const newData = xhr.responseText.slice(lastProcessedLength);
            lastProcessedLength = xhr.responseText.length;
            
            if (!newData) return;
            
            // Process new lines
            const lines = newData.split('\n');
            
            for (const line of lines) {
              const trimmedLine = line.trim();
              
              if (trimmedLine === '') continue;
              if (trimmedLine === 'data: [DONE]') {
                onChunk({ content: fullContent, done: true, model: responseModel });
                resolve({ content: fullContent, model: responseModel });
                return;
              }
              
              if (trimmedLine.startsWith('data: ')) {
                try {
                  const jsonStr = trimmedLine.slice(6); // Remove 'data: ' prefix
                  const data = JSON.parse(jsonStr);
                  
                  if (data.model) {
                    responseModel = data.model;
                  }
                  
                  const delta = data.choices?.[0]?.delta;
                  if (delta?.content) {
                    fullContent += delta.content;
                    onChunk({ content: fullContent, done: false });
                  }
                  
                  if (data.choices?.[0]?.finish_reason) {
                    onChunk({ content: fullContent, done: true, model: responseModel });
                    if (xhr.readyState === XMLHttpRequest.DONE) {
                      resolve({ content: fullContent, model: responseModel });
                    }
                    return;
                  }
                } catch (parseError) {
                  console.warn('Failed to parse SSE data:', trimmedLine, parseError);
                }
              }
            }
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            console.log('✅ OpenAI streaming complete:', fullContent);
            resolve({ content: fullContent, model: responseModel });
          } else {
            reject(new Error(`HTTP error! status: ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error occurred'));
        };

        xhr.send(JSON.stringify({
          model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          temperature: 0.7,
          max_tokens: 1000,
          stream: true,
        }));
      });
    } catch (error) {
      console.error('❌ OpenAI streaming error:', error);
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
      console.log('🏷️ OpenAIService: Generating thread name using direct fetch for message:', firstMessage.substring(0, 50) + '...');
      
      // Use direct fetch to avoid polyfill issues
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(this.openai as any).apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
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
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ OpenAIService: Received thread name response:', data);
      
      const title = data.choices[0]?.message?.content?.trim();
      if (!title) {
        throw new Error('No title generated');
      }

      console.log('✅ OpenAIService: Generated thread name:', title);
      return title;
    } catch (error) {
      console.error('❌ OpenAIService: Failed to generate thread name:', error);
      // Fallback to a simple title based on the first few words
      const words = firstMessage.split(' ').slice(0, 4).join(' ');
      const fallbackTitle = words.length > 30 ? words.substring(0, 30) + '...' : words;
      console.log('🔄 OpenAIService: Using fallback title:', fallbackTitle);
      return fallbackTitle;
    }
  }

  async generateThreadNameFromPair(userFirst: string, aiFirst: string): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      console.log('🏷️ OpenAIService: Generating thread name from pair using direct fetch');
      console.log('🏷️ User message:', userFirst.substring(0, 50) + '...');
      console.log('🏷️ AI message:', aiFirst.substring(0, 50) + '...');
      
      // Use direct fetch to avoid polyfill issues
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(this.openai as any).apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Generate a short, descriptive conversation title (3-6 words) using BOTH the user\'s first message and the assistant\'s first reply. Only return the title text.',
            },
            {
              role: 'user',
              content: `User: ${userFirst}\nAssistant: ${aiFirst}`,
            },
          ],
          temperature: 0.5,
          max_tokens: 20,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ OpenAIService: Received thread name from pair response:', data);
      
      const title = data.choices[0]?.message?.content?.trim();
      if (!title) {
        throw new Error('No title generated');
      }

      console.log('✅ OpenAIService: Generated thread name from pair:', title);
      return title;
    } catch (error) {
      console.error('❌ OpenAIService: Failed to generate thread name from pair:', error);
      const combined = `${userFirst} · ${aiFirst}`.slice(0, 30);
      const fallbackTitle = combined.length >= 30 ? combined + '...' : combined;
      console.log('🔄 OpenAIService: Using fallback title from pair:', fallbackTitle);
      return fallbackTitle;
    }
  }

  async generateThreadNameFromHistory(messages: Message[]): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    // Use a small window of the conversation to keep prompt compact
    const recent = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    try {
      console.log('🏷️ OpenAIService: Generating thread name from history using direct fetch');
      
      // Use direct fetch to avoid polyfill issues
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(this.openai as any).apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Generate a concise, descriptive chat title (3-6 words) based on the conversation. Only return the title text, no quotes or punctuation around it.',
            },
            ...recent,
          ],
          temperature: 0.4,
          max_tokens: 20,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ OpenAIService: Received thread name from history response:', data);
      
      const title = data.choices[0]?.message?.content?.trim();
      if (!title) {
        throw new Error('No title generated');
      }
      
      console.log('✅ OpenAIService: Generated thread name from history:', title);
      return title;
    } catch (error) {
      console.error('❌ OpenAIService: Failed to generate thread name from history:', error);
      // Fallback: use first user message words
      const firstUser = messages.find(m => m.role === 'user')?.content || 'New Chat';
      const words = firstUser.split(' ').slice(0, 5).join(' ');
      const fallbackTitle = words.length > 30 ? words.substring(0, 30) + '...' : words;
      console.log('🔄 OpenAIService: Using fallback title from history:', fallbackTitle);
      return fallbackTitle;
    }
  }
}
