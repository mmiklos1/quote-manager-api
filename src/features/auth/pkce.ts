import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

function base64url(buffer) {
  return buffer.toString('base64url');
}

/**
 * State and S256 PKCE for a redirect this API might run later.
 * Nothing here persists the verifier or registers a callback route.
 */
export function createPkcePair() {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  const state = base64url(randomBytes(32));
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
    state,
  };
}

export function pkceChallengeFor(codeVerifier) {
  return base64url(createHash('sha256').update(codeVerifier).digest());
}

export function statesMatch(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') {
    return false;
  }
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length || left.length === 0) {
    return false;
  }
  return timingSafeEqual(left, right);
}
