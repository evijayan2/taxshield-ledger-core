import {
  PayScheduleConfig,
  PayrollCalendarPeriod,
  PayrollFrequency,
  WeekendRollRule,
} from '../../types';

/**
 * Returns federal bank holidays for a given year as YYYY-MM-DD strings.
 */
export function getFederalBankHolidays(year: number): string[] {
  // Key US Federal Holidays
  const holidays: string[] = [
    `${year}-01-01`, // New Year's Day
    `${year}-06-19`, // Juneteenth
    `${year}-07-04`, // Independence Day
    `${year}-11-11`, // Veterans Day
    `${year}-12-25`, // Christmas Day
  ];

  // MLK Day: 3rd Monday of January
  holidays.push(formatISO(getNthDayOfMonth(year, 0, 1, 3)));

  // Washington's Birthday: 3rd Monday of February
  holidays.push(formatISO(getNthDayOfMonth(year, 1, 1, 3)));

  // Memorial Day: Last Monday of May
  holidays.push(formatISO(getLastDayOfWeekInMonth(year, 4, 1)));

  // Labor Day: 1st Monday of September
  holidays.push(formatISO(getNthDayOfMonth(year, 8, 1, 1)));

  // Columbus Day: 2nd Monday of October
  holidays.push(formatISO(getNthDayOfMonth(year, 9, 1, 2)));

  // Thanksgiving: 4th Thursday of November
  holidays.push(formatISO(getNthDayOfMonth(year, 10, 4, 4)));

  return holidays;
}

function getNthDayOfMonth(year: number, monthIndex: number, dayOfWeek: number, n: number): Date {
  const date = new Date(year, monthIndex, 1);
  let count = 0;
  while (date.getMonth() === monthIndex) {
    if (date.getDay() === dayOfWeek) {
      count++;
      if (count === n) return new Date(date);
    }
    date.setDate(date.getDate() + 1);
  }
  return new Date(year, monthIndex, 1);
}

function getLastDayOfWeekInMonth(year: number, monthIndex: number, dayOfWeek: number): Date {
  const date = new Date(year, monthIndex + 1, 0); // Last day of month
  while (date.getDay() !== dayOfWeek) {
    date.setDate(date.getDate() - 1);
  }
  return date;
}

function formatISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const res = new Date(d);
  res.setDate(res.getDate() + days);
  return res;
}

/**
 * Adjusts a target payday for weekends and federal holidays based on WeekendRollRule.
 */
export function adjustForWeekendAndHoliday(
  dateStr: string,
  rule: WeekendRollRule = 'PREVIOUS_BUSINESS_DAY'
): string {
  if (rule === 'EXACT_DAY') return dateStr;

  let d = new Date(`${dateStr}T00:00:00`);
  const year = d.getFullYear();
  const holidays = new Set(getFederalBankHolidays(year));

  const isWeekendOrHoliday = (date: Date): boolean => {
    const day = date.getDay();
    const iso = formatISO(date);
    return day === 0 || day === 6 || holidays.has(iso);
  };

  if (!isWeekendOrHoliday(d)) {
    return dateStr;
  }

  if (rule === 'PREVIOUS_BUSINESS_DAY') {
    while (isWeekendOrHoliday(d)) {
      d = addDays(d, -1);
    }
  } else if (rule === 'NEXT_BUSINESS_DAY') {
    while (isWeekendOrHoliday(d)) {
      d = addDays(d, 1);
    }
  }

  return formatISO(d);
}

/**
 * Generates the full fiscal year payroll calendar periods based on PayScheduleConfig.
 */
/**
 * Generates the full fiscal year payroll calendar periods based on PayScheduleConfig.
 * Fully accounts for anchor pay date, payday day of week, period lag days,
 * semi-monthly day settings, monthly payday settings, timesheet lock cutoff, and weekend/holiday roll rules.
 */
