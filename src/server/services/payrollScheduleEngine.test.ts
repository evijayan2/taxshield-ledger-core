import { describe, it, expect } from 'vitest';
import {
  generateFiscalYearCalendar,
  adjustForWeekendAndHoliday,
  getFederalBankHolidays,
} from './payrollScheduleEngine';

describe('payrollScheduleEngine', () => {
  it('generates 26 periods for BI_WEEKLY schedule in 2026', () => {
    const periods = generateFiscalYearCalendar('c1', 'ty-2026', 2026, {
      payFrequency: 'BI_WEEKLY',
      timesheetCutoffDays: 2,
    });

    expect(periods.length).toBe(26);
    expect(periods[0].periodNumber).toBe(1);
    expect(periods[0].periodStart).toBe('2026-01-01');
    expect(periods[0].periodEnd).toBe('2026-01-14');
    expect(periods[0].timesheetLockDate).toBe('2026-01-16 23:59:59');
    expect(periods[0].status).toBe('PUBLISHED');
  });

  it('generates 24 periods for SEMI_MONTHLY schedule in 2026', () => {
    const periods = generateFiscalYearCalendar('c1', 'ty-2026', 2026, {
      payFrequency: 'SEMI_MONTHLY',
    });

    expect(periods.length).toBe(24);
    expect(periods[0].periodStart).toBe('2026-01-01');
    expect(periods[0].periodEnd).toBe('2026-01-15');
    expect(periods[1].periodStart).toBe('2026-01-16');
    expect(periods[1].periodEnd).toBe('2026-01-31');
  });

  it('generates 12 periods for MONTHLY schedule in 2026', () => {
    const periods = generateFiscalYearCalendar('c1', 'ty-2026', 2026, {
      payFrequency: 'MONTHLY',
    });

    expect(periods.length).toBe(12);
    expect(periods[0].periodStart).toBe('2026-01-01');
    expect(periods[0].periodEnd).toBe('2026-01-31');
    expect(periods[11].periodStart).toBe('2026-12-01');
    expect(periods[11].periodEnd).toBe('2026-12-31');
  });

  it('adjusts weekend pay dates to PREVIOUS_BUSINESS_DAY', () => {
    // 2026-07-04 is Saturday (and Independence Day)
    const adjusted = adjustForWeekendAndHoliday('2026-07-04', 'PREVIOUS_BUSINESS_DAY');
    expect(adjusted).toBe('2026-07-03');
  });

  it('adjusts weekend pay dates to NEXT_BUSINESS_DAY', () => {
    // 2026-07-05 is Sunday
    const adjusted = adjustForWeekendAndHoliday('2026-07-05', 'NEXT_BUSINESS_DAY');
    expect(adjusted).toBe('2026-07-06');
  });

  it('includes federal bank holidays for target year', () => {
    const holidays = getFederalBankHolidays(2026);
    expect(holidays).toContain('2026-01-01');
    expect(holidays).toContain('2026-07-04');
    expect(holidays).toContain('2026-12-25');
  });

  it('calculates BI_WEEKLY periods aligned with anchorPayDate and periodLagDays', () => {
    const periods = generateFiscalYearCalendar('c1', 'ty-2026', 2026, {
      payFrequency: 'BI_WEEKLY',
      anchorPayDate: '2026-01-16', // payday
      periodLagDays: 5,
      timesheetCutoffDays: 2,
    });

    expect(periods.length).toBeGreaterThanOrEqual(26);
    // scheduledPayDate should be 5 days after periodEnd
    expect(periods[0].scheduledPayDate).toBe('2026-01-16');
    expect(periods[0].periodEnd).toBe('2026-01-11');
    expect(periods[0].periodStart).toBe('2025-12-29');
    expect(periods[0].timesheetLockDate).toBe('2026-01-13 23:59:59');
  });

  it('respects custom semiMonthlyDay1 and semiMonthlyDay2 anchor settings', () => {
    const periods = generateFiscalYearCalendar('c1', 'ty-2026', 2026, {
      payFrequency: 'SEMI_MONTHLY',
      semiMonthlyDay1: 10,
      semiMonthlyDay2: 25,
      periodLagDays: 3,
    });

    expect(periods[0].periodEnd).toBe('2026-01-10');
    expect(periods[0].scheduledPayDate).toBe('2026-01-13');
    expect(periods[1].periodStart).toBe('2026-01-11');
    expect(periods[1].periodEnd).toBe('2026-01-25');
    expect(periods[1].scheduledPayDate).toBe('2026-01-28');
  });
});

