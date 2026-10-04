import { soleCompanyId } from '../analytics/events.js';
import { ApiError, ErrorClass } from '../errors.js';
import { normalizeEmail } from '../identity/email.js';
import { verifyPassword } from '../passwords/hash.js';

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

  const passwordMatches = user.userPassword
    ? await verifyPassword(user.userPassword.passwordHash, password)
    : false;
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
