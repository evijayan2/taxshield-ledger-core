import {
  BenefitPlanType,
  CalculatedDeductionItem,
  DeductionCalculationResult,
  Employee,
  EmployeeBenefitElection,
  StatutoryWageBases,
} from '../../types';

export interface PlanTaxTreatment {
  isPreTaxFit: boolean;
  isPreTaxFica: boolean;
  isPreTaxFuta: boolean;
  isPreTaxSuta: boolean;
  isPreTaxState: boolean;
  isPreTaxLocal: boolean;
}

interface ReductionTotals {
  fit: number;
  fica: number;
  futa: number;
  suta: number;
  state: number;
  local: number;
  preTax: number;
  postTax: number;
  employer: number;
}

/**
 * Resolves statutory tax treatment for a given benefit plan type,
 * enforcing IRC Section 1372 restrictions for >2% S-Corp shareholders.
 */
export function resolvePlanTaxTreatment(
  planType: BenefitPlanType,
  isShareholder: boolean
): PlanTaxTreatment {
  const isSec125OrHsa =
    planType === 'SECTION_125_HEALTH' ||
    planType === 'SECTION_125_DENTAL' ||
    planType === 'SECTION_125_VISION' ||
    planType === 'SECTION_125_FSA' ||
    planType === 'HSA_PRETAX';

  if (isSec125OrHsa) {
    return {
      isPreTaxFit: !isShareholder,
      isPreTaxFica: true,
      isPreTaxFuta: true,
      isPreTaxSuta: true,
      isPreTaxState: true,
      isPreTaxLocal: true,
    };
  }

  if (planType === 'RETIREMENT_401K_TRADITIONAL') {
    return {
      isPreTaxFit: true,
      isPreTaxFica: false,
      isPreTaxFuta: false,
      isPreTaxSuta: false,
      isPreTaxState: false,
      isPreTaxLocal: false,
    };
  }

  return {
    isPreTaxFit: false,
    isPreTaxFica: false,
    isPreTaxFuta: false,
    isPreTaxSuta: false,
    isPreTaxState: false,
    isPreTaxLocal: false,
  };
}

/**
 * Computes the requested deduction amount and employer contribution for an election.
 */
export function computeElectionAmounts(
  election: EmployeeBenefitElection,
  grossEarnings: number
): { requestedAmount: number; employerContribution: number } {
  let requested = election.amountType === 'PERCENTAGE'
    ? Math.round((grossEarnings * (election.amount / 100)) * 100) / 100
    : election.amount;

  if (election.annualLimit !== undefined && election.ytdDeductions !== undefined) {
    const remaining = Math.max(0, election.annualLimit - election.ytdDeductions);
    requested = Math.min(requested, remaining);
  }

  let employerContrib = 0;
  if (election.employerContribution) {
    employerContrib = election.employerContributionType === 'PERCENTAGE'
      ? Math.round((grossEarnings * (election.employerContribution / 100)) * 100) / 100
      : election.employerContribution;
  }

  return {
    requestedAmount: Math.max(0, Math.round(requested * 100) / 100),
    employerContribution: Math.max(0, Math.round(employerContrib * 100) / 100),
  };
}

/**
 * Processes elections to accumulate wage base reductions and itemized lines.
 */
