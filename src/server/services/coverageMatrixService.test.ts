import { describe, it, expect } from 'vitest';
import { generateTaxRuleCoverageReport } from './coverageMatrixService';
import { Company, Employee } from '../../types';

describe('Tax Rule Coverage Matrix Service', () => {
  const baseCompany: Company = {
    id: 'comp-101',
    name: 'Acme Micro LLC',
    ein: '12-3456789',
    stateTaxId: 'PA-998877',
    address: '100 Main St',
    city: 'Philadelphia',
    state: 'PA',
    zip: '19103',
    ownerName: 'Jane Doe',
    ownerEmail: 'jane@example.com',
  };

  const employees: Employee[] = [
    {
      id: 'emp-1',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      phone: '555-0101',
      ssnLastFour: '1111',
      state: 'PA',
      workState: 'PA',
      employmentType: 'W2_HOURLY',
      payRate: 30,
      w4FilingStatus: 'SINGLE',
      w4MultipleJobs: false,
      w4DependentCredit: 0,
      w4OtherIncome: 0,
      w4Deductions: 0,
      w4ExtraWithholding: 0,
      isActive: true,
      paPsdCode: '510101',
    },
    {
      id: 'emp-2',
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@example.com',
      phone: '555-0102',
      ssnLastFour: '2222',
      state: 'NJ',
      workState: 'NJ',
      employmentType: 'W2_HOURLY',
      payRate: 40,
      w4FilingStatus: 'MARRIED_FILING_JOINTLY',
      w4MultipleJobs: false,
      w4DependentCredit: 0,
      w4OtherIncome: 0,
      w4Deductions: 0,
      w4ExtraWithholding: 0,
      isActive: true,
    },
  ];

  it('should generate coverage report with high readiness score when sealed packages are active', () => {
    const report = generateTaxRuleCoverageReport(baseCompany, employees, 2026);

    expect(report.companyId).toBe('comp-101');
    expect(report.taxYear).toBe(2026);
    expect(report.totalRequiredJurisdictions).toBeGreaterThan(0);
    expect(report.activeCount).toBeGreaterThan(0);
    expect(report.readinessPercentage).toBe(100);
    expect(report.isPayrollBlocked).toBe(false);
  });

  it('should flag unsupported jurisdiction as missing and block payroll', () => {
    const empWyoming: Employee = {
      ...employees[0],
      id: 'emp-3',
      workState: 'WY_UNKNOWN',
    };

    const report = generateTaxRuleCoverageReport(baseCompany, [empWyoming], 2026);

    expect(report.missingCount).toBeGreaterThan(0);
    expect(report.isPayrollBlocked).toBe(true);
    expect(report.blockingJurisdictions.length).toBeGreaterThan(0);
  });
});
