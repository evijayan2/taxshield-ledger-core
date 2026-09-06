import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidPhoneNumber,
  formatPhoneNumber,
  isValidEin,
  formatEin,
  isValidZipCode,
} from '../../src/utils/validators.js';

describe('Shared Core Validators & Formatters', () => {
  describe('isValidEmail', () => {
    it('should correctly validate RFC compliant emails', () => {
      expect(isValidEmail('test@taxledger.org')).toBe(true);
      expect(isValidEmail('owner+tax@company.co.uk')).toBe(true);
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
    });
  });

  describe('isValidPhoneNumber & formatPhoneNumber', () => {
    it('should validate US 10-digit and 11-digit phone numbers', () => {
      expect(isValidPhoneNumber('2155550199')).toBe(true);
      expect(isValidPhoneNumber('(215) 555-0199')).toBe(true);
      expect(isValidPhoneNumber('+1 (215) 555-0199')).toBe(true);
      expect(isValidPhoneNumber('12345')).toBe(false);
      expect(isValidPhoneNumber('')).toBe(false);
    });

    it('should format 10-digit phone numbers', () => {
      expect(formatPhoneNumber('2155550199')).toBe('(215) 555-0199');
      expect(formatPhoneNumber('12155550199')).toBe('(215) 555-0199');
    });
  });

  describe('isValidEin & formatEin', () => {
    it('should validate 9-digit IRS EIN numbers', () => {
      expect(isValidEin('12-3456789')).toBe(true);
      expect(isValidEin('123456789')).toBe(true);
      expect(isValidEin('00-1234567')).toBe(false);
      expect(isValidEin('12345')).toBe(false);
      expect(isValidEin('')).toBe(false);
    });

    it('should format 9-digit EINs into XX-XXXXXXX', () => {
      expect(formatEin('123456789')).toBe('12-3456789');
      expect(formatEin('12-3456789')).toBe('12-3456789');
    });
  });

  describe('isValidZipCode', () => {
    it('should validate US 5-digit and ZIP+4 formats', () => {
      expect(isValidZipCode('19106')).toBe(true);
      expect(isValidZipCode('19106-1234')).toBe(true);
      expect(isValidZipCode('1910')).toBe(false);
      expect(isValidZipCode('')).toBe(false);
    });
  });
});

