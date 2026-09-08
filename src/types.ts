export type TaxFilingFrequency = 'SEMI_MONTHLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
export type PayrollFrequency = 'WEEKLY' | 'BI_WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';

export interface Company {
  id: string;
  name: string;
  ein: string;
  stateTaxId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ownerName: string;
  ownerEmail: string;
  ownerTaxBracket?: number;
  stateFilingFrequency?: TaxFilingFrequency;
  filingFrequencyPA?: TaxFilingFrequency;
  payFrequency?: PayrollFrequency;
  standardMileageRate?: number;
  bankName?: string;
  routingNumber?: string;
  accountNumber?: string;
  mercuryApiKey?: string;
  mercuryAccountId?: string;
  mercuryEnvironment?: 'SANDBOX' | 'PRODUCTION';
  status?: 'ACTIVE' | 'DISSOLVED';
  closedAt?: string;
  closureReason?: string;
  addressHistory?: CompanyAddressHistory[];
}

export interface CompanyAddressHistory {
  id: string;
  companyId: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  psdCode?: string;
  localJurisdictionName?: string;
  workEitRate: number;
  effectiveDate: string;
  endDate?: string | null;
  createdAt?: string;
}

export type Organization = Company;

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  age?: number;
  relationshipToOwner?: 'NONE' | 'CHILD_UNDER_18' | 'CHILD_18_TO_20' | 'SPOUSE' | 'PARENT';
  email: string;
  phone: string;
  ssnLastFour: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  employmentType: 'W2_HOURLY' | 'W2_SALARY' | '1099_CONTRACTOR';
  payRate: number;
  payFrequency?: 'WEEKLY' | 'BI_WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';
  w4FilingStatus: 'SINGLE' | 'MARRIED_FILING_JOINTLY' | 'HEAD_OF_HOUSEHOLD';
  w4MultipleJobs: boolean;
  w4DependentCredit: number;
  w4OtherIncome: number;
  w4Deductions: number;
  w4ExtraWithholding: number;
  workState?: string;
  stateW4FilingStatus?: string;
  stateAllowances?: number;
  localTaxJurisdictionCode?: string;
  localTaxJurisdictionName?: string;
  localTaxRate?: number;
  localFlatTaxAnnual?: number;
  localFlatTaxExempt?: boolean;
  taxAttributes?: Record<string, unknown>;
  paPsdCode?: string;
  paPsdName?: string;
  paResidentEitRate?: number;
  paWorkPsdCode?: string;
  paWorkEitRate?: number;
  paLstAnnual?: number;
  paLstExempt?: boolean;
  bankName?: string;
  accountType?: 'CHECKING' | 'SAVINGS';
  routingNumber?: string;
  accountNumber?: string;
  bankAccountMasked?: string;
  isActive: boolean;
  residenceHistory?: EmployeeResidenceHistory[];
  bankHistory?: EmployeeBankHistory[];
}

export interface EmployeeBankHistory {
  id: string;
  employeeId: string;
  bankName: string;
  accountType: 'CHECKING' | 'SAVINGS';
  routingNumber: string;
  accountNumber: string;
  bankAccountMasked: string;
  effectiveDate: string;
  endDate?: string | null;
  createdAt?: string;
}

export interface EmployeeResidenceHistory {
  id: string;
  employeeId: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  psdCode?: string;
  localJurisdictionName?: string;
  localTaxRate?: number;
  effectiveDate: string;
  endDate?: string | null;
  createdAt?: string;
}

export interface MileageLog {
  id: string;
  employeeId: string;
  tripDate: string;
  originLocation: string;
  destinationLocation: string;
  businessPurpose: string;
  startOdometer: number;
  endOdometer: number;
  calculatedMiles: number;
  rateApplied: number;
  mileageAllowance: number;
  isReimbursableAccountablePlan: boolean;
  status: 'PENDING' | 'APPROVED' | 'REIMBURSED' | 'OWNER_TAX_DEDUCTION';
  linkedPayStubId?: string;
  notes?: string;
  createdAt: string;
}

