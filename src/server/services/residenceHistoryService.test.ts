import { describe, it, expect } from 'vitest';
import { resolvePayPeriodResidences, calculateWorkdays, calculateCalendarDays } from './residenceHistoryService';
import { Employee, EmployeeResidenceHistory } from '../../types';

describe('residenceHistoryService', () => {
  const dummyEmployee: Employee = {
    id: 'emp-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '555-1234',
    ssnLastFour: '1234',
    streetAddress: '100 Main St',
    city: 'Pittsburgh',
    state: 'PA',
    zip: '15201',
    employmentType: 'W2_SALARY',
    payRate: 100000,
    w4FilingStatus: 'SINGLE',
    w4MultipleJobs: false,
    w4DependentCredit: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    w4ExtraWithholding: 0,
    localTaxJurisdictionCode: '700101',
    localTaxJurisdictionName: 'Pittsburgh SD',
    localTaxRate: 0.03,
    isActive: true,
  };

  it('calculates workdays and calendar days correctly', () => {
    // 2026-09-01 (Tuesday) to 2026-09-14 (Monday): 14 calendar days, 10 workdays
    expect(calculateCalendarDays('2026-09-01', '2026-09-14')).toBe(14);
    expect(calculateWorkdays('2026-09-01', '2026-09-14')).toBe(10);
  });

  it('returns single interval when no residence history exists', () => {
    const intervals = resolvePayPeriodResidences(dummyEmployee, [], '2026-09-01', '2026-09-14');

    expect(intervals.length).toBe(1);
    expect(intervals[0].startDate).toBe('2026-09-01');
    expect(intervals[0].endDate).toBe('2026-09-14');
    expect(intervals[0].workdays).toBe(10);
    expect(intervals[0].psdCode).toBe('700101');
    expect(intervals[0].localTaxRate).toBe(0.03);
  });

  it('splits bi-weekly pay period when employee moves mid-period (SD A to SD B)', () => {
    const history: EmployeeResidenceHistory[] = [
      {
        id: 'hist-1',
        employeeId: 'emp-1',
        streetAddress: '100 Main St',
        city: 'Pittsburgh',
        state: 'PA',
        zip: '15201',
        psdCode: '700101',
        localJurisdictionName: 'Pittsburgh SD',
        localTaxRate: 0.03,
        effectiveDate: '2026-01-01',
        endDate: '2026-09-07',
      },
      {
        id: 'hist-2',
        employeeId: 'emp-1',
        streetAddress: '200 Mt Lebanon Blvd',
        city: 'Pittsburgh',
        state: 'PA',
        zip: '15228',
        psdCode: '700204',
        localJurisdictionName: 'Mt Lebanon SD',
        localTaxRate: 0.015,
        effectiveDate: '2026-09-08',
        endDate: null,
      },
    ];

    // Pay period Sept 1 to Sept 14
    const intervals = resolvePayPeriodResidences(dummyEmployee, history, '2026-09-01', '2026-09-14');

    expect(intervals.length).toBe(2);

    // Sub-interval 1: Sept 1 to Sept 7 (SD A)
    expect(intervals[0].startDate).toBe('2026-09-01');
    expect(intervals[0].endDate).toBe('2026-09-07');
    expect(intervals[0].psdCode).toBe('700101');
    expect(intervals[0].localTaxRate).toBe(0.03);
    expect(intervals[0].workdays).toBe(5); // Tue-Fri + Mon Sept 7

    // Sub-interval 2: Sept 8 to Sept 14 (SD B)
    expect(intervals[1].startDate).toBe('2026-09-08');
    expect(intervals[1].endDate).toBe('2026-09-14');
    expect(intervals[1].psdCode).toBe('700204');
    expect(intervals[1].localTaxRate).toBe(0.015);
    expect(intervals[1].workdays).toBe(5); // Tue-Fri + Mon Sept 14
  });
});
