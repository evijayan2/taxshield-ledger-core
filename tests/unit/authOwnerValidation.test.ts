import { describe, it, expect } from 'vitest';

/**
 * Validates whether a logged-in user email matches the registered company owner email.
 */
export function isUserAuthorizedForCompany(userEmail?: string | null, ownerEmail?: string | null, isDevBypass = false): boolean {
  if (isDevBypass) return true;
  if (!userEmail) return false;
  const cleanOwner = (ownerEmail || '').trim().toLowerCase();
  const cleanUser = userEmail.trim().toLowerCase();
  // If no owner is configured yet, any signed in user can perform setup
  if (!cleanOwner) return true;
  return cleanUser === cleanOwner;
}

describe('Owner Email Security Authorization', () => {
  it('should authorize exact match of owner email', () => {
    expect(isUserAuthorizedForCompany('owner@acme.tax', 'owner@acme.tax')).toBe(true);
  });

  it('should handle case insensitivity and whitespace', () => {
    expect(isUserAuthorizedForCompany(' Owner@Acme.Tax ', 'owner@acme.tax')).toBe(true);
  });

  it('should reject unauthorized user emails', () => {
    expect(isUserAuthorizedForCompany('hacker@external.com', 'owner@acme.tax')).toBe(false);
  });

  it('should allow initial sign-in when company owner is not set yet', () => {
    expect(isUserAuthorizedForCompany('newowner@acme.tax', '')).toBe(true);
    expect(isUserAuthorizedForCompany('newowner@acme.tax', undefined)).toBe(true);
  });

  it('should respect developer sandbox bypass', () => {
    expect(isUserAuthorizedForCompany('anyone@test.com', 'owner@acme.tax', true)).toBe(true);
  });
});
