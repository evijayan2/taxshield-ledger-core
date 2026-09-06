import { Employee, MileageLog, ComplianceTask } from '../types';
import { resolveActiveRuleSync, computeFederalWithholdingFromRule } from '../server/rules-engine/taxRulesEngine';
import { findDistrictByPsdCode } from './paSchoolDistricts';

/**
 * Get current system calendar year.
 */
export function getCurrentCalendarYear(): number {
  return new Date().getFullYear();
}

/**
 * Returns true if a given tax year is strictly in the future (greater than current calendar year).
 */
export function isFutureYear(year?: number): boolean {
  const currentYear = getCurrentCalendarYear();
  const targetYear = year || currentYear;
  return targetYear > currentYear;
}

/**
 * Returns true if a date string falls in a future tax year (greater than current calendar year).
 */
export function isFutureDateString(dateStr?: string): boolean {
  if (!dateStr) return false;
  const year = getRecordYear(dateStr);
  return year > getCurrentCalendarYear();
}

/**
 * Helper error message for future year restriction.
 */
export function getFutureYearLockMessage(year: number, actionName: string = 'adding entries or filing returns'): string {
  const currentYear = getCurrentCalendarYear();
  return `Action locked: Tax year ${year} is in the future (current system year is ${currentYear}). ${actionName} is strictly prohibited until tax year ${year} begins.`;
}

/**
 * Safely parse calendar year from an ISO date string, period label, or formatted string.
 */
export function getRecordYear(dateStr?: string): number {
  if (!dateStr) return getCurrentCalendarYear();
  const match = dateStr.match(/\b(20\d\d)\b/);
  if (match) return parseInt(match[1], 10);
  const parsedDate = new Date(dateStr);
  if (!isNaN(parsedDate.getTime())) return parsedDate.getFullYear();
  return getCurrentCalendarYear();
}

/**
 * Determine tax year for a ComplianceTask entity.
 */
export function getTaskTaxYear(task: ComplianceTask): number {
  if (task.taxYear && typeof task.taxYear === 'number') {
    return task.taxYear;
  }
  if (task.taxPeriodLabel) {
    const labelMatch = task.taxPeriodLabel.match(/\b(20\d\d)\b/);
    if (labelMatch) return parseInt(labelMatch[1], 10);
  }
  if (task.dueDate) {
    const dueMatch = task.dueDate.match(/^20\d\d/);
    if (dueMatch) return parseInt(dueMatch[0], 10);
  }
  return getCurrentCalendarYear();
}


/**
 * Generate default compliance tasks baseline for a given tax year.
 */
