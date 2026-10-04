import { ApiError, ErrorClass } from '../errors.js';
import { normalizeEmail } from './email.js';

/**
 * First provision inserts users. A later company activates company_users.
 * Not an HTTP route. Does not send mail.
 * The company row is locked so two last-seat writes cannot both succeed.
 */
export async function provisionMembership(prisma, { companyId, email }) {
  const normalized = normalizeEmail(email);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "companies" WHERE "id" = CAST(${companyId} AS uuid) FOR UPDATE
    `;

    const company = await tx.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new ApiError(ErrorClass.unknownCompany);
    }

    let user = await tx.user.findUnique({ where: { email: normalized } });
    if (!user) {
      // ON CONFLICT keeps this transaction alive when two companies
      // provision the same new email at the same time. A failed INSERT
      // would abort the Postgres transaction.
      await tx.$executeRaw`
        INSERT INTO "users" ("email")
        VALUES (${normalized})
        ON CONFLICT ("email") DO NOTHING
      `;
      user = await tx.user.findUnique({ where: { email: normalized } });
      if (!user) {
        throw new Error('user row was not created');
      }
    }

    const existing = await tx.companyUser.findUnique({
      where: { companyId_userId: { companyId, userId: user.id } },
    });

    if (existing?.status === 'active') {
      return { user, companyUser: existing };
    }

    const activeCount = await tx.companyUser.count({
      where: { companyId, status: 'active' },
    });
    if (activeCount >= company.seatLimit) {
      throw new ApiError(ErrorClass.seatLimitReached);
    }

    if (existing) {
      const companyUser = await tx.companyUser.update({
        where: { id: existing.id },
        data: { status: 'active', deactivatedAt: null },
      });
      return { user, companyUser };
    }

    const companyUser = await tx.companyUser.create({
      data: {
        companyId,
        userId: user.id,
        status: 'active',
      },
    });
    return { user, companyUser };
  });
}

/**
 * Inactivate one membership and revoke sessions for that company_user_id only.
 * The users row, other companies, linked logins, and password hash stay.
 */
export async function deprovisionMembership(prisma, { companyUserId }) {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.companyUser.findUnique({ where: { id: companyUserId } });
    if (!membership) {
      throw new ApiError(ErrorClass.unknownMembership);
    }

    const companyUser = await tx.companyUser.update({
      where: { id: companyUserId },
      data: {
        status: 'inactive',
        deactivatedAt: new Date(),
      },
    });

    await tx.session.updateMany({
      where: { companyUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { companyUser };
  });
}
