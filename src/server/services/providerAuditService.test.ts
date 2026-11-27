import { describe, it, expect } from 'vitest';
import { compareProviderRow, generateProviderAuditReport } from './providerAuditService';
import type { Employee, CompanyTaxSetting } from '../../types';
import type { ProviderPayrollRow } from '../../providerAuditTypes';

describe('providerAuditService', () => {
  const sampleEmployee: Employee = {
    id: 'emp_audit_1',
    companyId: 'comp_1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '555-1234',
    ssnLastFour: '1234',
    employmentType: 'W2_HOURLY',
    payRate: 50,
    payFrequency: 'SEMI_MONTHLY',
    w4FilingStatus: 'SINGLE',
    w4MultipleJobs: false,
    w4DependentCredit: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    w4ExtraWithholding: 0,
    state: 'PA',
    workState: 'PA',
    paPsdCode: '460401',
    paPsdName: 'Lower Merion Township',
    paResidentEitRate: 0.0100,
    paWorkPsdCode: '460401',
    paWorkEitRate: 0.0100,
    isActive: true,
    isTwoPercentShareholder: false,
  };

  it('evaluates clean match when provider withholding matches rules', () => {
    const row: ProviderPayrollRow = {
      employeeName: 'Jane Doe',
      ssnLast4: '1234',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-15',
      checkDate: '2026-08-15',
      grossWages: 2000,
      fitWithheld: 172.58,
      ficaSsWithheld: 124.0,
      ficaMedWithheld: 29.0,
      stateWithheld: 61.4,
      localWithheld: 20.0,
      netPay: 1593.02,
    };
    const res = compareProviderRow(row, sampleEmployee);
    expect(res.employeeName).toBe('Jane Doe');
    expect(res.variances.find((v) => v.fieldName === 'ficaSs')?.category).toBe('MATCH');
    expect(res.variances.find((v) => v.fieldName === 'ficaMed')?.category).toBe('MATCH');
  });

  it('tolerates small rounding drift within $0.05', () => {
    const row: ProviderPayrollRow = {
      employeeName: 'Jane Doe',
      ssnLast4: '1234',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-15',
      checkDate: '2026-08-15',
      grossWages: 2000,
      fitWithheld: 172.6, // $0.02 drift
      ficaSsWithheld: 124.03, // $0.03 drift
      ficaMedWithheld: 29.01,
      stateWithheld: 61.4,
      localWithheld: 20.0,
      netPay: 1592.96,
    };
    const res = compareProviderRow(row, sampleEmployee);
    const ssVar = res.variances.find((v) => v.fieldName === 'ficaSs');
    expect(ssVar?.category).toBe('ROUNDING_DRIFT');
  });

  it('detects and flags IRC § 1372 S-Corp shareholder health insurance error', () => {
    const sCorpOwner: Employee = {
      ...sampleEmployee,
      isTwoPercentShareholder: true,
    };
    const row: ProviderPayrollRow = {
      employeeName: 'Jane Doe',
      ssnLast4: '1234',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-15',
      checkDate: '2026-08-15',
      grossWages: 3000,
      fitWithheld: 300,
      ficaSsWithheld: 217.0, // Erroneously withheld FICA on $3,000 + $500 health
      ficaMedWithheld: 50.75,
      stateWithheld: 92.1,
      localWithheld: 30.0,
      netPay: 2310.15,
      sCorpHealth: 500,
    };
    const res = compareProviderRow(row, sCorpOwner);
    expect(res.status).toBe('CRITICAL_DISCREPANCY');
    const healthVar = res.variances.find((v) => v.category === 'S_CORP_HEALTH_ERROR');
    expect(healthVar).toBeDefined();
    expect(healthVar?.statutoryCitation).toContain('IRC § 1372');
  });

  it('flags SUTA rate mismatch when provider differs from company assigned rate', () => {
    const settings: CompanyTaxSetting[] = [
      {
        id: 'set_1',
        companyId: 'comp_1',
        jurisdiction: 'PA',
        taxKind: 'SUTA',
        status: 'ACTIVE',
        rateHistories: [
          {
            id: 'rh_1',
            companyId: 'comp_1',
            companyTaxSettingId: 'set_1',
            rateBps: 412.5,
            rateDecimal: 0.04125,
            effectiveFrom: '2026-01-01',
            status: 'ACTIVE',
          },
        ],
      },
    ];
    const row: ProviderPayrollRow = {
      employeeName: 'Jane Doe',
      ssnLast4: '1234',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-15',
      checkDate: '2026-08-15',
      grossWages: 2000,
      fitWithheld: 172.58,
      ficaSsWithheld: 124.0,
      ficaMedWithheld: 29.0,
      stateWithheld: 61.4,
      localWithheld: 20.0,
      netPay: 1593.02,
      employerSuta: 70.0, // Applied 3.50% instead of 4.125% ($82.50)
    };
    const res = compareProviderRow(row, sampleEmployee, settings);
    const sutaVar = res.variances.find((v) => v.category === 'SUTA_RATE_MISMATCH');
    expect(sutaVar).toBeDefined();
    expect(sutaVar?.statutoryCitation).toContain('43 P.S. § 781');
  });

  it('generates a full ProviderAuditReport aggregating multiple lines', () => {
    const rows: ProviderPayrollRow[] = [
      {
        employeeName: 'Jane Doe',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-15',
        checkDate: '2026-08-15',
        grossWages: 2000,
        fitWithheld: 172.58,
        ficaSsWithheld: 124.0,
        ficaMedWithheld: 29.0,
        stateWithheld: 61.4,
        localWithheld: 20.0,
        netPay: 1593.02,
      },
    ];
    const report = generateProviderAuditReport('comp_1', rows, [sampleEmployee], undefined, 'GUSTO');
    expect(report.companyId).toBe('comp_1');
    expect(report.provider).toBe('GUSTO');
    expect(report.totalGross).toBe(2000);
    expect(report.comparisons.length).toBe(1);
    expect(report.summaryExplanation).toContain('1 rows audited');
  });
});
