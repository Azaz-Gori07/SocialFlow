/**
 * Machine-readable error codes. Controllers and the frontend can rely on
 * `code` in addition to `statusCode` to branch behaviour.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_AUTH_EXPIRED: 'PROVIDER_AUTH_EXPIRED',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  OAUTH_FAILED: 'OAUTH_FAILED',
  OAUTH_STATE_MISMATCH: 'OAUTH_STATE_MISMATCH',
  OAUTH_TRANSACTION_EXPIRED: 'OAUTH_TRANSACTION_EXPIRED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors: any;
  public readonly code: ErrorCodeType;

  constructor(
    message: string,
    statusCode = 500,
    errors: any = null,
    code: ErrorCodeType = ErrorCode.INTERNAL
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors: any = null) {
    return new AppError(message, 400, errors, ErrorCode.VALIDATION_FAILED);
  }

  static unauthorized(message = 'Unauthorized access') {
    return new AppError(message, 401, null, ErrorCode.UNAUTHORIZED);
  }

  static forbidden(message = 'Access forbidden') {
    return new AppError(message, 403, null, ErrorCode.FORBIDDEN);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(message, 404, null, ErrorCode.NOT_FOUND);
  }

  static conflict(message: string) {
    return new AppError(message, 409, null, ErrorCode.CONFLICT);
  }

  static internal(message = 'Internal server error') {
    return new AppError(message, 500, null, ErrorCode.INTERNAL);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new AppError(message, 503, null, ErrorCode.INTERNAL);
  }

  /** Provider returned an error (4xx/5xx from the platform). */
  static providerError(message: string, errors: any = null) {
    return new AppError(message, 502, errors, ErrorCode.PROVIDER_ERROR);
  }

  /** Provider token expired/revoked; the user must reconnect. */
  static providerAuthExpired(message = 'Connected account needs re-authentication') {
    return new AppError(message, 401, null, ErrorCode.PROVIDER_AUTH_EXPIRED);
  }

  /** Provider credentials missing in env; never fall back to mock data. */
  static providerNotConfigured(platform: string) {
    return new AppError(
      `SocialFlow is not configured for ${platform}. Add its client credentials to the server environment.`,
      503,
      null,
      ErrorCode.PROVIDER_NOT_CONFIGURED
    );
  }

  static oauthFailed(message = 'OAuth flow failed') {
    return new AppError(message, 400, null, ErrorCode.OAUTH_FAILED);
  }

  static oauthStateMismatch() {
    return new AppError(
      'OAuth state mismatch. Please retry connecting the account.',
      400,
      null,
      ErrorCode.OAUTH_STATE_MISMATCH
    );
  }

  static oauthTransactionExpired() {
    return new AppError(
      'OAuth flow expired. Please retry connecting the account.',
      400,
      null,
      ErrorCode.OAUTH_TRANSACTION_EXPIRED
    );
  }
}
