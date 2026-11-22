/**
 * Payroll Tax Liability & Settlement Types.
 */

export type LiabilityStatus =
  | 'UNPAID'
  | 'ALLOCATED'
  | 'PENDING_REMITTANCE'
  | 'SETTLED'
  | 'RECONCILED'
  | 'OVERDUE';

export interface PayrollTaxLiability {
  id: string;
  companyId: string;
  payrollRunId?: string | null;
  taxYearId?: string;
  jurisdictionCode?: string;
  jurisdictionId?: string | null;
  agencyCode: string;
  taxType: string;
  amount: number;
  amountCents?: number;
  liabilityPeriodEnd: string;
  statutoryDueDate: string;
  status: LiabilityStatus;
  confirmationNumber?: string | null;
  paidAt?: string | null;
  notes?: string | null;
  rulePackVersion?: string;
  calculationSnapshotId?: string;
  allocations?: TaxPaymentAllocation[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TaxPaymentAllocation {
  id: string;
  companyId: string;
  liabilityId: string;
  taxPaymentId?: string;
  achBatchId?: string | null;
  amount: number;
  allocatedCents?: number;
  allocatedAt?: string;
  createdAt?: string;
}

export interface Federal941BundleSummary {
  taxPeriodEnd: string;
  statutoryDueDate: string;
  totalAmount: number;
  fitAmount: number;
  ficaSsAmount: number;
  ficaMedAmount: number;
  liabilityIds: string[];
  isSettled: boolean;
  confirmationNumber?: string | null;
  paidAt?: string | null;
  txpAddenda: string;
  portalUrl: string;
}

export interface StateRemittanceSummary {
  jurisdictionCode: string;
  agencyCode: string;
  taxType: string;
  taxPeriodEnd: string;
  statutoryDueDate: string;
  amount: number;
  liabilityId: string;
  isSettled: boolean;
  confirmationNumber?: string | null;
  paidAt?: string | null;
  txpAddenda?: string;
  portalUrl: string;
  portalName: string;
}
