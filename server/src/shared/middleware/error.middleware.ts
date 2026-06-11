import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/appError';
import { ApiResponse } from '../utils/response.util';

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