export function createDefaultComplianceTasks(year: number): ComplianceTask[] {
  return [
    {
      id: `comp_pa_sit_${year}`,
      taxYear: year,
      jurisdiction: 'PA_MYPATH_SIT',
      formIdentifier: 'REV_1667',
      title: 'PA myPATH Form REV-1667 (State Withholding Return)',
      taxPeriodLabel: `${year} Monthly / Quarterly`,
      dueDate: `${year}-09-15`,
      status: 'READY_TO_FILE',
      amountDue: 0.00,
      boxValues: {
        'box1_gross': { label: 'Total PA Gross Compensation', value: '$0.00', helper: 'Total wages paid to PA residents and for PA work' },
        'box2_tax_withheld': { label: 'PA Income Tax Withheld (3.07%)', value: '$0.00', helper: 'Exact 3.07% PA statutory withholding' },
        'box3_remittance': { label: 'Total Remittance Amount', value: '$0.00', helper: 'Paid via myPATH electronic bank debit / credit' }
      }
    },
    {
      id: `comp_fed_941_${year}`,
      taxYear: year,
      jurisdiction: 'FEDERAL_IRS',
      formIdentifier: 'FORM_941',
      title: 'IRS Form 941 (Employer Quarterly Federal Tax Return)',
      taxPeriodLabel: `${year} Q3 (Jul - Sep)`,
      dueDate: `${year}-10-31`,
      status: 'READY_TO_FILE',
      amountDue: 0.00,
      boxValues: {
        'box1_employees': { label: '1. Number of employees paid in period', value: '0' },
        'box2_wages': { label: '2. Wages, tips, and other compensation', value: '$0.00' },
        'box3_fed_tax': { label: '3. Federal income tax withheld from wages', value: '$0.00' },
        'box5a_ss_wages': { label: '5a. Taxable social security wages', value: '$0.00', helper: 'Both employee (6.2%) and employer (6.2%)' },
        'box5c_med_wages': { label: '5c. Taxable Medicare wages', value: '$0.00', helper: 'Both employee (1.45%) and employer (1.45%)' },
        'box10_total_taxes': { label: '10. Total taxes after adjustments', value: '$0.00' }
      }
    },
    {
      id: `comp_pa_uc_${year}`,
      taxYear: year,
      jurisdiction: 'PA_MYPATH_UC',
      formIdentifier: 'PA_UC_2',
      title: 'PA Unemployment Compensation Return (Form UC-2 / UC-2A)',
      taxPeriodLabel: `${year} Q3 (Jul - Sep)`,
      dueDate: `${year}-10-31`,
      status: 'PENDING',
      amountDue: 0.00,
      boxValues: {
        'total_wages': { label: 'Gross PA UC Covered Wages', value: '$0.00' },
        'employer_contribution': { label: 'Employer UC Contribution (3.822%)', value: '$0.00' },
        'employee_withholding': { label: 'Employee UC Tax Withholding (0.07%)', value: '$0.00' }
      }
    },
    {
      id: `comp_w2_w3_${year}`,
      taxYear: year,
      jurisdiction: 'SSA_W2',
      formIdentifier: 'W2_W3',
      title: 'Year-End Forms W-2 / W-3 Portal Package (SSA BSO & myPATH)',
      taxPeriodLabel: `${year} Annual Filing`,
      dueDate: `${year + 1}-01-31`,
      status: 'PENDING',
      amountDue: 0.00,
      boxValues: {
        'box1_wages': { label: 'Box 1: Wages, tips, other compensation', value: '$0.00' },
        'box2_fed_withheld': { label: 'Box 2: Federal income tax withheld', value: '$0.00' },
        'box3_ss_wages': { label: 'Box 3: Social security wages', value: '$0.00' },
        'box4_ss_tax': { label: 'Box 4: Social security tax withheld', value: '$0.00' },
        'box5_med_wages': { label: 'Box 5: Medicare wages and tips', value: '$0.00' },
        'box6_med_tax': { label: 'Box 6: Medicare tax withheld', value: '$0.00' },
        'box16_pa_wages': { label: 'Box 16: State wages (PA)', value: '$0.00' },
        'box17_pa_tax': { label: 'Box 17: State income tax (PA 3.07%)', value: '$0.00' },
        'box18_local_wages': { label: 'Box 18: Local wages, tips, etc.', value: '$0.00' },
        'box19_local_tax': { label: 'Box 19: Local income tax (EIT)', value: '$0.00' }
      }
    },
    {
      id: `comp_local_eit_${year}`,
      taxYear: year,
      jurisdiction: 'LOCAL_EIT',
      formIdentifier: 'PA_LOCAL_EIT',
      title: 'PA Local EIT & LST Quarterly Return (Act 32 PSD)',
      taxPeriodLabel: `${year} Q3 (Jul - Sep)`,
      dueDate: `${year}-10-31`,
      status: 'READY_TO_FILE',
      amountDue: 0.00,
      boxValues: {
        'local_wages': { label: 'Gross Local Taxable Compensation', value: '$0.00' },
        'local_eit_tax': { label: 'Local Earned Income Tax (EIT) Withheld', value: '$0.00' },
        'local_lst_tax': { label: 'Local Services Tax (LST) Withheld', value: '$0.00' },
        'total_local_remittance': { label: 'Total Remittance to Local Collector', value: '$0.00' }
      }
    }
  ];
}

/**
 * Dynamic Tax Rate Getter (resolves from Tax Rules Engine)
 */
