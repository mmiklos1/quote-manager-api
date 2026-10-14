import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createAttemptLimiter } from '../src/auth/attempts.js';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/logging/logger.js';
import { hashPassword } from '../src/passwords/hash.js';
import { validateAccessToken } from '../src/sessions/sessions.js';
import { hashToken } from '../src/sessions/token-hash.js';

const SIGNING_KEY = 'test-signing-key-at-least-32-characters';
const PASSWORD = 'abcdef1!';
const passwordHash = await hashPassword(PASSWORD);

function recordingLogger() {
  const events = [];
  const logger = createLogger((line) => {
    events.push(JSON.parse(line));
  });
  return { logger, events };
}

function createLoginPrisma({ user, memberships, storedHash = passwordHash }) {
  const sessions = [];
  const prisma = {
    user: {
      async findUnique({ where, include }) {
        if (!user) {
          return null;
        }
        if (where.email && where.email !== user.email) {
          return null;
        }
        if (where.id && where.id !== user.id) {
          return null;
        }
        return {
          id: user.id,
          email: user.email,
          userPassword: include?.userPassword && storedHash ? { passwordHash: storedHash } : null,
          companyUsers: include?.companyUsers ? memberships : [],
        };
      },
    },
    companyUser: {
      async findUnique({ where }) {
        return memberships.find((row) => row.id === where.id) ?? null;
      },
    },
    session: {
      async create({ data }) {
        const row = { id: `session-${sessions.length + 1}`, revokedAt: null, ...data };
        sessions.push(row);
        return row;
      },
      async findUnique({ where }) {
        return sessions.find((row) => row.tokenHash === where.tokenHash) ?? null;
      },
    },
  };
  return { prisma, sessions };
}

function membership(id, userId, companyId, status = 'active') {
  return { id, userId, companyId, status };
}

async function withServer(app, run) {
  const server = createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  try {
    return await run(port);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
}

async function postLogin(port, body, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    cookie: response.headers.get('set-cookie') ?? '',
    retryAfter: response.headers.get('retry-after'),
    cacheControl: response.headers.get('cache-control'),
  };
}

function appFor(prisma, { logger, attemptLimiter } = {}) {
  return createApp({
    prisma,
    config: { jwtSigningKey: SIGNING_KEY },
    logger,
    attemptLimiter,
  });
}

test('attempt limiter locks one email and releases it after the window', () => {
  let current = 1_000;
  const limiter = createAttemptLimiter({
    windowMs: 1_000,
    maxEmailFailures: 2,
    now: () => current,
  });
  limiter.recordFailure('1.1.1.1', 'a@b.c');
  limiter.recordFailure('1.1.1.1', 'a@b.c');
  assert.throws(
    () => limiter.assertAllowed('1.1.1.1', 'a@b.c'),
    (error) => error.errorClass === 'rate_limited' && error.retryAfterSeconds === 1,
  );
  limiter.assertAllowed('1.1.1.1', 'other@b.c');
  current += 1_000;
  limiter.assertAllowed('1.1.1.1', 'a@b.c');
});

test('unknown email, bad password, and inactive membership share one login error', async () => {
  const user = { id: 'user-1', email: 'user@example.com' };
  const active = createLoginPrisma({
    user,
    memberships: [membership('membership-1', user.id, 'company-1')],
  });
  const inactive = createLoginPrisma({
    user,
    memberships: [membership('membership-1', user.id, 'company-1', 'inactive')],
  });
  const missing = createLoginPrisma({
    user: null,
    memberships: [],
    storedHash: null,
  });
  const { logger, events } = recordingLogger();

  const bad = await withServer(appFor(active.prisma, { logger }), (port) => postLogin(port, {
    email: ' User@Example.com ',
    password: 'wrong-password1!',
  }));
  const unknown = await withServer(appFor(missing.prisma), (port) => postLogin(port, {
    email: 'missing@example.com',
    password: PASSWORD,
  }));
  const disabled = await withServer(appFor(inactive.prisma), (port) => postLogin(port, {
    email: user.email,
    password: PASSWORD,
  }));

  const expected = {
    error: {
      code: 'rejected',
      class: 'invalid_credentials',
      message: 'Invalid email or password',
    },
  };
  assert.equal(bad.status, 401);
  assert.deepEqual(bad.body, expected);
  assert.deepEqual(unknown.body, expected);
  assert.deepEqual(disabled.body, expected);
  assert.equal(bad.cookie, '');
  assert.equal(active.sessions.length, 0);
  assert.equal(events.some((event) => event.event === 'login_failed' && event.errorClass === 'bad_password'), true);
  assert.equal(JSON.stringify(events).includes(PASSWORD), false);
  assert.equal(JSON.stringify(events).includes('wrong-password1!'), false);
});

