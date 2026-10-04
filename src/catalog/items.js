import { ApiError, ErrorClass } from '../errors.js';
import { canMutateCatalog } from './access.js';
import { currencyForCountry } from './currency.js';
import { requirementWouldCycle } from './cycle.js';
import { LOCAL_IMAGE_KEY, storeCatalogImage } from './images.js';

const EVENTS = {
  created: 'catalog_item_created',
  updated: 'catalog_item_updated',
  softDeleted: 'catalog_item_soft_deleted',
  restored: 'catalog_item_restored',
  relationshipAdded: 'relationship_added',
  relationshipEdited: 'relationship_edited',
  relationshipRemoved: 'relationship_removed',
  cycleRejected: 'relationship_cycle_rejected',
  duplicateRejected: 'catalog_duplicate_rejected',
  imageFailed: 'image_upload_failed',
};

function emit(analytics, event, props) {
  analytics?.catalog?.(event, props);
}

function isUniqueConflict(error) {
  return error?.code === 'P2002';
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(ErrorClass.catalogValidation);
  }
  return value.trim();
}

function requireYear(value) {
  if (!Number.isInteger(value)) {
    throw new ApiError(ErrorClass.catalogValidation);
  }
  return value;
}

function requireRate(value) {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new ApiError(ErrorClass.catalogValidation);
  }
  return text;
}

function requireMetadata(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(ErrorClass.catalogValidation);
  }
  return value;
}

function rateText(value) {
  if (value && typeof value.toFixed === 'function') {
    return value.toFixed(2);
  }
  return Number(value).toFixed(2);
}

function assertCurrency(company) {
  const currency = currencyForCountry(company?.countryOfOrigin);
  if (!currency) {
    throw new ApiError(ErrorClass.countryOfOriginMissing);
  }
  return currency;
}

async function loadCompany(prisma, companyId) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new ApiError(ErrorClass.unknownCompany);
  }
  return company;
}

async function activeGrants(prisma, companyId, userId) {
  const membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId, userId } },
  });
  if (!membership || membership.status !== 'active') {
    return null;
  }
  const rows = await prisma.companyUserPermission.findMany({
    where: { companyUserId: membership.id },
    include: { permission: true },
  });
  return rows.map((row) => ({
    name: row.permission.name,
    isAdmin: row.permission.isAdmin,
  }));
}

async function assertReader(prisma, companyId, user) {
  const company = await loadCompany(prisma, companyId);
  if (user.isSuperAdmin) {
    return company;
  }
  const grants = await activeGrants(prisma, companyId, user.id);
  if (!grants) {
    throw new ApiError(ErrorClass.catalogForbidden);
  }
  return company;
}

async function assertEditor(prisma, companyId, user) {
  const company = await loadCompany(prisma, companyId);
  if (user.isSuperAdmin) {
    return company;
  }
  const grants = await activeGrants(prisma, companyId, user.id);
  if (!grants || !canMutateCatalog({ isSuperAdmin: false, grants })) {
    throw new ApiError(ErrorClass.catalogForbidden);
  }
  return company;
}

function presentItem(item, currency, requirements = []) {
  const requires = [];
  const requiredBy = [];
  for (const edge of requirements) {
    if (edge.deletedAt) {
      continue;
    }
    if (edge.requiringItemId === item.id) {
      requires.push({ id: edge.id, itemId: edge.requiredItemId });
    }
    if (edge.requiredItemId === item.id) {
      requiredBy.push({ id: edge.id, itemId: edge.requiringItemId });
    }
  }
  return {
    id: item.id,
    companyId: item.companyId,
    name: item.name,
    description: item.description,
    manufacturer: item.manufacturer,
    model: item.model,
    year: item.year,
    rentalRatePerDay: rateText(item.rentalRatePerDay),
    currency,
    imageKey: item.imageKey,
    derivativeKey: item.derivativeKey,
    metadata: item.metadata ?? null,
    requires,
    requiredBy,
  };
}

function itemData(body, image) {
  return {
    name: requireText(body.name, 'name'),
    description: requireText(body.description, 'description'),
    manufacturer: requireText(body.manufacturer, 'manufacturer'),
    model: requireText(body.model, 'model'),
    year: requireYear(body.year),
    rentalRatePerDay: requireRate(body.rentalRatePerDay),
    metadata: requireMetadata(body.metadata),
    imageKey: image.imageKey,
    derivativeKey: image.derivativeKey,
  };
}

async function liveItem(prisma, companyId, itemId) {
  const item = await prisma.catalogItem.findFirst({
    where: { id: itemId, companyId, deletedAt: null },
  });
  if (!item) {
    throw new ApiError(ErrorClass.catalogNotFound);
  }
  return item;
}