export const getActiveRates = () => {
  const paSit = resolveActiveRuleSync('PA-STATE', 'PA_SIT_RATE');
  const ficaSs = resolveActiveRuleSync('US-FED', 'FED_FICA_SS');
  const ficaMed = resolveActiveRuleSync('US-FED', 'FED_FICA_MEDICARE');
  const paUc = resolveActiveRuleSync('PA-STATE', 'PA_UC_EMPLOYER');

  if (paSit.payload.rate === undefined || ficaSs.payload.rate === undefined || ficaMed.payload.rate === undefined || paUc.payload.rate === undefined) {
    throw new Error('Required tax rate missing from Tax Rules Engine payload');
  }

  return {
    paSitRate: paSit.payload.rate,
    socialSecurityRate: ficaSs.payload.rate,
    medicareRate: ficaMed.payload.rate,
    paEmployerUcRate: paUc.payload.rate,
  };
};

/**
 * Calculate Federal Income Tax Withholding using dynamic rules engine brackets
 */
export function calculateFederalIncomeTax(
  grossPay: number,
  payFrequency: Employee['payFrequency'],
  w4Status: Employee['w4FilingStatus'],
  multipleJobs: boolean,
  dependentCredit: number,
  otherIncome: number = 0,
  deductions: number = 0,
  extraWithholding: number = 0
): number {
  const periodsPerYear = {
    WEEKLY: 52,
    BI_WEEKLY: 26,
    SEMI_MONTHLY: 24,
    MONTHLY: 12,
  }[payFrequency ?? 'BI_WEEKLY'] ?? 26;

  const annualizedGross = (grossPay * periodsPerYear) + otherIncome - deductions;
  if (annualizedGross <= 0) return extraWithholding;

  const rule = resolveActiveRuleSync('US-FED', 'FED_FIT_WITHHOLDING');
  let annualTax = computeFederalWithholdingFromRule(annualizedGross, w4Status, rule);

  annualTax = Math.max(0, annualTax - dependentCredit);
  const periodTax = (annualTax / periodsPerYear) + extraWithholding;
  return Math.round(periodTax * 100) / 100;
}

/**
 * Compute Gross-to-Net Pay & Employer Costs driven by dynamic rules engine
 */
