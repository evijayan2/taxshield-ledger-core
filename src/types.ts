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

export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  role?: string;
}

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
  taxFilingStatus?: string;
  w4MultipleJobs: boolean;
  w4DependentCredit: number;
  w4DependentsAmount?: number;
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
export type WeekendRollRule = 'PREVIOUS_BUSINESS_DAY' | 'NEXT_BUSINESS_DAY' | 'EXACT_DAY';
export type CalendarPeriodStatus = 'DRAFT' | 'PUBLISHED' | 'OPEN' | 'LOCKED' | 'COMPLETED';

export interface PayScheduleConfig {
  id?: string;
  companyId: string;
  taxYearId?: string | null;
  payFrequency: PayrollFrequency;
  paydayDayOfWeek: number;
  anchorPayDate?: string | null;
  periodLagDays: number;
  semiMonthlyDay1: number;
  semiMonthlyDay2: number;
  monthlyPayDay: number;
  timesheetCutoffDays: number;
  weekendRollRule: WeekendRollRule;
  createdAt?: string;
  updatedAt?: string;
}

export interface PayrollCalendarPeriod {
  id: string;
  companyId: string;
  taxYearId: string;
  periodNumber: number;
  periodStart: string;
  periodEnd: string;
  timesheetLockDate: string;
  scheduledPayDate: string;
  actualPayDate: string;
  status: CalendarPeriodStatus;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TimesheetEntry {
  id: string;
  employeeId: string;
  periodId?: string | null;
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

export interface EmployeeWorkLocationHistory {
  id: string;
  employeeId: string;
  streetAddress?: string;
  city?: string;
  state: string;
  zip?: string;
  psdCode?: string;
  localJurisdictionName?: string;
  workEitRate?: number;
  allocationPercentage: number;
  effectiveDate: string;
  endDate?: string | null;
  createdAt?: string;
}

export interface CapitalAsset {
  id: string;
  companyId: string;
  assetName: string;
  category: 'MACHINERY_EQUIPMENT' | 'VEHICLE' | 'FURNITURE_FIXTURES' | 'COMPUTERS_SOFTWARE' | 'BUILDINGS_IMPROVEMENTS';
  datePlacedInService: string;
  costBasis: number;
  businessUsePercent: number;
  depreciationMethod: 'MACRS_200_DB' | 'MACRS_150_DB' | 'STRAIGHT_LINE' | 'SECTION_179';
  recoveryPeriodYears: number;
  section179Claimed: number;
  priorDepreciation: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HomeOfficeExpense {
  id: string;
  companyId: string;
  taxYearId: string;
  calculationMethod: 'SIMPLIFIED' | 'ACTUAL';
  totalHomeSquareFeet: number;
  officeSquareFeet: number;
  mortgageInterest: number;
  realEstateTaxes: number;
  homeInsurance: number;
  utilities: number;
  rent: number;
  repairsMaintenance: number;
  otherDirectExpenses: number;
  otherIndirectExpenses: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResolvedJurisdiction {
  code: string;
  name: string;
  level: 'FEDERAL' | 'STATE' | 'LOCAL';
  taxType: 'FIT' | 'FICA_SS' | 'FICA_MED' | 'SIT' | 'SUTA' | 'LOCAL_EIT' | 'LOCAL_LST';
  state?: string;
  localityCode?: string;
  localityName?: string;
  rate?: number;
  annualFlatAmount?: number;
  isReciprocalExempt?: boolean;
  reciprocalExemptionReason?: string;
}

export interface JurisdictionResolution {
  employeeId: string;
  residenceState: string;
  workState: string;
  residencePsdCode?: string;
  workPsdCode?: string;
  periodStart: string;
  periodEnd: string;
  resolvedJurisdictions: ResolvedJurisdiction[];
}

export interface CoverageMatrixItem {
  jurisdictionCode: string;
  jurisdictionName: string;
  level: 'FEDERAL' | 'STATE' | 'LOCAL';
  ruleCode: string;
  ruleCategory: string;
  requiredForRosterCount: number;
  status: 'ACTIVE' | 'IN_REVIEW' | 'DRAFT' | 'SUPERSEDED' | 'MISSING';
  activeVersionNumber?: number;
  citationTier?: 'TIER_1_OFFICIAL' | 'TIER_2_GOV_DEPT' | 'TIER_3_THIRD_PARTY';
  effectiveStart?: string;
  effectiveEnd?: string | null;
  blocksPayroll: boolean;
  issueReason?: string;
}

export interface TaxRuleCoverageReport {
  companyId: string;
  taxYear: number;
  generatedAt: string;
  readinessPercentage: number;
  totalRequiredJurisdictions: number;
  activeCount: number;
  pendingCount: number;
  missingCount: number;
  isPayrollBlocked: boolean;
  blockingJurisdictions: string[];
  items: CoverageMatrixItem[];
}

export interface NewYearRolloverStep {
  stepNumber: number;
  title: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  details?: string;
}

export interface NewYearRolloverSummary {
  companyId: string;
  fromYear: number;
  toYear: number;
  taxYearId: string;
  calendarPeriodsGenerated: number;
  activeEmployeesMigrated: number;
  packagesSynced: string[];
  rulesActivated: number;
  coverageReadiness: number;
  completedAt: string;
}

export interface AssetDepreciationYearSchedule {
  year: number;
  beginningBasis: number;
  section179Deduction: number;
  regularDepreciation: number;
  totalAnnualDepreciation: number;
  endingBasis: number;
  accumulatedDepreciation: number;
}

export interface AssetDepreciationSchedule {
  assetId: string;
  assetName: string;
  costBasis: number;
  businessBasis: number;
  section179Claimed: number;
  currentYearDepreciation: number;
  accumulatedDepreciation: number;
  remainingBasis: number;
  scheduleCLine13Amount: number;
  form4562Part1Section179: number;
  yearByYear: AssetDepreciationYearSchedule[];
}

export interface HomeOfficeDeductionResult {
  companyId: string;
  taxYearId: string;
  calculationMethod: 'SIMPLIFIED' | 'ACTUAL';
  totalHomeSquareFeet: number;
  officeSquareFeet: number;
  businessPercentage: number;
  simplifiedDeduction: number;
  actualDirectExpenses: number;
  actualIndirectExpenses: number;
  allocatedIndirectExpenses: number;
  actualTotalDeduction: number;
  allowedDeduction: number;
  scheduleCLine30Amount: number;
  netIncomeLimitApplied: boolean;
  recommendedMethod: 'SIMPLIFIED' | 'ACTUAL';
}

export interface TaxSimulationScenario {
  ownerTaxBracketPercent: number;
  grossRevenue: number;
  ownerW2Salary: number;
  ownerDraws: number;
  section179AssetExpense: number;
  homeOfficeMethod: 'SIMPLIFIED' | 'ACTUAL';
  otherDeductibleExpenses: number;
}

export interface MonthlyFilingItem {
  month: string;
  monthNumber: number;
  dueDate: string;
  amount: number;
  paSitAmount: number;
  federalAmount: number;
}

export interface TaxSimulationResult {
  grossRevenue: number;
  totalExpenses: number;
  netBusinessProfit: number;
  w2GrossSalary: number;
  ownerDraws: number;
  qbiDeduction: number; // Section 199A QBI (20% of net income)
  selfEmploymentTax: number;
  federalIncomeTax: number;
  stateIncomeTax: number;
  totalTaxLiability: number;
  effectiveTaxRatePercent: number;
  quarterlyEstimatedPayment: number;
  estimatedPaymentDates: Array<{ quarter: string; dueDate: string; amount: number }>;
  monthlyFilingSchedule: MonthlyFilingItem[];
}

export type ReceiptScanStatus = 'unconfirmed' | 'confirmed' | 'rejected';
export type ReceiptConfidence = 'high' | 'medium' | 'low';
export type GeneralExpenseCategory = GeneralExpense['category'];

export interface ReceiptOcrField<T> {
  value: T | null;
  rawText?: string;
  confidence: ReceiptConfidence;
  isEdited?: boolean;
}

export interface ScheduleCSuggestion {
  category: GeneralExpenseCategory;
  scheduleCLine: string;
  lineDescription: string;
  confidence: ReceiptConfidence;
  matchedKeywords: string[];
}

export interface ExtractedReceiptResult {
  scanId: string;
  status: ReceiptScanStatus;
  vendor: ReceiptOcrField<string>;
  date: ReceiptOcrField<string>;
  totalAmount: ReceiptOcrField<number>;
  subtotal?: ReceiptOcrField<number>;
  taxAmount?: ReceiptOcrField<number>;
  suggestedCategory: ReceiptOcrField<GeneralExpenseCategory>;
  suggestedScheduleCLine: ReceiptOcrField<string>;
  receiptFileName?: string;
  receiptFileUrl?: string;
  rawExtractedText?: string;
  notes?: string;
  createdAt: string;
}



