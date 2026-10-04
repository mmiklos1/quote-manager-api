import express from 'express';
import { ApiError, ErrorClass } from './errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res) => {
    const error = new ApiError(ErrorClass.notFound);
    res.status(404).json(error.shape);
  });
  return app;
}