export function calculateGrossToNet(
  employee: Employee,
  hoursWorked: number,
  overtimeHours: number = 0,
  approvedMileageReimbursement: number = 0,
  approvedTravelReimbursement: number = 0
) {
  const regularEarnings = hoursWorked * employee.payRate;
  const overtimeEarnings = overtimeHours * (employee.payRate * 1.5);
  const grossEarnings = Math.round((regularEarnings + overtimeEarnings) * 100) / 100;

  const rates = getActiveRates();

  const federalIncomeTax = calculateFederalIncomeTax(
    grossEarnings,
    employee.payFrequency,
    employee.w4FilingStatus,
    employee.w4MultipleJobs,
    employee.w4DependentCredit,
    employee.w4OtherIncome,
    employee.w4Deductions,
    employee.w4ExtraWithholding
  );

  const rel = employee.relationshipToOwner || (employee.age !== undefined && employee.age < 18 ? 'CHILD_UNDER_18' : 'NONE');
  const isFicaExempt = rel === 'CHILD_UNDER_18';
  const isPaUcExempt = rel === 'CHILD_UNDER_18' || rel === 'CHILD_18_TO_20' || rel === 'SPOUSE' || rel === 'PARENT';

  const socialSecurityTax = isFicaExempt ? 0 : Math.round(grossEarnings * rates.socialSecurityRate * 100) / 100;
  const medicareTax = isFicaExempt ? 0 : Math.round(grossEarnings * rates.medicareRate * 100) / 100;

  const rawWorkState = employee.workState || employee.state || (employee.paPsdCode ? 'PA' : undefined);
  if (!rawWorkState) {
    throw new Error(`Employee [${employee.id || (employee.firstName + ' ' + employee.lastName)}] is missing state jurisdiction.`);
  }
  const workState = rawWorkState.toUpperCase();
  const residentState = (employee.state || employee.workState || workState).toUpperCase();
  const stateCode = workState;
  const localityCode = employee.localTaxJurisdictionCode || (employee.paPsdCode ? `PA-PSD-${employee.paPsdCode}` : undefined);
  let localityName: string | undefined = undefined;

  if ((workState === 'PA' || residentState === 'PA') && employee.paPsdCode) {
    const psdMatch = findDistrictByPsdCode(employee.paPsdCode);
    if (psdMatch) {
      localityName = psdMatch.name;
    }
  }

  if (!localityName && employee.localTaxJurisdictionCode) {
    if (employee.localTaxJurisdictionCode.startsWith('PA-PSD-')) {
      const cleanCode = employee.localTaxJurisdictionCode.replace('PA-PSD-', '');
      const locMatch = findDistrictByPsdCode(cleanCode);
      if (locMatch) {
        localityName = locMatch.name;
      }
    } else {
      localityName = employee.localTaxJurisdictionName;
    }
  }

  if (!localityName) {
    localityName = employee.localTaxJurisdictionName || employee.paPsdName || undefined;
  }

  let stateIncomeTax = 0;
  let employerStateUnemployment = 0;
  let stateDisplayName = `${stateCode} State Income Tax`;
  let sutaDisplayName = `${stateCode} State Unemployment`;

  if (stateCode === 'DE') {
    stateDisplayName = 'Delaware State Income Tax';
    sutaDisplayName = 'DE Unemployment Insurance (SUTA)';
    const deSitRule = resolveActiveRuleSync('DE-STATE', 'DE_SIT_BRACKETS');
    if (deSitRule?.payload?.brackets && Array.isArray(deSitRule.payload.brackets)) {
      const periods = employee.payFrequency === 'WEEKLY' ? 52 : employee.payFrequency === 'BI_WEEKLY' ? 26 : employee.payFrequency === 'SEMI_MONTHLY' ? 24 : 12;
      const annualizedGross = grossEarnings * periods;
      let annualTax = 0;
      const matchingBracket = deSitRule.payload.brackets.find((b: any) => {
        const low = b.over ?? b.incomeFrom ?? 0;
        const high = b.max ?? b.incomeTo ?? null;
        return annualizedGross > low && (high === null || high === undefined || annualizedGross <= high);
      });
      if (matchingBracket) {
        const low = matchingBracket.over ?? matchingBracket.incomeFrom ?? 0;
        const rateVal = matchingBracket.rate ?? matchingBracket.marginalRate ?? 0;
        const taxableExcess = annualizedGross - low;
        annualTax = (matchingBracket.baseTax || 0) + (taxableExcess * rateVal);
      }
      stateIncomeTax = Math.round((annualTax / periods) * 100) / 100;
    }

    const deSutaRule = resolveActiveRuleSync('DE-STATE', 'DE_SUTA_EMPLOYER');
    const deRate = deSutaRule.payload.rate;
    if (deRate === undefined) {
      throw new Error('Required tax rate [DE_SUTA_EMPLOYER] missing from Tax Rules Engine payload');
    }
    employerStateUnemployment = isPaUcExempt ? 0 : Math.round(grossEarnings * deRate * 100) / 100;
  } else if (stateCode === 'NJ') {
    stateDisplayName = 'New Jersey Gross Income Tax';
    sutaDisplayName = 'NJ Employer SUI Tax';
    const njSitRule = resolveActiveRuleSync('NJ-STATE', 'NJ_SIT_BRACKETS');
    if (njSitRule?.payload?.brackets && Array.isArray(njSitRule.payload.brackets)) {
      const periods = employee.payFrequency === 'WEEKLY' ? 52 : employee.payFrequency === 'BI_WEEKLY' ? 26 : employee.payFrequency === 'SEMI_MONTHLY' ? 24 : 12;
      const annualizedGross = grossEarnings * periods;
      let annualTax = 0;
      const matchingBracket = njSitRule.payload.brackets.find((b: any) => {
        const low = b.over ?? b.incomeFrom ?? 0;
        const high = b.max ?? b.incomeTo ?? null;
        return annualizedGross > low && (high === null || high === undefined || annualizedGross <= high);
      });
      if (matchingBracket) {
        const low = matchingBracket.over ?? matchingBracket.incomeFrom ?? 0;
        const rateVal = matchingBracket.rate ?? matchingBracket.marginalRate ?? 0;
        const taxableExcess = annualizedGross - low;
        annualTax = (matchingBracket.baseTax || 0) + (taxableExcess * rateVal);
      }
      stateIncomeTax = Math.round((annualTax / periods) * 100) / 100;
    }

    const njSuiRule = resolveActiveRuleSync('NJ-STATE', 'NJ_SUI_EMPLOYER');
    const njRate = njSuiRule.payload.rate;
    if (njRate === undefined) {
      throw new Error('Required tax rate [NJ_SUI_EMPLOYER] missing from Tax Rules Engine payload');
    }
    employerStateUnemployment = isPaUcExempt ? 0 : Math.round(grossEarnings * njRate * 100) / 100;
  } else if (stateCode === 'NY') {
    stateDisplayName = 'New York State Personal Income Tax';
    sutaDisplayName = 'NY Employer SUTA Tax';
    const nySitRule = resolveActiveRuleSync('NY-STATE', 'NY_SIT_BRACKETS');
    if (nySitRule?.payload?.brackets && Array.isArray(nySitRule.payload.brackets)) {
      const periods = employee.payFrequency === 'WEEKLY' ? 52 : employee.payFrequency === 'BI_WEEKLY' ? 26 : employee.payFrequency === 'SEMI_MONTHLY' ? 24 : 12;
      const annualizedGross = grossEarnings * periods;
      let annualTax = 0;
      const matchingBracket = nySitRule.payload.brackets.find((b: any) => {
        const low = b.over ?? b.incomeFrom ?? 0;
        const high = b.max ?? b.incomeTo ?? null;
        return annualizedGross > low && (high === null || high === undefined || annualizedGross <= high);
      });
      if (matchingBracket) {
        const low = matchingBracket.over ?? matchingBracket.incomeFrom ?? 0;
        const rateVal = matchingBracket.rate ?? matchingBracket.marginalRate ?? 0;
        const taxableExcess = annualizedGross - low;
        annualTax = (matchingBracket.baseTax || 0) + (taxableExcess * rateVal);
      }
      stateIncomeTax = Math.round((annualTax / periods) * 100) / 100;
    }

    const nySutaRule = resolveActiveRuleSync('NY-STATE', 'NY_SUTA_EMPLOYER');
    const nyRate = nySutaRule.payload.rate;
    if (nyRate === undefined) {
      throw new Error('Required tax rate [NY_SUTA_EMPLOYER] missing from Tax Rules Engine payload');
    }
    employerStateUnemployment = isPaUcExempt ? 0 : Math.round(grossEarnings * nyRate * 100) / 100;
  } else if (stateCode === 'OH') {
    stateDisplayName = 'Ohio Personal Income Tax';
    sutaDisplayName = 'OH Employer SUTA Tax';
    const ohSitRule = resolveActiveRuleSync('OH-STATE', 'OH_SIT_BRACKETS');
    if (ohSitRule?.payload?.brackets && Array.isArray(ohSitRule.payload.brackets)) {
      const periods = employee.payFrequency === 'WEEKLY' ? 52 : employee.payFrequency === 'BI_WEEKLY' ? 26 : employee.payFrequency === 'SEMI_MONTHLY' ? 24 : 12;
      const annualizedGross = grossEarnings * periods;
      let annualTax = 0;
      const matchingBracket = ohSitRule.payload.brackets.find((b: any) => {
        const low = b.over ?? b.incomeFrom ?? 0;
        const high = b.max ?? b.incomeTo ?? null;
        return annualizedGross > low && (high === null || high === undefined || annualizedGross <= high);
      });
      if (matchingBracket) {
        const low = matchingBracket.over ?? matchingBracket.incomeFrom ?? 0;
        const rateVal = matchingBracket.rate ?? matchingBracket.marginalRate ?? 0;
        const taxableExcess = annualizedGross - low;
        annualTax = (matchingBracket.baseTax || 0) + (taxableExcess * rateVal);
      }
      stateIncomeTax = Math.round((annualTax / periods) * 100) / 100;
    }

    const ohSutaRule = resolveActiveRuleSync('OH-STATE', 'OH_SUTA_EMPLOYER');
    const ohRate = ohSutaRule.payload.rate;
    if (ohRate === undefined) {
      throw new Error('Required tax rate [OH_SUTA_EMPLOYER] missing from Tax Rules Engine payload');
    }
    employerStateUnemployment = isPaUcExempt ? 0 : Math.round(grossEarnings * ohRate * 100) / 100;
  } else if (stateCode === 'FL' || stateCode === 'TX') {
    stateDisplayName = `${stateCode} Personal Income Tax (0.00%)`;
    sutaDisplayName = stateCode === 'FL' ? 'FL Reemployment Tax' : 'TX Unemployment SUTA';
    stateIncomeTax = 0;
    const sutaRuleCode = stateCode === 'FL' ? 'FL_SUTA_EMPLOYER' : 'TX_SUTA_EMPLOYER';
    const jurisCode = `${stateCode}-STATE`;
    const sutaRule = resolveActiveRuleSync(jurisCode, sutaRuleCode);
    const rate = sutaRule.payload.rate;
    if (rate === undefined) {
      throw new Error(`Required tax rate [${sutaRuleCode}] missing from Tax Rules Engine payload`);
    }
    employerStateUnemployment = isPaUcExempt ? 0 : Math.round(grossEarnings * rate * 100) / 100;
  } else if (stateCode === 'PA') {
    stateDisplayName = 'PA State Personal Income Tax';
    sutaDisplayName = 'PA Employer UC';
    stateIncomeTax = Math.round(grossEarnings * rates.paSitRate * 100) / 100;
    employerStateUnemployment = isPaUcExempt ? 0 : Math.round(grossEarnings * rates.paEmployerUcRate * 100) / 100;
  } else {
    throw new Error(`Unsupported state income tax jurisdiction [${stateCode}]. Active tax rule versions are required in the Tax Rules Engine.`);
  }

  const effectiveEitRate = Math.max(
    employee.localTaxRate || 0,
    employee.paResidentEitRate || 0,
    employee.paWorkEitRate || 0
  );
  const localIncomeTax = Math.round(grossEarnings * effectiveEitRate * 100) / 100;

  const periodsPerYear = employee.payFrequency === 'WEEKLY' ? 52 : employee.payFrequency === 'BI_WEEKLY' ? 26 : employee.payFrequency === 'SEMI_MONTHLY' ? 24 : 12;
  const isFlatExempt = employee.localFlatTaxExempt ?? employee.paLstExempt ?? false;
  const flatAnnual = employee.localFlatTaxAnnual ?? employee.paLstAnnual ?? (workState === 'PA' || residentState === 'PA' ? 52 : 0);
  const localFlatTax = (grossEarnings === 0 || isFlatExempt || flatAnnual === 0) ? 0 : Math.round((flatAnnual / periodsPerYear) * 100) / 100;

  const paStateTax = stateIncomeTax;
  const paLocalEit = localIncomeTax;
  const paLst = localFlatTax;

  const totalEmployeeTaxes = Math.round((federalIncomeTax + socialSecurityTax + medicareTax + stateIncomeTax + localIncomeTax + localFlatTax) * 100) / 100;
  const totalReimbursements = Math.round((approvedMileageReimbursement + approvedTravelReimbursement) * 100) / 100;
  const netPay = Math.round((grossEarnings - totalEmployeeTaxes + totalReimbursements) * 100) / 100;

  const employerSocialSecurity = socialSecurityTax;
  const employerMedicare = medicareTax;
  const employerPaUc = employerStateUnemployment;
  const totalEmployerTaxes = Math.round((employerSocialSecurity + employerMedicare + employerStateUnemployment) * 100) / 100;

  const totalCompanyCost = Math.round((grossEarnings + totalEmployerTaxes + totalReimbursements) * 100) / 100;

  const taxBreakdown = {
    workState,
    residentState,
    state: {
      code: stateCode,
      name: stateDisplayName,
      amount: stateIncomeTax
    },
    locality: localityName || localityCode ? {
      code: localityCode,
      name: localityName || localityCode,
      amount: localIncomeTax
    } : null,
    flatLocalTax: localFlatTax > 0 ? {
      name: workState === 'PA' || residentState === 'PA' ? 'PA Local Services Tax (LST)' : 'Local Flat Tax',
      amount: localFlatTax
    } : null,
    suta: {
      state: stateCode,
      name: sutaDisplayName,
      amount: employerStateUnemployment
    }
  };

  return {
    grossEarnings,
    regularEarnings,
    overtimeEarnings,
    federalIncomeTax,
    socialSecurityTax,
    medicareTax,
    stateCode,
    localityCode,
    localityName,
    stateIncomeTax,
    localIncomeTax,
    localFlatTax,
    employerStateUnemployment,
    taxBreakdown,
    paStateTax,
    paLocalEit,
    effectiveEitRate,
    paLst,
    totalEmployeeTaxes,
    approvedMileageReimbursement,
    approvedTravelReimbursement,
    totalReimbursements,
    netPay,
    employerSocialSecurity,
    employerMedicare,
    employerPaUc,
    totalEmployerTaxes,
    totalCompanyCost,
    isFicaExempt,
    isPaUcExempt,
    relationshipToOwner: rel
  };
}