async function liveEdges(prisma, companyId) {
  return prisma.catalogRequirement.findMany({
    where: { companyId, deletedAt: null },
  });
}

function edgeEnds(direction, itemId, targetItemId) {
  if (direction === 'requires') {
    return { requiringItemId: itemId, requiredItemId: targetItemId };
  }
  if (direction === 'required_by') {
    return { requiringItemId: targetItemId, requiredItemId: itemId };
  }
  throw new ApiError(ErrorClass.catalogValidation);
}

export function createCatalogService({ prisma, assetStorage, storage, crop, analytics }) {
  async function imageFor(body, previous) {
    const hasUpload = typeof body.imageBase64 === 'string' && body.imageBase64.length > 0;
    if (!hasUpload && previous) {
      return { imageKey: previous.imageKey, derivativeKey: previous.derivativeKey };
    }
    if (assetStorage !== 's3') {
      return { imageKey: LOCAL_IMAGE_KEY, derivativeKey: null };
    }
    try {
      return await storeCatalogImage({
        assetStorage,
        imageBase64: body.imageBase64,
        storage,
        crop,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        emit(analytics, EVENTS.imageFailed, { companyId: previous?.companyId });
      }
      throw error;
    }
  }

  return {
    async list(companyId, user, filters = {}) {
      const company = await assertReader(prisma, companyId, user);
      const currency = assertCurrency(company);
      const where = { companyId, deletedAt: null };
      if (typeof filters.name === 'string' && filters.name.length > 0) {
        where.name = { contains: filters.name, mode: 'insensitive' };
      }
      if (typeof filters.manufacturer === 'string' && filters.manufacturer.length > 0) {
        where.manufacturer = { contains: filters.manufacturer, mode: 'insensitive' };
      }
      if (typeof filters.model === 'string' && filters.model.length > 0) {
        where.model = { contains: filters.model, mode: 'insensitive' };
      }
      const items = await prisma.catalogItem.findMany({ where, orderBy: { name: 'asc' } });
      return items.map((item) => presentItem(item, currency));
    },

    async search(companyId, user, { q, excludeItemId }) {
      const company = await assertReader(prisma, companyId, user);
      assertCurrency(company);
      const query = requireText(q, 'q');
      const items = await prisma.catalogItem.findMany({
        where: {
          companyId,
          deletedAt: null,
          id: excludeItemId ? { not: excludeItemId } : undefined,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { manufacturer: { contains: query, mode: 'insensitive' } },
            { model: { contains: query, mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
      });
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        manufacturer: item.manufacturer,
        model: item.model,
        year: item.year,
      }));
    },

    async get(companyId, user, itemId) {
      const company = await assertReader(prisma, companyId, user);
      const currency = assertCurrency(company);
      const item = await liveItem(prisma, companyId, itemId);
      const requirements = await prisma.catalogRequirement.findMany({
        where: {
          companyId,
          deletedAt: null,
          OR: [{ requiringItemId: itemId }, { requiredItemId: itemId }],
        },
      });
      return presentItem(item, currency, requirements);
    },

    async create(companyId, user, body) {
      const company = await assertEditor(prisma, companyId, user);
      const currency = assertCurrency(company);
      const image = await imageFor(body);
      try {
        const item = await prisma.catalogItem.create({
          data: { companyId, ...itemData(body, image) },
        });
        emit(analytics, EVENTS.created, { companyId });
        return presentItem(item, currency);
      } catch (error) {
        if (isUniqueConflict(error)) {
          emit(analytics, EVENTS.duplicateRejected, { companyId });
          throw new ApiError(ErrorClass.catalogDuplicate);
        }
        throw error;
      }
    },

    async update(companyId, user, itemId, body) {
      const company = await assertEditor(prisma, companyId, user);
      const currency = assertCurrency(company);
      const existing = await liveItem(prisma, companyId, itemId);
      const image = await imageFor(body, existing);
      const next = itemData({ ...existing, ...body, rentalRatePerDay: body.rentalRatePerDay ?? rateText(existing.rentalRatePerDay) }, image);
      try {
        const item = await prisma.catalogItem.update({
          where: { id: itemId },
          data: next,
        });
        emit(analytics, EVENTS.updated, { companyId });
        return presentItem(item, currency);
      } catch (error) {
        if (isUniqueConflict(error)) {
          emit(analytics, EVENTS.duplicateRejected, { companyId });
          throw new ApiError(ErrorClass.catalogDuplicate);
        }
        throw error;
      }
    },

    async softDelete(companyId, user, itemId) {
      await assertEditor(prisma, companyId, user);
      await liveItem(prisma, companyId, itemId);
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.catalogItem.update({ where: { id: itemId }, data: { deletedAt: now } });
        await tx.catalogRequirement.updateMany({
          where: {
            companyId,
            deletedAt: null,
            OR: [{ requiringItemId: itemId }, { requiredItemId: itemId }],
          },
          data: { deletedAt: now },
        });
      });
      emit(analytics, EVENTS.softDeleted, { companyId });
    },

    async restore(companyId, user, itemId) {
      await assertEditor(prisma, companyId, user);
      const item = await prisma.catalogItem.findFirst({ where: { id: itemId, companyId } });
      if (!item || !item.deletedAt) {
        throw new ApiError(ErrorClass.catalogNotFound);
      }
      await prisma.$transaction(async (tx) => {
        await tx.catalogItem.update({ where: { id: itemId }, data: { deletedAt: null } });
        const edges = await tx.catalogRequirement.findMany({
          where: {
            companyId,
            deletedAt: { not: null },
            OR: [{ requiringItemId: itemId }, { requiredItemId: itemId }],
          },
        });
        for (const edge of edges) {
          const otherId = edge.requiringItemId === itemId ? edge.requiredItemId : edge.requiringItemId;
          const other = await tx.catalogItem.findFirst({ where: { id: otherId, companyId } });
          if (other && !other.deletedAt) {
            await tx.catalogRequirement.update({
              where: { id: edge.id },
              data: { deletedAt: null },
            });
          }
        }
      });
      emit(analytics, EVENTS.restored, { companyId });
    },

    async addRequirement(companyId, user, itemId, body) {
      await assertEditor(prisma, companyId, user);
      await liveItem(prisma, companyId, itemId);
      const target = await liveItem(prisma, companyId, body.targetItemId);
      const ends = edgeEnds(body.direction, itemId, target.id);
      const edges = await liveEdges(prisma, companyId);
      if (requirementWouldCycle(edges, ends.requiringItemId, ends.requiredItemId)) {
        emit(analytics, EVENTS.cycleRejected, { companyId, direction: body.direction });
        throw new ApiError(ErrorClass.catalogCycle);
      }
      const existing = await prisma.catalogRequirement.findUnique({
        where: {
          requiringItemId_requiredItemId: {
            requiringItemId: ends.requiringItemId,
            requiredItemId: ends.requiredItemId,
          },
        },
      });
      if (existing && !existing.deletedAt) {
        throw new ApiError(ErrorClass.catalogValidation);
      }
      const edge = existing
        ? await prisma.catalogRequirement.update({
          where: { id: existing.id },
          data: { deletedAt: null },
        })
        : await prisma.catalogRequirement.create({
          data: { companyId, ...ends },
        });
      emit(analytics, EVENTS.relationshipAdded, { companyId, direction: body.direction });
      return { id: edge.id, requiringItemId: edge.requiringItemId, requiredItemId: edge.requiredItemId };
    },

    async updateRequirement(companyId, user, itemId, requirementId, body) {
      await assertEditor(prisma, companyId, user);
      const edge = await prisma.catalogRequirement.findFirst({
        where: { id: requirementId, companyId, deletedAt: null },
      });
      if (!edge || (edge.requiringItemId !== itemId && edge.requiredItemId !== itemId)) {
        throw new ApiError(ErrorClass.catalogNotFound);
      }
      const target = await liveItem(prisma, companyId, body.targetItemId);
      const direction = edge.requiringItemId === itemId ? 'requires' : 'required_by';
      const ends = edgeEnds(direction, itemId, target.id);
      const edges = (await liveEdges(prisma, companyId)).filter((row) => row.id !== edge.id);
      if (requirementWouldCycle(edges, ends.requiringItemId, ends.requiredItemId)) {
        emit(analytics, EVENTS.cycleRejected, { companyId, direction });
        throw new ApiError(ErrorClass.catalogCycle);
      }
      let updated;
      try {
        updated = await prisma.catalogRequirement.update({
          where: { id: edge.id },
          data: ends,
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          throw new ApiError(ErrorClass.catalogValidation);
        }
        throw error;
      }
      emit(analytics, EVENTS.relationshipEdited, { companyId, direction });
      return { id: updated.id, requiringItemId: updated.requiringItemId, requiredItemId: updated.requiredItemId };
    },

    async removeRequirement(companyId, user, itemId, requirementId) {
      await assertEditor(prisma, companyId, user);
      const edge = await prisma.catalogRequirement.findFirst({
        where: { id: requirementId, companyId, deletedAt: null },
      });
      if (!edge || (edge.requiringItemId !== itemId && edge.requiredItemId !== itemId)) {
        throw new ApiError(ErrorClass.catalogNotFound);
      }
      await prisma.catalogRequirement.update({
        where: { id: edge.id },
        data: { deletedAt: new Date() },
      });
      const direction = edge.requiringItemId === itemId ? 'requires' : 'required_by';
      emit(analytics, EVENTS.relationshipRemoved, { companyId, direction });
    },
  };
}
