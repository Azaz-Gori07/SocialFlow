// Types used by the AI provider abstraction

export interface AIRequest {
  /** Prompt or messages to send to the model */
  prompt: string;
  /** Optional additional parameters */
  options?: Record<string, any>;
}

export interface AIResponse {
  /** Raw response body from the provider */
  data: any;
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
}
