import { AIRequest, AIResponse, ProviderConfig } from './ai.types';
import { env } from '../../shared/config/env.config';

/**
 * OpenAI-compatible provider wrapper. The base endpoint comes from
 * OPENROUTER_BASE_URL, so the same class serves OpenRouter and any
 * OpenAI-compatible provider (z.ai GLM, self-hosted vLLM, ...).
 */
export class OpenRouterProvider {
  private config: ProviderConfig;
  private endpoint = env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions';

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async call(request: AIRequest, timeoutMs: number = 30000): Promise<AIResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const body = {
      model: this.config.model,
      messages: [{ role: 'user', content: request.prompt }],
      ...request.options,
      // GLM (z.ai) emits a reasoning section that eats the token budget before
      // any post text appears; disable it for the short-form post pipeline.
      // If you point OPENROUTER_BASE_URL at providers that reject `thinking`,
      // move this into request.options instead.
      thinking: { type: 'disabled' },
    };

    const init: RequestInit & Record<string, any> = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal as any,
    };

    try {
      const res = await fetch(this.endpoint, init);
      const data = await res.json();
      return { data };
    } finally {
      clearTimeout(timeout);
    }
  }
}
