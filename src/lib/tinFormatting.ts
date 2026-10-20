/**
 * Taxpayer Identification Number (TIN) Formatting & Validation Utilities
 * 
 * Pure functions with zero cryptographic dependencies, safe for both browser
 * and server environments.
 */

/**
 * Normalizes a Taxpayer Identification Number by stripping hyphens and whitespace.
 * @param rawTIN Raw SSN or EIN input.
 * @returns 9-digit clean string.
 */
export function normalizeTIN(rawTIN: string): string {
  return rawTIN.replace(/[^0-9]/g, '');
}

/**
 * Validates format of an SSN or EIN string.
 * @param tin Clean or formatted TIN string.
 * @param tinType Optional "SSN" or "EIN".
 * @returns True if valid 9-digit format.
 */
export function validateTIN(tin: string, tinType?: 'SSN' | 'EIN' | string): boolean {
  const clean = normalizeTIN(tin);
  if (clean.length !== 9) return false;
  if (/^0{9}|1{9}|2{9}|3{9}|4{9}|5{9}|6{9}|7{9}|8{9}|9{9}$/.test(clean)) return false;

  if (tinType === 'SSN') {
    // Area number cannot be 000, 666, or 900-999
    const area = parseInt(clean.substring(0, 3), 10);
    if (area === 0 || area === 666 || area >= 900) return false;
  }
  return true;
}

export const isValidTIN = validateTIN;

/**
 * Formats a clean 9-digit TIN with standard hyphens.
 * @param cleanTIN 9-digit string.
 * @param tinType 'SSN' (XXX-XX-XXXX) or 'EIN' (XX-XXXXXXX).
 * @returns Hyphenated TIN string.
 */
export function formatTIN(cleanTIN: string, tinType: 'SSN' | 'EIN' | string = 'SSN'): string {
  const digits = cleanTIN.replace(/\D/g, '');
  if (tinType === 'EIN') {
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
}

/**
 * Masks a Taxpayer Identification Number for display without exposing secrets.
 * @param plainTIN The unencrypted SSN or EIN.
 * @param tinType "SSN" (***-**-1234) or "EIN" (**-***1234).
 * @returns Masked representation.
 */
export function maskTIN(plainTIN: string, tinType: 'SSN' | 'EIN' | string = 'SSN'): string {
  const clean = normalizeTIN(plainTIN);
  if (clean.length < 4) return '***';

  const lastFour = clean.slice(-4);
  if (tinType === 'EIN') {
    return `**-***${lastFour}`;
  }
  return `***-**-${lastFour}`;
}
