import { describe, it, expect } from 'vitest';
import { sanitizeAuditPayload } from '../../src/lib/audit.js';

describe('Audit Payload Sanitizer', () => {
  it('should redact direct sensitive keys in state payloads', () => {
    const raw = {
      id: 'emp-101',
      firstName: 'Alice',
      lastName: 'Smith',
      ssn: '123-45-6789',
      routingNumber: '021000021',
      accountNumber: '9876543210',
      password: 'PlainSecretPassword123!',
      passwordHash: '$2b$10$hashedstringvalue',
    };

    const sanitized = sanitizeAuditPayload(raw) as Record<string, unknown>;

    expect(sanitized.id).toBe('emp-101');
    expect(sanitized.firstName).toBe('Alice');
    expect(sanitized.lastName).toBe('Smith');
    expect(sanitized.ssn).toBe('••••');
    expect(sanitized.routingNumber).toBe('••••');
    expect(sanitized.accountNumber).toBe('••••');
    expect(sanitized.password).toBe('••••');
    expect(sanitized.passwordHash).toBe('••••');
  });

  it('should recursively redact sensitive keys inside nested objects and arrays', () => {
    const raw = {
      companyId: 'comp-1',
      user: {
        email: 'alice@example.com',
        token: 'secret-auth-token-123',
      },
      bankAccounts: [
        {
          bankName: 'Chase',
          accountNumber: '1122334455',
          isPrimary: true,
        },
      ],
    };

    const sanitized = sanitizeAuditPayload(raw) as any;

    expect(sanitized.companyId).toBe('comp-1');
    expect(sanitized.user.email).toBe('alice@example.com');
    expect(sanitized.user.token).toBe('••••');
    expect(sanitized.bankAccounts[0].bankName).toBe('Chase');
    expect(sanitized.bankAccounts[0].accountNumber).toBe('••••');
    expect(sanitized.bankAccounts[0].isPrimary).toBe(true);
  });

  it('should handle primitives and null values safely', () => {
    expect(sanitizeAuditPayload(null)).toBe(null);
    expect(sanitizeAuditPayload(undefined)).toBe(undefined);
    expect(sanitizeAuditPayload('string')).toBe('string');
    expect(sanitizeAuditPayload(42)).toBe(42);
  });
});