test('one active membership returns a revocable token and an httpOnly cookie', async () => {
  const user = { id: 'user-1', email: 'user@example.com' };
  const { prisma, sessions } = createLoginPrisma({
    user,
    memberships: [membership('membership-1', user.id, 'company-1')],
  });
  const { logger, events } = recordingLogger();
  const response = await withServer(appFor(prisma, { logger }), (port) => postLogin(port, {
    email: user.email,
    password: PASSWORD,
  }));

  assert.equal(response.status, 200);
  assert.equal(response.body.userId, user.id);
  assert.equal(response.body.companyUserId, 'membership-1');
  assert.equal(response.cacheControl, 'no-store');
  assert.match(response.cookie, /HttpOnly/);
  assert.match(response.cookie, /SameSite=Lax/);
  assert.match(response.cookie, /Path=\//);
  assert.doesNotMatch(response.cookie, /Secure/);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].tokenHash, hashToken(response.body.token));
  assert.notEqual(sessions[0].tokenHash, response.body.token);
  const resolved = await validateAccessToken(prisma, {
    token: response.body.token,
    signingKey: SIGNING_KEY,
  });
  assert.equal(resolved.userId, user.id);
  assert.equal(resolved.companyId, 'company-1');
  assert.equal(events.some((event) => event.event === 'login_succeeded'), true);
  assert.equal(JSON.stringify(events).includes(response.body.token), false);
  assert.equal(JSON.stringify(events).includes(PASSWORD), false);
});

test('https marks the access cookie Secure', async () => {
  const user = { id: 'user-1', email: 'user@example.com' };
  const { prisma } = createLoginPrisma({
    user,
    memberships: [membership('membership-1', user.id, 'company-1')],
  });
  const response = await withServer(appFor(prisma), (port) => postLogin(port, {
    email: user.email,
    password: PASSWORD,
  }, { 'x-forwarded-proto': 'https' }));
  assert.match(response.cookie, /Secure/);
});

test('two companies do not issue a token until the membership is named', async () => {
  const user = { id: 'user-1', email: 'user@example.com' };
  const { prisma, sessions } = createLoginPrisma({
    user,
    memberships: [
      membership('membership-1', user.id, 'company-1'),
      membership('membership-2', user.id, 'company-2'),
    ],
  });
  const app = appFor(prisma);
  const pending = await withServer(app, (port) => postLogin(port, {
    email: user.email,
    password: PASSWORD,
  }));
  assert.equal(pending.status, 200);
  assert.equal(pending.body.selectionRequired, true);
  assert.equal(pending.body.token, undefined);
  assert.equal(pending.cookie, '');
  assert.deepEqual(pending.body.activeMemberships, [
    { companyUserId: 'membership-1', companyId: 'company-1' },
    { companyUserId: 'membership-2', companyId: 'company-2' },
  ]);
  assert.equal(sessions.length, 0);

  const chosen = await withServer(app, (port) => postLogin(port, {
    email: user.email,
    password: PASSWORD,
    companyUserId: 'membership-2',
  }));
  assert.equal(chosen.status, 200);
  assert.equal(chosen.body.companyUserId, 'membership-2');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].companyUserId, 'membership-2');

  const rejected = await withServer(app, (port) => postLogin(port, {
    email: user.email,
    password: PASSWORD,
    companyUserId: 'membership-other',
  }));
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.class, 'unknown_membership');
  assert.equal(sessions.length, 1);
});

test('repeated failures are rejected before another password check', async () => {
  const user = { id: 'user-1', email: 'user@example.com' };
  let verifies = 0;
  const { prisma } = createLoginPrisma({
    user,
    memberships: [membership('membership-1', user.id, 'company-1')],
  });
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async (...args) => {
    verifies += 1;
    return original(...args);
  };
  const limiter = createAttemptLimiter({ maxEmailFailures: 2, windowMs: 60_000 });
  const response = await withServer(appFor(prisma, { attemptLimiter: limiter }), async (port) => {
    const first = await postLogin(port, { email: user.email, password: 'wrong-password1!' });
    const second = await postLogin(port, { email: user.email, password: 'wrong-password1!' });
    const third = await postLogin(port, { email: user.email, password: PASSWORD });
    return { first, second, third };
  });
  assert.equal(response.first.status, 401);
  assert.equal(response.second.status, 401);
  assert.equal(response.third.status, 429);
  assert.equal(response.third.body.error.class, 'rate_limited');
  assert.equal(response.third.body.error.message, 'Too many attempts. Try again later.');
  assert.ok(Number(response.third.retryAfter) >= 1);
  assert.equal(verifies, 2);
});

test('malformed login json is rejected and authenticate stays unmounted', async () => {
  const { prisma } = createLoginPrisma({
    user: { id: 'user-1', email: 'user@example.com' },
    memberships: [],
  });
  await withServer(appFor(prisma), async (port) => {
    const broken = await postLogin(port, '{');
    assert.equal(broken.status, 400);
    assert.equal(broken.body.error.class, 'invalid_request');
    const authenticate = await fetch(`http://127.0.0.1:${port}/api/v1/authenticate`, { method: 'POST' });
    assert.equal(authenticate.status, 404);
  });
});
