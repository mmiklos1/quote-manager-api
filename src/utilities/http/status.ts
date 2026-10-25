import { ErrorClass } from '../errors.js';

/** HTTP status for ApiError.errorClass values. Unknown classes fall back to 400. */
export const ERROR_STATUS: Record<string, number> = {
  [ErrorClass.invalidCredentials]: 401,
  [ErrorClass.missingToken]: 401,
  [ErrorClass.forgedToken]: 401,
  [ErrorClass.expiredToken]: 401,
  [ErrorClass.revokedToken]: 401,
  [ErrorClass.inactiveMembership]: 401,
  [ErrorClass.rateLimited]: 429,
  [ErrorClass.catalogForbidden]: 403,
  [ErrorClass.catalogNotFound]: 404,
  [ErrorClass.unknownCompany]: 404,
  [ErrorClass.notFound]: 404,
  [ErrorClass.catalogDuplicate]: 409,
  [ErrorClass.catalogCycle]: 422,
  [ErrorClass.catalogValidation]: 422,
  [ErrorClass.catalogImageTooLarge]: 422,
  [ErrorClass.catalogImageRejected]: 422,
  [ErrorClass.countryOfOriginMissing]: 422,
  [ErrorClass.unknownMembership]: 400,
  [ErrorClass.invalidRequest]: 400,
};

export function statusForErrorClass(errorClass: string): number {
  return ERROR_STATUS[errorClass] ?? 400;
}
