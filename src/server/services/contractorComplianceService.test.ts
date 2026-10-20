import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  isCorporateExempt,
  evaluateContractor1099Status,
  generateW9TokenPair,
  generateIrisCsvManifest,
  resolve1099NecThreshold,
} from './contractorComplianceService';
import type { IrisPayeeExport } from './contractorComplianceService';

describe('contractorComplianceService', () => {
  describe('isCorporateExempt', () => {
    it('identifies C and S corporations as exempt from 1099-NEC', () => {
      expect(isCorporateExempt('C_CORPORATION')).toBe(true);
      expect(isCorporateExempt('S_CORPORATION')).toBe(true);
      expect(isCorporateExempt('LLC_C_CORP')).toBe(true);
      expect(isCorporateExempt('LLC_S_CORP')).toBe(true);
    });

    it('identifies sole proprietors, disregarded LLCs, and partnerships as non-exempt', () => {
      expect(isCorporateExempt('INDIVIDUAL_SOLE_PROPRIETOR')).toBe(false);
      expect(isCorporateExempt('LLC_DISREGARDED')).toBe(false);
      expect(isCorporateExempt('PARTNERSHIP')).toBe(false);
      expect(isCorporateExempt(null)).toBe(false);
      expect(isCorporateExempt(undefined)).toBe(false);
    });
  });

  describe('evaluateContractor1099Status', () => {
    const statutoryThreshold = 600.00;

    it('returns EXEMPT_ENTITY regardless of payment amount if corporate', () => {
      expect(evaluateContractor1099Status(5000, statutoryThreshold, true, 'C_CORPORATION')).toBe('EXEMPT_ENTITY');
    });

    it('returns MISSING_W9 if contractor has no certified W-9', () => {
      expect(evaluateContractor1099Status(1200, statutoryThreshold, false, 'INDIVIDUAL_SOLE_PROPRIETOR')).toBe('MISSING_W9');
    });

    it('returns BELOW_THRESHOLD when payments are strictly under $600', () => {
      expect(evaluateContractor1099Status(0, statutoryThreshold, true, 'INDIVIDUAL_SOLE_PROPRIETOR')).toBe('BELOW_THRESHOLD');
      expect(evaluateContractor1099Status(599.99, statutoryThreshold, true, 'INDIVIDUAL_SOLE_PROPRIETOR')).toBe('BELOW_THRESHOLD');
    });

    it('returns THRESHOLD_MET when payments hit or exceed $600', () => {
      expect(evaluateContractor1099Status(600.00, statutoryThreshold, true, 'INDIVIDUAL_SOLE_PROPRIETOR')).toBe('THRESHOLD_MET');
      expect(evaluateContractor1099Status(2500.50, statutoryThreshold, true, 'INDIVIDUAL_SOLE_PROPRIETOR')).toBe('THRESHOLD_MET');
    });
  });

  describe('resolve1099NecThreshold', () => {
    it('dynamically resolves statutory $600 threshold from active FED_1099_NEC_THRESHOLD tax rule', () => {
      const threshold = resolve1099NecThreshold();
      expect(threshold).toBe(600.00);
    });
  });

  describe('generateW9TokenPair', () => {
    it('generates high-entropy token and matching SHA-256 hash', () => {
      const { rawToken, tokenHash } = generateW9TokenPair();
      expect(rawToken).toHaveLength(64); // 32 bytes hex
      expect(tokenHash).toHaveLength(64);

      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      expect(tokenHash).toBe(expectedHash);
    });
  });

  describe('generateIrisCsvManifest', () => {
    const samplePayees: IrisPayeeExport[] = [
      {
        tinType: '2',
        tinPlain: '123-45-6789',
        legalName: 'Dave Miller',
        address: '100 Main St',
        city: 'Philadelphia',
        state: 'PA',
        zipCode: '19104',
        compensationAmount: 750.00,
      },
      {
        tinType: '1',
        tinPlain: '98-7654321',
        legalName: 'Apex Studio LLC',
        address: '200 Market St',
        city: 'Pittsburgh',
        state: 'PA',
        zipCode: '15222',
        compensationAmount: 1200.00,
      },
    ];

    it('generates standard IRS CSV with B records and C footer total', () => {
      const csv = generateIrisCsvManifest('12-3456789', 'Acme Consulting LLC', '2026', samplePayees);
      const lines = csv.split('\n');

      // Header row
      expect(lines[0]).toContain('RecordType,PayerTIN,PayerName,TaxYear');
      // Payee 1 (B record)
      expect(lines[1]).toContain('B,123456789,"Acme Consulting LLC",2026,2,123456789,"Dave Miller"');
      expect(lines[1]).toContain('750.00');
      // Payee 2 (B record)
      expect(lines[2]).toContain('B,123456789,"Acme Consulting LLC",2026,1,987654321,"Apex Studio LLC"');
      expect(lines[2]).toContain('1200.00');
      // Summary (C record)
      expect(lines[3]).toContain('C,123456789,"Acme Consulting LLC",2026,2,1950.00');
    });
  });
});
