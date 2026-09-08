import {
  Company,
  Organization,
  Employee,
  MileageLog,
  TravelExpense,
  PayrollRun,
  PayStub,
  ComplianceTask,
  GeneralExpense,
  TimesheetEntry,
  TaxYear,
} from '../types';

const STORAGE_KEYS = {
  COMPANY: 'taxshield_company',
  ORG: 'taxshield_org',
  EMPLOYEES: 'taxshield_employees',
  MILEAGE: 'taxshield_mileage',
  TRAVEL_EXPENSES: 'taxshield_travel_expenses',
  PAYROLL_RUNS: 'taxshield_payroll_runs',
  PAY_STUBS: 'taxshield_pay_stubs',
  COMPLIANCE_TASKS: 'taxshield_compliance_tasks',
  GENERAL_EXPENSES: 'taxshield_general_expenses',
  TIMESHEETS: 'taxshield_timesheets',
};

export const DEFAULT_EMPTY_COMPANY: Company = {
  id: 'comp_main',
  name: '',
  ein: '',
  stateTaxId: '',
  address: '',
  city: '',
  state: 'PA',
  zip: '',
  ownerName: '',
  ownerEmail: '',
  stateFilingFrequency: 'MONTHLY',
  filingFrequencyPA: 'MONTHLY',
  payFrequency: 'BI_WEEKLY',
};

export const DEFAULT_EMPTY_ORG: Organization = DEFAULT_EMPTY_COMPANY;
export const REAL_DEFAULT_COMPANY = DEFAULT_EMPTY_COMPANY;
export const REAL_DEFAULT_ORG = DEFAULT_EMPTY_COMPANY;

export function isCompanyConfigured(company?: Company): boolean {
  if (!company) return false;
  return Boolean(company.name && company.name.trim().length > 0 && company.ein && company.ein.trim().length > 0);
}

export function isOrgConfigured(org?: Organization): boolean {
  return isCompanyConfigured(org);
}

export const REAL_DEFAULT_EMPLOYEES: Employee[] = [];

export const INITIAL_COMPLIANCE_TASKS: ComplianceTask[] = [
  {
    id: 'comp_01',
    taxYear: 2026,
    jurisdiction: 'PA_MYPATH_SIT',
    formIdentifier: 'REV_1667',
    title: 'PA myPATH Form REV-1667 (State Withholding Return)',
    taxPeriodLabel: '2026 Monthly / Quarterly',
    dueDate: '2026-09-15',
    status: 'READY_TO_FILE',
    amountDue: 0.0,
    boxValues: {
      box1_gross: { label: 'Total PA Gross Compensation', value: '$0.00', helper: 'Total wages paid to PA residents and for PA work' },
      box2_tax_withheld: { label: 'PA Income Tax Withheld', value: '$0.00', helper: 'Exact PA statutory withholding resolved from active TaxRuleVersion' },
      box3_remittance: { label: 'Total Remittance Amount', value: '$0.00', helper: 'Paid via myPATH electronic bank debit / credit' },
    },
  },
  {
    id: 'comp_02',
    taxYear: 2026,
    jurisdiction: 'FEDERAL_IRS',
    formIdentifier: 'FORM_941',
    title: 'IRS Form 941 (Employer Quarterly Federal Tax Return)',
    taxPeriodLabel: '2026 Q3 (Jul - Sep)',
    dueDate: '2026-10-31',
    status: 'READY_TO_FILE',
    amountDue: 0.0,
    boxValues: {
      box1_employees: { label: '1. Number of employees paid in period', value: '0' },
      box2_wages: { label: '2. Wages, tips, and other compensation', value: '$0.00' },
      box3_fed_tax: { label: '3. Federal income tax withheld from wages', value: '$0.00' },
      box5a_ss_wages: { label: '5a. Taxable social security wages', value: '$0.00', helper: 'Both employee and employer statutory Social Security rates' },
      box5c_med_wages: { label: '5c. Taxable Medicare wages', value: '$0.00', helper: 'Both employee and employer statutory Medicare rates' },
      box10_total_taxes: { label: '10. Total taxes after adjustments', value: '$0.00' },
    },
  },
  {
    id: 'comp_03',
    taxYear: 2026,
    jurisdiction: 'PA_MYPATH_UC',
    formIdentifier: 'PA_UC_2',
    title: 'PA Unemployment Compensation Return (Form UC-2 / UC-2A)',
    taxPeriodLabel: '2026 Q3 (Jul - Sep)',
    dueDate: '2026-10-31',
    status: 'PENDING',
    amountDue: 0.0,
    boxValues: {
      total_wages: { label: 'Gross PA UC Covered Wages', value: '$0.00' },
      employer_contribution: { label: 'Employer UC Contribution', value: '$0.00' },
      employee_withholding: { label: 'Employee UC Withholding', value: '$0.00' },
    },
  },
  {
    id: 'comp_04',
    taxYear: 2026,
    jurisdiction: 'SSA_W2',
    formIdentifier: 'W2_W3',
    title: 'Year-End Forms W-2 / W-3 Portal Package (SSA BSO & myPATH)',
    taxPeriodLabel: '2026 Annual Filing',
    dueDate: '2027-01-31',
    status: 'PENDING',
    amountDue: 0.0,
    boxValues: {
      box1_wages: { label: 'Box 1: Wages, tips, other compensation', value: '$0.00' },
      box2_fed_withheld: { label: 'Box 2: Federal income tax withheld', value: '$0.00' },
      box3_ss_wages: { label: 'Box 3: Social security wages', value: '$0.00' },
      box4_ss_tax: { label: 'Box 4: Social security tax withheld', value: '$0.00' },
      box5_med_wages: { label: 'Box 5: Medicare wages and tips', value: '$0.00' },
      box6_med_tax: { label: 'Box 6: Medicare tax withheld', value: '$0.00' },
      box16_pa_wages: { label: 'Box 16: State wages (PA)', value: '$0.00' },
      box17_pa_tax: { label: 'Box 17: State income tax (PA)', value: '$0.00' },
      box18_local_wages: { label: 'Box 18: Local wages, tips, etc.', value: '$0.00' },
      box19_local_tax: { label: 'Box 19: Local income tax (EIT)', value: '$0.00' },
    },
  },
  {
    id: 'comp_05',
    taxYear: 2026,
    jurisdiction: 'LOCAL_EIT',
    formIdentifier: 'PA_LOCAL_EIT',
    title: 'PA Local EIT & LST Quarterly Return (Act 32 PSD)',
    taxPeriodLabel: '2026 Q3 (Jul - Sep)',
    dueDate: '2026-10-31',
    status: 'READY_TO_FILE',
    amountDue: 0.0,
    boxValues: {
      local_wages: { label: 'Gross Local Taxable Compensation', value: '$0.00' },
      local_eit_tax: { label: 'Local Earned Income Tax (EIT) Withheld', value: '$0.00' },
      local_lst_tax: { label: 'Local Services Tax (LST) Withheld', value: '$0.00' },
      total_local_remittance: { label: 'Total Remittance to Local Collector', value: '$0.00' },
    },
  },
];

