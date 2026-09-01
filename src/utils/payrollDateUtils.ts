import { Company, Employee, PayrollRun, TimesheetEntry } from '../types';

export interface PayrollPeriodResult {
  periodStart: string;
  periodEnd: string;
  payDate: string;
  payFrequency: 'WEEKLY' | 'BI_WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';
  source: 'LAST_RUN_ROLLOVER' | 'APPROVED_TIMESHEETS' | 'DEFAULT_CALENDAR';
}

/**
 * Formats a Date object as an ISO date string (YYYY-MM-DD) in local time.
 * @param date - Date object
 * @returns YYYY-MM-DD formatted string
 */
function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds a specified number of days to a Date object.
 * @param date - Base date
 * @param days - Number of days to add
 * @returns New Date object
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Resolves the primary pay frequency from LLC setup (Company) or employee fallback.
 * @param company - Company / LLC setup object
 * @param employees - List of employees
 * @returns Primary pay frequency (defaults to BI_WEEKLY if undefined)
 */
export function resolvePrimaryPayFrequency(
  company?: Company,
  employees: Employee[] = []
): 'WEEKLY' | 'BI_WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY' {
  if (company?.payFrequency) {
    return company.payFrequency;
  }
  const activeEmps = employees.filter((e) => e.isActive);
  if (activeEmps.length > 0 && activeEmps[0].payFrequency) {
    return activeEmps[0].payFrequency;
  }
  return 'BI_WEEKLY';
}

/**
 * Calculates the next pay period dates based on LLC setup pay frequency, previous payroll runs,
 * and approved timesheets.
 *
 * @param employees - Active employees array
 * @param payrollRuns - Historical locked/completed payroll runs
 * @param timesheets - Optional list of timesheet entries
 * @param company - Optional LLC / Company setup object
 * @param referenceDateStr - Optional YYYY-MM-DD reference date (defaults to current local date)
 * @returns Object containing periodStart, periodEnd, payDate, payFrequency, and source.
 */
export function calculateNextPayrollPeriod(
  employees: Employee[],
  payrollRuns: PayrollRun[],
  timesheets: TimesheetEntry[] = [],
  company?: Company,
  referenceDateStr?: string
): PayrollPeriodResult {
  const payFrequency = resolvePrimaryPayFrequency(company, employees);
  const refDate = referenceDateStr ? new Date(`${referenceDateStr}T00:00:00`) : new Date();

  // 1. Check for existing completed/locked payroll runs
  const sortedRuns = [...payrollRuns].sort(
    (a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime()
  );
  const lastRun = sortedRuns[0];

  if (lastRun && lastRun.periodEnd) {
    const lastEnd = new Date(`${lastRun.periodEnd}T00:00:00`);
    const nextStart = addDays(lastEnd, 1);
    let nextEnd: Date;

    if (payFrequency === 'WEEKLY') {
      nextEnd = addDays(nextStart, 6);
    } else if (payFrequency === 'SEMI_MONTHLY') {
      const day = nextStart.getDate();
      const month = nextStart.getMonth();
      const year = nextStart.getFullYear();

      if (day <= 15) {
        nextEnd = new Date(year, month, 15);
      } else {
        // Last day of month
        nextEnd = new Date(year, month + 1, 0);
      }
    } else if (payFrequency === 'MONTHLY') {
      const year = nextStart.getFullYear();
      const month = nextStart.getMonth();
      nextEnd = new Date(year, month + 1, 0);
    } else {
      // Default: BI_WEEKLY (14-day cycle)
      nextEnd = addDays(nextStart, 13);
    }

    // Pay date is typically 5 calendar days after period end
    const payDateObj = addDays(nextEnd, 5);

    return {
      periodStart: formatDateISO(nextStart),
      periodEnd: formatDateISO(nextEnd),
      payDate: formatDateISO(payDateObj),
      payFrequency,
      source: 'LAST_RUN_ROLLOVER',
    };
  }

  // 2. Fallback to approved timesheet date range if available
  const approvedTimesheets = timesheets.filter((t) => t.status === 'APPROVED' && t.workDate);
  if (approvedTimesheets.length > 0) {
    const sortedDates = approvedTimesheets
      .map((t) => t.workDate.split('T')[0])
      .sort();
    const earliest = sortedDates[0];
    const latest = sortedDates[sortedDates.length - 1];
    const latestDate = new Date(`${latest}T00:00:00`);
    const payDateObj = addDays(latestDate, 5);

    return {
      periodStart: earliest,
      periodEnd: latest,
      payDate: formatDateISO(payDateObj),
      payFrequency,
      source: 'APPROVED_TIMESHEETS',
    };
  }

  // 3. Fallback to current calendar window relative to reference date
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth();
  let defaultStart: Date;
  let defaultEnd: Date;

  if (payFrequency === 'SEMI_MONTHLY') {
    if (refDate.getDate() <= 15) {
      defaultStart = new Date(currentYear, currentMonth, 1);
      defaultEnd = new Date(currentYear, currentMonth, 15);
    } else {
      defaultStart = new Date(currentYear, currentMonth, 16);
      defaultEnd = new Date(currentYear, currentMonth + 1, 0);
    }
  } else if (payFrequency === 'MONTHLY') {
    defaultStart = new Date(currentYear, currentMonth, 1);
    defaultEnd = new Date(currentYear, currentMonth + 1, 0);
  } else if (payFrequency === 'WEEKLY') {
    const dayOfWeek = refDate.getDay(); // 0 = Sun
    defaultStart = addDays(refDate, -dayOfWeek);
    defaultEnd = addDays(defaultStart, 6);
  } else {
    // BI_WEEKLY: Current month 1st to 14th or 15th to 28th
    if (refDate.getDate() <= 14) {
      defaultStart = new Date(currentYear, currentMonth, 1);
      defaultEnd = new Date(currentYear, currentMonth, 14);
    } else {
      defaultStart = new Date(currentYear, currentMonth, 15);
      defaultEnd = new Date(currentYear, currentMonth, 28);
    }
  }

  const payDateObj = addDays(defaultEnd, 5);

  return {
    periodStart: formatDateISO(defaultStart),
    periodEnd: formatDateISO(defaultEnd),
    payDate: formatDateISO(payDateObj),
    payFrequency,
    source: 'DEFAULT_CALENDAR',
  };
}
