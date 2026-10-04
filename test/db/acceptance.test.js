import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { describe, test } from 'node:test';
import { createAnalytics } from '../../src/analytics/events.js';
import { verifyPasswordLogin } from '../../src/auth/password.js';
import { completeProviderAuthentication } from '../../src/auth/provider.js';
import { ResetNotConfiguredError } from '../../src/errors.js';
import { deprovisionMembership, provisionMembership } from '../../src/identity/membership.js';
import { grantCompanyUserPermission } from '../../src/identity/permissions.js';
import { createLogger } from '../../src/logging/logger.js';
import { hashPassword } from '../../src/passwords/hash.js';
import { confirmPasswordReset, requestPasswordReset, RESET_ACCEPTED } from '../../src/reset/reset.js';
import { accessTokenWindow } from '../../src/sessions/lifetime.js';
import { issueSession, validateAccessToken } from '../../src/sessions/sessions.js';
import { hashToken } from '../../src/sessions/token-hash.js';

const SIGNING_KEY = 'test-signing-key-at-least-32-characters';

function email(label) {
  return `${label}.${randomUUID()}@example.com`;
}

function recorder() {
  const events = [];
  const analytics = createAnalytics(createLogger((line) => {
    events.push(JSON.parse(line));
  }));
  return { events, analytics };
}

async function openDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is unset. No local database name, user, or port was chosen.');
  }
  const { createPrismaClient } = await import('../../src/db/client.js');
  return createPrismaClient(process.env.DATABASE_URL).prisma;
}

let prisma;

async function db() {
  if (!prisma) {
    prisma = await openDatabase();
  }
  return prisma;
}

async function company(seatLimit, name = 'Company') {
  const client = await db();
  return client.company.create({ data: { name, seatLimit } });
}

async function seedCurrentPassword(userId, plain) {
  const client = await db();
  const passwordHash = await hashPassword(plain);
  await client.userPassword.create({ data: { userId, passwordHash } });
  await client.passwordHistory.create({ data: { userId, passwordHash } });
  return passwordHash;
}

