import argon2 from 'argon2';

/**
 * Password hashing.
 * Algorithm: Argon2id (slow adaptive hash; not SHA-256).
 * Parameters, OWASP password storage guidance as adopted by this build:
 * - type: argon2id
 * - memoryCost: 19456 (19 MiB, in KiB)
 * - timeCost: 2
 * - parallelism: 1
 * - hashLength: 32
 * The encoded hash string carries these parameters. Verification uses that string.
 */
export const PASSWORD_HASH_PARAMETERS = {
  algorithm: 'argon2id',
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

export async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: PASSWORD_HASH_PARAMETERS.memoryCost,
    timeCost: PASSWORD_HASH_PARAMETERS.timeCost,
    parallelism: PASSWORD_HASH_PARAMETERS.parallelism,
    hashLength: PASSWORD_HASH_PARAMETERS.hashLength,
  });
}

export async function verifyPassword(passwordHash, password) {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
