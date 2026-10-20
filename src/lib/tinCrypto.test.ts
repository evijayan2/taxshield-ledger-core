import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  normalizeTIN,
  validateTIN,
  maskTIN,
  encryptTIN,
  decryptTIN,
} from './tinCrypto';

describe('tinCrypto', () => {
  const sampleSSN = '123-45-6789';
  const sampleEIN = '12-3456789';
  const testKey = crypto.randomBytes(32);

  describe('normalizeTIN', () => {
    it('strips dashes and whitespace from SSN', () => {
      expect(normalizeTIN(' 123-45-6789 ')).toBe('123456789');
    });

    it('strips dashes from EIN', () => {
      expect(normalizeTIN('12-3456789')).toBe('123456789');
    });
  });

  describe('validateTIN', () => {
    it('accepts valid 9-digit SSN', () => {
      expect(validateTIN('219-45-6789', 'SSN')).toBe(true);
    });

    it('rejects repeating identical digits', () => {
      expect(validateTIN('000-00-0000', 'SSN')).toBe(false);
      expect(validateTIN('999-99-9999', 'SSN')).toBe(false);
    });

    it('rejects invalid SSN area numbers 000 or 666', () => {
      expect(validateTIN('000-12-3456', 'SSN')).toBe(false);
      expect(validateTIN('666-12-3456', 'SSN')).toBe(false);
    });

    it('rejects wrong length strings', () => {
      expect(validateTIN('12345', 'SSN')).toBe(false);
      expect(validateTIN('1234567890', 'EIN')).toBe(false);
    });
  });

  describe('maskTIN', () => {
    it('masks SSN in standard ***-**-XXXX format', () => {
      expect(maskTIN(sampleSSN, 'SSN')).toBe('***-**-6789');
    });

    it('masks EIN in standard **-***XXXX format', () => {
      expect(maskTIN(sampleEIN, 'EIN')).toBe('**-***6789');
    });

    it('handles short inputs safely', () => {
      expect(maskTIN('12')).toBe('***');
    });
  });

  describe('encryptTIN and decryptTIN', () => {
    it('successfully encrypts and decrypts SSN with custom key', () => {
      const encrypted = encryptTIN(sampleSSN, testKey);
      expect(encrypted).not.toContain('123456789');
      expect(encrypted.split(':')).toHaveLength(3);

      const decrypted = decryptTIN(encrypted, testKey);
      expect(decrypted).toBe('123456789');
    });

    it('successfully encrypts and decrypts EIN with env fallback key', () => {
      const encrypted = encryptTIN(sampleEIN);
      const decrypted = decryptTIN(encrypted);
      expect(decrypted).toBe('123456789');
    });

    it('fails closed when ciphertext or tag is tampered with', () => {
      const encrypted = encryptTIN(sampleSSN, testKey);
      const [iv, tag, data] = encrypted.split(':');
      // Tamper with data segment
      const tamperedData = Buffer.from('tampered-bytes').toString('base64');
      const tamperedPayload = `${iv}:${tag}:${tamperedData}`;

      expect(() => decryptTIN(tamperedPayload, testKey)).toThrow();
    });

    it('fails closed when wrong key is provided', () => {
      const wrongKey = crypto.randomBytes(32);
      const encrypted = encryptTIN(sampleSSN, testKey);
      expect(() => decryptTIN(encrypted, wrongKey)).toThrow();
    });

    it('rejects empty inputs', () => {
      expect(() => encryptTIN('')).toThrow('Cannot encrypt empty');
      expect(() => decryptTIN('')).toThrow('Invalid encrypted TIN payload');
    });
  });
});
