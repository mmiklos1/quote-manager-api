import { ApiError, ErrorClass } from '../errors.js';

export function passwordRejectionClass(password) {
  if (typeof password !== 'string' || [...password].length < 8) {
    return ErrorClass.passwordTooShort;
  }
  if (!/\p{N}/u.test(password)) {
    return ErrorClass.passwordMissingNumber;
  }
  const hasSpecial = [...password].some(
    (character) => !/\p{L}/u.test(character) && !/\p{N}/u.test(character),
  );
  if (!hasSpecial) {
    return ErrorClass.passwordMissingSpecial;
  }
  return null;
}

export function assertPasswordRules(password) {
  const errorClass = passwordRejectionClass(password);
  if (errorClass) {
    throw new ApiError(errorClass);
  }
}
