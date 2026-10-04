import assert from 'node:assert/strict';
import test from 'node:test';
import { canMutateCatalog } from '../src/catalog/access.js';
import { requirementWouldCycle } from '../src/catalog/cycle.js';
import { currencyForCountry } from '../src/catalog/currency.js';
import { decodeImage, LOCAL_IMAGE_KEY, MAX_IMAGE_BYTES, storeCatalogImage } from '../src/catalog/images.js';
import { createCatalogService } from '../src/catalog/items.js';
import { accessTokenFromCookie } from '../src/catalog/routes.js';
import { ApiError, ErrorClass } from '../src/errors.js';

test('currency uses the company country code', () => {
  assert.equal(currencyForCountry('us'), 'USD');
  assert.equal(currencyForCountry('GB'), 'GBP');
  assert.equal(currencyForCountry(''), null);
  assert.equal(currencyForCountry('United States'), null);
});

test('a requirement edge rejects a cycle', () => {
  const edges = [
    { requiringItemId: 'a', requiredItemId: 'b' },
    { requiringItemId: 'b', requiredItemId: 'c' },
  ];
  assert.equal(requirementWouldCycle(edges, 'c', 'a'), true);
  assert.equal(requirementWouldCycle(edges, 'a', 'a'), true);
  assert.equal(requirementWouldCycle(edges, 'a', 'c'), false);
});

test('catalog edits require product manager, admin, or super admin', () => {
  assert.equal(canMutateCatalog({ isSuperAdmin: true, grants: [] }), true);
  assert.equal(canMutateCatalog({
    isSuperAdmin: false,
    grants: [{ name: 'product_manager', isAdmin: false }],
  }), true);
  assert.equal(canMutateCatalog({
    isSuperAdmin: false,
    grants: [{ name: 'admin', isAdmin: true }],
  }), true);
  assert.equal(canMutateCatalog({
    isSuperAdmin: false,
    grants: [{ name: 'sales', isAdmin: false }],
  }), false);
});

test('local image storage does not keep bytes', async () => {
  let stored = 0;
  const image = await storeCatalogImage({
    assetStorage: 'local',
    imageBase64: Buffer.from('not-an-image').toString('base64'),
    storage: { async put() { stored += 1; } },
    crop: { async toSquare() { throw new Error('crop should not run'); } },
  });
  assert.equal(image.imageKey, LOCAL_IMAGE_KEY);
  assert.equal(image.derivativeKey, null);
  assert.equal(stored, 0);
});

test('an image over 10 MB is rejected before storage', () => {
  const bytes = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1);
  assert.throws(
    () => decodeImage(bytes.toString('base64')),
    (error) => error instanceof ApiError && error.errorClass === ErrorClass.catalogImageTooLarge,
  );
});

test('the access token is read from the cookie and not from another name', () => {
  assert.equal(accessTokenFromCookie('theme=light; access_token=abc%3D'), 'abc=');
  assert.equal(accessTokenFromCookie('session=nope'), '');
});

