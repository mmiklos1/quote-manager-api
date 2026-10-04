import express from 'express';
import { ApiError, ErrorClass } from '../errors.js';
import { validateAccessToken } from '../sessions/sessions.js';
import { sharpCrop } from './images.js';
import { createCatalogService } from './items.js';
import { createS3Storage } from './storage.js';

const STATUS = {
  [ErrorClass.missingToken]: 401,
  [ErrorClass.forgedToken]: 401,
  [ErrorClass.expiredToken]: 401,
  [ErrorClass.revokedToken]: 401,
  [ErrorClass.inactiveMembership]: 401,
  [ErrorClass.catalogForbidden]: 403,
  [ErrorClass.catalogNotFound]: 404,
  [ErrorClass.unknownCompany]: 404,
  [ErrorClass.notFound]: 404,
  [ErrorClass.catalogDuplicate]: 409,
  [ErrorClass.catalogCycle]: 422,
  [ErrorClass.catalogValidation]: 422,
  [ErrorClass.catalogImageTooLarge]: 422,
  [ErrorClass.catalogImageRejected]: 422,
  [ErrorClass.countryOfOriginMissing]: 422,
};

export function accessTokenFromCookie(cookieHeader) {
  if (typeof cookieHeader !== 'string') {
    return '';
  }
  for (const part of cookieHeader.split(';')) {
    const text = part.trim();
    const splitAt = text.indexOf('=');
    if (splitAt === -1) {
      continue;
    }
    if (text.slice(0, splitAt) === 'access_token') {
      return decodeURIComponent(text.slice(splitAt + 1));
    }
  }
  return '';
}

function catalogAnalytics(logger) {
  return {
    catalog(event, props) {
      logger?.info?.({
        kind: 'analytics',
        event,
        companyId: props.companyId,
        direction: props.direction,
      });
    },
  };
}

async function defaultAuthenticate({ prisma, config }, req) {
  const token = accessTokenFromCookie(req.headers.cookie);
  const session = await validateAccessToken(prisma, {
    token,
    signingKey: config.jwtSigningKey,
  });
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    throw new ApiError(ErrorClass.forgedToken);
  }
  return user;
}

export function createCatalogRouter({
  prisma,
  config,
  logger,
  authenticate,
  storage,
  crop,
}) {
  const assetStorage = config.assetStorage === 's3' ? 's3' : 'local';
  const imageStorage = storage ?? (assetStorage === 's3'
    ? createS3Storage({ bucket: config.s3Bucket, region: config.s3Region })
    : { async put() {} });
  const service = createCatalogService({
    prisma,
    assetStorage,
    storage: imageStorage,
    crop: crop ?? {
      async toSquare(...args) {
        return (await sharpCrop()).toSquare(...args);
      },
      async downscale(...args) {
        return (await sharpCrop()).downscale(...args);
      },
    },
    analytics: catalogAnalytics(logger),
  });
  const identify = authenticate ?? ((req) => defaultAuthenticate({ prisma, config }, req));
  const router = express.Router({ mergeParams: true });

  async function run(req, res, next, handler) {
    try {
      const user = await identify(req);
      await handler(user);
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(STATUS[error.errorClass] ?? 400).json(error.shape);
        return;
      }
      next(error);
    }
  }

  router.get('/search', (req, res, next) => run(req, res, next, async (user) => {
    const items = await service.search(req.params.companyId, user, {
      q: req.query.q,
      excludeItemId: req.query.excludeItemId,
    });
    res.json({ items });
  }));

  router.get('/', (req, res, next) => run(req, res, next, async (user) => {
    const items = await service.list(req.params.companyId, user, {
      name: req.query.name,
      manufacturer: req.query.manufacturer,
      model: req.query.model,
    });
    res.json({ items });
  }));

  router.post('/', (req, res, next) => run(req, res, next, async (user) => {
    const item = await service.create(req.params.companyId, user, req.body ?? {});
    res.status(201).json(item);
  }));

  router.get('/:itemId', (req, res, next) => run(req, res, next, async (user) => {
    const item = await service.get(req.params.companyId, user, req.params.itemId);
    res.json(item);
  }));

  router.patch('/:itemId', (req, res, next) => run(req, res, next, async (user) => {
    const item = await service.update(req.params.companyId, user, req.params.itemId, req.body ?? {});
    res.json(item);
  }));

  router.post('/:itemId/soft-delete', (req, res, next) => run(req, res, next, async (user) => {
    await service.softDelete(req.params.companyId, user, req.params.itemId);
    res.status(204).end();
  }));

  router.post('/:itemId/restore', (req, res, next) => run(req, res, next, async (user) => {
    await service.restore(req.params.companyId, user, req.params.itemId);
    res.status(204).end();
  }));

  router.post('/:itemId/requirements', (req, res, next) => run(req, res, next, async (user) => {
    const edge = await service.addRequirement(req.params.companyId, user, req.params.itemId, req.body ?? {});
    res.status(201).json(edge);
  }));

  router.patch('/:itemId/requirements/:requirementId', (req, res, next) => run(req, res, next, async (user) => {
    const edge = await service.updateRequirement(
      req.params.companyId,
      user,
      req.params.itemId,
      req.params.requirementId,
      req.body ?? {},
    );
    res.json(edge);
  }));

  router.delete('/:itemId/requirements/:requirementId', (req, res, next) => run(req, res, next, async (user) => {
    await service.removeRequirement(
      req.params.companyId,
      user,
      req.params.itemId,
      req.params.requirementId,
    );
    res.status(204).end();
  }));

  return router;
}
