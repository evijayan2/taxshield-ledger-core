import { Employee, EmployeeBankHistory, AuditLogEntry } from '../../types';

export interface ActiveBankAccount {
  bankName: string;
  accountType: 'CHECKING' | 'SAVINGS';
  routingNumber: string;
  accountNumber: string;
  bankAccountMasked: string;
}

/**
 * Safely masks a raw bank account number to show only the last 4 digits (•••• XXXX).
 */
export function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber) return '•••• 0000';
  const clean = accountNumber.replace(/\D/g, '');
  if (clean.length < 4) return '•••• ' + clean.padStart(4, '0');
  return '•••• ' + clean.slice(-4);
}

/**
 * Resolves the employee's active direct deposit bank account for a specific payment date (YYYY-MM-DD).
 */
export function resolveActiveBankAccount(
  employee: Employee,
  bankHistory: EmployeeBankHistory[] = [],
  dateStr: string = new Date().toISOString().split('T')[0]
): ActiveBankAccount {
  const targetDate = new Date(dateStr);

  const activeRecord = (bankHistory || []).find(h => {
    const start = new Date(h.effectiveDate);
    const end = h.endDate ? new Date(h.endDate) : new Date('2099-12-31');
    return start <= targetDate && end >= targetDate;
  });

  if (activeRecord) {
    return {
      bankName: activeRecord.bankName,
      accountType: (activeRecord.accountType as 'CHECKING' | 'SAVINGS') || 'CHECKING',
      routingNumber: activeRecord.routingNumber,
      accountNumber: activeRecord.accountNumber,
      bankAccountMasked: activeRecord.bankAccountMasked || maskAccountNumber(activeRecord.accountNumber),
    };
  }

  // Fallback to employee profile bank attributes
  const rawAccount = employee.accountNumber || '';
  const masked = employee.bankAccountMasked || maskAccountNumber(rawAccount);

  return {
    bankName: employee.bankName || 'Direct Deposit Bank',
    accountType: employee.accountType || 'CHECKING',
    routingNumber: employee.routingNumber || '',
    accountNumber: rawAccount,
    bankAccountMasked: masked,
  };
}

/**
 * Creates an immutable AuditLogEntry for employee bank account updates with ZERO secret leakage.
 * Plain-text account numbers are strictly excluded from audit payloads.
 */
export function createBankUpdateAuditEntry(
  companyId: string,
  employeeId: string,
  actorId: string,
  previousMask: string,
  newMask: string,
  newBankName: string
): AuditLogEntry {
  return {
    id: `audit-bank-${Date.now()}`,
    companyId,
    entityType: 'EMPLOYEE_BANK_ACCOUNT',
    entityId: employeeId,
    action: 'UPDATE',
    actorId,
    previousState: {
      maskedAccount: previousMask || 'None',
    },
    newState: {
      bankName: newBankName,
      maskedAccount: newMask,
    },
    reason: 'Employee Direct Deposit Account Security Update',
    timestamp: new Date().toISOString(),
  };
}
