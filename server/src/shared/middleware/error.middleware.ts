import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/appError';
import { ApiResponse } from '../utils/response.util';
import { ProviderError } from '../../services/social/errors/providerError';
import { GitHubApiError, GitHubRateLimitError } from '../../features/developer/github/github.client';

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // If headers already sent, delegate to standard Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle operational AppErrors
  if (err instanceof AppError) {
    return ApiResponse.error(res, err.message, err.errors, err.statusCode);
  }

  // Handle provider failures (expired tokens, capability gaps) with their HTTP
  // status instead of falling through to a generic 500.
  if (err instanceof ProviderError) {
    return ApiResponse.error(res, err.message, err.providerCode ?? null, err.status || 502);
  }

  // GitHub provider failures carry a real status code. Without this mapping a
  // revoked token surfaced as an opaque 500 on every read path that had not
  // yet learned to catch it.
  if (err instanceof GitHubRateLimitError) {
    return ApiResponse.error(res, err.message, null, 429);
  }
  if (err instanceof GitHubApiError) {
    const status = err.status === 401 ? 401 : err.status === 404 ? 404 : 502;
    const message =
      err.status === 401
        ? 'GitHub access token is no longer valid. Reconnect GitHub from Developer settings.'
        : err.status === 404
          ? 'GitHub resource not found'
          : `GitHub API request failed (${err.status})`;
    return ApiResponse.error(res, message, null, status);
  }

  // Handle mongoose validation/cast errors
  if (err.name === 'ValidationError') {
    return ApiResponse.error(res, 'Validation Error', err.message, 400);
  }
  if (err.name === 'CastError') {
    return ApiResponse.error(res, 'Resource not found or invalid format', null, 400);
  }

  // Handle default unhandled exceptions (programming bugs or database outages)
  console.error('💥 Unhandled Exception:', err);
  
  // Clean message for client in production-like settings
  const message = process.env.NODE_ENV === 'production' 
    ? 'An unexpected error occurred on the server' 
    : err.message;
    
  return ApiResponse.error(
    res, 
    message, 
    process.env.NODE_ENV === 'production' ? null : err.stack, 
    500
  );
}
