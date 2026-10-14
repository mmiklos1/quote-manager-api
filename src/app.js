import express from 'express';
import { createAnalytics } from './analytics/events.js';
import { createLoginRouter } from './auth/routes.js';
import { createCatalogRouter } from './catalog/routes.js';
import { ApiError, ErrorClass } from './errors.js';

export function createApp({ prisma, config, logger, attemptLimiter } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16mb' }));
  if (prisma && config) {
    const analytics = createAnalytics(logger ?? { info() {} });
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
  app.use((req, res) => {
    const error = new ApiError(ErrorClass.notFound);
    res.status(404).json(error.shape);
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json(new ApiError(ErrorClass.invalidRequest).shape);
      return;
    }
    logger?.error?.({ message: 'request_failed' });
    res.status(500).json(new ApiError(ErrorClass.internal).shape);
  });
  return app;
}
