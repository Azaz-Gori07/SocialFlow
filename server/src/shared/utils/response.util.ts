import { Response } from 'express';

export interface StandardResponse<T = any> {
  success: boolean;
  message: string;
  data: T | null;
  errors: any | null;
  timestamp: string;
}

export class ApiResponse {
  static success<T>(
    res: Response,
    data: T,
    message = 'Request completed successfully',
    statusCode = 200
  ): Response {
    const responseBody: StandardResponse<T> = {
      success: true,
      message,
      data,
      errors: null,
      timestamp: new Date().toISOString()
    };
    return res.status(statusCode).json(responseBody);
  }

  static error(
    res: Response,
    message = 'An error occurred',
    errors: any = null,
    statusCode = 500
  ): Response {
    const responseBody: StandardResponse<null> = {
      success: false,
      message,
      data: null,
      errors,
      timestamp: new Date().toISOString()
    };
    return res.status(statusCode).json(responseBody);
  }
}
