/**
 * Pure input validation and Indian phone number normalization helpers
 * shared between backend API routes and unit tests.
 */

/**
 * Normalizes an Indian mobile phone input by removing spaces, hyphens,
 * leading +91 / 91 (when 12 digits) or leading 0 (when 11 digits).
 * Returns the 10-digit string if valid (starts with 6-9), or null if invalid.
 */
export function normalizeIndianPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return null;
  }
  return digits;
}

export interface RegistrationValidationInput {
  storeName: unknown;
  storeLocation: unknown;
  phoneNumber: unknown;
  password: unknown;
  confirmPassword: unknown;
}

export interface ValidationResult<T> {
  ok: true;
  data: T;
}

export interface ValidationError {
  ok: false;
  error: string;
  field?: string;
}

export function validateRegistrationInput(
  input: RegistrationValidationInput
):
  | ValidationResult<{
      storeName: string;
      storeLocation: string;
      phoneNumber: string;
      password: string;
    }>
  | ValidationError {
  const storeName =
    typeof input.storeName === 'string' ? input.storeName.trim() : '';
  if (storeName.length < 2 || storeName.length > 80) {
    return {
      ok: false,
      field: 'storeName',
      error: 'Please enter a valid store name (at least 2 characters).',
    };
  }

  const storeLocation =
    typeof input.storeLocation === 'string' ? input.storeLocation.trim() : '';
  if (storeLocation.length < 3 || storeLocation.length > 200) {
    return {
      ok: false,
      field: 'storeLocation',
      error: 'Please enter your store area, city, or PIN code.',
    };
  }

  const phoneNumber = normalizeIndianPhone(input.phoneNumber);
  if (!phoneNumber) {
    return {
      ok: false,
      field: 'phoneNumber',
      error: 'Please enter a valid 10-digit Indian mobile number.',
    };
  }

  const password = typeof input.password === 'string' ? input.password : '';
  if (password.length < 6 || password.length > 128) {
    return {
      ok: false,
      field: 'password',
      error: 'Password must be at least 6 characters long.',
    };
  }

  const confirmPassword =
    typeof input.confirmPassword === 'string' ? input.confirmPassword : '';
  if (password !== confirmPassword) {
    return {
      ok: false,
      field: 'confirmPassword',
      error: 'Passwords do not match. Please check and try again.',
    };
  }

  return {
    ok: true,
    data: { storeName, storeLocation, phoneNumber, password },
  };
}

export function validateLoginInput(input: {
  phoneNumber: unknown;
  password: unknown;
}):
  | ValidationResult<{ phoneNumber: string; password: string }>
  | ValidationError {
  const phoneNumber = normalizeIndianPhone(input.phoneNumber);
  if (!phoneNumber) {
    return {
      ok: false,
      field: 'phoneNumber',
      error: 'Please enter a valid 10-digit Indian mobile number.',
    };
  }

  const password = typeof input.password === 'string' ? input.password : '';
  if (password.length < 1) {
    return {
      ok: false,
      field: 'password',
      error: 'Please enter your password.',
    };
  }

  return {
    ok: true,
    data: { phoneNumber, password },
  };
}
