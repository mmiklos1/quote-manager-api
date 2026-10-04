import jwt from 'jsonwebtoken';
import { ApiError, ErrorClass } from '../errors.js';
import { accessTokenWindow, assertSigningKey } from './lifetime.js';
import { hashToken } from './token-hash.js';

/**
 * Requires companyUserId. Does not search for a membership.
 * JWT claims are sub, iat, and exp. Company context stays on the session row.
 */
export async function issueSession(prisma, analytics, { userId, companyUserId, method, signingKey, now = new Date() }) {
  assertSigningKey(signingKey);
  const membership = await prisma.companyUser.findUnique({ where: { id: companyUserId } });
  if (!membership || membership.userId !== userId) {
    throw new ApiError(ErrorClass.forgedToken);
  }
  if (membership.status !== 'active') {
    analytics.loginFailed({
      method,
      userId,
      companyId: membership.companyId,
      errorClass: ErrorClass.inactiveMembership,
    });
    throw new ApiError(ErrorClass.inactiveMembership);
  }

  const window = accessTokenWindow(now);
  const token = jwt.sign(
    {
      sub: userId,
      iat: window.issuedAtSeconds,
      exp: window.expiresAtSeconds,
    },
    signingKey,
    { algorithm: 'HS256' },
  );
  const tokenHash = hashToken(token);

  await prisma.session.create({
    data: {
      userId,
      companyUserId,
      tokenHash,
      expiresAt: window.expiresAt,
    },
  });

  analytics.loginSucceeded({
    method,
    userId,
    companyId: membership.companyId,
  });

  return {
    token,
    expiresAt: window.expiresAt,
    userId,
    companyUserId,
  };
}

export async function validateAccessToken(prisma, { token, signingKey, now = new Date() }) {
  assertSigningKey(signingKey);
  if (typeof token !== 'string' || token.length === 0) {
    throw new ApiError(ErrorClass.missingToken);
  }

  let payload;
  try {
    payload = jwt.verify(token, signingKey, {
      algorithms: ['HS256'],
      clockTolerance: 0,
    });
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      throw new ApiError(ErrorClass.expiredToken);
    }
    throw new ApiError(ErrorClass.forgedToken);
  }

  if (typeof payload?.sub !== 'string' || payload.sub.length === 0) {
    throw new ApiError(ErrorClass.forgedToken);
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!session || session.userId !== payload.sub) {
    throw new ApiError(ErrorClass.forgedToken);
  }
  if (session.revokedAt) {
    throw new ApiError(ErrorClass.revokedToken);
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    throw new ApiError(ErrorClass.expiredToken);
  }

  const membership = await prisma.companyUser.findUnique({
    where: { id: session.companyUserId },
  });
  if (!membership || membership.status !== 'active' || membership.userId !== session.userId) {
    throw new ApiError(ErrorClass.inactiveMembership);
  }

  return {
    userId: session.userId,
    companyUserId: session.companyUserId,
    companyId: membership.companyId,
  };
}
