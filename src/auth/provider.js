import { soleCompanyId } from '../analytics/events.js';
import { ApiError, ErrorClass } from '../errors.js';
import { normalizeEmail } from '../identity/email.js';

const PROVIDERS = new Set(['google', 'microsoft']);

function activeMemberships(companyUsers) {
  return companyUsers
    .filter((membership) => membership.status === 'active')
    .map((membership) => ({
      companyUserId: membership.id,
      companyId: membership.companyId,
    }));
}

/**
 * Finishes Google or Microsoft after the caller already has a verified email
 * and the provider's stable subject. Does not create a user or a session.
 * Does not call the provider.
 */
export async function completeProviderAuthentication(prisma, analytics, {
  provider,
  providerSubject,
  email,
  emailVerified,
}) {
  if (!PROVIDERS.has(provider)) {
    throw new ApiError(ErrorClass.invalidProvider);
  }
  if (emailVerified !== true) {
    analytics.loginFailed({
      method: provider,
      errorClass: ErrorClass.unverifiedProviderEmail,
    });
    throw new ApiError(ErrorClass.unverifiedProviderEmail);
  }
  if (typeof providerSubject !== 'string' || providerSubject.length === 0) {
    throw new Error('providerSubject is required');
  }

  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { companyUsers: true },
  });
  if (!user) {
    analytics.loginFailed({
      method: provider,
      errorClass: ErrorClass.unknownEmail,
    });
    throw new ApiError(ErrorClass.unknownEmail);
  }

  const memberships = activeMemberships(user.companyUsers);
  if (memberships.length === 0) {
    analytics.loginFailed({
      method: provider,
      userId: user.id,
      errorClass: ErrorClass.inactiveMembership,
    });
    throw new ApiError(ErrorClass.inactiveMembership);
  }

  const existing = await prisma.linkedLogin.findUnique({
    where: {
      provider_providerSubject: {
        provider,
        providerSubject,
      },
    },
  });
  if (existing && existing.userId !== user.id) {
    analytics.loginFailed({
      method: provider,
      userId: user.id,
      companyId: soleCompanyId(memberships),
      errorClass: ErrorClass.providerSubjectConflict,
    });
    throw new ApiError(ErrorClass.providerSubjectConflict);
  }
  if (!existing) {
    try {
      await prisma.linkedLogin.create({
        data: {
          userId: user.id,
          provider,
          providerSubject,
        },
      });
    } catch (error) {
      const raced = await prisma.linkedLogin.findUnique({
        where: { provider_providerSubject: { provider, providerSubject } },
      });
      if (raced?.userId === user.id) {
        return { userId: user.id, activeMemberships: memberships };
      }
      if (raced) {
        analytics.loginFailed({
          method: provider,
          userId: user.id,
          companyId: soleCompanyId(memberships),
          errorClass: ErrorClass.providerSubjectConflict,
        });
        throw new ApiError(ErrorClass.providerSubjectConflict);
      }
      throw error;
    }
  }

  return {
    userId: user.id,
    activeMemberships: memberships,
  };
}
