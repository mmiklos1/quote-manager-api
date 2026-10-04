import { createHash } from 'node:crypto';

export function hashToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}
