import { ApiError, ErrorClass } from '../errors.js';

/**
 * The permission must belong to the same company as the membership.
 * The migration trigger enforces the same rule for direct inserts.
 */
export async function grantCompanyUserPermission(prisma, { companyUserId, permissionId }) {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.companyUser.findUnique({ where: { id: companyUserId } });
    if (!membership) {
      throw new ApiError(ErrorClass.unknownMembership);
    }
    const permission = await tx.permission.findUnique({ where: { id: permissionId } });
    if (!permission || membership.companyId !== permission.companyId) {
      throw new ApiError(ErrorClass.permissionCompanyMismatch);
    }

    return tx.companyUserPermission.create({
      data: { companyUserId, permissionId },
    });
  });
}
