import express from 'express';
import { createCatalogRouter } from './catalog/routes.js';
import { ApiError, ErrorClass } from './errors.js';

export function createApp({ prisma, config, logger } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16mb' }));
  if (prisma && config) {
    app.use(
      '/api/v1/companies/:companyId/catalog-items',
      createCatalogRouter({ prisma, config, logger }),
    );
  }
  app.use((req, res) => {
    const error = new ApiError(ErrorClass.notFound);
    res.status(404).json(error.shape);
  });
  return app;
}
