export interface Company {
  id: string;
  name: string;
  ein: string;
  stateTaxId: string; // PA Account ID
  address: string;
  city: string;
  state: string;
  zip: string;
  ownerName: string;
  ownerEmail: string;
  ownerTaxBracket: number; // e.g. 24 for 24%
  stateFilingFrequency?: 'SEMI_MONTHLY' | 'MONTHLY' | 'QUARTERLY';
  filingFrequencyPA?: 'SEMI_MONTHLY' | 'MONTHLY' | 'QUARTERLY'; // Legacy alias
  payFrequency?: 'WEEKLY' | 'BI_WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';
  standardMileageRate: number; // e.g. 0.67
  // Company Banking & Mercury API Integration
  bankName?: string;
  routingNumber?: string;
  accountNumber?: string;
  mercuryApiKey?: string;
  mercuryAccountId?: string;
  mercuryEnvironment?: 'SANDBOX' | 'PRODUCTION';
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
  payRate: number; // hourly rate ($) or salary per period ($)
  payFrequency?: 'WEEKLY' | 'BI_WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';
  // Federal W-4
  w4FilingStatus: 'SINGLE' | 'MARRIED_FILING_JOINTLY' | 'HEAD_OF_HOUSEHOLD';
  w4MultipleJobs: boolean;
  w4DependentCredit: number; // $ annual credit
  w4OtherIncome: number;
  w4Deductions: number;
  w4ExtraWithholding: number;
  // Generic State & Local Tax
  workState?: string;
  stateW4FilingStatus?: string;
  stateAllowances?: number;
  localTaxJurisdictionCode?: string; // e.g. 460401 or DE-WILMINGTON
  localTaxJurisdictionName?: string;
  localTaxRate?: number; // e.g. 0.01 (1.0%)
  localFlatTaxAnnual?: number; // e.g. 52 ($52/yr LST)
  localFlatTaxExempt?: boolean;
  taxAttributes?: Record<string, unknown>;
  // Legacy PA aliases (optional)
  paPsdCode?: string;
  paPsdName?: string;
  paResidentEitRate?: number;
  paWorkPsdCode?: string;
  paWorkEitRate?: number;
  paLstAnnual?: number;
  paLstExempt?: boolean;
  // Payout Details — ACH Direct Deposit (Single Bank Supported)
  bankName?: string;
  accountType?: 'CHECKING' | 'SAVINGS';
  routingNumber?: string;
  accountNumber?: string;
  bankAccountMasked?: string;
  isActive: boolean;
}

export interface MileageLog {
  id: string;
  employeeId: string;
  tripDate: string; // YYYY-MM-DD
  // 5-Point IRS Requirements
  originLocation: string;
  destinationLocation: string;
  businessPurpose: string; // Specific (e.g. "Vendor negotiation at distributor")
  startOdometer: number;
  endOdometer: number;
  calculatedMiles: number;
  // Financial
  rateApplied: number; // e.g. 0.67
  mileageAllowance: number; // miles * rate
  // Reimbursement & Tax Categorization
  isReimbursableAccountablePlan: boolean;
  status: 'PENDING' | 'APPROVED' | 'REIMBURSED' | 'OWNER_TAX_DEDUCTION';
  linkedPayStubId?: string;
  notes?: string;
  createdAt: string;
}

export interface TravelExpense {
  id: string;
  employeeId: string;
  mileageLogId?: string; // optionally linked to a 5-point trip
  expenseDate: string; // YYYY-MM-DD
  category: 'PARKING_FEE' | 'TOLL_ROAD' | 'BRIDGE_TOLL' | 'PUBLIC_TRANSIT';
  description: string; // e.g. "PA Turnpike Exit 326 Valley Forge Toll"
  amount: number; // in dollars e.g. 14.50
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
  // Earnings
  hoursWorked: number;
  overtimeHours: number;
  hourlyRate: number;
  grossEarnings: number;
  // Taxes Withheld (Employee)
  federalIncomeTax: number;
  socialSecurityTax: number; // 6.2%
  medicareTax: number; // 1.45%
  // State & Locality Attribution
  stateCode?: string; // e.g. "PA", "DE", "NJ"
  localityCode?: string; // e.g. "PA-PSD-460401"
  localityName?: string; // e.g. "Lower Merion Township"
  stateIncomeTax?: number;
  localIncomeTax?: number;
  localFlatTax?: number;
  totalEmployeeTaxes: number;
  // Accountable Plan Reimbursements (Non-Taxable)
  mileageReimbursement: number;
  travelExpensesReimbursement: number;
  totalReimbursements: number;
  // Net Take-Home Pay
  netPay: number; // (Gross - Taxes) + Reimbursements
  // Employer Taxes (Company Cost)
  employerSocialSecurity: number; // 6.2%
  employerMedicare: number; // 1.45%
  employerStateUnemployment?: number; // SUTA e.g. 3.5%
  taxBreakdown?: Record<string, unknown>;
  // Legacy aliases
  paStateTax?: number;
  paLocalEit?: number;
  paLst?: number;
  employerPaUc?: number;
  totalEmployerTaxes: number;
  totalCompanyCost: number; // Gross + Employer Taxes + Reimbursements
  // Disbursement
  disbursementMethod: 'ACH' | 'CHECK';
  disbursementStatus: 'PENDING' | 'PAID';
  achTraceRef?: string;
  paidAt?: string;
  createdAt: string;
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
  formIdentifier: string; // 'FORM_941', 'REV_1667', 'PA_UC_2', 'LOCAL_EIT_QTR', 'W2_W3'
  title: string;
  taxPeriodLabel: string; // e.g. '2026 Q1', '2026 Annual'
  dueDate: string;
  status: 'PENDING' | 'READY_TO_FILE' | 'FILED';
  amountDue: number;
  confirmationNumber?: string;
  filedDate?: string;
  boxValues: Record<string, { label: string; value: string | number; helper?: string }>;
}

export interface GeneralExpense {
  id: string;
  expenseDate: string; // YYYY-MM-DD
  category: 'LEGAL_ACCOUNTING' | 'SOFTWARE_TECH' | 'OFFICE_SUPPLIES' | 'PHONE_INTERNET' | 'BANK_FEES' | 'MARKETING' | 'UTILITIES' | 'RENT_LEASE' | 'OTHER';
  payee: string;
  description: string;
  amount: number;
  paidBy: 'OWNER_PERSONAL' | 'LLC_ACCOUNT';
  scheduleCLine?: string; // e.g. "Line 18 - Office Expense", "Line 8 - Advertising"
  isTaxDeductible?: boolean;
  receiptUrl?: string;
  receiptNote?: string;
  notes?: string;
  createdAt?: string;
}

export interface AuditLogEntry {
  id: string;
  companyId?: string;
  entityType: string; // e.g. "GeneralExpense", "PayrollRun", "MileageLog", "TaxRuleVersion"
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
  calculationType: string; // e.g. "PAYROLL_WITHHOLDING", "MILEAGE_DEDUCTION"
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
  workDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  unpaidBreakMinutes: number;
  regularHours: number;
  overtimeHours: number;
  notes?: string;
  status: TimesheetStatus;
  linkedPayStubId?: string;
  createdAt: string;
}

export type AllAppData = import('./utils/storage').AllAppData;


