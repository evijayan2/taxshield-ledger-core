import { describe, it, expect } from 'vitest';
import { maskAccountNumber, resolveActiveBankAccount, createBankUpdateAuditEntry } from './bankHistoryService';
import { Employee, EmployeeBankHistory } from '../../types';

describe('bankHistoryService', () => {
  const sampleEmployee: Employee = {
    id: 'emp-1',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    phone: '555-1234',
    ssnLastFour: '1234',
    employmentType: 'W2_SALARY',
    payRate: 80000,
    w4FilingStatus: 'SINGLE',
    w4MultipleJobs: false,
    w4DependentCredit: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    w4ExtraWithholding: 0,
    bankName: 'Chase Bank',
    accountType: 'CHECKING',
    routingNumber: '021000021',
    accountNumber: '123456789',
    bankAccountMasked: '•••• 6789',
    isActive: true,
  };

  it('correctly masks raw bank account numbers', () => {
    expect(maskAccountNumber('123456789')).toBe('•••• 6789');
    expect(maskAccountNumber('9876')).toBe('•••• 9876');
    expect(maskAccountNumber('')).toBe('•••• 0000');
  });

  it('resolves default employee bank profile when no history exists', () => {
    const activeBank = resolveActiveBankAccount(sampleEmployee, [], '2026-05-15');
    expect(activeBank.bankName).toBe('Chase Bank');
    expect(activeBank.routingNumber).toBe('021000021');
    expect(activeBank.bankAccountMasked).toBe('•••• 6789');
  });

  it('resolves new active PNC bank account after direct deposit change on 2026-09-01', () => {
    const history: EmployeeBankHistory[] = [
      {
        id: 'ebh-1',
        employeeId: 'emp-1',
        bankName: 'Chase Bank',
        accountType: 'CHECKING',
        routingNumber: '021000021',
        accountNumber: '123456789',
        bankAccountMasked: '•••• 6789',
        effectiveDate: '2026-01-01',
        endDate: '2026-08-31',
      },
      {
        id: 'ebh-2',
        employeeId: 'emp-1',
        bankName: 'PNC Bank',
        accountType: 'CHECKING',
        routingNumber: '043000096',
        accountNumber: '987654321',
        bankAccountMasked: '•••• 4321',
        effectiveDate: '2026-09-01',
        endDate: null,
      },
    ];

    // Pay date Aug 15 -> Chase
    const augDisbursement = resolveActiveBankAccount(sampleEmployee, history, '2026-08-15');
    expect(augDisbursement.bankName).toBe('Chase Bank');
    expect(augDisbursement.bankAccountMasked).toBe('•••• 6789');

    // Pay date Sept 15 -> PNC
    const septDisbursement = resolveActiveBankAccount(sampleEmployee, history, '2026-09-15');
    expect(septDisbursement.bankName).toBe('PNC Bank');
    expect(septDisbursement.routingNumber).toBe('043000096');
    expect(septDisbursement.bankAccountMasked).toBe('•••• 4321');
  });

  it('creates audit log entry with zero secret leakage (account numbers masked)', () => {
    const auditEntry = createBankUpdateAuditEntry(
      'comp-1',
      'emp-1',
      'usr-1',
      '•••• 6789',
      '•••• 4321',
      'PNC Bank'
    );

    expect(auditEntry.action).toBe('UPDATE');
    expect(auditEntry.previousState).toEqual({ maskedAccount: '•••• 6789' });
    expect(auditEntry.newState).toEqual({ bankName: 'PNC Bank', maskedAccount: '•••• 4321' });

    // Verify unmasked secret (123456789 / 987654321) is NOT leaked anywhere in audit JSON
    const auditJsonStr = JSON.stringify(auditEntry);
    expect(auditJsonStr).not.toContain('123456789');
    expect(auditJsonStr).not.toContain('987654321');
  });
});
