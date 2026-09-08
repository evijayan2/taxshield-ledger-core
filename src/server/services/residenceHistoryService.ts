import { Employee, EmployeeResidenceHistory } from '../../types';

export interface PayPeriodResidenceInterval {
  startDate: string;
  endDate: string;
  calendarDays: number;
  workdays: number;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  psdCode?: string;
  localJurisdictionName?: string;
  localTaxRate: number;
}

/**
 * Calculates the number of standard workdays (Mon-Fri) between two YYYY-MM-DD dates inclusive.
 */
export function calculateWorkdays(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}

/**
 * Calculates the total calendar days between two YYYY-MM-DD dates inclusive.
 */
export function calculateCalendarDays(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Resolves all effective residence intervals overlapping a specific pay period [periodStart, periodEnd].
 * If no history records exist, falls back to the current employee profile.
 */
export function resolvePayPeriodResidences(
  employee: Employee,
  history: EmployeeResidenceHistory[] = [],
  periodStart: string,
  periodEnd: string
): PayPeriodResidenceInterval[] {
  const pStart = new Date(periodStart);
  const pEnd = new Date(periodEnd);

  // Filter records that overlap with periodStart..periodEnd
  const activeRecords = (history || []).filter(h => {
    const effStart = new Date(h.effectiveDate);
    const effEnd = h.endDate ? new Date(h.endDate) : new Date('2099-12-31');
    return effStart <= pEnd && effEnd >= pStart;
  }).sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime());

  if (activeRecords.length === 0) {
    // Fallback to static employee record
    const workdays = calculateWorkdays(periodStart, periodEnd);
    const calendarDays = calculateCalendarDays(periodStart, periodEnd);

    return [{
      startDate: periodStart,
      endDate: periodEnd,
      calendarDays,
      workdays,
      streetAddress: employee.streetAddress || '',
      city: employee.city || '',
      state: employee.state || employee.workState || 'PA',
      zip: employee.zip || '',
      psdCode: employee.paPsdCode || employee.localTaxJurisdictionCode,
      localJurisdictionName: employee.paPsdName || employee.localTaxJurisdictionName,
      localTaxRate: employee.paResidentEitRate ?? employee.localTaxRate ?? 0,
    }];
  }

  const intervals: PayPeriodResidenceInterval[] = [];

  for (const rec of activeRecords) {
    const recStart = new Date(rec.effectiveDate);
    const recEnd = rec.endDate ? new Date(rec.endDate) : new Date('2099-12-31');

    const intStart = recStart > pStart ? rec.effectiveDate : periodStart;
    const intEnd = recEnd < pEnd && rec.endDate ? rec.endDate : periodEnd;

    if (new Date(intStart) <= new Date(intEnd)) {
      const workdays = calculateWorkdays(intStart, intEnd);
      const calendarDays = calculateCalendarDays(intStart, intEnd);

      intervals.push({
        startDate: intStart,
        endDate: intEnd,
        calendarDays,
        workdays,
        streetAddress: rec.streetAddress,
        city: rec.city,
        state: rec.state,
        zip: rec.zip,
        psdCode: rec.psdCode || undefined,
        localJurisdictionName: rec.localJurisdictionName || undefined,
        localTaxRate: rec.localTaxRate ?? 0,
      });
    }
  }

  return intervals;
}