/**
 * Validate IRS 5-Point Mileage Audit Readiness
 */
export function validateIrs5PointMileage(trip: Partial<MileageLog>): {
  isValid: boolean;
  score: number;
  missingFields: string[];
  warnings: string[];
} {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (trip.tripDate) score += 20;
  else missingFields.push('Point 1: Trip Date is required');

  if (trip.originLocation && trip.originLocation.trim().length > 3) score += 10;
  else missingFields.push('Point 2a: Specific Origin Address/Location required');

  if (trip.destinationLocation && trip.destinationLocation.trim().length > 3) score += 10;
  else missingFields.push('Point 2b: Specific Destination Address/Location required');

  if (trip.businessPurpose && trip.businessPurpose.trim().length >= 8) {
    score += 20;
    const vagueKeywords = ['meeting', 'errand', 'drive', 'work', 'client', 'business'];
    if (vagueKeywords.includes(trip.businessPurpose.trim().toLowerCase())) {
      warnings.push('Business purpose is vague. Specific context required.');
    }
  } else {
    missingFields.push('Point 3: Detailed Business Purpose required');
  }

  if (trip.startOdometer !== undefined && trip.startOdometer > 0) score += 20;
  else missingFields.push('Point 4: Starting Odometer reading is required');

  if (trip.endOdometer !== undefined && trip.endOdometer > (trip.startOdometer || 0)) {
    score += 20;
  } else {
    missingFields.push('Point 5: Ending Odometer must be greater than Start Odometer');
  }

  return {
    isValid: missingFields.length === 0,
    score,
    missingFields,
    warnings
  };
}

