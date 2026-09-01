import { describe, it, expect } from 'vitest';
import { calculateGrossToNet, calculateFederalIncomeTax } from '../../src/utils/taxEngine';
import { resolveActiveRuleSync } from '../../src/server/rules-engine/taxRulesEngine';
import { validateSourceCitation } from '../../src/server/services/taxRuleService';
import { Employee } from '../../src/types';
import { CitationTier } from '@prisma/client';

const mockEmployee: Employee = {
  id: 'emp_regression_1',
  firstName: 'Natarajan',
  lastName: 'Vijayanathan',
  age: 30,
  relationshipToOwner: 'NONE',
  email: 'natarajan@impactflow.com',
  phone: '(555) 123-4567',
  ssnLastFour: '1234',
  employmentType: 'W2_HOURLY',
  payRate: 25.00,
  payFrequency: 'BI_WEEKLY',
  w4FilingStatus: 'MARRIED_FILING_JOINTLY',
  w4MultipleJobs: false,
  w4DependentCredit: 2000,
  w4OtherIncome: 0,
  w4Deductions: 0,
  w4ExtraWithholding: 0,
  paPsdCode: '460401',
  paPsdName: 'Lower Merion Township',
  paResidentEitRate: 0.0100,
  paWorkPsdCode: '460401',
  paWorkEitRate: 0.0100,
  paLstAnnual: 52.00,
  paLstExempt: false,
  bankName: 'PNC Bank',
  accountType: 'CHECKING',
  routingNumber: '031000053',
  accountNumber: '123456789',
  bankAccountMasked: '•••• 6789',
  isActive: true,
};

describe('Tax Rule Engine Regression Suite', () => {
  it('Regression 1: PA State Income Tax flat rate (3.07%)', () => {
    const paRule = resolveActiveRuleSync('PA-STATE', 'PA_SIT_RATE');
    expect(paRule.payload.rate).toBe(0.0307);

    const gross = 2000;
    const expectedPaSit = Math.round(gross * 0.0307 * 100) / 100; // $61.40
    const calc = calculateGrossToNet(mockEmployee, 80);
    expect(calc.paStateTax).toBe(expectedPaSit);
  });

  it('Regression 2: Federal Withholding Bracket Calculation', () => {
    // Bi-weekly gross pay $2,000 => $52,000 annualized
    // MFJ Standard allowance $29,200 => Taxable $22,800 <= $23,200 bracket (10%)
    // Annual tax = $2,280 - $2,000 dependent credit = $280 / 26 = $10.77
    const fitTax = calculateFederalIncomeTax(2000, 'BI_WEEKLY', 'MARRIED_FILING_JOINTLY', false, 2000);
    expect(fitTax).toBe(10.77);
  });

  it('Regression 3: FICA Social Security (6.2%) and Medicare (1.45%)', () => {
    const ssRule = resolveActiveRuleSync('US-FED', 'FED_FICA_SS');
    const medRule = resolveActiveRuleSync('US-FED', 'FED_FICA_MEDICARE');

    expect(ssRule.payload.rate).toBe(0.062);
    expect(medRule.payload.rate).toBe(0.0145);

    const calc = calculateGrossToNet(mockEmployee, 80); // $2000 gross
    expect(calc.socialSecurityTax).toBe(124.00); // 2000 * 0.062
    expect(calc.medicareTax).toBe(29.00); // 2000 * 0.0145
  });

  it('Regression 4: Child Under 18 FICA and PA UC Exemptions', () => {
    const childEmp: Employee = {
      ...mockEmployee,
      age: 16,
      relationshipToOwner: 'CHILD_UNDER_18',
    };
    const calc = calculateGrossToNet(childEmp, 40); // $1000 gross
    expect(calc.isFicaExempt).toBe(true);
    expect(calc.isPaUcExempt).toBe(true);
    expect(calc.socialSecurityTax).toBe(0);
    expect(calc.medicareTax).toBe(0);
    expect(calc.employerPaUc).toBe(0);
  });

  it('Regression 5: IRS Standard Mileage Rate ($0.67/mi)', () => {
    const mileageRule = resolveActiveRuleSync('US-FED', 'IRS_MILEAGE');
    expect(mileageRule.payload.ratePerMile).toBe(0.67);

    const miles = 150;
    const reimbursement = Math.round(miles * (mileageRule.payload.ratePerMile ?? 0) * 100) / 100;
    expect(reimbursement).toBe(100.50);
  });

  it('Regression 6: Mandatory Source Citation Validation Gate', () => {
    const validCitation = {
      sourceTitle: 'IRS Publication 15-T',
      sourceUrl: 'https://www.irs.gov/pub/irs-pdf/p15t.pdf',
      sourcePublisher: 'Internal Revenue Service',
      statuteReference: '26 U.S. Code § 3402',
      citationTier: CitationTier.TIER_1_OFFICIAL,
    };

    expect(() => validateSourceCitation(validCitation)).not.toThrow();

    const invalidCitation = { ...validCitation, sourceUrl: '' };
    expect(() => validateSourceCitation(invalidCitation)).toThrow(
      'TaxRule contribution requires sourceUrl citation'
    );
  });
});
