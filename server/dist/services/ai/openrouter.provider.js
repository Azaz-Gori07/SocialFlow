"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterProvider = void 0;
/**
 * Simple OpenRouter provider wrapper.
 * It expects the OpenRouter API to accept a JSON body with a `model` and `prompt`.
 * Adjust the payload shape if your actual OpenRouter integration differs.
 */
class OpenRouterProvider {
    config;
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    constructor(config) {
        this.config = config;
    }
    async call(request, timeoutMs = 30000) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const body = {
            model: this.config.model,
            messages: [{ role: 'user', content: request.prompt }],
            ...request.options,
        };
        const init = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        };
        try {
            const res = await fetch(this.endpoint, init);
            const data = await res.json();
            return { data };
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.OpenRouterProvider = OpenRouterProvider;
