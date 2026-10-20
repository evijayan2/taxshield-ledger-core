import { describe, it, expect } from 'vitest';
import {
  isTimesheetModificationAllowed,
  assertTimesheetModificationAllowed,
} from './timesheetLockService';
import { PayrollCalendarPeriod } from '../../types';

describe('timesheetLockService', () => {
  const samplePeriod: PayrollCalendarPeriod = {
    id: 'p1',
    companyId: 'c1',
    taxYearId: 'ty1',
    periodNumber: 1,
    periodStart: '2026-01-01',
    periodEnd: '2026-01-14',
    timesheetLockDate: '2026-01-16 23:59:59',
    scheduledPayDate: '2026-01-19',
    actualPayDate: '2026-01-19',
    status: 'PUBLISHED',
  };

  it('allows timesheet modifications before the submission cutoff date', () => {
    const res = isTimesheetModificationAllowed('2026-01-05', [samplePeriod], '2026-01-15 12:00:00');
    expect(res.allowed).toBe(true);
  });

  it('blocks timesheet modifications after the submission cutoff date', () => {
    const res = isTimesheetModificationAllowed('2026-01-05', [samplePeriod], '2026-01-17 08:00:00');
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('DEADLINE_PASSED');
    expect(res.message).toContain('Timesheet submission deadline');
  });

  it('blocks timesheet modifications when period status is LOCKED', () => {
    const lockedPeriod: PayrollCalendarPeriod = {
      ...samplePeriod,
      status: 'LOCKED',
    };

    const res = isTimesheetModificationAllowed('2026-01-05', [lockedPeriod], '2026-01-10 12:00:00');
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('PERIOD_LOCKED');
  });

  it('throws Error in assertTimesheetModificationAllowed when locked', () => {
    expect(() => {
      assertTimesheetModificationAllowed('2026-01-05', [samplePeriod], '2026-01-18 12:00:00');
    }).toThrow('Timesheet submission deadline');
  });
});
