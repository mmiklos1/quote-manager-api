import { ApiError, ErrorClass } from '../../utilities/errors.js';
import { validateAccessToken } from '../../utilities/sessions/sessions.js';
import { createCatalogService } from './catalog.service.js';
import { sharpCrop } from './images.js';
import { createS3Storage } from './storage.js';

export function accessTokenFromAuthorization(header) {
  if (typeof header !== 'string') {
    return '';
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : '';
}

export function accessTokenFromRequest(req) {
  const bearer = accessTokenFromAuthorization(req.headers?.authorization);
  if (bearer) {
    return bearer;
  }
  return accessTokenFromCookie(req.headers?.cookie);
}

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
  const token = accessTokenFromRequest(req);
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

export function createCatalogController({
  prisma,
  config,
  logger,
  authenticate,
  storage,
  crop,
}: {
  prisma: any;
  config: { assetStorage?: string; s3Bucket?: string; s3Region?: string; jwtSigningKey?: string };
  logger?: { info?(record: unknown): void };
  authenticate?: (req: any) => Promise<any>;
  storage?: { put(...args: any[]): Promise<unknown> };
  crop?: {
    toSquare(...args: [Buffer, number]): Promise<Buffer>;
    downscale(...args: [Buffer, number]): Promise<Buffer>;
  };
}) {
  const assetStorage = config.assetStorage === 's3' ? 's3' : 'local';
  const imageStorage = storage ?? (assetStorage === 's3'
    ? createS3Storage({ bucket: config.s3Bucket ?? '', region: config.s3Region ?? '' })
    : { async put() {} });
  const service = createCatalogService({
    prisma,
    assetStorage,
    storage: imageStorage,
    crop: crop ?? {
      async toSquare(...args: [Buffer, number]) {
        return (await sharpCrop()).toSquare(...args);
      },
      async downscale(...args: [Buffer, number]) {
        return (await sharpCrop()).downscale(...args);
      },
    },
    analytics: catalogAnalytics(logger),
  });
  const identify = authenticate ?? ((req) => defaultAuthenticate({ prisma, config }, req));

  async function run(req, res, next, handler) {
    try {
      const user = await identify(req);
      await handler(user);
    } catch (error) {
      next(error);
    }
  }

  return {
    search(req, res, next) {
      return run(req, res, next, async (user) => {
        const items = await service.search(req.params.companyId, user, {
          q: req.query.q,
          excludeItemId: req.query.excludeItemId,
        });
        res.json({ items });
      });
    },
    list(req, res, next) {
      return run(req, res, next, async (user) => {
        const items = await service.list(req.params.companyId, user, {
          name: req.query.name,
          manufacturer: req.query.manufacturer,
          model: req.query.model,
        });
        res.json({ items });
      });
    },
    create(req, res, next) {
      return run(req, res, next, async (user) => {
        const item = await service.create(req.params.companyId, user, req.body ?? {});
        res.status(201).json(item);
      });
    },
    get(req, res, next) {
      return run(req, res, next, async (user) => {
        const item = await service.get(req.params.companyId, user, req.params.itemId);
        res.json(item);
      });
    },
    update(req, res, next) {
      return run(req, res, next, async (user) => {
        const item = await service.update(req.params.companyId, user, req.params.itemId, req.body ?? {});
        res.json(item);
      });
    },
    softDelete(req, res, next) {
      return run(req, res, next, async (user) => {
        await service.softDelete(req.params.companyId, user, req.params.itemId);
        res.status(204).end();
      });
    },
    restore(req, res, next) {
      return run(req, res, next, async (user) => {
        await service.restore(req.params.companyId, user, req.params.itemId);
        res.status(204).end();
      });
    },
    addRequirement(req, res, next) {
      return run(req, res, next, async (user) => {
        const edge = await service.addRequirement(req.params.companyId, user, req.params.itemId, req.body ?? {});
        res.status(201).json(edge);
      });
    },
    updateRequirement(req, res, next) {
      return run(req, res, next, async (user) => {
        const edge = await service.updateRequirement(
          req.params.companyId,
          user,
          req.params.itemId,
          req.params.requirementId,
          req.body ?? {},
        );
        res.json(edge);
      });
    },
    removeRequirement(req, res, next) {
      return run(req, res, next, async (user) => {
        await service.removeRequirement(
          req.params.companyId,
          user,
          req.params.itemId,
          req.params.requirementId,
        );
        res.status(204).end();
      });
    },
  };
}
