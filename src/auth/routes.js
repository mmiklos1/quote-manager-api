import express from 'express';
import { ApiError, ErrorClass } from '../errors.js';
import { ACCESS_TOKEN_LIFETIME_SECONDS } from '../sessions/lifetime.js';
import { createAttemptLimiter } from './attempts.js';
import { accessTokenCookie } from './cookie.js';
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, signInWithPassword } from './login.js';

const CREDENTIAL_FAILURES = new Set([
  ErrorClass.unknownEmail,
  ErrorClass.badPassword,
  ErrorClass.inactiveMembership,
  ErrorClass.invalidEmail,
]);

const STATUS = {
  [ErrorClass.invalidCredentials]: 401,
  [ErrorClass.rateLimited]: 429,
  [ErrorClass.unknownMembership]: 400,
  [ErrorClass.invalidRequest]: 400,
};

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

function invalidCredentialsError() {
  return new ApiError(ErrorClass.invalidCredentials, INVALID_CREDENTIALS_MESSAGE);
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

export function createLoginRouter({ prisma, analytics, signingKey, attemptLimiter } = {}) {
  const limiter = attemptLimiter ?? createAttemptLimiter();
  const router = express.Router();

  router.post('/', async (req, res, next) => {
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
        res.status(413).json(new ApiError(ErrorClass.invalidRequest).shape);
        return;
      }

      limiter.assertAllowed(ip, emailKey);

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
          throw invalidCredentialsError();
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
      if (error instanceof ApiError) {
        if (error.errorClass === ErrorClass.rateLimited) {
          analytics.loginFailed({
            method: 'password',
            errorClass: ErrorClass.rateLimited,
          });
          if (error.retryAfterSeconds) {
            res.setHeader('Retry-After', String(error.retryAfterSeconds));
          }
        }
        res.status(STATUS[error.errorClass] ?? 400).json(error.shape);
        return;
      }
      next(error);
    }
  });

  return router;
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
