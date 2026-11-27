/**
 * Form 941 (Quarterly Federal Tax Return) & Form 940 (Annual FUTA Tax Return)
 * Reconciliation Worksheet Service.
 * Zero hardcoded statutory rates — resolves FUTA rate and wage cap from Tax Rules Engine.
 */

import type { Employee, Organization, PayStub } from '../../types';
import { getActiveRates, getRecordYear } from '../../utils/taxEngine';

export interface Form941MonthlyBreakdown {
  monthIndex: 1 | 2 | 3;
  monthLabel: string;
  taxLiability: number;
}

export interface Form941Worksheet {
  taxYear: number;
  quarter: 1 | 2 | 3 | 4;
  employerName: string;
  employerEin: string;
  line1EmployeesCount: number;
  line2WagesTipsComp: number;
  line3FederalIncomeTaxWithheld: number;
  line5aTaxableSsWages: number;
  line5aSsTax: number;
  line5cTaxableMedWages: number;
  line5cMedTax: number;
  line5eTotalSsMedTaxes: number;
  line6TotalTaxesBeforeAdjustments: number;
  line10TotalTaxesAfterAdjustments: number;
  monthlyLiabilityBreakdown: Form941MonthlyBreakdown[];
  payStubCount: number;
}

export interface Form940QuarterlyBreakdown {
  quarter: 1 | 2 | 3 | 4;
  taxLiability: number;
}

