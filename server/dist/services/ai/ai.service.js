"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const env_config_1 = require("../../shared/config/env.config");
const openrouter_provider_1 = require("./openrouter.provider");
/**
 * Central AI service that handles primary OpenRouter, fallback OpenRouter,
 * and legacy OpenAI/Claude providers (kept for backward compatibility).
 */
class AIService {
    // Primary and fallback provider configs
    primaryConfig = null;
    fallbackConfig = null;
    constructor() {
        if (env_config_1.env.OPENROUTER_API_KEY && env_config_1.env.OPENROUTER_API_KEY_MODEL) {
            this.primaryConfig = {
                apiKey: env_config_1.env.OPENROUTER_API_KEY,
                model: env_config_1.env.OPENROUTER_API_KEY_MODEL,
            };
        }
        if (env_config_1.env.OPENROUTER_API_KEY_2 && env_config_1.env.OPENROUTER_API_KEY_2_MODEL) {
            this.fallbackConfig = {
                apiKey: env_config_1.env.OPENROUTER_API_KEY_2,
                model: env_config_1.env.OPENROUTER_API_KEY_2_MODEL,
            };
        }
    }
    /** Execute request with retry, timeout and fail‑over logic */
    async execute(request) {
        // Try primary OpenRouter first
        if (this.primaryConfig) {
            try {
                return await this.callWithRetry(new openrouter_provider_1.OpenRouterProvider(this.primaryConfig), request, 2);
            }
            catch (e) {
                // fall through to fallback
            }
        }
        // Fallback OpenRouter
        if (this.fallbackConfig) {
            try {
                return await this.callWithRetry(new openrouter_provider_1.OpenRouterProvider(this.fallbackConfig), request, 1);
            }
            catch (e) {
                // fall through to legacy
            }
        }
        // Legacy OpenAI
        if (env_config_1.env.OPENAI_API_KEY) {
            // Placeholder: legacy provider would be implemented similarly.
            // For migration we keep compatibility but do not perform a real call.
            return { data: { legacy: 'openai', prompt: request.prompt } };
        }
        // Legacy Claude
        if (env_config_1.env.CLAUDE_API_KEY) {
            return { data: { legacy: 'claude', prompt: request.prompt } };
        }
        throw new Error('No AI provider configuration available');
    }
    /** Helper to perform retries with exponential backoff (base 200ms) */
    async callWithRetry(provider, request, retries) {
        let attempt = 0;
        const maxAttempts = retries + 1; // initial try + retries
        while (attempt < maxAttempts) {
            try {
                return await provider.call(request, 30000);
            }
            catch (err) {
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
exports.AIService = AIService;