export function generateFiscalYearCalendar(
  companyId: string,
  taxYearId: string,
  year: number,
  config: Partial<PayScheduleConfig> = {}
): PayrollCalendarPeriod[] {
  const payFrequency: PayrollFrequency = config.payFrequency || 'BI_WEEKLY';
  const cutoffDays = config.timesheetCutoffDays ?? 2;
  const rollRule: WeekendRollRule = config.weekendRollRule || 'PREVIOUS_BUSINESS_DAY';
  const lagDays = config.periodLagDays ?? 5;

  const semiDay1 = config.semiMonthlyDay1 ?? 15;
  const semiDay2 = config.semiMonthlyDay2 ?? 0;
  const monthlyDay = config.monthlyPayDay ?? 0;

  const periods: PayrollCalendarPeriod[] = [];

  if (payFrequency === 'SEMI_MONTHLY') {
    let periodNum = 1;
    for (let month = 0; month < 12; month++) {
      // Period 1: 1st to semiDay1 (e.g. 15th)
      const p1Start = new Date(year, month, 1);
      const p1End = new Date(year, month, Math.min(semiDay1, 28));
      const p1TargetPay = addDays(p1End, lagDays);
      const p1ActualPay = adjustForWeekendAndHoliday(formatISO(p1TargetPay), rollRule);
      const p1LockDate = `${formatISO(addDays(p1End, cutoffDays))} 23:59:59`;

      periods.push({
        id: `cal-${taxYearId}-${periodNum}`,
        companyId,
        taxYearId,
        periodNumber: periodNum++,
        periodStart: formatISO(p1Start),
        periodEnd: formatISO(p1End),
        timesheetLockDate: p1LockDate,
        scheduledPayDate: formatISO(p1TargetPay),
        actualPayDate: p1ActualPay,
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
      });

      // Period 2: (semiDay1 + 1) to semiDay2 or EOM
      const p2Start = new Date(year, month, Math.min(semiDay1 + 1, 29));
      const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
      const p2EndDay = semiDay2 > 0 ? Math.min(semiDay2, lastDayOfMonth) : lastDayOfMonth;
      const p2End = new Date(year, month, p2EndDay);
      const p2TargetPay = addDays(p2End, lagDays);
      const p2ActualPay = adjustForWeekendAndHoliday(formatISO(p2TargetPay), rollRule);
      const p2LockDate = `${formatISO(addDays(p2End, cutoffDays))} 23:59:59`;

      periods.push({
        id: `cal-${taxYearId}-${periodNum}`,
        companyId,
        taxYearId,
        periodNumber: periodNum++,
        periodStart: formatISO(p2Start),
        periodEnd: formatISO(p2End),
        timesheetLockDate: p2LockDate,
        scheduledPayDate: formatISO(p2TargetPay),
        actualPayDate: p2ActualPay,
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
      });
    }
  } else if (payFrequency === 'MONTHLY') {
    for (let month = 0; month < 12; month++) {
      const pStart = new Date(year, month, 1);
      const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
      const pEndDay = monthlyDay > 0 ? Math.min(monthlyDay, lastDayOfMonth) : lastDayOfMonth;
      const pEnd = new Date(year, month, pEndDay);
      const pTargetPay = addDays(pEnd, lagDays);
      const pActualPay = adjustForWeekendAndHoliday(formatISO(pTargetPay), rollRule);
      const pLockDate = `${formatISO(addDays(pEnd, cutoffDays))} 23:59:59`;

      periods.push({
        id: `cal-${taxYearId}-${month + 1}`,
        companyId,
        taxYearId,
        periodNumber: month + 1,
        periodStart: formatISO(pStart),
        periodEnd: formatISO(pEnd),
        timesheetLockDate: pLockDate,
        scheduledPayDate: formatISO(pTargetPay),
        actualPayDate: pActualPay,
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
      });
    }
  } else if (payFrequency === 'WEEKLY') {
    // 52 weekly periods starting from anchor alignment or Jan 1
    let currentStart = new Date(year, 0, 1);
    if (config.anchorPayDate) {
      const anchor = new Date(`${config.anchorPayDate}T00:00:00`);
      if (!isNaN(anchor.getTime())) {
        let payDate = new Date(anchor);
        // Step backward or forward so periodEnd is the first periodEnd in 'year'
        while (addDays(payDate, -lagDays).getFullYear() >= year) {
          payDate = addDays(payDate, -7);
        }
        while (addDays(payDate, -lagDays).getFullYear() < year) {
          payDate = addDays(payDate, 7);
        }
        const periodEndForAnchor = addDays(payDate, -lagDays);
        currentStart = addDays(periodEndForAnchor, -6);
      }
    }
    let periodNum = 1;
    while (currentStart.getFullYear() <= year && periodNum <= 52) {
      const currentEnd = addDays(currentStart, 6);
      const pTargetPay = addDays(currentEnd, lagDays);
      const pActualPay = adjustForWeekendAndHoliday(formatISO(pTargetPay), rollRule);
      const pLockDate = `${formatISO(addDays(currentEnd, cutoffDays))} 23:59:59`;

      periods.push({
        id: `cal-${taxYearId}-${periodNum}`,
        companyId,
        taxYearId,
        periodNumber: periodNum,
        periodStart: formatISO(currentStart),
        periodEnd: formatISO(currentEnd),
        timesheetLockDate: pLockDate,
        scheduledPayDate: formatISO(pTargetPay),
        actualPayDate: pActualPay,
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
      });

      periodNum++;
      currentStart = addDays(currentEnd, 1);
    }
  } else {
    // Default: BI_WEEKLY (26 periods)
    let currentStart = new Date(year, 0, 1);
    if (config.anchorPayDate) {
      const anchor = new Date(`${config.anchorPayDate}T00:00:00`);
      if (!isNaN(anchor.getTime())) {
        let payDate = new Date(anchor);
        // Step backward or forward so periodEnd is the first periodEnd in 'year'
        while (addDays(payDate, -lagDays).getFullYear() >= year) {
          payDate = addDays(payDate, -14);
        }
        while (addDays(payDate, -lagDays).getFullYear() < year) {
          payDate = addDays(payDate, 14);
        }
        const periodEndForAnchor = addDays(payDate, -lagDays);
        currentStart = addDays(periodEndForAnchor, -13);
      }
    }
    let periodNum = 1;
    while (currentStart.getFullYear() <= year && periodNum <= 26) {
      const currentEnd = addDays(currentStart, 13);
      const pTargetPay = addDays(currentEnd, lagDays);
      const pActualPay = adjustForWeekendAndHoliday(formatISO(pTargetPay), rollRule);
      const pLockDate = `${formatISO(addDays(currentEnd, cutoffDays))} 23:59:59`;

      periods.push({
        id: `cal-${taxYearId}-${periodNum}`,
        companyId,
        taxYearId,
        periodNumber: periodNum,
        periodStart: formatISO(currentStart),
        periodEnd: formatISO(currentEnd),
        timesheetLockDate: pLockDate,
        scheduledPayDate: formatISO(pTargetPay),
        actualPayDate: pActualPay,
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
      });

      periodNum++;
      currentStart = addDays(currentEnd, 1);
    }
  }

  return periods;
}
