import { describe, it, expect } from 'vitest';
import {
  calculateBenefitDeductions,
  clampBenefitDeductions,
  resolvePlanTaxTreatment,
} from './benefitDeductionEngine';
import { EmployeeBenefitElection } from '../../types';

describe('Benefit Deduction Engine - Statutory Cascades & IRC § 1372', () => {
  it('Scenario 1: Section 125 Health reduces FIT, FICA, and PA-PIT for standard employee', () => {
    const gross = 2000;
    const elections: EmployeeBenefitElection[] = [
      {
        planType: 'SECTION_125_HEALTH',
        planName: 'Standard Health PPO',
        amountType: 'FIXED',
        amount: 200,
      },
    ];

    const result = calculateBenefitDeductions(gross, elections, { isShareholderGreaterThan2Pct: false });

    expect(result.wageBases.fitTaxableWages).toBe(1800);
    expect(result.wageBases.ssTaxableWages).toBe(1800);
    expect(result.wageBases.medicareTaxableWages).toBe(1800);
    expect(result.wageBases.stateTaxableWages).toBe(1800);
    expect(result.wageBases.localTaxableWages).toBe(1800);
    expect(result.totalPreTaxDeductions).toBe(200);
    expect(result.totalPostTaxDeductions).toBe(0);
    expect(result.totalDeductions).toBe(200);
  });

  it('Scenario 2: Section 401(k) Traditional reduces FIT but NOT FICA or PA-PIT', () => {
    const gross = 2000;
    const elections: EmployeeBenefitElection[] = [
      {
        planType: 'RETIREMENT_401K_TRADITIONAL',
        planName: 'Traditional 401(k)',
        amountType: 'FIXED',
        amount: 150,
      },
    ];

    const result = calculateBenefitDeductions(gross, elections);

    expect(result.wageBases.fitTaxableWages).toBe(1850);
    expect(result.wageBases.ssTaxableWages).toBe(2000);
    expect(result.wageBases.medicareTaxableWages).toBe(2000);
    expect(result.wageBases.stateTaxableWages).toBe(2000);
    expect(result.wageBases.localTaxableWages).toBe(2000);
    expect(result.totalPreTaxDeductions).toBe(150);
  });

  it('Scenario 3: IRC § 1372 >2% S-Corp Shareholder Health is included in FIT but exempt from FICA & PA-PIT', () => {
    const gross = 5000;
    const elections: EmployeeBenefitElection[] = [
      {
        planType: 'SECTION_125_HEALTH',
        planName: 'Owner Health Plan',
        amountType: 'FIXED',
        amount: 500,
        isShareholderGreaterThan2Pct: true,
      },
    ];

    const result = calculateBenefitDeductions(gross, elections, { isShareholderGreaterThan2Pct: true });

    // FIT wages are NOT reduced (included in Box 1)
    expect(result.wageBases.fitTaxableWages).toBe(5000);
    // FICA and PA-PIT are exempt (reduced)
    expect(result.wageBases.ssTaxableWages).toBe(4500);
    expect(result.wageBases.medicareTaxableWages).toBe(4500);
    expect(result.wageBases.stateTaxableWages).toBe(4500);
    expect(result.wageBases.localTaxableWages).toBe(4500);
  });

  it('Scenario 4: Combined Deductions (Sec 125 + 401k + Roth)', () => {
    const gross = 3000;
    const elections: EmployeeBenefitElection[] = [
      {
        planType: 'SECTION_125_HEALTH',
        amountType: 'FIXED',
        amount: 200,
      },
      {
        planType: 'RETIREMENT_401K_TRADITIONAL',
        amountType: 'FIXED',
        amount: 300,
      },
      {
        planType: 'RETIREMENT_401K_ROTH',
        amountType: 'FIXED',
        amount: 100,
      },
    ];

    const result = calculateBenefitDeductions(gross, elections);

    expect(result.wageBases.fitTaxableWages).toBe(2500); // 3000 - 200 - 300
    expect(result.wageBases.ssTaxableWages).toBe(2800);  // 3000 - 200
    expect(result.wageBases.medicareTaxableWages).toBe(2800);
    expect(result.wageBases.stateTaxableWages).toBe(2800);
    expect(result.wageBases.localTaxableWages).toBe(2800);
    expect(result.totalPreTaxDeductions).toBe(500); // 200 + 300
    expect(result.totalPostTaxDeductions).toBe(100); // 100 Roth
    expect(result.totalDeductions).toBe(600);
  });

  it('Scenario 5: Deductions Exceed Net Earnings (Clamp to prevent negative pay)', () => {
    const gross = 500;
    const taxes = 80;
    const availableNet = gross - taxes; // $420
    const elections: EmployeeBenefitElection[] = [
      {
        planType: 'SECTION_125_HEALTH',
        amountType: 'FIXED',
        amount: 300,
      },
      {
        planType: 'POST_TAX_OTHER',
        amountType: 'FIXED',
        amount: 300,
      },
    ];

    const raw = calculateBenefitDeductions(gross, elections);
    expect(raw.totalDeductions).toBe(600);

    const clamped = clampBenefitDeductions(raw, availableNet);

    expect(clamped.clampedDeductions).toBe(420);
    expect(clamped.uncollectedDeductions).toBe(180);
    expect(clamped.itemizedDeductions[0].appliedAmount).toBe(300);
    expect(clamped.itemizedDeductions[0].uncollectedAmount).toBe(0);
    expect(clamped.itemizedDeductions[1].appliedAmount).toBe(120);
    expect(clamped.itemizedDeductions[1].uncollectedAmount).toBe(180);
  });

  it('Calculates percentage-based deductions and caps by annual limit', () => {
    const gross = 4000;
    const elections: EmployeeBenefitElection[] = [
      {
        planType: 'RETIREMENT_401K_TRADITIONAL',
        amountType: 'PERCENTAGE',
        amount: 5, // 5% of 4000 = $200
        annualLimit: 1000,
        ytdDeductions: 900, // Only $100 cap remaining
      },
    ];

    const result = calculateBenefitDeductions(gross, elections);

    expect(result.wageBases.fitTaxableWages).toBe(3900); // Capped at $100
    expect(result.totalDeductions).toBe(100);
  });

  it('Correctly resolves plan tax treatment for all standard benefit types', () => {
    const sec125 = resolvePlanTaxTreatment('SECTION_125_DENTAL', false);
    expect(sec125.isPreTaxFit).toBe(true);
    expect(sec125.isPreTaxFica).toBe(true);
    expect(sec125.isPreTaxState).toBe(true);

    const roth = resolvePlanTaxTreatment('RETIREMENT_401K_ROTH', false);
    expect(roth.isPreTaxFit).toBe(false);
    expect(roth.isPreTaxFica).toBe(false);

    const postTax = resolvePlanTaxTreatment('POST_TAX_OTHER', false);
    expect(postTax.isPreTaxFit).toBe(false);
  });
});
