import { describe, it, expect } from 'vitest';
import {
  bpsToDecimal,
  decimalToBps,
  formatRatePercent,
  getStatutorySutaRule,
  validateSutaRateBounds,
  resolveSutaRate,
  createSutaAuditEntry,
} from './sutaExperienceService';
import type { CompanyTaxSetting } from '../../types';

describe('sutaExperienceService', () => {
  describe('rate conversion utilities', () => {
    it('accurately converts bps to decimal', () => {
      expect(bpsToDecimal(413)).toBe(0.0413);
      expect(bpsToDecimal(350)).toBe(0.035);
      expect(bpsToDecimal(0)).toBe(0);
    });

    it('accurately converts decimal to bps', () => {
      expect(decimalToBps(0.04125)).toBe(413);
      expect(decimalToBps(0.035)).toBe(350);
      expect(decimalToBps(0.023)).toBe(230);
    });

    it('formats decimal rate as human-readable percent', () => {
      expect(formatRatePercent(0.04125)).toBe('4.125%');
      expect(formatRatePercent(0.035)).toBe('3.500%');
      expect(formatRatePercent(0.002)).toBe('0.200%');
    });
  });

  describe('getStatutorySutaRule', () => {
    it('retrieves statutory PA UC rule from Tax Rules Engine fixture', () => {
      const paRule = getStatutorySutaRule('PA');
      expect(paRule.ruleCode).toBe('PA_UC_EMPLOYER');
      expect(paRule.rate).toBe(0.035);
      expect(paRule.wageCap).toBe(10000);
      expect(paRule.ceilingRate).toBeGreaterThan(paRule.rate);
      expect(paRule.floorRate).toBe(0);
    });

    it('retrieves statutory NJ SUI rule from Tax Rules Engine fixture', () => {
      const njRule = getStatutorySutaRule('NJ');
      expect(njRule.ruleCode).toBe('NJ_SUI_EMPLOYER');
      expect(njRule.rate).toBe(0.028);
      expect(njRule.wageCap).toBe(42300);
    });
  });

  describe('validateSutaRateBounds', () => {
    it('validates a rate within standard statutory bounds', () => {
      const result = validateSutaRateBounds(0.04125, { ceilingRate: 0.105, floorRate: 0.005 });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects a negative SUTA rate', () => {
      const result = validateSutaRateBounds(-0.015);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be negative');
    });

    it('rejects a rate exceeding statutory ceiling', () => {
      const result = validateSutaRateBounds(0.25, { ceilingRate: 0.105 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds state statutory ceiling');
      expect(result.error).toContain('10.500%');
    });

    it('rejects a rate below statutory floor', () => {
      const result = validateSutaRateBounds(0.001, { floorRate: 0.005 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('below state statutory floor');
      expect(result.error).toContain('0.500%');
    });
  });

  describe('resolveSutaRate', () => {
    const mockCompanySettings: CompanyTaxSetting[] = [
      {
        id: 'setting-pa-01',
        companyId: 'comp-100',
        jurisdiction: 'PA',
        taxKind: 'SUTA',
        stateAccountId: 'PA-UC-1234567',
        status: 'ACTIVE',
        rateHistories: [
          {
            id: 'hist-pa-2025',
            companyId: 'comp-100',
            companyTaxSettingId: 'setting-pa-01',
            rateDecimal: 0.0385,
            rateBps: 385,
            effectiveFrom: '2025-01-01',
            effectiveTo: '2025-12-31',
            noticeReference: 'PA Form UC-657 (2025)',
            status: 'ACTIVE',
          },
          {
            id: 'hist-pa-2026',
            companyId: 'comp-100',
            companyTaxSettingId: 'setting-pa-01',
            rateDecimal: 0.04125,
            rateBps: 413,
            effectiveFrom: '2026-01-01',
            effectiveTo: null,
            noticeReference: 'PA Form UC-657 (2026)',
            status: 'ACTIVE',
          },
        ],
      },
      {
        id: 'setting-nj-01',
        companyId: 'comp-100',
        jurisdiction: 'NJ',
        taxKind: 'SUTA',
        stateAccountId: 'NJ-DOL-998877',
        status: 'ACTIVE',
        rateHistories: [
          {
            id: 'hist-nj-2026',
            companyId: 'comp-100',
            companyTaxSettingId: 'setting-nj-01',
            rateDecimal: 0.032,
            rateBps: 320,
            effectiveFrom: '2026-01-01',
            effectiveTo: null,
            noticeReference: 'NJ Form NJ-927 Notice',
            status: 'ACTIVE',
          },
        ],
      },
    ];

    it('resolves assigned experience rate when matching setting exists', () => {
      const res = resolveSutaRate({
        stateCode: 'PA',
        companyTaxSettings: mockCompanySettings,
        effectiveDate: new Date('2026-03-15'),
      });

      expect(res.source).toBe('ASSIGNED_EXPERIENCE_RATE');
      expect(res.rate).toBe(0.04125);
      expect(res.rateBps).toBe(413);
      expect(res.state).toBe('PA');
      expect(res.noticeReference).toBe('PA Form UC-657 (2026)');
      expect(res.wageCap).toBe(10000);
      expect(res.settingId).toBe('setting-pa-01');
      expect(res.historyId).toBe('hist-pa-2026');
    });

    it('falls back to statutory default when company has no settings for jurisdiction', () => {
      const res = resolveSutaRate({
        stateCode: 'DE',
        companyTaxSettings: mockCompanySettings,
        effectiveDate: new Date('2026-03-15'),
      });

      expect(res.source).toBe('STATUTORY_DEFAULT');
      expect(res.rate).toBe(0.023);
      expect(res.rateBps).toBe(230);
      expect(res.state).toBe('DE');
      expect(res.wageCap).toBe(10500);
      expect(res.noticeReference).toBeNull();
    });

    it('supports multi-state discrete resolution for PA and NJ', () => {
      const paRes = resolveSutaRate({
        stateCode: 'PA',
        companyTaxSettings: mockCompanySettings,
        effectiveDate: new Date('2026-06-01'),
      });
      const njRes = resolveSutaRate({
        stateCode: 'NJ',
        companyTaxSettings: mockCompanySettings,
        effectiveDate: new Date('2026-06-01'),
      });

      expect(paRes.rate).toBe(0.04125);
      expect(paRes.source).toBe('ASSIGNED_EXPERIENCE_RATE');
      expect(njRes.rate).toBe(0.032);
      expect(njRes.source).toBe('ASSIGNED_EXPERIENCE_RATE');
    });

    it('handles effective dates correctly across prior and current revisions', () => {
      const pastRes = resolveSutaRate({
        stateCode: 'PA',
        companyTaxSettings: mockCompanySettings,
        effectiveDate: new Date('2025-06-15'),
      });

      expect(pastRes.source).toBe('ASSIGNED_EXPERIENCE_RATE');
      expect(pastRes.rate).toBe(0.0385);
      expect(pastRes.noticeReference).toBe('PA Form UC-657 (2025)');

      const currentRes = resolveSutaRate({
        stateCode: 'PA',
        companyTaxSettings: mockCompanySettings,
        effectiveDate: new Date('2026-02-01'),
      });

      expect(currentRes.source).toBe('ASSIGNED_EXPERIENCE_RATE');
      expect(currentRes.rate).toBe(0.04125);
      expect(currentRes.noticeReference).toBe('PA Form UC-657 (2026)');
    });
  });

  describe('createSutaAuditEntry', () => {
    it('generates structured audit log entry with formatted percentages', () => {
      const audit = createSutaAuditEntry({
        companyId: 'comp-100',
        actorId: 'usr-admin-01',
        stateCode: 'PA',
        oldRate: 0.0385,
        newRate: 0.04125,
        noticeReference: 'PA Form UC-657 (2026)',
        effectiveFrom: '2026-01-01',
      });

      expect(audit.companyId).toBe('comp-100');
      expect(audit.actorId).toBe('usr-admin-01');
      expect(audit.action).toBe('UPDATE_SUTA_RATE');
      expect(audit.details.jurisdiction).toBe('PA');
      expect(audit.details.previousRatePercent).toBe('3.850%');
      expect(audit.details.newRatePercent).toBe('4.125%');
      expect(audit.details.noticeReference).toBe('PA Form UC-657 (2026)');
      expect(audit.details.effectiveFrom).toBe('2026-01-01');
    });
  });
});
