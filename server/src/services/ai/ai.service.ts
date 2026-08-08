import { env } from '../../shared/config/env.config';
import { OpenRouterProvider } from './openrouter.provider';
import { AIRequest, AIResponse, ProviderConfig } from './ai.types';

/**
 * Central AI service. Real provider calls only:
 * - primary OpenRouter key, then fallback OpenRouter key
 * - if no key is configured, calls throw instead of returning fabricated data
 */
export class AIService {
  private primaryConfig: ProviderConfig | null = null;
  private fallbackConfig: ProviderConfig | null = null;

  constructor() {
    if (env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY_MODEL) {
      this.primaryConfig = {
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_API_KEY_MODEL,
      };
    }
    if (env.OPENROUTER_API_KEY_2 && env.OPENROUTER_API_KEY_2_MODEL) {
      this.fallbackConfig = {
        apiKey: env.OPENROUTER_API_KEY_2,
        model: env.OPENROUTER_API_KEY_2_MODEL,
      };
    }
  }

  get isConfigured(): boolean {
    return this.primaryConfig !== null || this.fallbackConfig !== null;
  }

  /**
   * Execute request with retry and fail-over. The returned data is the raw
   * provider response body.
   */
  async execute(request: AIRequest): Promise<AIResponse> {
    if (this.primaryConfig) {
      try {
        return await this.callWithRetry(new OpenRouterProvider(this.primaryConfig), request, 2);
      } catch (e) {
        // fall through to fallback
      }
    }

    if (this.fallbackConfig) {
      try {
        return await this.callWithRetry(new OpenRouterProvider(this.fallbackConfig), request, 1);
      } catch (e) {
        // fall through to error
      }
    }

    throw new Error('No AI provider configured. Set OPENROUTER_API_KEY (and OPENROUTER_API_KEY_MODEL) to enable AI features.');
  }

  /** Extracts the text content from an OpenRouter chat-completions response. */
  static extractText(data: any): string {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    throw new Error('AI provider returned an unexpected response shape');
  }

  /** Parses a JSON payload from model output, tolerating markdown fences. */
  static parseJson(text: string): any {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('AI provider did not return valid JSON');
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  /** Helper to perform retries with exponential backoff (base 200ms) */
  private async callWithRetry(
    provider: OpenRouterProvider,
    request: AIRequest,
    retries: number,
  ): Promise<AIResponse> {
    let attempt = 0;
    const maxAttempts = retries + 1;
    while (attempt < maxAttempts) {
      try {
        return await provider.call(request, 30000);
      } catch (err: any) {
        attempt++;
        if (attempt >= maxAttempts) {
          throw err;
        }
        const delay = 200 * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    throw new Error('Retry exhausted');
  }
}
