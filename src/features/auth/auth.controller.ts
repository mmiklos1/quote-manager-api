import { ApiError, ErrorClass } from '../../utilities/errors.js';
import { ACCESS_TOKEN_LIFETIME_SECONDS } from '../../utilities/sessions/lifetime.js';
import { createAttemptLimiter } from './attempts.js';
import { accessTokenCookie } from './cookie.js';
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  signInWithPassword,
} from './auth.service.js';

const CREDENTIAL_FAILURES = new Set<string>([
  ErrorClass.unknownEmail,
  ErrorClass.badPassword,
  ErrorClass.inactiveMembership,
  ErrorClass.invalidEmail,
]);

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

function invalidCredentialsError(cause?: ApiError) {
  const error = new ApiError(
    ErrorClass.invalidCredentials,
    INVALID_CREDENTIALS_MESSAGE,
    cause?.analytics ?? {
      method: 'password',
      errorClass: cause?.errorClass ?? ErrorClass.invalidCredentials,
    },
  );
  return error;
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function bucketEmail(email) {
  if (typeof email !== 'string') {
    return '';
  }
  return email.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);
}

function bodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body;
}

function acceptableLoginFields(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') {
    return false;
  }
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
    return false;
  }
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  return true;
}

export function createAuthController({
  prisma,
  analytics,
  signingKey,
  attemptLimiter,
}: {
  prisma?: unknown;
  analytics?: { loginSucceeded?(props?: Record<string, unknown>): void };
  signingKey?: string;
  attemptLimiter?: ReturnType<typeof createAttemptLimiter>;
} = {}) {
  const limiter = attemptLimiter ?? createAttemptLimiter();

  return {
    async login(req, res, next) {
      const body = bodyObject(req.body);
      const email = body?.email;
      const password = body?.password;
      const companyUserId = body?.companyUserId;
      const ip = clientIp(req);
      const emailKey = bucketEmail(email);

      try {
        res.setHeader('Cache-Control', 'no-store');
        const declaredLength = Number(req.headers['content-length'] ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > 8192) {
          const oversized = new ApiError(ErrorClass.invalidRequest);
          oversized.httpStatus = 413;
          throw oversized;
        }

        try {
          limiter.assertAllowed(ip, emailKey);
        } catch (error) {
          if (error instanceof ApiError && error.errorClass === ErrorClass.rateLimited) {
            error.analytics = {
              method: 'password',
              errorClass: ErrorClass.rateLimited,
            };
          }
          throw error;
        }

        if (!acceptableLoginFields(email, password)) {
          limiter.recordFailure(ip, emailKey);
          throw invalidCredentialsError();
        }

        let result;
        try {
          result = await signInWithPassword(prisma, analytics, {
            email,
            password,
            companyUserId,
            signingKey,
          });
        } catch (error) {
          if (error instanceof ApiError && CREDENTIAL_FAILURES.has(error.errorClass)) {
            limiter.recordFailure(ip, emailKey);
            throw invalidCredentialsError(error);
          }
          throw error;
        }

        if (result.selectionRequired) {
          res.status(200).json({
            selectionRequired: true,
            userId: result.userId,
            activeMemberships: result.activeMemberships,
          });
          return;
        }

        const forwarded = req.headers['x-forwarded-proto'];
        const secure = req.secure === true || forwarded === 'https';
        res.setHeader('Set-Cookie', accessTokenCookie(result.token, {
          maxAge: ACCESS_TOKEN_LIFETIME_SECONDS,
          secure,
        }));
        res.status(200).json({
          token: result.token,
          expiresAt: result.expiresAt.toISOString(),
          userId: result.userId,
          companyUserId: result.companyUserId,
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
