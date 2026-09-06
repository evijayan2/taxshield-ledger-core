/**
 * Common data format validation and formatting utilities for TaxShield Ledger.
 */

/**
 * Validates whether a string is a properly formatted email address.
 * @param email - The email string to validate
 * @returns True if valid email format, false otherwise
 */
export function isValidEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

/**
 * Validates whether a string is a valid 10-digit or 11-digit (with country code 1) US phone number.
 * @param phone - The phone string to validate
 * @returns True if valid phone number, false otherwise
 */
export function isValidPhoneNumber(phone?: string | null): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    // US area codes cannot start with 0 or 1
    return digits[0] >= '2' && digits[0] <= '9';
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits[1] >= '2' && digits[1] <= '9';
  }
  return false;
}

/**
 * Formats a phone string into a standard US (XXX) XXX-XXXX format.
 * @param phone - The raw phone number string
 * @returns Standard formatted phone string, or original if invalid length
 */
export function formatPhoneNumber(phone?: string | null): string {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  const cleanDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (cleanDigits.length === 10) {
    return `(${cleanDigits.slice(0, 3)}) ${cleanDigits.slice(3, 6)}-${cleanDigits.slice(6)}`;
  }
  return phone.trim();
}

/**
 * Validates whether a string is a valid 9-digit IRS Employer Identification Number (EIN).
 * Accepts XX-XXXXXXX or 9 continuous digits.
 * @param ein - The EIN string to validate
 * @returns True if valid EIN format, false otherwise
 */
export function isValidEin(ein?: string | null): boolean {
  if (!ein || typeof ein !== 'string') return false;
  const trimmed = ein.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 9) return false;
  // IRS EIN prefixes are 01-99, cannot be 00
  const prefix = parseInt(digits.slice(0, 2), 10);
  return prefix >= 1 && prefix <= 99;
}

/**
 * Formats an EIN string into standard IRS XX-XXXXXXX format.
 * @param ein - Raw or partially formatted EIN string
 * @returns Formatted XX-XXXXXXX string, or trimmed original if not 9 digits
 */
export function formatEin(ein?: string | null): string {
  if (!ein || typeof ein !== 'string') return '';
  const digits = ein.replace(/\D/g, '');
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return ein.trim();
}

/**
 * Validates a 5-digit or 9-digit (ZIP+4) US postal code.
 * @param zip - The ZIP code string
 * @returns True if valid ZIP format, false otherwise
 */
export function isValidZipCode(zip?: string | null): boolean {
  if (!zip || typeof zip !== 'string') return false;
  const trimmed = zip.trim();
  return /^\d{5}(-\d{4})?$/.test(trimmed);
}

