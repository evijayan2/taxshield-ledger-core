/**
 * Phase 3 Commercial Expansion Types
 * Invoicing, Stripe Payment Settlement, Contractor W-9 Hub & 1099-NEC
 */

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'VOID';

export interface Customer {
  id: string;
  companyId: string;
  name: string;
  contactPerson?: string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  id: string;
  companyId: string;
  customerId: string;
  customerName?: string;
  taxYearId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  stripePaymentId?: string | null;
  stripePaymentUrl?: string | null;
  notes?: string | null;
  lineItems: InvoiceLineItem[];
  createdAt?: string;
  updatedAt?: string;
}

export type TaxClassification =
  | 'INDIVIDUAL_SOLE_PROPRIETOR'
  | 'C_CORPORATION'
  | 'S_CORPORATION'
  | 'PARTNERSHIP'
  | 'LLC_DISREGARDED'
  | 'LLC_C_CORP'
  | 'LLC_S_CORP'
  | 'LLC_PARTNERSHIP'
  | 'OTHER';

export interface FormW9Record {
  id: string;
  companyId: string;
  employeeId: string;
  businessName?: string | null;
  taxClassification: TaxClassification | string;
  tinType: 'SSN' | 'EIN' | string;
  tinMasked: string;
  tinEncrypted?: string;
  exemptPayeeCode?: string | null;
  fatcaCode?: string | null;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  certifiedSignature: string;
  certifiedAt: string;
  ipAddress?: string | null;
  is1099Eligible: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContractorPayment {
  id: string;
  companyId: string;
  employeeId: string;
  taxYearId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'ACH' | 'CHECK' | 'WIRE' | string;
  referenceNumber?: string | null;
  description?: string | null;
  generalExpenseId?: string | null;
  createdAt?: string;
}

export type Contractor1099Status =
  | 'EXEMPT_ENTITY'
  | 'MISSING_W9'
  | 'BELOW_THRESHOLD'
  | 'THRESHOLD_MET';

export interface ContractorComplianceSummary {
  employeeId: string;
  contractorName: string;
  businessName?: string | null;
  tinMasked?: string | null;
  hasCertifiedW9: boolean;
  isCorporateExempt: boolean;
  ytdTotalPaid: number;
  thresholdAmount: number;
  status: Contractor1099Status;
  is1099Eligible: boolean;
}

export interface W9InviteToken {
  id: string;
  companyId: string;
  employeeId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
}

export interface CompanySequence {
  id: string;
  companyId: string;
  sequenceType: string;
  currentValue: number;
  updatedAt: string;
}

export interface ProcessedStripeEvent {
  id: string;
  companyId: string;
  eventId: string;
  eventType: string;
  processedAt: string;
}

export type BankReconciliationStatus = 'UNMATCHED' | 'NEEDS_REVIEW' | 'MATCHED' | 'DUPLICATE';

export type BankMatchedEntityType =
  | 'GENERAL_EXPENSE'
  | 'TRAVEL_EXPENSE'
  | 'INVOICE'
  | 'PAYROLL_RUN'
  | 'CONTRACTOR_PAYMENT'
  | 'TRANSFER_INTERNAL';

export interface BankImportBatch {
  id: string;
  companyId: string;
  fileName: string;
  accountName?: string | null;
  accountMask?: string | null;
  totalRows: number;
  matchedCount: number;
  reviewCount: number;
  unmatchedCount: number;
  duplicateCount: number;
  netAmount: number;
  importedAt?: string;
}

export interface BankTransaction {
  id: string;
  companyId: string;
  batchId: string;
  fingerprint: string;
  postedDate: string;
  rawDescription: string;
  cleanPayee: string;
  amount: number;
  transactionType: 'DEBIT' | 'CREDIT';
  reconciliationStatus: BankReconciliationStatus;
  matchedEntityType?: BankMatchedEntityType | null;
  matchedEntityId?: string | null;
  confidenceScore?: number | null;
  matchNotes?: string | null;
  reconciledAt?: string | null;
  reconciledBy?: string | null;
  createdAt?: string;
}

export interface ParsedBankRow {
  date: string;
  rawDescription: string;
  cleanPayee: string;
  amount: number;
  transactionType: 'DEBIT' | 'CREDIT';
  fitid?: string;
  fingerprint: string;
}

export interface CandidateMatch {
  entityType: BankMatchedEntityType;
  entityId: string;
  label: string;
  date: string;
  amount: number;
  payeeOrCustomer: string;
  confidenceScore: number;
  matchReasons: string[];
}

// ==========================================
// FEATURE 3.5: DUPLICATE DETECTION & AUDIT READINESS
// ==========================================

export type DuplicateSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type DuplicateMatchType =
  | 'EXACT_MATCH'
  | 'NEAR_DATE_MATCH'
  | 'FUZZY_PAYEE_MATCH'
  | 'BANK_COLLISION';

export interface DuplicateExpenseCandidate {
  entityType: 'GENERAL_EXPENSE' | 'TRAVEL_EXPENSE' | 'BANK_TRANSACTION';
  id: string;
  date: string;
  amount: number;
  payee: string;
  description: string;
  category?: string;
  receiptUrl?: string;
  matchedEntityId?: string | null;
}

export interface DuplicateExpenseMatch {
  id: string;
  primary: DuplicateExpenseCandidate;
  duplicate: DuplicateExpenseCandidate;
  matchType: DuplicateMatchType;
  severity: DuplicateSeverity;
  confidence: number;
  dateDeltaDays: number;
  reasons: string[];
  suggestedAction: string;
  isDismissed?: boolean;
}

export type AuditReadinessTier = 'AUDIT_READY' | 'GOOD_STANDING' | 'NEEDS_ATTENTION' | 'AUDIT_RISK';

export interface AuditReadinessPillar {
  id: string;
  name: string;
  score: number; // 0 to 100
  weight: number; // e.g. 0.25
  status: 'EXCELLENT' | 'GOOD' | 'NEEDS_WORK' | 'CRITICAL';
  description: string;
  metrics: {
    totalItems: number;
    compliantItems: number;
    percentage: number;
    detail: string;
  };
}

export type NeedsAttentionSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface NeedsAttentionItem {
  id: string;
  severity: NeedsAttentionSeverity;
  title: string;
  description: string;
  entityType: 'EXPENSE' | 'MILEAGE' | 'CONTRACTOR' | 'BANK_TRANSACTION' | 'DUPLICATE';
  entityId: string;
  actionRoute: string;
  suggestedFix: string;
  irsReference?: string;
}

export interface ExpenseAuditCheck {
  checkName: string;
  passed: boolean;
  message: string;
  irsRule?: string;
}

export interface ExpenseAuditDetail {
  expenseId: string;
  score: number;
  checks: ExpenseAuditCheck[];
  hasReceipt: boolean;
  hasPurpose: boolean;
  hasScheduleC: boolean;
  isBankReconciled: boolean;
  hasDuplicateWarning: boolean;
}

export interface CompanyAuditReadinessReport {
  companyId: string;
  taxYear: number;
  overallScore: number;
  tier: AuditReadinessTier;
  evaluatedAt: string;
  pillars: {
    receiptCoverage: AuditReadinessPillar;
    businessPurposeQuality: AuditReadinessPillar;
    bankReconciliation: AuditReadinessPillar;
    mileageCompleteness: AuditReadinessPillar;
    contractorCompliance: AuditReadinessPillar;
    duplicateHealth: AuditReadinessPillar;
  };
  duplicates: DuplicateExpenseMatch[];
  actionItems: NeedsAttentionItem[];
  perExpenseDetails: Record<string, ExpenseAuditDetail>;
  summaryStats: {
    totalExpensesCount: number;
    totalExpensesAmount: number;
    reconciledExpensesCount: number;
    missingReceiptsOver75Count: number;
    unresolvedDuplicatesCount: number;
    mileageTripsCount: number;
    mileageTripsCompliantCount: number;
    contractorsOverThresholdCount: number;
    missingW9Count: number;
  };
}