export interface TravelExpense {
  id: string;
  employeeId: string;
  mileageLogId?: string;
  expenseDate: string;
  category: 'PARKING_FEE' | 'TOLL_ROAD' | 'BRIDGE_TOLL' | 'PUBLIC_TRANSIT';
  description: string;
  amount: number;
  paymentSource: 'PERSONAL_OUT_OF_POCKET' | 'COMPANY_CARD' | 'EZPASS_BUSINESS';
  receiptNote?: string;
  receiptUrl?: string;
  isReimbursable: boolean;
  status: 'PENDING' | 'APPROVED' | 'REIMBURSED' | 'OWNER_TAX_DEDUCTION';
  linkedPayStubId?: string;
  createdAt: string;
}

export interface PayStub {
  id: string;
  payrollRunId: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  hoursWorked: number;
  overtimeHours: number;
  hourlyRate: number;
  grossEarnings: number;
  federalIncomeTax: number;
  socialSecurityTax: number;
  medicareTax: number;
  stateCode?: string;
  localityCode?: string;
  localityName?: string;
  stateIncomeTax?: number;
  localIncomeTax?: number;
  localFlatTax?: number;
  totalEmployeeTaxes: number;
  mileageReimbursement: number;
  travelExpensesReimbursement: number;
  totalReimbursements: number;
  netPay: number;
  employerSocialSecurity: number;
  employerMedicare: number;
  employerStateUnemployment?: number;
  taxBreakdown?: Record<string, unknown>;
  paStateTax?: number;
  paLocalEit?: number;
  paLst?: number;
  employerPaUc?: number;
  totalEmployerTaxes: number;
  totalCompanyCost: number;
  disbursementMethod: 'ACH' | 'CHECK';
  disbursementStatus: 'PENDING' | 'PAID';
  achTraceRef?: string;
  paidAt?: string;
  createdAt: string;
  taxLines?: PayStubTaxLine[];
}

export interface PayStubTaxLine {
  id: string;
  payStubId: string;
  jurisdictionType: 'FEDERAL' | 'STATE' | 'LOCAL_EIT' | 'LOCAL_LST';
  jurisdictionCode: string;
  jurisdictionName: string;
  taxableWages: number;
  taxRate: number;
  taxWithheld: number;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string;
}

export interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: 'DRAFT' | 'LOCKED' | 'DISBURSED';
  totalGross: number;
  totalEmployeeTaxes: number;
  totalReimbursements: number;
  totalNetPay: number;
  totalEmployerTaxes: number;
  totalCompanyCost: number;
  stubsCount: number;
  createdAt: string;
  lockedAt?: string;
}

export interface ComplianceTask {
  id: string;
  taxYear?: number;
  jurisdiction: 'FEDERAL_IRS' | 'PA_MYPATH_SIT' | 'PA_MYPATH_UC' | 'LOCAL_EIT' | 'SSA_W2';
  formIdentifier: string;
  title: string;
  taxPeriodLabel: string;
  dueDate: string;
  status: 'PENDING' | 'READY_TO_FILE' | 'FILED';
  amountDue: number;
  confirmationNumber?: string;
  filedDate?: string;
  boxValues: Record<string, { label: string; value: string | number; helper?: string }>;
  notes?: string;
}

export interface GeneralExpense {
  id: string;
  expenseDate: string;
  category: 'LEGAL_ACCOUNTING' | 'SOFTWARE_TECH' | 'OFFICE_SUPPLIES' | 'PHONE_INTERNET' | 'BANK_FEES' | 'MARKETING' | 'UTILITIES' | 'RENT_LEASE' | 'OTHER';
  payee: string;
  description: string;
  amount: number;
  paidBy: 'OWNER_PERSONAL' | 'LLC_ACCOUNT';
  scheduleCLine?: string;
  isTaxDeductible?: boolean;
  receiptUrl?: string;
  receiptNote?: string;
  notes?: string;
  createdAt?: string;
}

export interface AuditLogEntry {
  id: string;
  companyId?: string;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTIVATE';
  actorId: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string;
  timestamp: string;
}

export interface CalculationSnapshot {
  id: string;
  calculationType: string;
  entityId: string;
  ruleVersionIds: string[];
  snapshotData: Record<string, unknown>;
  createdAt: string;
}

export interface TaxYear {
  id: string;
  companyId?: string;
  year: number;
  status: 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  createdAt: string;
}

export type TimesheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface TimesheetEntry {
  id: string;
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  unpaidBreakMinutes: number;
  regularHours: number;
  overtimeHours: number;
  notes?: string;
  status: TimesheetStatus;
  linkedPayStubId?: string;
  createdAt: string;
}