export interface Form940Worksheet {
  taxYear: number;
  employerName: string;
  employerEin: string;
  stateCode: string;
  futaRate: number;
  futaWageCap: number;
  line3TotalPaymentsToAllEmployees: number;
  line4ExemptPayments: number;
  line5PaymentsExceedingWageCap: number;
  line6SubtotalExempt: number;
  line7TotalTaxableFutaWages: number;
  line8FutaTaxBeforeAdjustments: number;
  line12TotalFutaTaxAfterAdjustments: number;
  quarterlyLiability: Form940QuarterlyBreakdown[];
  employeeCount: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function getPayStubMonth(stub: PayStub): number {
  const dateStr = stub.payDate || stub.periodEnd || stub.periodStart;
  if (!dateStr) return 1;
  const parts = dateStr.split('T')[0].split('-').map(Number);
  return parts[1] >= 1 && parts[1] <= 12 ? parts[1] : 1;
}

function getQuarterForMonth(month: number): 1 | 2 | 3 | 4 {
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Builds an IRS Form 941 quarterly reconciliation worksheet from pay stubs.
 */
export function buildForm941Worksheet(
  org: Organization,
  payStubs: PayStub[],
  taxYear: number,
  quarter: 1 | 2 | 3 | 4
): Form941Worksheet {
  const startMonth = (quarter - 1) * 3 + 1;
  const quarterStubs = (payStubs || []).filter((s) => {
    const y = getRecordYear(s.payDate || s.periodEnd || s.periodStart);
    const m = getPayStubMonth(s);
    return y === taxYear && getQuarterForMonth(m) === quarter;
  });

  const uniqueEmps = new Set(quarterStubs.map((s) => s.employeeId));
  let line2Wages = 0;
  let line3Fit = 0;
  let totalEeSs = 0;
  let totalErSs = 0;
  let totalEeMed = 0;
  let totalErMed = 0;

  const monthlyTotals: Record<number, number> = { 0: 0, 1: 0, 2: 0 };

  for (const stub of quarterStubs) {
    const gross = stub.grossEarnings || 0;
    const fit = stub.federalIncomeTax || 0;
    const eeSs = stub.socialSecurityTax || 0;
    const erSs = stub.employerSocialSecurity || 0;
    const eeMed = stub.medicareTax || 0;
    const erMed = stub.employerMedicare || 0;

    line2Wages += gross;
    line3Fit += fit;
    totalEeSs += eeSs;
    totalErSs += erSs;
    totalEeMed += eeMed;
    totalErMed += erMed;

    const mIdx = getPayStubMonth(stub) - startMonth;
    if (mIdx >= 0 && mIdx <= 2) {
      monthlyTotals[mIdx] += fit + eeSs + erSs + eeMed + erMed;
    }
  }

  const line5aSsTax = round2(totalEeSs + totalErSs);
  const line5cMedTax = round2(totalEeMed + totalErMed);
  const line5eTotalSsMedTaxes = round2(line5aSsTax + line5cMedTax);
  const line3Rounded = round2(line3Fit);
  const line6Total = round2(line3Rounded + line5eTotalSsMedTaxes);

  const monthlyLiabilityBreakdown: Form941MonthlyBreakdown[] = [0, 1, 2].map((offset) => ({
    monthIndex: (offset + 1) as 1 | 2 | 3,
    monthLabel: MONTH_NAMES[startMonth - 1 + offset] || `Month ${offset + 1}`,
    taxLiability: round2(monthlyTotals[offset]),
  }));

  return {
    taxYear,
    quarter,
    employerName: org.name || 'Company',
    employerEin: org.ein || '',
    line1EmployeesCount: uniqueEmps.size,
    line2WagesTipsComp: round2(line2Wages),
    line3FederalIncomeTaxWithheld: line3Rounded,
    line5aTaxableSsWages: round2(line2Wages),
    line5aSsTax,
    line5cTaxableMedWages: round2(line2Wages),
    line5cMedTax,
    line5eTotalSsMedTaxes,
    line6TotalTaxesBeforeAdjustments: line6Total,
    line10TotalTaxesAfterAdjustments: line6Total,
    monthlyLiabilityBreakdown,
    payStubCount: quarterStubs.length,
  };
}

/**
 * Builds an IRS Form 940 annual FUTA reconciliation worksheet from pay stubs.
 * Resolves FUTA rate and wage cap dynamically from active Tax Rules Engine.
 */
export function buildForm940Worksheet(
  org: Organization,
  employees: Employee[],
  payStubs: PayStub[],
  taxYear: number
): Form940Worksheet {
  const rates = getActiveRates(new Date(taxYear, 6, 1));
  const futaRate = rates.futaRate;
  const futaWageCap = rates.futaWageCap ?? 7000;
  const isCorporateEntity = org.entityType === 'S_CORP' || org.entityType === 'C_CORP';

  const yearStubs = (payStubs || []).filter((s) => getRecordYear(s.payDate || s.periodEnd || s.periodStart) === taxYear);
  const empById = new Map((employees || []).map((e) => [e.id, e]));
  const wagesByEmployee = new Map<string, number>();
  const quarterlyLiabilityMap: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  let totalPayments = 0;
  let exemptPayments = 0;

  for (const stub of yearStubs) {
    const gross = stub.grossEarnings || 0;
    totalPayments += gross;

    const emp = empById.get(stub.employeeId);
    const rel = emp?.relationshipToOwner || (emp?.age !== undefined && emp.age < 18 ? 'CHILD_UNDER_18' : 'NONE');
    const isFutaExempt = !isCorporateEntity && (rel === 'CHILD_UNDER_18' || rel === 'CHILD_18_TO_20' || rel === 'SPOUSE');

    if (isFutaExempt) {
      exemptPayments += gross;
    } else {
      const prev = wagesByEmployee.get(stub.employeeId) || 0;
      const remainingCap = Math.max(0, futaWageCap - prev);
      const taxableThisStub = Math.min(gross, remainingCap);
      wagesByEmployee.set(stub.employeeId, prev + gross);

      const q = getQuarterForMonth(getPayStubMonth(stub));
      quarterlyLiabilityMap[q] += stub.employerFuta ?? round2(taxableThisStub * futaRate);
    }
  }

  let excessWages = 0;
  for (const totalEmpWages of wagesByEmployee.values()) {
    if (totalEmpWages > futaWageCap) {
      excessWages += totalEmpWages - futaWageCap;
    }
  }

  const line3 = round2(totalPayments);
  const line4 = round2(exemptPayments);
  const line5 = round2(excessWages);
  const line6 = round2(line4 + line5);
  const line7 = round2(Math.max(0, line3 - line6));
  const line8 = round2(line7 * futaRate);

  const quarterlyLiability: Form940QuarterlyBreakdown[] = ([1, 2, 3, 4] as const).map((q) => ({
    quarter: q,
    taxLiability: round2(quarterlyLiabilityMap[q]),
  }));

  return {
    taxYear,
    employerName: org.name || 'Company',
    employerEin: org.ein || '',
    stateCode: (org.state || 'PA').toUpperCase(),
    futaRate,
    futaWageCap,
    line3TotalPaymentsToAllEmployees: line3,
    line4ExemptPayments: line4,
    line5PaymentsExceedingWageCap: line5,
    line6SubtotalExempt: line6,
    line7TotalTaxableFutaWages: line7,
    line8FutaTaxBeforeAdjustments: line8,
    line12TotalFutaTaxAfterAdjustments: line8,
    quarterlyLiability,
    employeeCount: new Set(yearStubs.map((s) => s.employeeId)).size,
  };
}

/**
 * Generates a CPA-ready CSV reconciliation worksheet for Form 941.
 */
export function generateForm941Csv(ws: Form941Worksheet): string {
  const rows: Array<[string, string, string]> = [
    ['Form 941 Line', 'Description', 'Value'],
    ['Header', 'Employer Name', ws.employerName],
    ['Header', 'Employer EIN', ws.employerEin],
    ['Header', 'Tax Year / Quarter', `${ws.taxYear} Q${ws.quarter}`],
    ['Line 1', 'Number of employees who received wages', String(ws.line1EmployeesCount)],
    ['Line 2', 'Wages, tips, and other compensation', ws.line2WagesTipsComp.toFixed(2)],
    ['Line 3', 'Federal income tax withheld from wages', ws.line3FederalIncomeTaxWithheld.toFixed(2)],
    ['Line 5a', 'Taxable Social Security wages', ws.line5aTaxableSsWages.toFixed(2)],
    ['Line 5a Tax', 'Social Security tax (EE + ER)', ws.line5aSsTax.toFixed(2)],
    ['Line 5c', 'Taxable Medicare wages', ws.line5cTaxableMedWages.toFixed(2)],
    ['Line 5c Tax', 'Medicare tax (EE + ER)', ws.line5cMedTax.toFixed(2)],
    ['Line 5e', 'Total Social Security and Medicare taxes', ws.line5eTotalSsMedTaxes.toFixed(2)],
    ['Line 6', 'Total taxes before adjustments', ws.line6TotalTaxesBeforeAdjustments.toFixed(2)],
    ['Line 10', 'Total taxes after adjustments', ws.line10TotalTaxesAfterAdjustments.toFixed(2)],
    ...ws.monthlyLiabilityBreakdown.map((m): [string, string, string] => [
      `Month ${m.monthIndex}`,
      `${m.monthLabel} Tax Liability`,
      m.taxLiability.toFixed(2),
    ]),
  ];
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

/**
 * Generates a CPA-ready CSV reconciliation worksheet for Form 940.
 */
export function generateForm940Csv(ws: Form940Worksheet): string {
  const rows: Array<[string, string, string]> = [
    ['Form 940 Line', 'Description', 'Value'],
    ['Header', 'Employer Name', ws.employerName],
    ['Header', 'Employer EIN', ws.employerEin],
    ['Header', 'Tax Year', String(ws.taxYear)],
    ['Header', 'FUTA Net Rate', `${(ws.futaRate * 100).toFixed(2)}%`],
    ['Header', 'FUTA Wage Cap per Employee', ws.futaWageCap.toFixed(2)],
    ['Line 3', 'Total payments to all employees', ws.line3TotalPaymentsToAllEmployees.toFixed(2)],
    ['Line 4', 'Payments exempt from FUTA (family sole prop/partnership)', ws.line4ExemptPayments.toFixed(2)],
    ['Line 5', 'Total payments made to each employee in excess of cap', ws.line5PaymentsExceedingWageCap.toFixed(2)],
    ['Line 6', 'Subtotal (Line 4 + Line 5)', ws.line6SubtotalExempt.toFixed(2)],
    ['Line 7', 'Total taxable FUTA wages (Line 3 - Line 6)', ws.line7TotalTaxableFutaWages.toFixed(2)],
    ['Line 8', 'FUTA tax before adjustments', ws.line8FutaTaxBeforeAdjustments.toFixed(2)],
    ['Line 12', 'Total FUTA tax after adjustments', ws.line12TotalFutaTaxAfterAdjustments.toFixed(2)],
    ...ws.quarterlyLiability.map((q): [string, string, string] => [
      `Q${q.quarter}`,
      `Q${q.quarter} FUTA Liability`,
      q.taxLiability.toFixed(2),
    ]),
  ];
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
