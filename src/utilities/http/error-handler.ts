import type { ErrorRequestHandler } from 'express';
import { ApiError, ErrorClass, type ErrorAnalytics } from '../errors.js';
import type { Logger } from '../logging/logger.js';
import { statusForErrorClass } from './status.js';

type ErrorHandlerDeps = {
  analytics?: { loginFailed(props?: ErrorAnalytics): void };
  logger?: Logger;
};

/**
 * Final Express error middleware. Controllers throw ApiError (optionally with
 * analytics metadata) and call next(error). This handler emits login_failed
 * when metadata is present, then writes the rejection body.
 */
export function createErrorHandler({ analytics, logger }: ErrorHandlerDeps = {}): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') {
      res.status(400).json(new ApiError(ErrorClass.invalidRequest).shape);
      return;
    }

    if (error instanceof ApiError) {
      if (error.analytics) {
        analytics?.loginFailed(error.analytics);
      }
      if (error.retryAfterSeconds) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      res.status(error.httpStatus ?? statusForErrorClass(error.errorClass)).json(error.shape);
      return;
    }

    logger?.error?.({ message: 'request_failed' });
    res.status(500).json(new ApiError(ErrorClass.internal).shape);
  };
}