function processElectionItems(
  grossEarnings: number,
  elections: EmployeeBenefitElection[],
  isShareholder: boolean
): { totals: ReductionTotals; itemized: CalculatedDeductionItem[] } {
  const totals: ReductionTotals = { fit: 0, fica: 0, futa: 0, suta: 0, state: 0, local: 0, preTax: 0, postTax: 0, employer: 0 };
  const itemized: CalculatedDeductionItem[] = [];

  for (const election of elections) {
    const isOwner = election.isShareholderGreaterThan2Pct ?? isShareholder;
    const treatment = resolvePlanTaxTreatment(election.planType, isOwner);
    const amounts = computeElectionAmounts(election, grossEarnings);

    if (treatment.isPreTaxFit) totals.fit += amounts.requestedAmount;
    if (treatment.isPreTaxFica) totals.fica += amounts.requestedAmount;
    if (treatment.isPreTaxFuta) totals.futa += amounts.requestedAmount;
    if (treatment.isPreTaxSuta) totals.suta += amounts.requestedAmount;
    if (treatment.isPreTaxState) totals.state += amounts.requestedAmount;
    if (treatment.isPreTaxLocal) totals.local += amounts.requestedAmount;

    if (treatment.isPreTaxFit || treatment.isPreTaxFica) {
      totals.preTax += amounts.requestedAmount;
    } else {
      totals.postTax += amounts.requestedAmount;
    }
    totals.employer += amounts.employerContribution;

    itemized.push({
      planType: election.planType,
      planName: election.planName || election.planType,
      requestedAmount: amounts.requestedAmount,
      appliedAmount: amounts.requestedAmount,
      uncollectedAmount: 0,
      isPreTaxFit: treatment.isPreTaxFit,
      isPreTaxFica: treatment.isPreTaxFica,
      isPreTaxState: treatment.isPreTaxState,
      isPreTaxLocal: treatment.isPreTaxLocal,
      employerContribution: amounts.employerContribution,
    });
  }

  return { totals, itemized };
}

/**
 * Computes statutory taxable wage bases across all tax vectors
 * based on employee benefit elections and IRC Section 1372 status.
 */
export function calculateBenefitDeductions(
  grossEarnings: number,
  elections: EmployeeBenefitElection[] = [],
  employee?: Partial<Employee>
): DeductionCalculationResult {
  const isShareholder = Boolean(employee?.isShareholderGreaterThan2Pct);
  const { totals, itemized } = processElectionItems(grossEarnings, elections, isShareholder);

  const wageBases: StatutoryWageBases = {
    fitTaxableWages: Math.max(0, Math.round((grossEarnings - totals.fit) * 100) / 100),
    ssTaxableWages: Math.max(0, Math.round((grossEarnings - totals.fica) * 100) / 100),
    medicareTaxableWages: Math.max(0, Math.round((grossEarnings - totals.fica) * 100) / 100),
    futaTaxableWages: Math.max(0, Math.round((grossEarnings - totals.futa) * 100) / 100),
    sutaTaxableWages: Math.max(0, Math.round((grossEarnings - totals.suta) * 100) / 100),
    stateTaxableWages: Math.max(0, Math.round((grossEarnings - totals.state) * 100) / 100),
    localTaxableWages: Math.max(0, Math.round((grossEarnings - totals.local) * 100) / 100),
  };

  const totalDeductions = Math.round((totals.preTax + totals.postTax) * 100) / 100;

  return {
    wageBases,
    totalPreTaxDeductions: Math.round(totals.preTax * 100) / 100,
    totalPostTaxDeductions: Math.round(totals.postTax * 100) / 100,
    totalDeductions,
    totalEmployeeDeductions: totalDeductions,
    totalEmployerContributions: Math.round(totals.employer * 100) / 100,
    clampedDeductions: totalDeductions,
    uncollectedDeductions: 0,
    itemizedDeductions: itemized,
  };
}

/**
 * Clamps employee voluntary deductions to ensure net pay never falls below $0.00.
 */
export function clampBenefitDeductions(
  result: DeductionCalculationResult,
  availableNetPay: number
): DeductionCalculationResult {
  const maxAvailable = Math.max(0, Math.round(availableNetPay * 100) / 100);
  if (result.totalDeductions <= maxAvailable) {
    return result;
  }

  let remaining = maxAvailable;
  let totalApplied = 0;
  const updatedItems = result.itemizedDeductions.map((item) => {
    const applied = Math.min(item.requestedAmount, remaining);
    const uncollected = Math.round((item.requestedAmount - applied) * 100) / 100;
    remaining = Math.max(0, Math.round((remaining - applied) * 100) / 100);
    totalApplied += applied;
    return {
      ...item,
      appliedAmount: Math.round(applied * 100) / 100,
      uncollectedAmount: uncollected,
    };
  });

  const appliedTotal = Math.round(totalApplied * 100) / 100;
  const uncollectedTotal = Math.round((result.totalDeductions - appliedTotal) * 100) / 100;

  return {
    ...result,
    clampedDeductions: appliedTotal,
    totalEmployeeDeductions: appliedTotal,
    uncollectedDeductions: uncollectedTotal,
    itemizedDeductions: updatedItems,
  };
}
