/**
 * Payroll Tax Liability Service.
 * Pure domain logic to decompose approved paystubs into discrete statutory liabilities,
 * compute deterministic due dates, and format banking CCD+ TXP addenda strings.
 */

import type { PayStub } from '../../types';
import type {
  PayrollTaxLiability,
  Federal941BundleSummary,
  StateRemittanceSummary,
} from '../../payrollLiabilityTypes';

export interface DecomposeLiabilitiesParams {
  companyId: string;
  payrollRunId: string;
  taxYearId?: string;
  payDate: string;
  periodEnd: string;
  payStubs: PayStub[];
  companyState?: string;
  rulePackVersion?: string;
  calculationSnapshotId?: string;
}

/**
 * Normalizes an alphanumeric tax ID string to digits only.
 */
function cleanDigits(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Parses YYYY-MM-DD into numeric [year, month, day] safely without timezone shifts.
 */
export function parseDateParts(dateInput: string | Date): { year: number; month: number; day: number } {
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('T')[0].split('-').map(Number);
    if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return { year: parts[0], month: parts[1], day: parts[2] };
    }
  }
  const d = new Date(dateInput);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/**
 * Formats a date string into YYMMDD format for NACHA TXP compatibility.
 */
export function formatYYMMDD(dateStr: string): string {
  const { year, month, day } = parseDateParts(dateStr);
  const yy = String(year).slice(-2);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Computes the official calendar quarter end date (YYYY-MM-DD) for a given date.
 */
export function getQuarterEndDate(dateInput: string | Date): string {
  const { year, month } = parseDateParts(dateInput);
  if (month <= 3) return `${year}-03-31`;
  if (month <= 6) return `${year}-06-30`;
  if (month <= 9) return `${year}-09-30`;
  return `${year}-12-31`;
}

/**
 * Computes calendar quarter end date and statutory due date for quarterly taxes (SUTA, EIT).
 */
function getQuarterlyDueDate(year: number, month: number): string {
  if (month <= 3) return `${year}-04-30`;
  if (month <= 6) return `${year}-07-31`;
  if (month <= 9) return `${year}-10-31`;
  return `${year + 1}-01-31`;
}

/**
 * Computes deterministic statutory due date based on tax program and pay date.
 */
export function calculateStatutoryDueDate(taxType: string, dateInput: string | Date): string {
  const { year, month } = parseDateParts(dateInput);
  const isQuarterly =
    taxType.includes('SUTA') ||
    taxType.includes('UC') ||
    taxType.includes('EIT') ||
    taxType.includes('LST');
  if (isQuarterly) {
    return getQuarterlyDueDate(year, month);
  }
  // Monthly depositor: 15th of the following month
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-15`;
}

/**
 * Generates an 80-character standardized NACHA TXP (Tax Payment) Addenda string.
 */
export function generateTXPAddenda(
  params: {
    taxId: string;
    taxTypeCode: string;
    taxPeriodEnd: string;
    amount: number;
    taxQualifier?: string;
    checkNumber?: string;
  },
  pad80 = true
): string {
  const cleanId = cleanDigits(params.taxId);
  const periodEndYYMMDD = formatYYMMDD(params.taxPeriodEnd);
  const amountCents = Math.round(params.amount * 100);
  const qualifier = params.taxQualifier || 'M';
  let segment = `TXP*${cleanId}*${params.taxTypeCode}*${periodEndYYMMDD}*${amountCents}*${qualifier}*`;
  if (params.checkNumber) segment += `**${params.checkNumber}*`;
  segment += '~';
  return pad80 && segment.length < 80 ? segment.padEnd(80, ' ') : segment;
}

/**
 * Sums wage deductions and taxes across all paystubs in a run.
 */
function aggregateStubTaxes(payStubs: PayStub[]) {
  return payStubs.reduce(
    (acc, s) => {
      acc.fit += s.federalIncomeTax || 0;
      acc.ss += (s.socialSecurityTax || 0) + (s.employerSocialSecurity || 0);
      acc.med += (s.medicareTax || 0) + (s.employerMedicare || 0);
      acc.sit += s.stateIncomeTax ?? s.paStateTax ?? 0;
      acc.suta += s.employerStateUnemployment ?? s.employerPaUc ?? 0;
      acc.eit += s.localIncomeTax ?? s.paLocalEit ?? 0;
      acc.lst += s.localFlatTax ?? s.paLst ?? 0;
      return acc;
    },
    { fit: 0, ss: 0, med: 0, sit: 0, suta: 0, eit: 0, lst: 0 }
  );
}

/**
 * Creates a PayrollTaxLiability object with standard defaults.
 */
function createLiability(
  params: DecomposeLiabilitiesParams,
  agencyCode: string,
  taxType: string,
  jurisdictionCode: string,
  amount: number
): PayrollTaxLiability {
  const rounded = Math.round(amount * 100) / 100;
  return {
    id: `${params.payrollRunId}_${agencyCode}_${taxType}`,
    companyId: params.companyId,
    payrollRunId: params.payrollRunId,
    taxYearId: params.taxYearId,
    agencyCode,
    taxType,
    jurisdictionCode,
    amount: rounded,
    amountCents: Math.round(rounded * 100),
    liabilityPeriodEnd: params.periodEnd,
    statutoryDueDate: calculateStatutoryDueDate(taxType, params.payDate),
    status: 'UNPAID',
    rulePackVersion: params.rulePackVersion || '2026.1.0',
    calculationSnapshotId: params.calculationSnapshotId,
  };
}

/**
 * Decomposes paystubs into discrete statutory liabilities.
 */
export function decomposePayStubsToLiabilities(
  params: DecomposeLiabilitiesParams
): PayrollTaxLiability[] {
  if (!params.payStubs || params.payStubs.length === 0) return [];
  const totals = aggregateStubTaxes(params.payStubs);
  const liabilities: PayrollTaxLiability[] = [];
  const state = params.companyState || 'PA';

  if (totals.fit > 0) liabilities.push(createLiability(params, 'IRS', 'FIT', 'US-FED', totals.fit));
  if (totals.ss > 0) liabilities.push(createLiability(params, 'IRS', 'FICA_SS', 'US-FED', totals.ss));
  if (totals.med > 0) liabilities.push(createLiability(params, 'IRS', 'FICA_MED', 'US-FED', totals.med));
  if (totals.sit > 0) {
    const sitAgency = state === 'PA' ? 'PA_DOR' : `${state}_DOR`;
    const sitType = state === 'PA' ? 'PA_PIT' : `${state}_SIT`;
    liabilities.push(createLiability(params, sitAgency, sitType, `${state}-STATE`, totals.sit));
  }
  if (totals.suta > 0) {
    const sutaAgency = state === 'PA' ? 'PA_UC' : `${state}_DOL`;
    const sutaType = state === 'PA' ? 'PA_UC_EMPLOYER' : `${state}_SUTA_EMPLOYER`;
    liabilities.push(createLiability(params, sutaAgency, sutaType, `${state}-STATE`, totals.suta));
  }
  if (totals.eit > 0) liabilities.push(createLiability(params, 'LOCAL_TAX_COLLECTOR', 'PA_EIT', 'PA-LOCAL', totals.eit));
  if (totals.lst > 0) liabilities.push(createLiability(params, 'LOCAL_TAX_COLLECTOR', 'PA_LST', 'PA-LOCAL', totals.lst));

  return liabilities;
}

/**
 * Bundles Federal 941 liabilities (FIT + FICA_SS + FICA_MED) into an aggregated deposit instruction.
 */
export function buildFederal941Bundle(
  liabilities: PayrollTaxLiability[],
  ein: string,
  periodEnd: string
): Federal941BundleSummary {
  const fedItems = liabilities.filter((l) => l.agencyCode === 'IRS');
  let fitAmount = 0;
  let ficaSsAmount = 0;
  let ficaMedAmount = 0;
  const liabilityIds: string[] = [];
  let isSettled = fedItems.length > 0;
  let confirmationNumber: string | null = null;
  let paidAt: string | null = null;

  for (const item of fedItems) {
    liabilityIds.push(item.id);
    if (item.taxType === 'FIT') fitAmount += item.amount;
    if (item.taxType === 'FICA_SS') ficaSsAmount += item.amount;
    if (item.taxType === 'FICA_MED') ficaMedAmount += item.amount;
    if (item.status !== 'SETTLED') isSettled = false;
    if (item.confirmationNumber) confirmationNumber = item.confirmationNumber;
    if (item.paidAt) paidAt = item.paidAt;
  }

  const totalAmount = Math.round((fitAmount + ficaSsAmount + ficaMedAmount) * 100) / 100;
  const statutoryDueDate =
    fedItems[0]?.statutoryDueDate || calculateStatutoryDueDate('FIT', periodEnd);
  // Official IRS 941 EFTPS period end is the calendar quarter end
  const quarterEnd = getQuarterEndDate(periodEnd);
  const txpAddenda = generateTXPAddenda(
    {
      taxId: ein,
      taxTypeCode: '01101',
      taxPeriodEnd: quarterEnd,
      amount: totalAmount,
      taxQualifier: 'M',
    },
    true
  );

  return {
    taxPeriodEnd: quarterEnd,
    statutoryDueDate,
    totalAmount,
    fitAmount: Math.round(fitAmount * 100) / 100,
    ficaSsAmount: Math.round(ficaSsAmount * 100) / 100,
    ficaMedAmount: Math.round(ficaMedAmount * 100) / 100,
    liabilityIds,
    isSettled,
    confirmationNumber,
    paidAt,
    txpAddenda,
    portalUrl: 'https://www.eftps.gov/eftps/',
  };
}

/**
 * Resolves government portal URL and friendly portal name.
 */
function resolvePortalInfo(taxType: string, isPit: boolean) {
  if (isPit) return { portalUrl: 'https://mypath.pa.gov/', portalName: 'PA myPATH' };
  if (taxType.includes('UC') || taxType.includes('SUTA')) {
    return { portalUrl: 'https://www.uctax.pa.gov/', portalName: 'PA UC Portal' };
  }
  return {
    portalUrl: 'https://dced.pa.gov/local-government/local-income-tax-information/',
    portalName: 'PA Local Collector (Act 32)',
  };
}

/**
 * Builds state and local remittance instructions from non-federal liabilities.
 */
export function buildStateRemittanceSummaries(
  liabilities: PayrollTaxLiability[],
  company: { stateTaxId?: string }
): StateRemittanceSummary[] {
  return liabilities
    .filter((l) => l.agencyCode !== 'IRS')
    .map((l) => {
      const isPit = l.taxType.includes('PIT') || l.taxType.includes('SIT');
      const txpAddenda = isPit
        ? generateTXPAddenda(
            {
              taxId: company.stateTaxId || '00000000',
              taxTypeCode: '0100',
              taxPeriodEnd: l.liabilityPeriodEnd,
              amount: l.amount,
              taxQualifier: 'M',
            },
            true
          )
        : undefined;

      const { portalUrl, portalName } = resolvePortalInfo(l.taxType, isPit);

      return {
        jurisdictionCode: l.jurisdictionCode || 'PA-STATE',
        agencyCode: l.agencyCode,
        taxType: l.taxType,
        taxPeriodEnd: l.liabilityPeriodEnd,
        statutoryDueDate: l.statutoryDueDate,
        amount: l.amount,
        liabilityId: l.id,
        isSettled: l.status === 'SETTLED',
        confirmationNumber: l.confirmationNumber,
        paidAt: l.paidAt,
        txpAddenda,
        portalUrl,
        portalName,
      };
    });
}
