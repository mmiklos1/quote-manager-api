import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from './logger.js';

export function requestPath(url: unknown): string {
  if (typeof url !== 'string' || url.length === 0) {
    return '/';
  }
  const query = url.indexOf('?');
  const path = query === -1 ? url : url.slice(0, query);
  return path.length === 0 ? '/' : path;
}

export function requestIp(req: Pick<Request, 'ip' | 'socket'>): string {
  return req?.ip || req?.socket?.remoteAddress || 'unknown';
}

/**
 * First app middleware. Logs method, path, and IP for every request,
 * including paths that later return 404. Query strings stay off the log.
 */
export function createRequestLogger(logger?: Logger): RequestHandler {
  return function requestLogger(req: Request, _res: Response, next: NextFunction) {
    logger?.debug?.({
      message: 'request',
      method: typeof req.method === 'string' ? req.method : '',
      path: requestPath(req.originalUrl ?? req.url),
      ip: requestIp(req),
    });
    next();
  };
}
