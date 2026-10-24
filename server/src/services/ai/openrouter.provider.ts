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

    const body: Record<string, any> = {
      model: this.config.model,
      messages: [{ role: 'user', content: request.prompt }],
      ...request.options,
    };

    if (this.config.disableThinking) {
      body.thinking = { type: 'disabled' };
    }

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
      // Surface provider HTTP errors (401 bad key, 402 out of credits, 429
      // rate limit, ...) — otherwise they masquerade downstream as
      // "unexpected response shape" and the real cause is lost.
      if (!res.ok) {
        const message = (data as { error?: { message?: string } })?.error?.message
          || JSON.stringify(data).slice(0, 200);
        throw new Error(`AI provider HTTP ${res.status}: ${message}`);
      }
      return { data };
    } finally {
      clearTimeout(timeout);
    }
  }
}
