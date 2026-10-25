/** One week, in whole seconds. JWT exp is a second, so the row uses this too. */
export const ACCESS_TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

export function accessTokenWindow(now) {
  const issuedAtSeconds = Math.floor(now.getTime() / 1000);
  const expiresAtSeconds = issuedAtSeconds + ACCESS_TOKEN_LIFETIME_SECONDS;
  return {
    issuedAtSeconds,
    expiresAtSeconds,
    expiresAt: new Date(expiresAtSeconds * 1000),
  };
}

export const MIN_SIGNING_KEY_LENGTH = 32;

export function assertSigningKey(signingKey) {
  if (typeof signingKey !== 'string' || signingKey.length < MIN_SIGNING_KEY_LENGTH) {
    throw new Error('JWT_SIGNING_KEY must be set and at least 32 characters. It is not committed.');
  }
}