export function getStoredData<T>(key: string, defaultVal: T): T {
  return defaultVal;
}

export function setStoredData<T>(_key: string, _val: T): void {
  // Direct PostgreSQL storage architecture active — localStorage persistence disabled.
}

export type AllAppData = ReturnType<typeof loadAllAppData>;

export function loadAllAppData(): {
  company: Company;
  org: Organization;
  employees: Employee[];
  mileageLogs: MileageLog[];
  travelExpenses: TravelExpense[];
  payrollRuns: PayrollRun[];
  payStubs: PayStub[];
  complianceTasks: ComplianceTask[];
  generalExpenses: GeneralExpense[];
  timesheets: TimesheetEntry[];
  auditLogs: import('../types').AuditLogEntry[];
  taxYears: TaxYear[];
  activeTaxYear: number;
} {
  const defaultTaxYear: TaxYear = {
    id: 'ty_2026',
    companyId: 'comp_main',
    year: 2026,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  return {
    company: REAL_DEFAULT_COMPANY,
    org: REAL_DEFAULT_ORG,
    employees: [],
    mileageLogs: [],
    travelExpenses: [],
    payrollRuns: [],
    payStubs: [],
    complianceTasks: INITIAL_COMPLIANCE_TASKS,
    generalExpenses: [],
    timesheets: [],
    auditLogs: [],
    taxYears: [defaultTaxYear],
    activeTaxYear: 2026,
  };
}

export function saveAllAppData(_data: ReturnType<typeof loadAllAppData>): void {
  // Direct PostgreSQL storage architecture active — localStorage writes disabled.
}

export function clearToFreshRealApp(ownerEmail: string = '') {
  const cleanCompany: Company = {
    ...DEFAULT_EMPTY_COMPANY,
    ownerEmail: ownerEmail || '',
  };
  const defaultTaxYear: TaxYear = {
    id: 'ty_2026',
    companyId: 'comp_main',
    year: 2026,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };
  return {
    company: cleanCompany,
    org: cleanCompany,
    employees: [],
    mileageLogs: [],
    travelExpenses: [],
    payrollRuns: [],
    payStubs: [],
    complianceTasks: INITIAL_COMPLIANCE_TASKS,
    generalExpenses: [],
    timesheets: [],
    auditLogs: [],
    taxYears: [defaultTaxYear],
    activeTaxYear: 2026,
  };
}

export function loadSampleTemplate() {
  return clearToFreshRealApp();
}

export const resetToSeedData = loadSampleTemplate;
