/**
 * Domain types for Provider Payroll Import and Audit Variance Reconciliation.
 */
import type { Employee, CompanyTaxSetting } from './types';

export type ProviderType = 'GUSTO' | 'QUICKBOOKS' | 'GENERIC';

export type VarianceCategory =
  | 'MATCH'
  | 'ROUNDING_DRIFT'
  | 'TAX_MISCALCULATION'
  | 'S_CORP_HEALTH_ERROR'
  | 'SUTA_RATE_MISMATCH'
  | 'LOCAL_TAX_DISCREPANCY'
  | 'MISSING_DATA';

export type AuditLineStatus = 'CLEAN' | 'WARNING' | 'CRITICAL_DISCREPANCY';

export interface ProviderPayrollRow {
  employeeName: string;
  ssnLast4?: string;
  periodStart: string;
  periodEnd: string;
  checkDate: string;
  grossWages: number;
  fitWithheld: number;
  ficaSsWithheld: number;
  ficaMedWithheld: number;
  stateWithheld: number;
  localWithheld: number;
  netPay: number;
  employerSuta?: number;
  employerFuta?: number;
  sCorpHealth?: number;
  rawLine?: Record<string, string>;
}

export interface AuditVarianceLine {
  fieldName: string;
  displayName: string;
  providerValue: number;
  taxShieldValue: number;
  delta: number;
  category: VarianceCategory;
  explanation: string;
  statutoryCitation?: string;
}

export interface AuditComparisonResult {
  employeeName: string;
  employeeId?: string;
  periodStart: string;
  periodEnd: string;
  checkDate: string;
  status: AuditLineStatus;
  providerRow: ProviderPayrollRow;
  taxShieldCalculated?: {
    grossEarnings: number;
    fit: number;
    ss: number;
    med: number;
    sit: number;
    eit: number;
    suta: number;
    netPay: number;
  };
  variances: AuditVarianceLine[];
  explanation: string;
}

export interface ProviderAuditReport {
  id: string;
  companyId: string;
  provider: ProviderType;
  analyzedAt: string;
  totalGross: number;
  totalNet: number;
  totalProviderTaxes: number;
  totalTaxShieldTaxes: number;
  totalVariance: number;
  cleanCount: number;
  warningCount: number;
  criticalCount: number;
  comparisons: AuditComparisonResult[];
  summaryExplanation: string;
}
