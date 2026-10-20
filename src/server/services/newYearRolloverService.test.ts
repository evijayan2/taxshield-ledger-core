import { describe, it, expect } from 'vitest';
import { processNewYearRollover } from './newYearRolloverService';
import { Company, Employee } from '../../types';

describe('New-Year Setup Rollover Service', () => {
  const company: Company = {
    id: 'comp-2026',
    name: 'Roll-over LLC',
    ein: '99-8877665',
    stateTaxId: 'PA-123456',
    address: '200 Market St',
    city: 'Philadelphia',
    state: 'PA',
    zip: '19106',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@example.com',
    payFrequency: 'BI_WEEKLY',
  };

  const employees: Employee[] = [
    {
      id: 'emp-1',
      firstName: 'Alice',
      lastName: 'Vance',
      email: 'alice@example.com',
      phone: '555-0199',
      ssnLastFour: '9999',
      state: 'PA',
      workState: 'PA',
      employmentType: 'W2_HOURLY',
      payRate: 32,
      w4FilingStatus: 'SINGLE',
      w4MultipleJobs: false,
      w4DependentCredit: 0,
      w4OtherIncome: 0,
      w4Deductions: 0,
      w4ExtraWithholding: 0,
      isActive: true,
      paPsdCode: '510101',
    },
  ];

  it('should process 5-step rollover from 2026 to 2027 and generate 26 periods', () => {
    const { summary, steps } = processNewYearRollover(company, employees, 2026, 2027);

    expect(summary.fromYear).toBe(2026);
    expect(summary.toYear).toBe(2027);
    expect(summary.calendarPeriodsGenerated).toBe(26);
    expect(summary.activeEmployeesMigrated).toBe(1);
    expect(summary.coverageReadiness).toBe(100);

    expect(steps.length).toBe(5);
    expect(steps.every((s) => s.status === 'COMPLETED')).toBe(true);
  });

  it('should throw error if target tax year is not strictly greater than current tax year', () => {
    expect(() => processNewYearRollover(company, employees, 2026, 2026)).toThrow('strictly greater');
  });
});
