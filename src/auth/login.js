import { ApiError, ErrorClass } from '../errors.js';
import { issueSession } from '../sessions/sessions.js';
import { verifyPasswordLogin } from './password.js';

export const MAX_EMAIL_LENGTH = 320;
export const MAX_PASSWORD_LENGTH = 128;

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
  const verified = await verifyPasswordLogin(prisma, analytics, { email, password });
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
