import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorType: string;
  public readonly details?: unknown;
  public readonly upstream: boolean;

  public constructor(params: {
    message: string;
    statusCode: number;
    errorType: string;
    details?: unknown;
    upstream?: boolean;
  }) {
    super(params.message);
    this.name = 'AppError';
    this.statusCode = params.statusCode;
    this.errorType = params.errorType;
    this.details = params.details;
    this.upstream = params.upstream ?? false;
  }
}

export class ValidationAppError extends AppError {
  public constructor(message: string, details?: unknown) {
    super({
      message,
      statusCode: 400,
      errorType: 'validation_error',
      details,
    });
  }
}

export class AuthAppError extends AppError {
  public constructor(message = 'Unauthorized') {
    super({
      message,
      statusCode: 401,
      errorType: 'auth_error',
    });
  }
}

export class ContentTypeAppError extends AppError {
  public constructor(message = 'Content-Type must be application/json') {
    super({
      message,
      statusCode: 400,
      errorType: 'content_type_error',
    });
  }
}

export class RateLimitAppError extends AppError {
  public constructor(message = 'Too many requests') {
    super({
      message,
      statusCode: 429,
      errorType: 'rate_limit_error',
    });
  }
}

export class UpstreamAppError extends AppError {
  public constructor(message: string, details?: unknown, statusCode = 502) {
    super({
      message,
      statusCode,
      errorType: 'google_calendar_error',
      details,
      upstream: true,
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
