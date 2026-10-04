import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createPkcePair, pkceChallengeFor, statesMatch } from '../src/auth/pkce.js';
import { ACCESS_TOKEN_LIFETIME_SECONDS, accessTokenWindow } from '../src/sessions/lifetime.js';
import { hashToken } from '../src/sessions/token-hash.js';

test('PKCE challenge is S256 and state is compared in full', () => {
  const pair = createPkcePair();
  assert.equal(pair.codeChallengeMethod, 'S256');
  assert.equal(pair.codeChallenge, pkceChallengeFor(pair.codeVerifier));
  assert.equal(statesMatch(pair.state, pair.state), true);
  assert.equal(statesMatch(pair.state, `${pair.state}x`), false);
  assert.equal(statesMatch(pair.state, pair.state.slice(0, -1)), false);
});

test('access token lifetime is one week in whole seconds', () => {
  const now = new Date('2026-09-26T12:00:00.400Z');
  const window = accessTokenWindow(now);
  assert.equal(ACCESS_TOKEN_LIFETIME_SECONDS, 7 * 24 * 60 * 60);
  assert.equal(window.expiresAtSeconds - window.issuedAtSeconds, ACCESS_TOKEN_LIFETIME_SECONDS);
  assert.equal(window.issuedAtSeconds, Math.floor(now.getTime() / 1000));
});

test('token hash is sha256 and is not the raw token', () => {
  const raw = 'header.payload.sig';
  const digest = hashToken(raw);
  assert.notEqual(digest, raw);
  assert.equal(digest, createHash('sha256').update(raw).digest('hex'));
});

test('signed token subject is the user id and carries no company claim', () => {
  const now = new Date();
  const window = accessTokenWindow(now);
  const signingKey = 'test-signing-key-at-least-32-characters';
  const token = jwt.sign(
    { sub: 'user-a', iat: window.issuedAtSeconds, exp: window.expiresAtSeconds },
    signingKey,
    { algorithm: 'HS256' },
  );
  const payload = jwt.verify(token, signingKey, { algorithms: ['HS256'], clockTolerance: 0 });
  assert.equal(payload.sub, 'user-a');
  assert.equal(payload.companyId, undefined);
  assert.equal(payload.exp - payload.iat, ACCESS_TOKEN_LIFETIME_SECONDS);
});
