import express, { type Router } from 'express';
import { createHealthController } from './health.controller.js';

export function createHealthRouter(deps: Parameters<typeof createHealthController>[0] = {}): Router {
  const controller = createHealthController(deps);
  const router = express.Router();
  router.get('/health', (req, res) => controller.health(req, res));
  router.get('/heartbeat', (req, res) => controller.heartbeat(req, res));
  return router;
}
