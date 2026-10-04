export const ErrorClass = {
  unknownEmail: 'unknown_email',
  badPassword: 'bad_password',
  inactiveMembership: 'inactive_membership',
  unverifiedProviderEmail: 'unverified_provider_email',
  providerSubjectConflict: 'provider_subject_conflict',
  invalidProvider: 'invalid_provider',
  invalidEmail: 'invalid_email',
  missingToken: 'missing_token',
  forgedToken: 'forged_token',
  expiredToken: 'expired_token',
  revokedToken: 'revoked_token',
  passwordTooShort: 'password_too_short',
  passwordMissingNumber: 'password_missing_number',
  passwordMissingSpecial: 'password_missing_special',
  passwordReused: 'password_reused',
  passwordConfirmMismatch: 'password_confirm_mismatch',
  resetTokenRejected: 'reset_token_rejected',
  seatLimitReached: 'seat_limit_reached',
  permissionCompanyMismatch: 'permission_company_mismatch',
  unknownCompany: 'unknown_company',
  unknownMembership: 'unknown_membership',
  notFound: 'not_found',
  catalogForbidden: 'catalog_forbidden',
  catalogNotFound: 'catalog_not_found',
  catalogDuplicate: 'catalog_duplicate',
  catalogCycle: 'catalog_cycle',
  catalogValidation: 'catalog_validation',
  catalogImageTooLarge: 'catalog_image_too_large',
  catalogImageRejected: 'catalog_image_rejected',
  countryOfOriginMissing: 'country_of_origin_missing',
};

/**
 * Implementation choice for the one rejection shape.
 * HTTP status for auth classes is not part of this object.
 * See docs/features/B-012-rejection-errors/README.md.
 */
export class ApiError extends Error {
  constructor(errorClass) {
    super(errorClass);
    this.name = 'ApiError';
    this.errorClass = errorClass;
    this.shape = { error: { code: 'rejected', class: errorClass } };
  }
}

export class ResetNotConfiguredError extends Error {
  constructor() {
    super('password reset is not configured');
    this.name = 'ResetNotConfiguredError';
  }
}
