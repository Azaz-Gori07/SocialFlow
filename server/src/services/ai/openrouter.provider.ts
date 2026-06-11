import { AIRequest, AIResponse, ProviderConfig } from './ai.types';

/**
 * Simple OpenRouter provider wrapper.
 * It expects the OpenRouter API to accept a JSON body with a `model` and `prompt`.
 * Adjust the payload shape if your actual OpenRouter integration differs.
 */
export class OpenRouterProvider {
  private config: ProviderConfig;
  private endpoint = 'https://openrouter.ai/api/v1/chat/completions';

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
