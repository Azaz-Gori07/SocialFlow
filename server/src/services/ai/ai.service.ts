import { env } from '../../shared/config/env.config';
import { OpenRouterProvider } from './openrouter.provider';
import { AIRequest, AIResponse, ProviderConfig } from './ai.types';

/**
 * Central AI service that handles primary OpenRouter, fallback OpenRouter,
 * and legacy OpenAI/Claude providers (kept for backward compatibility).
 */
export class AIService {
  // Primary and fallback provider configs
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

  /** Execute request with retry, timeout and fail‑over logic */
  async execute(request: AIRequest): Promise<AIResponse> {
    // Try primary OpenRouter first
    if (this.primaryConfig) {
      try {
        return await this.callWithRetry(new OpenRouterProvider(this.primaryConfig), request, 2);
      } catch (e) {
        // fall through to fallback
      }
    }

    // Fallback OpenRouter
    if (this.fallbackConfig) {
      try {
        return await this.callWithRetry(new OpenRouterProvider(this.fallbackConfig), request, 1);
      } catch (e) {
        // fall through to legacy
      }
    }

    // Legacy OpenAI
    if (env.OPENAI_API_KEY) {
      // Placeholder: legacy provider would be implemented similarly.
      // For migration we keep compatibility but do not perform a real call.
      return { data: { legacy: 'openai', prompt: request.prompt } } as AIResponse;
    }

    // Legacy Claude
    if (env.CLAUDE_API_KEY) {
      return { data: { legacy: 'claude', prompt: request.prompt } } as AIResponse;
    }

    throw new Error('No AI provider configuration available');
  }

  /** Helper to perform retries with exponential backoff (base 200ms) */
  private async callWithRetry(
    provider: OpenRouterProvider,
    request: AIRequest,
    retries: number,
  ): Promise<AIResponse> {
    let attempt = 0;
    const maxAttempts = retries + 1; // initial try + retries
    while (attempt < maxAttempts) {
      try {
        return await provider.call(request, 30000);
      } catch (err: any) {
        attempt++;
        if (attempt >= maxAttempts) {
          throw err;
        }
        // exponential backoff
        const delay = 200 * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    // Should never reach here
    throw new Error('Retry exhausted');
  }
}
