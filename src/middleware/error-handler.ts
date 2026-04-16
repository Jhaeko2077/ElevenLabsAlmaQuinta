import type { ErrorRequestHandler } from 'express';

import { AppMetrics } from '../config/metrics';
import { AppError, isAppError } from '../lib/errors';

export function createErrorHandler(
  metrics: AppMetrics,
  nodeEnv: 'development' | 'test' | 'production',
): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const appError = isAppError(error)
      ? error
      : error instanceof SyntaxError
        ? new AppError({
          message: 'Invalid JSON body',
          statusCode: 400,
          errorType: 'invalid_json',
        })
        : new AppError({
          message: 'Internal server error',
          statusCode: 500,
          errorType: 'internal_error',
        });

    const tool = req.toolName ?? 'unknown';
    res.locals.errorType = appError.errorType;

    if (appError.errorType === 'validation_error') {
      metrics.validationFailuresTotal.inc({ tool });
    }

    if (req.toolName) {
      metrics.recordToolFailure(tool, appError.errorType);
    }

    req.logger.error({
      event: appError.errorType === 'validation_error' ? 'validation_error' : 'request_error',
      request_id: req.requestId,
      route: req.routeLabel ?? req.originalUrl,
      method: req.method,
      tool_name: req.toolName,
      duration_ms: res.getHeader('x-response-time-ms') ? Number(res.getHeader('x-response-time-ms')) : undefined,
      status_code: appError.statusCode,
      auth_result: req.authResult,
      error_type: appError.errorType,
      details: appError.details,
      stack: nodeEnv === 'development' ? error.stack : undefined,
    });

    res.status(appError.statusCode).json({
      ok: false,
      tool,
      request_id: req.requestId,
      error: {
        type: appError.errorType,
        message: appError.message,
        details: appError.details,
        ...(nodeEnv === 'development' ? { stack: error.stack } : {}),
      },
    });
  };
}
