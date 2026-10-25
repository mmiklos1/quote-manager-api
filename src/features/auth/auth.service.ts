import { ApiError, ErrorClass } from '../../utilities/errors.js';
import { normalizeEmail } from '../../utilities/identity/email.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../../utilities/passwords/hash.js';
import { issueSession } from '../../utilities/sessions/sessions.js';
import { soleCompanyId } from '../analytics/analytics.service.js';

export const MAX_EMAIL_LENGTH = 320;
export const MAX_PASSWORD_LENGTH = 128;

async function matchesStoredPassword(user, password) {
  const candidate = typeof password === 'string' ? password : '';
  const stored = user?.userPassword?.passwordHash;
  if (typeof stored === 'string' && stored.length > 0) {
    return verifyPassword(stored, candidate);
  }
  await verifyPassword(DUMMY_PASSWORD_HASH, candidate);
  return false;
}

function activeMemberships(companyUsers) {
  return companyUsers
    .filter((membership) => membership.status === 'active')
    .map((membership) => ({
      companyUserId: membership.id,
      companyId: membership.companyId,
    }));
}

/**
 * Proves email and password. Does not create a user, choose a company, or issue a token.
 * Failures throw ApiError with analytics metadata for the app error handler.
 */
export async function verifyPasswordLogin(prisma, { email, password }) {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: {
      userPassword: true,
      companyUsers: true,
    },
  });

  const passwordMatches = await matchesStoredPassword(user, password);

  if (!user) {
    throw new ApiError(ErrorClass.unknownEmail, undefined, {
      method: 'password',
      errorClass: ErrorClass.unknownEmail,
    });
  }

  const memberships = activeMemberships(user.companyUsers);
  if (memberships.length === 0) {
    throw new ApiError(ErrorClass.inactiveMembership, undefined, {
      method: 'password',
      userId: user.id,
      errorClass: ErrorClass.inactiveMembership,
    });
  }

  if (!passwordMatches) {
    throw new ApiError(ErrorClass.badPassword, undefined, {
      method: 'password',
      userId: user.id,
      companyId: soleCompanyId(memberships),
      errorClass: ErrorClass.badPassword,
    });
  }

  return {
    userId: user.id,
    activeMemberships: memberships,
  };
}

/**
 * Proves the password, then issues a session only when the company membership is known.
 * One active membership is that known membership. Two or more require companyUserId.
 */
export async function signInWithPassword(prisma, analytics, {
  email,
  password,
  companyUserId,
  signingKey,
}) {
  const verified = await verifyPasswordLogin(prisma, { email, password });
  let membershipId = companyUserId;
  if (membershipId === undefined || membershipId === null || membershipId === '') {
    if (verified.activeMemberships.length !== 1) {
      return {
        selectionRequired: true,
        userId: verified.userId,
        activeMemberships: verified.activeMemberships,
      };
    }
    membershipId = verified.activeMemberships[0].companyUserId;
  }

  const selected = verified.activeMemberships.find((membership) => membership.companyUserId === membershipId);
  if (typeof membershipId !== 'string' || !selected) {
    throw new ApiError(ErrorClass.unknownMembership);
  }

  const issued = await issueSession(prisma, analytics, {
    userId: verified.userId,
    companyUserId: selected.companyUserId,
    method: 'password',
    signingKey,
  });

  return {
    selectionRequired: false,
    token: issued.token,
    expiresAt: issued.expiresAt,
    userId: issued.userId,
    companyUserId: issued.companyUserId,
  };
}