/**
 * Calculate Pass-Through Tax Benefit for Owner Form 1040
 */
export function calculatePassThroughSavings(
  totalGrossWages: number,
  totalEmployerTaxes: number,
  totalMileageAllowance: number,
  totalTravelExpenses: number,
  totalGeneralExpenses: number,
  ownerTaxBracketPercent: number = 24,
  ownerPaTaxRate?: number
) {
  const paRate = ownerPaTaxRate ?? getActiveRates().paSitRate;
  const totalBusinessLossExpenses =
    totalGrossWages +
    totalEmployerTaxes +
    totalMileageAllowance +
    totalTravelExpenses +
    totalGeneralExpenses;

  const federalTaxSavings = totalBusinessLossExpenses * (ownerTaxBracketPercent / 100);
  const paStateTaxSavings = totalBusinessLossExpenses * paRate;
  const totalEstimatedTaxSavings = federalTaxSavings + paStateTaxSavings;

  return {
    totalBusinessLossExpenses: Math.round(totalBusinessLossExpenses * 100) / 100,
    federalTaxSavings: Math.round(federalTaxSavings * 100) / 100,
    paStateTaxSavings: Math.round(paStateTaxSavings * 100) / 100,
    totalEstimatedTaxSavings: Math.round(totalEstimatedTaxSavings * 100) / 100
  };
}

