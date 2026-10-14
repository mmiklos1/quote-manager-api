import { soleCompanyId } from '../analytics/events.js';
import { ApiError, ErrorClass } from '../errors.js';
import { normalizeEmail } from '../identity/email.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../passwords/hash.js';

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
 */
export async function verifyPasswordLogin(prisma, analytics, { email, password }) {
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
    analytics.loginFailed({
      method: 'password',
      errorClass: ErrorClass.unknownEmail,
    });
    throw new ApiError(ErrorClass.unknownEmail);
  }

  const memberships = activeMemberships(user.companyUsers);
  if (memberships.length === 0) {
    analytics.loginFailed({
      method: 'password',
      userId: user.id,
      errorClass: ErrorClass.inactiveMembership,
    });
    throw new ApiError(ErrorClass.inactiveMembership);
  }

  if (!passwordMatches) {
    analytics.loginFailed({
      method: 'password',
      userId: user.id,
      companyId: soleCompanyId(memberships),
      errorClass: ErrorClass.badPassword,
    });
    throw new ApiError(ErrorClass.badPassword);
  }

  return {
    userId: user.id,
    activeMemberships: memberships,
  };
}
