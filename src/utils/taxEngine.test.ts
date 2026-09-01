import { describe, it, expect } from 'vitest';
import { calculateGrossToNet, getActiveRates, getRecordYear, getTaskTaxYear, createDefaultComplianceTasks, isFutureYear, isFutureDateString, getCurrentCalendarYear } from './taxEngine';
import { Employee } from '../types';

const baseEmployee: Employee = {
  id: 'emp_test_1',
  firstName: 'Vighnesh',
  lastName: 'Pillai',
  age: 16,
  relationshipToOwner: 'CHILD_UNDER_18',
  email: 'vighnesh@example.com',
  phone: '(555) 123-4567',
  ssnLastFour: '9876',
  employmentType: 'W2_HOURLY',
  payRate: 15.00,
  payFrequency: 'SEMI_MONTHLY',
  w4FilingStatus: 'SINGLE',
  w4MultipleJobs: false,
  w4DependentCredit: 0,
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
  bankName: 'Wells Fargo',
  accountType: 'CHECKING',
  routingNumber: '121000248',
  accountNumber: '555444333',
  bankAccountMasked: '•••• 4333',
  isActive: true,
};

describe('Tax Engine Family Relation Exemptions', () => {
  it('should exempt Child Under 18 from FICA (Social Security & Medicare) and PA UC', () => {
    const hours = 40; // $600 gross earnings
    const result = calculateGrossToNet(baseEmployee, hours);
    const rates = getActiveRates();

    expect(result.grossEarnings).toBe(600);
    // Child Under 18 FICA exemption check
    expect(result.isFicaExempt).toBe(true);
    expect(result.isPaUcExempt).toBe(true);
    expect(result.socialSecurityTax).toBe(0);
    expect(result.medicareTax).toBe(0);
    expect(result.employerSocialSecurity).toBe(0);
    expect(result.employerMedicare).toBe(0);
    expect(result.employerPaUc).toBe(0);

    // PA State Income Tax (3.07%) should still apply
    expect(result.paStateTax).toBe(Math.round(600 * rates.paSitRate * 100) / 100); // $18.42
  });

  it('should calculate FICA for standard unrelated employee', () => {
    const unrelatedEmp: Employee = {
      ...baseEmployee,
      age: 25,
      relationshipToOwner: 'NONE',
    };
    const hours = 40; // $600 gross earnings
    const result = calculateGrossToNet(unrelatedEmp, hours);
    const rates = getActiveRates();

    expect(result.isFicaExempt).toBe(false);
    expect(result.isPaUcExempt).toBe(false);
    expect(result.socialSecurityTax).toBe(Math.round(600 * rates.socialSecurityRate * 100) / 100); // $37.20
    expect(result.medicareTax).toBe(Math.round(600 * rates.medicareRate * 100) / 100); // $8.70
    expect(result.employerPaUc).toBeGreaterThan(0);
  });

  it('should exempt Spouse from PA UC but keep FICA active', () => {
    const spouseEmp: Employee = {
      ...baseEmployee,
      age: 35,
      relationshipToOwner: 'SPOUSE',
    };
    const result = calculateGrossToNet(spouseEmp, 40);

    expect(result.isFicaExempt).toBe(false);
    expect(result.isPaUcExempt).toBe(true);
    expect(result.socialSecurityTax).toBeGreaterThan(0);
    expect(result.employerPaUc).toBe(0);
  });
});

describe('Tax Year Helper Utilities', () => {
  it('should parse year correctly with getRecordYear', () => {
    expect(getRecordYear('2027-05-12')).toBe(2027);
    expect(getRecordYear('2026 Q3')).toBe(2026);
    expect(getRecordYear()).toBe(getCurrentCalendarYear());
  });

  it('should resolve compliance task tax year with getTaskTaxYear', () => {
    expect(getTaskTaxYear({ taxYear: 2027, taxPeriodLabel: '2027 Q1', dueDate: '2027-04-30' } as any)).toBe(2027);
    expect(getTaskTaxYear({ taxPeriodLabel: '2026 Annual Filing', dueDate: '2027-01-31' } as any)).toBe(2026);
  });

  it('should identify future tax years and future date strings', () => {
    const currentYear = getCurrentCalendarYear();
    expect(isFutureYear(currentYear + 1)).toBe(true);
    expect(isFutureYear(currentYear)).toBe(false);
    expect(isFutureYear(2020)).toBe(false);

    expect(isFutureDateString(`${currentYear + 1}-06-15`)).toBe(true);
    expect(isFutureDateString(`${currentYear}-06-15`)).toBe(false);
  });

  it('should create default baseline compliance tasks for specified tax year', () => {
    const tasks2027 = createDefaultComplianceTasks(2027);
    expect(tasks2027.length).toBe(5);
    expect(tasks2027.every(t => t.taxYear === 2027)).toBe(true);
    expect(tasks2027[0].dueDate).toContain('2027');
  });
});

describe('Delaware Multi-State Tax Calculations', () => {
  it('should calculate DE state income tax and DE SUTA for Delaware employee', () => {
    const deEmployee: Employee = {
      ...baseEmployee,
      state: 'DE',
      workState: 'DE',
      localTaxJurisdictionCode: 'DE-LOCAL-WILMINGTON',
      localTaxJurisdictionName: 'City of Wilmington',
      localTaxRate: 0.0125,
      relationshipToOwner: 'NONE',
    };

    const result = calculateGrossToNet(deEmployee, 40); // $600 gross
    expect(result.stateCode).toBe('DE');
    expect(result.localityName).toBe('City of Wilmington');
    expect(result.stateIncomeTax).toBeGreaterThan(0);
    expect(result.localIncomeTax).toBe(Math.round(600 * 0.0125 * 100) / 100);
    expect(result.employerStateUnemployment).toBeGreaterThan(0);
    expect(result.taxBreakdown).toBeDefined();
    expect((result.taxBreakdown as any).state.code).toBe('DE');
  });
});


