import express, { type Router } from 'express';
import { createAuthController } from './auth.controller.js';

export function createLoginRouter(deps: Parameters<typeof createAuthController>[0] = {}): Router {
  const controller = createAuthController(deps);
  const router = express.Router();
  router.post('/', (req, res, next) => controller.login(req, res, next));
  return router;
}
