import { ApiError, ErrorClass } from '../errors.js';

/**
 * Trim plus lowercase of the whole address.
 * Plus-tags are kept. Domains are not rewritten.
 */
export function normalizeEmail(email) {
  if (typeof email !== 'string') {
    throw new ApiError(ErrorClass.invalidEmail);
  }
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new ApiError(ErrorClass.invalidEmail);
  }
  return normalized;
}
