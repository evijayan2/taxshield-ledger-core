import { describe, it, expect } from 'vitest';
import {
  normalizePayeeForDedupe,
  getDaysDifference,
  detectDuplicateExpenses,
  evaluateExpenseAudit,
  calculateAuditReadiness,
} from './auditReadinessService';
import { GeneralExpense, TravelExpense, MileageLog } from '../../types';
import { BankTransaction, ContractorPayment, FormW9Record } from '../../commercialTypes';

describe('Audit Readiness & Duplicate Detection Service', () => {
  describe('normalizePayeeForDedupe', () => {
    it('should strip store numbers, legal suffixes, and punctuation', () => {
      expect(normalizePayeeForDedupe('STAPLES #0129 INC.')).toBe('staples');
      expect(normalizePayeeForDedupe('Home Depot STORE 442, LLC')).toBe('home depot');
      expect(normalizePayeeForDedupe('FIGMA.COM')).toBe('figma');
      expect(normalizePayeeForDedupe('AWS Cloud Services Inc')).toBe('aws cloud services');
    });

    it('should handle empty or whitespace-only strings gracefully', () => {
      expect(normalizePayeeForDedupe('')).toBe('');
      expect(normalizePayeeForDedupe('   ')).toBe('');
    });
  });

  describe('getDaysDifference', () => {
    it('should calculate calendar day diff between ISO dates', () => {
      expect(getDaysDifference('2026-04-14', '2026-04-14')).toBe(0);
      expect(getDaysDifference('2026-04-14', '2026-04-16')).toBe(2);
      expect(getDaysDifference('2026-05-01', '2026-04-28')).toBe(3);
      expect(getDaysDifference('', '2026-04-14')).toBe(999);
    });
  });

  describe('detectDuplicateExpenses', () => {
    const expenseA: GeneralExpense = {
      id: 'exp_1',
      expenseDate: '2026-04-14',
      amount: 84.20,
      payee: 'Staples',
      description: 'Office paper and printer ink',
      category: 'OFFICE_SUPPLIES',
      paidBy: 'LLC_ACCOUNT',
    };

    const expenseB: GeneralExpense = {
      id: 'exp_2',
      expenseDate: '2026-04-14',
      amount: 84.20,
      payee: 'Staples',
      description: 'Office supplies',
      category: 'OFFICE_SUPPLIES',
      paidBy: 'LLC_ACCOUNT',
    };

    const expenseC_diffDate: GeneralExpense = {
      id: 'exp_3',
      expenseDate: '2026-04-16',
      amount: 84.20,
      payee: 'STAPLES #0129',
      description: 'Paper',
      category: 'OFFICE_SUPPLIES',
      paidBy: 'LLC_ACCOUNT',
    };

    const bankDebit: BankTransaction = {
      id: 'btx_1',
      companyId: 'comp_1',
      batchId: 'batch_1',
      fingerprint: 'fp_1',
      postedDate: '2026-04-15',
      rawDescription: 'POS DEBIT STAPLES 0129',
      cleanPayee: 'Staples',
      amount: 84.20,
      transactionType: 'DEBIT',
      reconciliationStatus: 'NEEDS_REVIEW',
    };

    it('should detect exact same-day duplicate general expenses with HIGH severity', () => {
      const matches = detectDuplicateExpenses({
        generalExpenses: [expenseA, expenseB],
      });

      expect(matches.length).toBe(1);
      expect(matches[0].severity).toBe('HIGH');
      expect(matches[0].matchType).toBe('EXACT_MATCH');
      expect(matches[0].confidence).toBeGreaterThanOrEqual(0.95);
      expect(matches[0].dateDeltaDays).toBe(0);
    });

    it('should detect near-date duplicate within 3 days with fuzzy payee name', () => {
      const matches = detectDuplicateExpenses({
        generalExpenses: [expenseA, expenseC_diffDate],
      });

      expect(matches.length).toBe(1);
      expect(matches[0].matchType).toBe('NEAR_DATE_MATCH');
      expect(matches[0].dateDeltaDays).toBe(2);
      expect(matches[0].reasons.length).toBeGreaterThan(0);
    });

    it('should detect bank transaction collision against manual ledger entry', () => {
      const matches = detectDuplicateExpenses({
        generalExpenses: [expenseA],
        bankTransactions: [bankDebit],
      });

      expect(matches.length).toBe(1);
      expect(matches[0].matchType).toBe('BANK_COLLISION');
      expect(matches[0].primary.entityType).toBe('GENERAL_EXPENSE');
      expect(matches[0].duplicate.entityType).toBe('BANK_TRANSACTION');
    });

    it('should exclude dismissed duplicate pairs', () => {
      const matches = detectDuplicateExpenses({
        generalExpenses: [expenseA, expenseB],
        dismissedPairKeys: ['exp_1_exp_2'],
      });

      expect(matches.length).toBe(0);
    });

    it('should not match transactions with different amounts or dates > 3 days', () => {
      const expenseFar: GeneralExpense = {
        ...expenseA,
        id: 'exp_far',
        expenseDate: '2026-05-20',
      };
      const expenseDiffAmt: GeneralExpense = {
        ...expenseA,
        id: 'exp_diff',
        amount: 150.00,
      };

      const matches = detectDuplicateExpenses({
        generalExpenses: [expenseA, expenseFar, expenseDiffAmt],
      });

      expect(matches.length).toBe(0);
    });
  });

  describe('evaluateExpenseAudit', () => {
    it('should award high score for expense >= $75 with receipt and business purpose', () => {
      const exp: GeneralExpense = {
        id: 'exp_ok',
        expenseDate: '2026-05-10',
        amount: 120.00,
        payee: 'Staples',
        description: 'Printer cartridges for client contracts',
        category: 'OFFICE_SUPPLIES',
        scheduleCLine: 'Line 18 - Office Expense',
        paidBy: 'LLC_ACCOUNT',
        receiptUrl: 'https://storage.taxshield.internal/receipts/exp_ok.pdf',
      };

      const audit = evaluateExpenseAudit(exp, true, false);
      expect(audit.score).toBeGreaterThanOrEqual(90);
      expect(audit.hasReceipt).toBe(true);
      expect(audit.hasPurpose).toBe(true);
      expect(audit.isBankReconciled).toBe(true);
    });

    it('should penalize expense >= $75 missing receipt per IRS IRC § 274(d)', () => {
      const exp: GeneralExpense = {
        id: 'exp_no_receipt',
        expenseDate: '2026-05-10',
        amount: 250.00,
        payee: 'Best Buy',
        description: 'External monitor for mobile workstation',
        category: 'OFFICE_SUPPLIES',
        scheduleCLine: 'Line 18 - Office Expense',
        paidBy: 'LLC_ACCOUNT',
      };

      const audit = evaluateExpenseAudit(exp, false, false);
      expect(audit.hasReceipt).toBe(false);
      const receiptCheck = audit.checks.find((c) => c.checkName.includes('Receipt Required'));
      expect(receiptCheck?.passed).toBe(false);
      expect(receiptCheck?.irsRule).toContain('274(d)');
      expect(audit.score).toBeLessThan(75);
    });

    it('should allow expense < $75 without receipt per IRS Rev. Proc. 95-48 exemption', () => {
      const exp: GeneralExpense = {
        id: 'exp_under_75',
        expenseDate: '2026-05-10',
        amount: 24.50,
        payee: 'Coffee Shop',
        description: 'Client coffee meeting to review quarterly projections',
        category: 'OTHER',
        scheduleCLine: 'Line 27a - Other Expenses',
        paidBy: 'LLC_ACCOUNT',
      };

      const audit = evaluateExpenseAudit(exp, true, false);
      expect(audit.hasReceipt).toBe(false);
      const receiptCheck = audit.checks.find((c) => c.checkName.includes('Optional'));
      expect(receiptCheck?.passed).toBe(true);
      expect(receiptCheck?.irsRule).toContain('95-48');
    });

    it('should penalize vague or missing business purpose', () => {
      const exp: GeneralExpense = {
        id: 'exp_vague',
        expenseDate: '2026-05-10',
        amount: 45.00,
        payee: 'Vendor',
        description: 'misc',
        category: 'OTHER',
        paidBy: 'LLC_ACCOUNT',
      };

      const audit = evaluateExpenseAudit(exp, false, false);
      expect(audit.hasPurpose).toBe(false);
      const purposeCheck = audit.checks.find((c) => c.checkName.includes('Business Purpose Missing'));
      expect(purposeCheck?.passed).toBe(false);
    });
  });

  describe('calculateAuditReadiness', () => {
    it('should calculate AUDIT_READY score for comprehensive compliant ledger', () => {
      const generalExpenses: GeneralExpense[] = [
        {
          id: 'exp_1',
          expenseDate: '2026-04-10',
          amount: 150.00,
          payee: 'AWS Hosting',
          description: 'Production infrastructure for client web apps',
          category: 'SOFTWARE_TECH',
          scheduleCLine: 'Line 27a',
          paidBy: 'LLC_ACCOUNT',
          receiptUrl: 'https://example.com/receipt1.pdf',
        },
        {
          id: 'exp_2',
          expenseDate: '2026-04-12',
          amount: 45.00,
          payee: 'Office Supplies',
          description: 'Notebooks and pens for tax planning',
          category: 'OFFICE_SUPPLIES',
          scheduleCLine: 'Line 18',
          paidBy: 'LLC_ACCOUNT',
          receiptUrl: 'https://example.com/receipt2.pdf',
        },
      ];

      const bankTransactions: BankTransaction[] = [
        {
          id: 'btx_1',
          companyId: 'comp_1',
          batchId: 'batch_1',
          fingerprint: 'fp_1',
          postedDate: '2026-04-11',
          rawDescription: 'AWS CLOUD',
          cleanPayee: 'AWS',
          amount: 150.00,
          transactionType: 'DEBIT',
          reconciliationStatus: 'MATCHED',
          matchedEntityId: 'exp_1',
        },
      ];

      const mileageLogs: MileageLog[] = [
        {
          id: 'mil_1',
          employeeId: 'emp_1',
          tripDate: '2026-04-15',
          originLocation: 'Philadelphia, PA',
          destinationLocation: 'King of Prussia, PA',
          businessPurpose: 'Client consultation for annual tax audit',
          startOdometer: 12000,
          endOdometer: 12042,
          calculatedMiles: 42,
          rateApplied: 0.67,
          mileageAllowance: 28.14,
          isReimbursableAccountablePlan: true,
          status: 'APPROVED',
          createdAt: '2026-04-15T12:00:00Z',
        },
      ];

      const contractorPayments: ContractorPayment[] = [
        {
          id: 'cp_1',
          companyId: 'comp_1',
          employeeId: 'emp_contractor_1',
          taxYearId: 'ty_2026',
          amount: 800.00,
          paymentDate: '2026-04-18',
          paymentMethod: 'ACH',
        },
      ];

      const w9Records: FormW9Record[] = [
        {
          id: 'w9_1',
          companyId: 'comp_1',
          employeeId: 'emp_contractor_1',
          taxClassification: 'INDIVIDUAL_SOLE_PROPRIETOR',
          tinType: 'SSN',
          tinMasked: '***-**-4321',
          tinEncrypted: 'enc_tin_123',
          address: '123 Tech Way',
          city: 'Philadelphia',
          state: 'PA',
          zipCode: '19104',
          certifiedSignature: 'Alex Consultant',
          certifiedAt: '2026-01-10T10:00:00Z',
          is1099Eligible: true,
        },
      ];

      const report = calculateAuditReadiness({
        companyId: 'comp_1',
        taxYear: 2026,
        generalExpenses,
        bankTransactions,
        mileageLogs,
        contractorPayments,
        w9Records,
      });

      expect(report.overallScore).toBeGreaterThanOrEqual(90);
      expect(report.tier).toBe('AUDIT_READY');
      expect(report.pillars.receiptCoverage.score).toBeGreaterThanOrEqual(90);
      expect(report.pillars.businessPurposeQuality.score).toBe(100);
      expect(report.pillars.bankReconciliation.score).toBe(100);
      expect(report.pillars.mileageCompleteness.score).toBe(100);
      expect(report.pillars.contractorCompliance.score).toBe(100);
      expect(report.pillars.duplicateHealth.score).toBe(100);
      expect(report.duplicates.length).toBe(0);
    });

    it('should generate CRITICAL action items when documentation is missing', () => {
      const generalExpenses: GeneralExpense[] = [
        {
          id: 'exp_no_rcpt',
          expenseDate: '2026-06-01',
          amount: 500.00,
          payee: 'Hardware Superstore',
          description: '', // missing purpose
          category: 'OFFICE_SUPPLIES',
          paidBy: 'LLC_ACCOUNT',
        },
      ];

      const contractorPayments: ContractorPayment[] = [
        {
          id: 'cp_no_w9',
          companyId: 'comp_1',
          employeeId: 'emp_missing_w9',
          taxYearId: 'ty_2026',
          amount: 1200.00,
          paymentDate: '2026-06-02',
          paymentMethod: 'ACH',
        },
      ];

      const report = calculateAuditReadiness({
        companyId: 'comp_1',
        taxYear: 2026,
        generalExpenses,
        contractorPayments,
        w9Records: [], // zero W-9s
      });

      expect(report.overallScore).toBeLessThan(75);
      expect(report.actionItems.length).toBeGreaterThanOrEqual(2);

      const receiptAction = report.actionItems.find((a) => a.id.includes('missing_receipt'));
      expect(receiptAction).toBeDefined();
      expect(receiptAction?.severity).toBe('CRITICAL');
      expect(receiptAction?.irsReference).toContain('274(d)');

      const w9Action = report.actionItems.find((a) => a.id.includes('missing_w9'));
      expect(w9Action).toBeDefined();
      expect(w9Action?.severity).toBe('CRITICAL');
      expect(w9Action?.irsReference).toContain('1099-NEC');
    });
  });
});
