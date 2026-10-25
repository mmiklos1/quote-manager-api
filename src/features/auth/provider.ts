import { soleCompanyId } from '../analytics/analytics.service.js';
import { ApiError, ErrorClass } from '../../utilities/errors.js';
import { normalizeEmail } from '../../utilities/identity/email.js';

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
 * Does not call the provider. Failures carry analytics metadata for the HTTP layer.
 */
export async function completeProviderAuthentication(prisma, {
  provider,
  providerSubject,
  email,
  emailVerified,
}) {
  if (!PROVIDERS.has(provider)) {
    throw new ApiError(ErrorClass.invalidProvider);
  }
  if (emailVerified !== true) {
    throw new ApiError(ErrorClass.unverifiedProviderEmail, undefined, {
      method: provider,
      errorClass: ErrorClass.unverifiedProviderEmail,
    });
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
    throw new ApiError(ErrorClass.unknownEmail, undefined, {
      method: provider,
      errorClass: ErrorClass.unknownEmail,
    });
  }

  const memberships = activeMemberships(user.companyUsers);
  if (memberships.length === 0) {
    throw new ApiError(ErrorClass.inactiveMembership, undefined, {
      method: provider,
      userId: user.id,
      errorClass: ErrorClass.inactiveMembership,
    });
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
    throw new ApiError(ErrorClass.providerSubjectConflict, undefined, {
      method: provider,
      userId: user.id,
      companyId: soleCompanyId(memberships),
      errorClass: ErrorClass.providerSubjectConflict,
    });
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
        throw new ApiError(ErrorClass.providerSubjectConflict, undefined, {
          method: provider,
          userId: user.id,
          companyId: soleCompanyId(memberships),
          errorClass: ErrorClass.providerSubjectConflict,
        });
      }
      throw error;
    }
  }

  return {
    userId: user.id,
    activeMemberships: memberships,
  };
}
