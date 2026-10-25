import { ApiError, ErrorClass } from '../../utilities/errors.js';

export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_EMAIL_FAILURES = 8;
const MAX_BUCKETS = 10000;

export function createAttemptLimiter({
  windowMs = ATTEMPT_WINDOW_MS,
  maxEmailFailures = MAX_EMAIL_FAILURES,
  maxIpFailures = MAX_EMAIL_FAILURES * 5,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map();

  function live(key, current) {
    const existing = buckets.get(key);
    if (!existing || current >= existing.resetAt) {
      return null;
    }
    return existing;
  }

  function bump(key, current) {
    const existing = live(key, current);
    if (existing) {
      existing.count += 1;
      return;
    }
    if (buckets.size >= MAX_BUCKETS) {
      for (const [storedKey, bucket] of buckets) {
        if (current >= bucket.resetAt) {
          buckets.delete(storedKey);
        }
      }
    }
    if (buckets.size >= MAX_BUCKETS) {
      return;
    }
    buckets.set(key, { resetAt: current + windowMs, count: 1 });
  }

  return {
    assertAllowed(ip, email) {
      const current = now();
      const emailBucket = live(`${ip}\n${email}`, current);
      const ipBucket = live(`ip:${ip}`, current);
      const emailBlocked = emailBucket && emailBucket.count >= maxEmailFailures;
      const ipBlocked = ipBucket && ipBucket.count >= maxIpFailures;
      if (!emailBlocked && !ipBlocked) {
        return;
      }
      const resetAt = Math.max(
        emailBlocked ? emailBucket.resetAt : 0,
        ipBlocked ? ipBucket.resetAt : 0,
      );
      const error = new ApiError(ErrorClass.rateLimited, 'Too many attempts. Try again later.');
      error.retryAfterSeconds = Math.max(1, Math.ceil((resetAt - current) / 1000));
      throw error;
    },
    recordFailure(ip, email) {
      const current = now();
      bump(`${ip}\n${email}`, current);
      bump(`ip:${ip}`, current);
    },
  };
}
