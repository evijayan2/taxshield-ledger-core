import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidPhoneNumber,
  formatPhoneNumber,
  isValidEin,
  formatEin,
  isValidZipCode,
  isValidAbaRouting,
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

  describe('isValidAbaRouting', () => {
    it('should accept valid Federal Reserve Mod-10 routing numbers', () => {
      expect(isValidAbaRouting('021000021')).toBe(true); // Chase
      expect(isValidAbaRouting('121000248')).toBe(true); // Wells Fargo
      expect(isValidAbaRouting('031000053')).toBe(true); // PNC Bank
    });

    it('should reject invalid checksum routing numbers', () => {
      expect(isValidAbaRouting('021000022')).toBe(false);
      expect(isValidAbaRouting('111111111')).toBe(false);
    });

    it('should reject wrong-length, empty, or null inputs', () => {
      expect(isValidAbaRouting('12345')).toBe(false);
      expect(isValidAbaRouting('1234567890')).toBe(false);
      expect(isValidAbaRouting('')).toBe(false);
      expect(isValidAbaRouting(null)).toBe(false);
    });
  });
});