function memoryPrisma(seed) {
  const state = {
    companies: new Map(seed.companies.map((row) => [row.id, row])),
    users: new Map([[seed.user.id, seed.user]]),
    memberships: [...seed.memberships],
    grants: [...seed.grants],
    items: [],
    edges: [],
  };

  function matchItem(where) {
    return state.items.filter((item) => {
      if (where.id && item.id !== where.id) return false;
      if (where.companyId && item.companyId !== where.companyId) return false;
      if (where.deletedAt === null && item.deletedAt) return false;
      return true;
    });
  }

  const prisma = {
    company: {
      async findUnique({ where }) {
        return state.companies.get(where.id) ?? null;
      },
    },
    companyUser: {
      async findUnique({ where }) {
        const key = where.companyId_userId;
        return state.memberships.find((row) => row.companyId === key.companyId && row.userId === key.userId) ?? null;
      },
    },
    companyUserPermission: {
      async findMany({ where }) {
        return state.grants
          .filter((row) => row.companyUserId === where.companyUserId)
          .map((row) => ({ permission: row.permission }));
      },
    },
    catalogItem: {
      async findMany({ where }) {
        return matchItem(where);
      },
      async findFirst({ where }) {
        return matchItem(where)[0] ?? null;
      },
      async create({ data }) {
        const key = `${data.companyId}|${data.manufacturer}|${data.model}|${data.year}|${data.name}`;
        if (state.items.some((item) => `${item.companyId}|${item.manufacturer}|${item.model}|${item.year}|${item.name}` === key)) {
          const error = new Error('unique');
          error.code = 'P2002';
          throw error;
        }
        const item = { id: `item-${state.items.length + 1}`, deletedAt: null, derivativeKey: null, metadata: null, ...data };
        state.items.push(item);
        return item;
      },
      async update({ where, data }) {
        const item = state.items.find((row) => row.id === where.id);
        Object.assign(item, data);
        return item;
      },
    },
    catalogRequirement: {
      async findMany({ where }) {
        return state.edges.filter((edge) => {
          if (where.companyId && edge.companyId !== where.companyId) return false;
          if (where.deletedAt === null && edge.deletedAt) return false;
          if (where.deletedAt && typeof where.deletedAt === 'object' && edge.deletedAt === null) return false;
          if (where.id && edge.id !== where.id) return false;
          if (where.OR) {
            const hit = where.OR.some((clause) => (
              (clause.requiringItemId && edge.requiringItemId === clause.requiringItemId)
              || (clause.requiredItemId && edge.requiredItemId === clause.requiredItemId)
            ));
            if (!hit) return false;
          }
          return true;
        });
      },
      async findFirst(args) {
        const rows = await prisma.catalogRequirement.findMany(args);
        return rows[0] ?? null;
      },
      async findUnique({ where }) {
        const key = where.requiringItemId_requiredItemId;
        return state.edges.find((edge) => edge.requiringItemId === key.requiringItemId && edge.requiredItemId === key.requiredItemId) ?? null;
      },
      async create({ data }) {
        const edge = { id: `edge-${state.edges.length + 1}`, deletedAt: null, ...data };
        state.edges.push(edge);
        return edge;
      },
      async update({ where, data }) {
        const edge = state.edges.find((row) => row.id === where.id);
        Object.assign(edge, data);
        return edge;
      },
      async updateMany({ where, data }) {
        const rows = await prisma.catalogRequirement.findMany({ where });
        for (const row of rows) {
          Object.assign(row, data);
        }
      },
    },
    async $transaction(work) {
      return work(prisma);
    },
  };
  return { prisma, state };
}

function serviceFor(seed) {
  const { prisma, state } = memoryPrisma(seed);
  const analytics = [];
  const service = createCatalogService({
    prisma,
    assetStorage: 'local',
    storage: { async put() {} },
    crop: {},
    analytics: { catalog: (event) => analytics.push(event) },
  });
  return { service, state, analytics };
}

const company = { id: 'co-1', countryOfOrigin: 'US' };
const manager = { id: 'user-1', isSuperAdmin: false };
const outsider = { id: 'user-2', isSuperAdmin: false };

function managerSeed() {
  return {
    companies: [company],
    user: manager,
    memberships: [{ id: 'mem-1', companyId: 'co-1', userId: 'user-1', status: 'active' }],
    grants: [{
      companyUserId: 'mem-1',
      permission: { name: 'product_manager', isAdmin: false },
    }],
  };
}

test('a product manager can create an item and a duplicate is rejected', async () => {
  const { service, state, analytics } = serviceFor(managerSeed());
  const created = await service.create('co-1', manager, {
    name: 'Cable',
    description: 'One meter',
    manufacturer: 'Acme',
    model: 'C1',
    year: 2024,
    rentalRatePerDay: '15.5',
    metadata: { color: 'black' },
    type: 'Audio',
  });
  assert.equal(created.currency, 'USD');
  assert.equal(created.imageKey, LOCAL_IMAGE_KEY);
  assert.equal(created.metadata.color, 'black');
  assert.equal(state.items[0].type, undefined);
  assert.equal(analytics.includes('catalog_item_created'), true);

  await assert.rejects(
    () => service.create('co-1', manager, {
      name: 'Cable',
      description: 'Other',
      manufacturer: 'Acme',
      model: 'C1',
      year: 2024,
      rentalRatePerDay: '10',
    }),
    (error) => error instanceof ApiError && error.errorClass === ErrorClass.catalogDuplicate,
  );
});

