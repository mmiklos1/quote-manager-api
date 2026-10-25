import express, { type Router } from 'express';
import {
  accessTokenFromAuthorization,
  accessTokenFromCookie,
  accessTokenFromRequest,
  createCatalogController,
} from './catalog.controller.js';

export {
  accessTokenFromAuthorization,
  accessTokenFromCookie,
  accessTokenFromRequest,
};

export function createCatalogRouter(deps: Parameters<typeof createCatalogController>[0]): Router {
  const controller = createCatalogController(deps);
  const router = express.Router({ mergeParams: true });

  router.get('/search', (req, res, next) => controller.search(req, res, next));
  router.get('/', (req, res, next) => controller.list(req, res, next));
  router.post('/', (req, res, next) => controller.create(req, res, next));
  router.get('/:itemId', (req, res, next) => controller.get(req, res, next));
  router.patch('/:itemId', (req, res, next) => controller.update(req, res, next));
  router.post('/:itemId/soft-delete', (req, res, next) => controller.softDelete(req, res, next));
  router.post('/:itemId/restore', (req, res, next) => controller.restore(req, res, next));
  router.post('/:itemId/requirements', (req, res, next) => controller.addRequirement(req, res, next));
  router.patch('/:itemId/requirements/:requirementId', (req, res, next) => {
    controller.updateRequirement(req, res, next);
  });
  router.delete('/:itemId/requirements/:requirementId', (req, res, next) => {
    controller.removeRequirement(req, res, next);
  });

  return router;
}

export function createCompanyAbilitiesRouter(deps: Parameters<typeof createCatalogController>[0]): Router {
  const controller = createCatalogController(deps);
  const router = express.Router({ mergeParams: true });
  router.get('/', (req, res, next) => controller.abilities(req, res, next));
  return router;
}