describe('F-003 acceptance', { concurrency: 1 }, () => {
  test('createPrismaClient refuses an empty database url', async () => {
    const { createPrismaClient } = await import('../../src/db/client.js');
    assert.throws(() => createPrismaClient(''), /DATABASE_URL is unset/);
  });

  test('first provision creates one user and one active membership', async () => {
    const client = await db();
    const address = email('ada');
    const first = await company(30, 'A');
    const created = await provisionMembership(client, { companyId: first.id, email: `  ${address.toUpperCase()} ` });
    const users = await client.user.findMany({ where: { email: address } });
    assert.equal(users.length, 1);
    assert.equal(created.companyUser.status, 'active');
    assert.equal(created.companyUser.deactivatedAt, null);
  });

  test('a second company reuses the user and adds a membership', async () => {
    const client = await db();
    const address = email('ada');
    const first = await company(5, 'A');
    const second = await company(5, 'B');
    await provisionMembership(client, { companyId: first.id, email: address });
    await provisionMembership(client, { companyId: second.id, email: address });
    const users = await client.user.findMany({ where: { email: address } });
    const memberships = await client.companyUser.findMany({ where: { userId: users[0].id } });
    assert.equal(users.length, 1);
    assert.equal(memberships.length, 2);
  });

  test('plus-tags are a different user', async () => {
    const client = await db();
    const id = randomUUID();
    const first = await company(5, 'A');
    const plain = await provisionMembership(client, { companyId: first.id, email: `ada.${id}@example.com` });
    const tagged = await provisionMembership(client, { companyId: first.id, email: `ada.${id}+desk@example.com` });
    assert.notEqual(plain.user.id, tagged.user.id);
  });

  test('seat limit 30 rejects the 31st active membership', async () => {
    const client = await db();
    const office = await company(30, 'A');
    for (let index = 0; index < 30; index += 1) {
      await provisionMembership(client, { companyId: office.id, email: email(`seat${index}`) });
    }
    const extra = email('seat31');
    await assert.rejects(
      () => provisionMembership(client, { companyId: office.id, email: extra }),
      (error) => error.errorClass === 'seat_limit_reached',
    );
    const active = await client.companyUser.count({ where: { companyId: office.id, status: 'active' } });
    assert.equal(active, 30);
    assert.equal(await client.user.findUnique({ where: { email: extra } }), null);
  });

  test('a race on the last seat allows only one winner', async () => {
    const client = await db();
    const office = await company(1, 'A');
    const results = await Promise.allSettled([
      provisionMembership(client, { companyId: office.id, email: email('one') }),
      provisionMembership(client, { companyId: office.id, email: email('two') }),
    ]);
    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result) => result.status === 'rejected');
    assert.equal(won.length, 1);
    assert.equal(lost.length, 1);
    assert.equal(lost[0].reason.errorClass, 'seat_limit_reached');
    const active = await client.companyUser.count({ where: { companyId: office.id, status: 'active' } });
    assert.equal(active, 1);
  });

  test('an email with no active membership is rejected and no user is created', async () => {
    const client = await db();
    const { analytics } = recorder();
    const address = email('stranger');
    await assert.rejects(
      () => verifyPasswordLogin(client, analytics, { email: address, password: 'abcdef1!' }),
      (error) => error.errorClass === 'unknown_email',
    );
    for (const provider of ['google', 'microsoft']) {
      await assert.rejects(
        () => completeProviderAuthentication(client, analytics, {
          provider,
          providerSubject: `sub-${provider}-${address}`,
          email: address,
          emailVerified: true,
        }),
        (error) => error.errorClass === 'unknown_email',
      );
    }
    assert.equal(await client.user.findUnique({ where: { email: address } }), null);
    assert.equal(await client.linkedLogin.count({ where: { providerSubject: { contains: address } } }), 0);
  });

  test('issueSession returns a one-week token for the supplied membership; login does not choose a company', async () => {
    const client = await db();
    const { analytics, events } = recorder();
    const office = await company(5, 'A');
    const address = email('member');
    const membership = await provisionMembership(client, { companyId: office.id, email: address });
    await seedCurrentPassword(membership.user.id, 'abcdef1!');

    const verified = await verifyPasswordLogin(client, analytics, { email: address, password: 'abcdef1!' });
    assert.equal(verified.userId, membership.user.id);
    assert.equal(verified.activeMemberships.length, 1);
    assert.equal(await client.session.count({ where: { userId: membership.user.id } }), 0);
    assert.equal(events.some((event) => event.event === 'login_succeeded'), false);

    const now = new Date();
    const issued = await issueSession(client, analytics, {
      userId: verified.userId,
      companyUserId: membership.companyUser.id,
      method: 'password',
      signingKey: SIGNING_KEY,
      now,
    });
    assert.equal(issued.expiresAt.getTime(), accessTokenWindow(now).expiresAt.getTime());
    const session = await client.session.findFirst({ where: { userId: membership.user.id } });
    assert.equal(session.tokenHash, hashToken(issued.token));
    assert.notEqual(session.tokenHash, issued.token);
    const resolved = await validateAccessToken(client, { token: issued.token, signingKey: SIGNING_KEY, now });
    assert.equal(resolved.userId, membership.user.id);
    assert.equal(events.some((event) => event.event === 'login_succeeded'), true);
  });

  test('password login at two companies returns both memberships and writes no session', async () => {
    const client = await db();
    const { analytics } = recorder();
    const address = email('both');
    const first = await company(5, 'A');
    const second = await company(5, 'B');
    const membershipA = await provisionMembership(client, { companyId: first.id, email: address });
    await provisionMembership(client, { companyId: second.id, email: address });
    await seedCurrentPassword(membershipA.user.id, 'abcdef1!');
    const verified = await verifyPasswordLogin(client, analytics, { email: address, password: 'abcdef1!' });
    assert.equal(verified.activeMemberships.length, 2);
    assert.equal(await client.session.count({ where: { userId: membershipA.user.id } }), 0);
  });

  test('a second login expires one week from the second login', async () => {
    const client = await db();
    const { analytics } = recorder();
    const office = await company(5, 'A');
    const membership = await provisionMembership(client, { companyId: office.id, email: email('again') });
    const firstNow = new Date();
    const secondNow = new Date(firstNow.getTime() + 24 * 60 * 60 * 1000);
    const first = await issueSession(client, analytics, {
      userId: membership.user.id,
      companyUserId: membership.companyUser.id,
      method: 'password',
      signingKey: SIGNING_KEY,
      now: firstNow,
    });
    const second = await issueSession(client, analytics, {
      userId: membership.user.id,
      companyUserId: membership.companyUser.id,
      method: 'password',
      signingKey: SIGNING_KEY,
      now: secondNow,
    });
    assert.equal(first.expiresAt.getTime(), accessTokenWindow(firstNow).expiresAt.getTime());
    assert.equal(second.expiresAt.getTime(), accessTokenWindow(secondNow).expiresAt.getTime());
    assert.notEqual(first.expiresAt.getTime(), second.expiresAt.getTime());
  });

  test('Google or Microsoft verified email resolves to the same user id', async () => {
    const client = await db();
    const { analytics } = recorder();
    const office = await company(5, 'A');
    const address = email('sso');
    const membership = await provisionMembership(client, { companyId: office.id, email: address });
    await seedCurrentPassword(membership.user.id, 'abcdef1!');

    for (const provider of ['google', 'microsoft']) {
      const finished = await completeProviderAuthentication(client, analytics, {
        provider,
        providerSubject: `${provider}-subject-${address}`,
        email: address.toUpperCase(),
        emailVerified: true,
      });
      assert.equal(finished.userId, membership.user.id);
      assert.equal(await client.session.count({ where: { userId: membership.user.id } }), 0);
      const issued = await issueSession(client, analytics, {
        userId: finished.userId,
        companyUserId: membership.companyUser.id,
        method: provider,
        signingKey: SIGNING_KEY,
      });
      const resolved = await validateAccessToken(client, { token: issued.token, signingKey: SIGNING_KEY });
      assert.equal(resolved.userId, membership.user.id);
    }

    const links = await client.linkedLogin.findMany({ where: { userId: membership.user.id } });
    assert.equal(links.length, 2);
    assert.equal(links.some((link) => link.providerSubject === address), false);
    const again = await completeProviderAuthentication(client, analytics, {
      provider: 'google',
      providerSubject: `google-subject-${address}`,
      email: address,
      emailVerified: true,
    });
    assert.equal(again.userId, membership.user.id);
    assert.equal(await client.linkedLogin.count({ where: { userId: membership.user.id, provider: 'google' } }), 1);
    assert.ok(await client.userPassword.findUnique({ where: { userId: membership.user.id } }));
  });

  test('unverified provider email does not link and does not create a user', async () => {
    const client = await db();
    const { analytics } = recorder();
    const address = email('unverified');
    await assert.rejects(
      () => completeProviderAuthentication(client, analytics, {
        provider: 'google',
        providerSubject: `sub-${address}`,
        email: address,
        emailVerified: false,
      }),
      (error) => error.errorClass === 'unverified_provider_email',
    );
    assert.equal(await client.user.findUnique({ where: { email: address } }), null);
    assert.equal(await client.linkedLogin.findUnique({
      where: { provider_providerSubject: { provider: 'google', providerSubject: `sub-${address}` } },
    }), null);
  });

  test('deprovision of company A rejects A and leaves B and the user', async () => {
    const client = await db();
    const { analytics } = recorder();
    const address = email('multi');
    const companyA = await company(5, 'A');
    const companyB = await company(5, 'B');
    const membershipA = await provisionMembership(client, { companyId: companyA.id, email: address });
    const membershipB = await provisionMembership(client, { companyId: companyB.id, email: address });
    await seedCurrentPassword(membershipA.user.id, 'abcdef1!');
    await completeProviderAuthentication(client, analytics, {
      provider: 'microsoft',
      providerSubject: `ms-${address}`,
      email: address,
      emailVerified: true,
    });
    const sessionA = await issueSession(client, analytics, {
      userId: membershipA.user.id,
      companyUserId: membershipA.companyUser.id,
      method: 'password',
      signingKey: SIGNING_KEY,
    });
    const sessionB = await issueSession(client, analytics, {
      userId: membershipB.user.id,
      companyUserId: membershipB.companyUser.id,
      method: 'password',
      signingKey: SIGNING_KEY,
    });

    await deprovisionMembership(client, { companyUserId: membershipA.companyUser.id });

    await assert.rejects(
      () => validateAccessToken(client, { token: sessionA.token, signingKey: SIGNING_KEY }),
      (error) => error.errorClass === 'revoked_token',
    );
    const resolvedB = await validateAccessToken(client, { token: sessionB.token, signingKey: SIGNING_KEY });
    assert.equal(resolvedB.userId, membershipA.user.id);
    assert.equal(resolvedB.companyUserId, membershipB.companyUser.id);
    assert.ok(await client.user.findUnique({ where: { id: membershipA.user.id } }));
    assert.ok(await client.userPassword.findUnique({ where: { userId: membershipA.user.id } }));
    assert.equal(await client.linkedLogin.count({ where: { userId: membershipA.user.id } }), 1);
    const inactive = await client.companyUser.findUnique({ where: { id: membershipA.companyUser.id } });
    assert.equal(inactive.status, 'inactive');
    assert.ok(inactive.deactivatedAt);
  });

  test('missing, expired, forged, revoked, and inactive tokens are rejected', async () => {
    const client = await db();
    const { analytics } = recorder();
    const office = await company(5, 'A');
    const membership = await provisionMembership(client, { companyId: office.id, email: email('token') });
    const issued = await issueSession(client, analytics, {
      userId: membership.user.id,
      companyUserId: membership.companyUser.id,
      method: 'password',
      signingKey: SIGNING_KEY,
    });

    await assert.rejects(
      () => validateAccessToken(client, { token: '', signingKey: SIGNING_KEY }),
      (error) => error.errorClass === 'missing_token',
    );
    await assert.rejects(
      () => validateAccessToken(client, { token: undefined, signingKey: SIGNING_KEY }),
      (error) => error.errorClass === 'missing_token',
    );

    const forged = jwt.sign({ sub: membership.user.id }, 'different-signing-key-32-characters-xx', { algorithm: 'HS256' });
    await assert.rejects(
      () => validateAccessToken(client, { token: forged, signingKey: SIGNING_KEY }),
      (error) => error.errorClass === 'forged_token',
    );
    const expiredJwt = jwt.sign(
      { sub: membership.user.id, exp: Math.floor(Date.now() / 1000) - 10 },
      SIGNING_KEY,
      { algorithm: 'HS256' },
    );
    await assert.rejects(
      () => validateAccessToken(client, { token: expiredJwt, signingKey: SIGNING_KEY }),
      (error) => error.errorClass === 'expired_token',
    );

    await assert.rejects(
      () => validateAccessToken(client, {
        token: issued.token,
        signingKey: SIGNING_KEY,
        now: issued.expiresAt,
      }),
      (error) => error.errorClass === 'expired_token',
    );

    await client.session.update({
      where: { tokenHash: hashToken(issued.token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await assert.rejects(
      () => validateAccessToken(client, { token: issued.token, signingKey: SIGNING_KEY }),
      (error) => error.errorClass === 'expired_token',
    );
    await client.session.update({
      where: { tokenHash: hashToken(issued.token) },
      data: { expiresAt: issued.expiresAt, revokedAt: new Date() },
    });
    await assert.rejects(
      () => validateAccessToken(client, { token: issued.token, signingKey: SIGNING_KEY }),
      (error) => error.errorClass === 'revoked_token',
    );

    const stillActive = await issueSession(client, analytics, {
      userId: membership.user.id,
      companyUserId: membership.companyUser.id,
      method: 'password',
      signingKey: SIGNING_KEY,
    });
    await client.companyUser.update({
      where: { id: membership.companyUser.id },
      data: { status: 'inactive', deactivatedAt: new Date() },
    });
    await assert.rejects(
      () => validateAccessToken(client, { token: stillActive.token, signingKey: SIGNING_KEY }),
      (error) => error.errorClass === 'inactive_membership',
    );
  });

  test('a token for user A resolves to user A only', async () => {
    const client = await db();
    const { analytics } = recorder();
    const office = await company(5, 'A');
    const userA = await provisionMembership(client, { companyId: office.id, email: email('user-a') });
    const userB = await provisionMembership(client, { companyId: office.id, email: email('user-b') });
    const issued = await issueSession(client, analytics, {
      userId: userA.user.id,
      companyUserId: userA.companyUser.id,
      method: 'password',
      signingKey: SIGNING_KEY,
    });
    const resolved = await validateAccessToken(client, { token: issued.token, signingKey: SIGNING_KEY });
    assert.equal(resolved.userId, userA.user.id);
    assert.notEqual(resolved.userId, userB.user.id);
  });

  test('reset sends mail for an existing hash and confirm requires a matching new password', async () => {
    const client = await db();
    const { analytics, events } = recorder();
    const office = await company(5, 'A');
    const membership = await provisionMembership(client, { companyId: office.id, email: email('reset') });
    const originalHash = await seedCurrentPassword(membership.user.id, 'eeeeee1!');
    const sent = [];
    let rawToken;
    const requested = await requestPasswordReset(client, analytics, {
      email: membership.user.email,
      from: 'fixture-from@example.com',
      subject: 'fixture-subject',
      expiresAt: new Date(Date.now() + 60_000),
      renderLink(token) {
        rawToken = token;
        return `fixture-link:${token}`;
      },
      async sendMail(message) {
        sent.push(message);
      },
    });
    assert.deepEqual(requested, RESET_ACCEPTED);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].text, `fixture-link:${rawToken}`);
    assert.equal(sent[0].subject, 'fixture-subject');
    assert.equal(events.some((event) => event.event === 'password_reset_requested'), true);

    await assert.rejects(
      () => confirmPasswordReset(client, analytics, {
        rawToken,
        password: 'zzzzzz1!',
        confirmPassword: 'zzzzzz2!',
      }),
      (error) => error.errorClass === 'password_confirm_mismatch',
    );
    assert.equal((await client.userPassword.findUnique({ where: { userId: membership.user.id } })).passwordHash, originalHash);
  });

  test('reset rejects weak and reused passwords and a second submit', async () => {
    const client = await db();
    const { analytics, events } = recorder();
    const office = await company(5, 'A');
    const membership = await provisionMembership(client, { companyId: office.id, email: email('policy') });
    const plains = ['aaaaaa1!', 'bbbbbb1!', 'cccccc1!', 'dddddd1!', 'eeeeee1!'];
    const hashes = [];
    for (const plain of plains) {
      hashes.push(await hashPassword(plain));
    }
    await client.userPassword.create({
      data: { userId: membership.user.id, passwordHash: hashes[4] },
    });
    for (const passwordHash of hashes) {
      await client.passwordHistory.create({ data: { userId: membership.user.id, passwordHash } });
    }

    let rawToken;
    await requestPasswordReset(client, analytics, {
      email: membership.user.email,
      from: 'fixture-from@example.com',
      subject: 'fixture-subject',
      expiresAt: new Date(Date.now() + 60_000),
      renderLink(token) {
        rawToken = token;
        return `fixture-link:${token}`;
      },
      async sendMail() {},
    });

    const current = async () => (await client.userPassword.findUnique({ where: { userId: membership.user.id } })).passwordHash;
    for (const [password, errorClass] of [
      ['short1!', 'password_too_short'],
      ['abcdefg!', 'password_missing_number'],
      ['abcdefg1', 'password_missing_special'],
      ['aaaaaa1!', 'password_reused'],
      ['eeeeee1!', 'password_reused'],
    ]) {
      await assert.rejects(
        () => confirmPasswordReset(client, analytics, { rawToken, password, confirmPassword: password }),
        (error) => error.errorClass === errorClass,
      );
      assert.equal(await current(), hashes[4]);
    }

    await confirmPasswordReset(client, analytics, {
      rawToken,
      password: 'zzzzzz1!',
      confirmPassword: 'zzzzzz1!',
    });
    const replaced = await current();
    assert.notEqual(replaced, hashes[4]);
    assert.equal(events.some((event) => event.event === 'password_reset_completed'), true);
    const used = await client.passwordReset.findFirst({ where: { userId: membership.user.id } });
    assert.ok(used.usedAt);

    await assert.rejects(
      () => confirmPasswordReset(client, analytics, {
        rawToken,
        password: 'yyyyyy1!',
        confirmPassword: 'yyyyyy1!',
      }),
      (error) => error.errorClass === 'reset_token_rejected',
    );
    assert.equal(await current(), replaced);
  });

  test('reset with no password hash sends no mail and does not reveal the missing hash', async () => {
    const client = await db();
    const { analytics, events } = recorder();
    const office = await company(5, 'A');
    const membership = await provisionMembership(client, { companyId: office.id, email: email('sso-only') });
    const sent = [];
    const result = await requestPasswordReset(client, analytics, {
      email: membership.user.email,
      from: 'fixture-from@example.com',
      subject: 'fixture-subject',
      expiresAt: new Date(Date.now() + 60_000),
      renderLink(token) {
        return `fixture-link:${token}`;
      },
      async sendMail(message) {
        sent.push(message);
      },
    });
    const unknown = await requestPasswordReset(client, analytics, {
      email: email('nobody'),
      from: 'fixture-from@example.com',
      subject: 'fixture-subject',
      expiresAt: new Date(Date.now() + 60_000),
      renderLink(token) {
        return `fixture-link:${token}`;
      },
      async sendMail(message) {
        sent.push(message);
      },
    });
    assert.deepEqual(result, RESET_ACCEPTED);
    assert.deepEqual(unknown, result);
    assert.equal(sent.length, 0);
    assert.equal(events.length, 0);
    assert.equal(result.error, undefined);
    await assert.rejects(
      () => requestPasswordReset(client, analytics, { email: membership.user.email }),
      ResetNotConfiguredError,
    );
  });

  test('exactly one admin permission per company', async () => {
    const client = await db();
    const office = await company(5, 'A');
    await client.permission.create({
      data: { companyId: office.id, name: 'admin', isAdmin: true, access: null },
    });
    await assert.rejects(() => client.permission.create({
      data: { companyId: office.id, name: 'other-admin', isAdmin: true, access: null },
    }));
  });

  test('permission access is stored without reading keys, and a cross-company grant fails', async () => {
    const client = await db();
    const companyA = await company(5, 'A');
    const companyB = await company(5, 'B');
    const access = { unlabeled: ['kept', 'as-given'], n: 1 };
    const permissionA = await client.permission.create({
      data: { companyId: companyA.id, name: 'custom', isAdmin: false, access },
    });
    assert.deepEqual(permissionA.access, access);
    const permissionB = await client.permission.create({
      data: { companyId: companyB.id, name: 'custom', isAdmin: false, access: null },
    });
    const membershipA = await provisionMembership(client, { companyId: companyA.id, email: email('grant') });
    await assert.rejects(
      () => grantCompanyUserPermission(client, {
        companyUserId: membershipA.companyUser.id,
        permissionId: permissionB.id,
      }),
      (error) => error.errorClass === 'permission_company_mismatch',
    );
    await assert.rejects(() => client.companyUserPermission.create({
      data: { companyUserId: membershipA.companyUser.id, permissionId: permissionB.id },
    }), (error) => {
      assert.equal(String(error).includes('permission_company_mismatch'), true);
      return true;
    });
    const granted = await grantCompanyUserPermission(client, {
      companyUserId: membershipA.companyUser.id,
      permissionId: permissionA.id,
    });
    assert.equal(granted.permissionId, permissionA.id);
  });
});