test('a member without catalog permission cannot create', async () => {
  const { service } = serviceFor({
    companies: [company],
    user: outsider,
    memberships: [{ id: 'mem-2', companyId: 'co-1', userId: 'user-2', status: 'active' }],
    grants: [{ companyUserId: 'mem-2', permission: { name: 'sales', isAdmin: false } }],
  });
  await assert.rejects(
    () => service.create('co-1', outsider, {
      name: 'Cable',
      description: 'One meter',
      manufacturer: 'Acme',
      model: 'C1',
      year: 2024,
      rentalRatePerDay: '10',
    }),
    (error) => error instanceof ApiError && error.errorClass === ErrorClass.catalogForbidden,
  );
});

test('requires rejects a cycle and a missing country', async () => {
  const { service } = serviceFor(managerSeed());
  const first = await service.create('co-1', manager, {
    name: 'Console',
    description: 'Desk',
    manufacturer: 'Acme',
    model: 'A',
    year: 2020,
    rentalRatePerDay: '1',
  });
  const second = await service.create('co-1', manager, {
    name: 'Wing',
    description: 'Side',
    manufacturer: 'Acme',
    model: 'B',
    year: 2020,
    rentalRatePerDay: '1',
  });
  await service.addRequirement('co-1', manager, first.id, { direction: 'requires', targetItemId: second.id });
  await assert.rejects(
    () => service.addRequirement('co-1', manager, second.id, { direction: 'requires', targetItemId: first.id }),
    (error) => error instanceof ApiError && error.errorClass === ErrorClass.catalogCycle,
  );

  const bare = serviceFor({
    companies: [{ id: 'co-2', countryOfOrigin: null }],
    user: manager,
    memberships: [{ id: 'mem-9', companyId: 'co-2', userId: 'user-1', status: 'active' }],
    grants: [{ companyUserId: 'mem-9', permission: { name: 'product_manager', isAdmin: false } }],
  });
  await assert.rejects(
    () => bare.service.create('co-2', manager, {
      name: 'Cable',
      description: 'One meter',
      manufacturer: 'Acme',
      model: 'C1',
      year: 2024,
      rentalRatePerDay: '10',
    }),
    (error) => error instanceof ApiError && error.errorClass === ErrorClass.countryOfOriginMissing,
  );
});

test('restore brings back a relationship only when the other item is live', async () => {
  const { service, state } = serviceFor(managerSeed());
  const first = await service.create('co-1', manager, {
    name: 'Console',
    description: 'Desk',
    manufacturer: 'Acme',
    model: 'A',
    year: 2020,
    rentalRatePerDay: '1',
  });
  const second = await service.create('co-1', manager, {
    name: 'Wing',
    description: 'Side',
    manufacturer: 'Acme',
    model: 'B',
    year: 2020,
    rentalRatePerDay: '1',
  });
  const third = await service.create('co-1', manager, {
    name: 'Case',
    description: 'Box',
    manufacturer: 'Acme',
    model: 'C',
    year: 2020,
    rentalRatePerDay: '1',
  });
  await service.addRequirement('co-1', manager, first.id, { direction: 'requires', targetItemId: second.id });
  await service.addRequirement('co-1', manager, first.id, { direction: 'requires', targetItemId: third.id });
  await service.softDelete('co-1', manager, third.id);
  await service.softDelete('co-1', manager, first.id);
  await service.restore('co-1', manager, first.id);
  const detail = await service.get('co-1', manager, first.id);
  assert.deepEqual(detail.requires.map((edge) => edge.itemId), [second.id]);
  assert.equal(state.items.find((item) => item.id === third.id).deletedAt instanceof Date, true);
});
