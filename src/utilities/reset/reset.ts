import { ApiError, ErrorClass, ResetNotConfiguredError } from '../errors.js';
import { normalizeEmail } from '../identity/email.js';
import { hashPassword } from '../passwords/hash.js';
import { assertPasswordRules } from '../passwords/policy.js';
import { assertPasswordNotReused } from '../passwords/reuse.js';
import { hashToken } from '../sessions/token-hash.js';
import { randomBytes } from 'node:crypto';

export const RESET_ACCEPTED = { result: 'accepted' };

function assertResetConfigured({ from, subject, expiresAt, renderLink, sendMail }) {
  if (typeof from !== 'string' || from.length === 0) {
    throw new ResetNotConfiguredError();
  }
  if (typeof subject !== 'string' || subject.length === 0) {
    throw new ResetNotConfiguredError();
  }
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw new ResetNotConfiguredError();
  }
  if (typeof renderLink !== 'function' || typeof sendMail !== 'function') {
    throw new ResetNotConfiguredError();
  }
}

/**
 * Sends a link only when user_passwords exists.
 * Unknown email and a missing hash return the same value and emit no event.
 * The body is the link from renderLink and nothing else.
 * expiresAt is the caller's absolute timestamp. This module has no lifetime.
 */
export async function requestPasswordReset(prisma, analytics, input) {
  assertResetConfigured(input);
  const normalized = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { userPassword: true },
  });

  if (!user?.userPassword) {
    return RESET_ACCEPTED;
  }

  const rawToken = randomBytes(32).toString('base64url');
  const link = input.renderLink(rawToken);
  if (typeof link !== 'string' || link.length === 0) {
    throw new ResetNotConfiguredError();
  }

  const tokenHash = hashToken(rawToken);
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: input.expiresAt,
    },
  });

  await input.sendMail({
    from: input.from,
    to: user.email,
    subject: input.subject,
    text: link,
  });

  analytics.passwordResetRequested({
    method: 'password',
    userId: user.id,
  });

  return RESET_ACCEPTED;
}

/**
 * password and confirmPassword must match. A failed rule does not set used_at.
 * A second success is rejected and leaves the hash from the first success.
 */
export async function confirmPasswordReset(prisma, analytics, {
  rawToken,
  password,
  confirmPassword,
  now = new Date(),
}) {
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    throw new ApiError(ErrorClass.resetTokenRejected);
  }

  const tokenHash = hashToken(rawToken);

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`
      SELECT "id" FROM "password_resets" WHERE "token_hash" = ${tokenHash} FOR UPDATE
    `;
    if (!Array.isArray(locked) || locked.length === 0) {
      throw new ApiError(ErrorClass.resetTokenRejected);
    }

    const reset = await tx.passwordReset.findUnique({ where: { tokenHash } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= now.getTime()) {
      throw new ApiError(ErrorClass.resetTokenRejected);
    }

    if (password !== confirmPassword) {
      throw new ApiError(ErrorClass.passwordConfirmMismatch);
    }
    assertPasswordRules(password);
    await assertPasswordNotReused(tx, reset.userId, password);

    const passwordHash = await hashPassword(password);
    await tx.userPassword.update({
      where: { userId: reset.userId },
      data: { passwordHash },
    });
    await tx.passwordHistory.create({
      data: {
        userId: reset.userId,
        passwordHash,
      },
    });
    await tx.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: now },
    });

    return { userId: reset.userId };
  });

  analytics.passwordResetCompleted({
    method: 'password',
    userId: result.userId,
  });

  return RESET_ACCEPTED;
}
