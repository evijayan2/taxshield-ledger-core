import { describe, it, expect } from 'vitest';
import {
  calculateStatutoryDueDate,
  generateTXPAddenda,
  getQuarterEndDate,
  parseDateParts,
  decomposePayStubsToLiabilities,
  buildFederal941Bundle,
  buildStateRemittanceSummaries,
} from './payrollLiabilityService';
import type { PayStub } from '../../types';

describe('payrollLiabilityService', () => {
  it('parses date parts without timezone shift and calculates deterministic due dates', () => {
    // 1st of month parsing check
    const parts = parseDateParts('2026-08-01');
    expect(parts).toEqual({ year: 2026, month: 8, day: 1 });

    // Federal 941 monthly: 15th of following month
    expect(calculateStatutoryDueDate('FIT', '2026-08-01')).toBe('2026-09-15');
    expect(calculateStatutoryDueDate('FIT', '2026-08-31')).toBe('2026-09-15');
    expect(calculateStatutoryDueDate('FICA_SS', '2026-12-15')).toBe('2027-01-15');

    // SUTA / Local quarterly: last day of month following quarter end
    expect(calculateStatutoryDueDate('PA_UC_EMPLOYER', '2026-02-15')).toBe('2026-04-30'); // Q1
    expect(calculateStatutoryDueDate('PA_EIT', '2026-05-20')).toBe('2026-07-31'); // Q2
    expect(calculateStatutoryDueDate('SUTA', '2026-08-15')).toBe('2026-10-31'); // Q3
    expect(calculateStatutoryDueDate('PA_UC_EMPLOYER', '2026-11-20')).toBe('2027-01-31'); // Q4
  });

  it('computes official calendar quarter end date correctly', () => {
    expect(getQuarterEndDate('2026-01-15')).toBe('2026-03-31');
    expect(getQuarterEndDate('2026-05-20')).toBe('2026-06-30');
    expect(getQuarterEndDate('2026-08-15')).toBe('2026-09-30');
    expect(getQuarterEndDate('2026-11-20')).toBe('2026-12-31');
  });

  it('generates exact 80-character NACHA CCD+ TXP addenda string', () => {
    const txp = generateTXPAddenda(
      {
        taxId: '12-3456789',
        taxTypeCode: '01101',
        taxPeriodEnd: '2026-09-30',
        amount: 1165.0,
        taxQualifier: 'M',
      },
      true
    );
    expect(txp.length).toBe(80);
    expect(txp.startsWith('TXP*123456789*01101*260930*116500*M*~')).toBe(true);
    expect(txp.endsWith(' ')).toBe(true);
  });

  it('decomposes approved paystubs into discrete statutory liabilities', () => {
    const mockStubs: Partial<PayStub>[] = [
      {
        id: 'stub_1',
        federalIncomeTax: 200,
        socialSecurityTax: 155,
        employerSocialSecurity: 155,
        medicareTax: 72.5,
        employerMedicare: 72.5,
        paStateTax: 76.75,
        employerPaUc: 87.5,
      },
      {
        id: 'stub_2',
        federalIncomeTax: 200,
        socialSecurityTax: 155,
        employerSocialSecurity: 155,
        medicareTax: 72.5,
        employerMedicare: 72.5,
        paStateTax: 76.75,
        employerPaUc: 87.5,
      },
    ];

    const liabilities = decomposePayStubsToLiabilities({
      companyId: 'comp_1',
      payrollRunId: 'run_1',
      payDate: '2026-08-31',
      periodEnd: '2026-08-31',
      payStubs: mockStubs as PayStub[],
    });

    expect(liabilities.length).toBe(5);
    const fit = liabilities.find((l) => l.taxType === 'FIT');
    const ss = liabilities.find((l) => l.taxType === 'FICA_SS');
    const med = liabilities.find((l) => l.taxType === 'FICA_MED');
    const pit = liabilities.find((l) => l.taxType === 'PA_PIT');
    const uc = liabilities.find((l) => l.taxType === 'PA_UC_EMPLOYER');

    expect(fit?.amount).toBe(400);
    expect(ss?.amount).toBe(620);
    expect(med?.amount).toBe(290);
    expect(pit?.amount).toBe(153.5);
    expect(uc?.amount).toBe(175);
  });

  it('handles empty stubs gracefully by returning empty array', () => {
    const liabilities = decomposePayStubsToLiabilities({
      companyId: 'comp_1',
      payrollRunId: 'run_empty',
      payDate: '2026-08-31',
      periodEnd: '2026-08-31',
      payStubs: [],
    });
    expect(liabilities).toEqual([]);
  });

  it('aggregates Federal 941 bundle correctly and sets quarter end date on TXP', () => {
    const mockStubs: Partial<PayStub>[] = [
      {
        federalIncomeTax: 400,
        socialSecurityTax: 310,
        employerSocialSecurity: 310,
        medicareTax: 72.5,
        employerMedicare: 72.5,
      },
    ];

    const liabilities = decomposePayStubsToLiabilities({
      companyId: 'comp_1',
      payrollRunId: 'run_1',
      payDate: '2026-08-15',
      periodEnd: '2026-08-15',
      payStubs: mockStubs as PayStub[],
    });

    const bundle = buildFederal941Bundle(liabilities, '12-3456789', '2026-08-15');
    expect(bundle.totalAmount).toBe(1165.0);
    expect(bundle.fitAmount).toBe(400);
    expect(bundle.ficaSsAmount).toBe(620);
    expect(bundle.ficaMedAmount).toBe(145);
    expect(bundle.taxPeriodEnd).toBe('2026-09-30'); // Q3 calendar quarter end
    expect(bundle.txpAddenda.startsWith('TXP*123456789*01101*260930*116500*M*~')).toBe(true);
    expect(bundle.isSettled).toBe(false);
  });

  it('generates state remittance summaries with portal links and PA SIT TXP', () => {
    const mockStubs: Partial<PayStub>[] = [
      {
        paStateTax: 153.5,
        employerPaUc: 175.0,
      },
    ];

    const liabilities = decomposePayStubsToLiabilities({
      companyId: 'comp_1',
      payrollRunId: 'run_1',
      payDate: '2026-08-31',
      periodEnd: '2026-08-31',
      payStubs: mockStubs as PayStub[],
    });

    const summaries = buildStateRemittanceSummaries(liabilities, { stateTaxId: '12345678' });
    expect(summaries.length).toBe(2);
    const pit = summaries.find((s) => s.taxType === 'PA_PIT');
    const uc = summaries.find((s) => s.taxType === 'PA_UC_EMPLOYER');

    expect(pit?.amount).toBe(153.5);
    expect(pit?.txpAddenda).toBeDefined();
    expect(pit?.portalName).toBe('PA myPATH');
    expect(uc?.amount).toBe(175.0);
    expect(uc?.portalName).toBe('PA UC Portal');
  });
});
