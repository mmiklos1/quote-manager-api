import { ApiError, ErrorClass } from '../errors.js';
import { verifyPassword } from './hash.js';

const HISTORY_LIMIT = 5;

export async function assertPasswordNotReused(tx, userId, password) {
  const current = await tx.userPassword.findUnique({ where: { userId } });
  if (current && (await verifyPassword(current.passwordHash, password))) {
    throw new ApiError(ErrorClass.passwordReused);
  }

  const recent = await tx.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  });

  for (const row of recent) {
    if (await verifyPassword(row.passwordHash, password)) {
      throw new ApiError(ErrorClass.passwordReused);
    }
  }
}
