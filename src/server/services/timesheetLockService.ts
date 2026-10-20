import { PayrollCalendarPeriod } from '../../types';

export interface TimesheetLockCheckResult {
  allowed: boolean;
  reason?: 'PERIOD_LOCKED' | 'DEADLINE_PASSED' | 'NO_PERIOD_FOUND';
  period?: PayrollCalendarPeriod;
  message?: string;
}

/**
 * Evaluates whether a timesheet entry for a given workDate can be created, updated, or deleted
 * based on the published fiscal year payroll calendar periods and timesheet lock dates.
 */
export function isTimesheetModificationAllowed(
  workDate: string,
  periods: PayrollCalendarPeriod[] = [],
  referenceTimeIso?: string
): TimesheetLockCheckResult {
  const cleanWorkDate = workDate.split('T')[0];
  const activePeriod = periods.find(
    (p) => cleanWorkDate >= p.periodStart && cleanWorkDate <= p.periodEnd
  );

  if (!activePeriod) {
    return {
      allowed: true,
      reason: 'NO_PERIOD_FOUND',
    };
  }

  if (activePeriod.status === 'LOCKED' || activePeriod.status === 'COMPLETED') {
    return {
      allowed: false,
      reason: 'PERIOD_LOCKED',
      period: activePeriod,
      message: `Pay period ${activePeriod.periodStart} to ${activePeriod.periodEnd} is locked for payroll processing. Timesheet entries cannot be modified.`,
    };
  }

  const nowIso = referenceTimeIso || new Date().toISOString().replace('T', ' ').split('.')[0];
  if (activePeriod.timesheetLockDate && nowIso > activePeriod.timesheetLockDate) {
    return {
      allowed: false,
      reason: 'DEADLINE_PASSED',
      period: activePeriod,
      message: `Timesheet submission deadline (${activePeriod.timesheetLockDate}) for pay period ${activePeriod.periodStart} to ${activePeriod.periodEnd} has passed. Timesheets are locked.`,
    };
  }

  return {
    allowed: true,
    period: activePeriod,
  };
}

/**
 * Asserts that a timesheet edit is allowed; throws an Error if locked.
 */
export function assertTimesheetModificationAllowed(
  workDate: string,
  periods: PayrollCalendarPeriod[] = [],
  referenceTimeIso?: string
): void {
  const result = isTimesheetModificationAllowed(workDate, periods, referenceTimeIso);
  if (!result.allowed) {
    throw new Error(result.message || 'Timesheet modification not allowed for locked pay period.');
  }
}
