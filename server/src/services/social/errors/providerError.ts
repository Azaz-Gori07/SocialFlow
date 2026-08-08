import { logger } from '../../../shared/utils/logger';

/** Whether an HTTP status from a provider is safe to retry. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Whether an HTTP status is a permanent (do-not-retry) failure. */
export function isPermanentStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 404;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly platform: string,
    public readonly status?: number,
    public readonly providerCode?: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  static fromResponse(platform: string, message: string, status: number, providerCode?: string): ProviderError {
    return new ProviderError(message, platform, status, providerCode, isRetryableStatus(status));
  }
}

/**
 * Reads a provider error body and classifies it.
 * Meta/X/LinkedIn errors include error codes — map the common permanent ones.
 */
export function classifyProviderError(
  platform: string,
  message: string,
  status: number,
  body?: any
): ProviderError {
  let providerCode: string | undefined;

  if (body?.error?.code !== undefined) providerCode = String(body.error.code);
  else if (body?.error_code !== undefined) providerCode = String(body.error_code);
  else if (body?.errors?.[0]?.code !== undefined) providerCode = String(body.errors[0].code);
  else if (body?.status !== undefined && status === 0) providerCode = String(body.status);

  // Known permanent provider codes we must never blindly retry.
  const permanentCodes = new Set([
    // Meta Graph API
    '100', // generic invalid parameter
    '190', // invalid/expired token
    '200', // permission error
    '10', // permission denied
    // X API
    '87', // client not permitted
    '88', // rate limit (429 though)
    '89', // invalid or revoked token
    '131', // internal
    // LinkedIn
    '401', // unauthorized
    '403', // forbidden
  ]);

  const retryable = isRetryableStatus(status) || (providerCode !== undefined && !permanentCodes.has(providerCode));

  logger.debug(`[provider] ${platform} error classified`, {
    status,
    providerCode,
    retryable,
    message: message.slice(0, 200),
  });

  return new ProviderError(message, platform, status, providerCode, retryable);
}
