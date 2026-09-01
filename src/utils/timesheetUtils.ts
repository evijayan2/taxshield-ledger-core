import { TimesheetEntry } from '../types';

/**
 * Result object for timesheet hours calculation.
 */
export interface CalculatedHours {
  totalNetHours: number;
  regularHours: number;
  overtimeHours: number;
}

/**
 * Calculates net worked hours, regular hours (up to 8 hrs/day), and overtime hours (> 8 hrs/day).
 * @param startTime - Start time string in HH:mm format (e.g., "08:30")
 * @param endTime - End time string in HH:mm format (e.g., "17:00")
 * @param unpaidBreakMinutes - Unpaid break duration in minutes (e.g., 30)
 * @returns Object containing total net hours, regular hours, and overtime hours.
 */
export function calculateTimesheetHours(
  startTime: string,
  endTime: string,
  unpaidBreakMinutes: number = 0
): CalculatedHours {
  if (!startTime || !endTime) {
    return { totalNetHours: 0, regularHours: 0, overtimeHours: 0 };
  }

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const startTotalMinutes = startH * 60 + startM;
  let endTotalMinutes = endH * 60 + endM;

  // Handle shift crossing midnight
  if (endTotalMinutes < startTotalMinutes) {
    endTotalMinutes += 24 * 60;
  }

  const elapsedMinutes = endTotalMinutes - startTotalMinutes;
  const netMinutes = Math.max(0, elapsedMinutes - Math.max(0, unpaidBreakMinutes));
  const totalNetHours = Math.round((netMinutes / 60) * 100) / 100;

  const regularHours = Math.min(8, totalNetHours);
  const overtimeHours = Math.round(Math.max(0, totalNetHours - 8) * 100) / 100;

  return {
    totalNetHours,
    regularHours,
    overtimeHours,
  };
}

/**
 * Sums approved regular and overtime hours for a specific employee within a date range.
 * @param timesheets - List of timesheet entries
 * @param employeeId - Employee ID to filter by
 * @param periodStart - Pay period start date (YYYY-MM-DD)
 * @param periodEnd - Pay period end date (YYYY-MM-DD)
 * @returns Aggregated regular and overtime hours for the period.
 */
export function getApprovedHoursForEmployee(
  timesheets: TimesheetEntry[],
  employeeId: string,
  periodStart: string,
  periodEnd: string
): { regular: number; overtime: number } {
  const filtered = timesheets.filter((t) => {
    const isApproved = t.status === 'APPROVED';
    const isSameEmp = t.employeeId === employeeId;
    const cleanDate = t.workDate ? t.workDate.split('T')[0] : '';
    const inRange = cleanDate >= periodStart && cleanDate <= periodEnd;
    return isApproved && isSameEmp && inRange;
  });

  const totals = filtered.reduce(
    (acc, t) => {
      acc.regular += t.regularHours || 0;
      acc.overtime += t.overtimeHours || 0;
      return acc;
    },
    { regular: 0, overtime: 0 }
  );

  return {
    regular: Math.round(totals.regular * 100) / 100,
    overtime: Math.round(totals.overtime * 100) / 100,
  };
}

/**
 * Formats a decimal hour value to a display string (e.g. 8 -> "8.0 hrs").
 * @param hours - Hour number
 * @returns Formatted hour string
 */
export function formatHours(hours: number): string {
  return `${hours.toFixed(1)} hrs`;
}

/**
 * Configuration parameters for generating bulk timesheets over a date range.
 */
export interface BulkTimesheetConfig {
  employeeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  daysOfWeek: number[]; // 0 = Sun, 1 = Mon, ... 6 = Sat
  startTime: string;
  endTime: string;
  unpaidBreakMinutes: number;
  notes?: string;
}

/**
 * Generates an array of daily timesheet entries for specified active days in a date range.
 * @param config - Bulk configuration object
 * @returns Array of new timesheet entry objects without id/createdAt
 */
export function generateBulkTimesheets(
  config: BulkTimesheetConfig
): Omit<TimesheetEntry, 'id' | 'createdAt'>[] {
  const {
    employeeId,
    startDate,
    endDate,
    daysOfWeek,
    startTime,
    endTime,
    unpaidBreakMinutes,
    notes,
  } = config;

  if (!employeeId || !startDate || !endDate) return [];

  const { regularHours, overtimeHours } = calculateTimesheetHours(
    startTime,
    endTime,
    unpaidBreakMinutes
  );

  const results: Omit<TimesheetEntry, 'id' | 'createdAt'>[] = [];
  const curr = new Date(`${startDate}T00:00:00`);
  const last = new Date(`${endDate}T00:00:00`);

  while (curr <= last) {
    const dayIndex = curr.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    if (daysOfWeek.includes(dayIndex)) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      const workDate = `${year}-${month}-${day}`;

      results.push({
        employeeId,
        workDate,
        startTime,
        endTime,
        unpaidBreakMinutes,
        regularHours,
        overtimeHours,
        notes: notes ? notes.trim() : undefined,
        status: 'APPROVED',
      });
    }
    curr.setDate(curr.getDate() + 1);
  }

  return results;
}
