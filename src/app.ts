import express, { type Express, type Request, type Response } from 'express';
import type { AppConfig } from './config.js';
import { createAnalytics } from './features/analytics/analytics.service.js';
import { createLoginRouter } from './features/auth/routes.js';
import { createCatalogRouter } from './features/catalog/routes.js';
import { createHealthRouter } from './features/health/routes.js';
import { ApiError, ErrorClass } from './utilities/errors.js';
import { createErrorHandler } from './utilities/http/error-handler.js';
import type { Logger } from './utilities/logging/logger.js';
import { createRequestLogger } from './utilities/logging/requests.js';

type AttemptLimiter = {
  assertAllowed(ip: string, email: string): void;
  recordFailure(ip: string, email: string): void;
};

type CreateAppOptions = {
  prisma?: unknown;
  config?: AppConfig;
  logger?: Logger;
  attemptLimiter?: AttemptLimiter;
};

export function createApp({
  prisma,
  config,
  logger,
  attemptLimiter,
}: CreateAppOptions = {}): Express {
  const app = express();
  const analytics = createAnalytics(logger ?? { info() {} });
  app.disable('x-powered-by');
  app.use(createRequestLogger(logger));
  app.use(express.json({ limit: '16mb' }));
  const health = createHealthRouter({ databaseReady: Boolean(prisma) });
  app.use(health);
  app.use('/api/v1', health);
  if (prisma && config) {
    app.use('/api/v1/login', createLoginRouter({
      prisma,
      analytics,
      signingKey: config.jwtSigningKey,
      attemptLimiter,
    }));
    app.use(
      '/api/v1/companies/:companyId/catalog-items',
      createCatalogRouter({ prisma, config, logger }),
    );
  }
  app.use((_req: Request, res: Response) => {
    const error = new ApiError(ErrorClass.notFound);
    res.status(404).json(error.shape);
  });
  app.use(createErrorHandler({ analytics, logger }));
  return app;
}
