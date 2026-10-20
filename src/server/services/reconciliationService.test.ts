import { describe, it, expect } from 'vitest';
import {
  findCandidateMatches,
  classifyTransaction,
  reconcileBankBatch,
  calculateTextSimilarity,
  LedgerReconciliationData,
} from './reconciliationService';
import { GeneralExpense, PayrollRun } from '../../types';
import { Invoice, ContractorPayment } from '../../commercialTypes';

describe('reconciliationService', () => {
  const companyId = 'comp-recon-test';

  const mockExpenses: GeneralExpense[] = [
    {
      id: 'exp-1',
      expenseDate: '2026-05-01',
      category: 'OFFICE_SUPPLIES',
      payee: 'Staples',
      description: 'Printer ink and copy paper',
      amount: 84.5,
      scheduleCLine: '18',
      isTaxDeductible: true,
      paidBy: 'LLC_ACCOUNT',
    },
    {
      id: 'exp-2',
      expenseDate: '2026-05-02',
      category: 'SOFTWARE_TECH',
      payee: 'GitHub',
      description: 'Team copilot subscription',
      amount: 42.0,
      scheduleCLine: '27a',
      isTaxDeductible: true,
      paidBy: 'LLC_ACCOUNT',
    },
    {
      id: 'exp-3-ambiguous-a',
      expenseDate: '2026-05-10',
      category: 'OTHER',
      payee: 'Corner Cafe',
      description: 'Client meeting lunch',
      amount: 50.0,
      scheduleCLine: '24b',
      isTaxDeductible: true,
      paidBy: 'LLC_ACCOUNT',
    },
    {
      id: 'exp-3-ambiguous-b',
      expenseDate: '2026-05-10',
      category: 'OTHER',
      payee: 'Downtown Bistro',
      description: 'Dinner with partner',
      amount: 50.0,
      scheduleCLine: '24b',
      isTaxDeductible: true,
      paidBy: 'LLC_ACCOUNT',
    },
  ];

  const mockInvoices: Invoice[] = [
    {
      id: 'inv-1',
      companyId,
      customerId: 'cust-1',
      customerName: 'Acme Corporation',
      taxYearId: 'ty-2026',
      invoiceNumber: 'INV-2026-001',
      issueDate: '2026-05-01',
      dueDate: '2026-05-31',
      status: 'PAID',
      subtotal: 6500.0,
      taxAmount: 0,
      totalAmount: 6500.0,
      amountPaid: 6500.0,
      lineItems: [],
    },
  ];

  const mockPayrollRuns: PayrollRun[] = [
    {
      id: 'pay-1',
      periodStart: '2026-04-16',
      periodEnd: '2026-04-30',
      payDate: '2026-05-05',
      status: 'DISBURSED',
      totalGross: 3000.0,
      totalEmployeeTaxes: 450.0,
      totalReimbursements: 0,
      totalNetPay: 2550.0,
      totalEmployerTaxes: 230.0,
      totalCompanyCost: 3230.0,
      stubsCount: 1,
      createdAt: '2026-05-05T00:00:00.000Z',
    },
  ];

  const mockContractorPayments: ContractorPayment[] = [
    {
      id: 'cp-1',
      companyId,
      employeeId: 'emp-contractor-1',
      taxYearId: 'ty-2026',
      paymentDate: '2026-05-08',
      amount: 750.0,
      paymentMethod: 'ACH',
      description: 'Dave Designer - Brand Refresh Milestone 1',
    },
  ];

  const mockLedger: LedgerReconciliationData = {
    generalExpenses: mockExpenses,
    invoices: mockInvoices,
    payrollRuns: mockPayrollRuns,
    contractorPayments: mockContractorPayments,
  };

  describe('calculateTextSimilarity', () => {
    it('should return 1.0 for exact matches', () => {
      expect(calculateTextSimilarity('Staples', 'staples')).toBe(1.0);
    });

    it('should return high score for substring containment', () => {
      expect(calculateTextSimilarity('Staples Inc', 'Staples')).toBeGreaterThanOrEqual(0.85);
    });

    it('should return 0 for unrelated strings', () => {
      expect(calculateTextSimilarity('Home Depot', 'Staples')).toBe(0);
    });
  });

  describe('findCandidateMatches & classifyTransaction', () => {
    it('should classify exact expense match as MATCHED (score >= 0.95)', () => {
      const bankTx = {
        fingerprint: 'fp-1',
        amount: 84.5,
        postedDate: '2026-05-01',
        cleanPayee: 'Staples',
        rawDescription: 'POS DEBIT STAPLES 0129',
        transactionType: 'DEBIT' as const,
      };

      const candidates = findCandidateMatches(bankTx, mockLedger);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].entityType).toBe('GENERAL_EXPENSE');
      expect(candidates[0].entityId).toBe('exp-1');
      expect(candidates[0].confidenceScore).toBeGreaterThanOrEqual(0.95);

      const classification = classifyTransaction(bankTx, candidates, new Set());
      expect(classification.status).toBe('MATCHED');
      expect(classification.bestMatch?.entityId).toBe('exp-1');
    });

    it('should classify date lag or fuzzy match as NEEDS_REVIEW (default per AGENTS.md)', () => {
      const bankTx = {
        fingerprint: 'fp-2',
        amount: 42.0,
        postedDate: '2026-05-05', // 3 days after May 2nd expense
        cleanPayee: 'GitHub Copilot',
        rawDescription: 'GITHUB *COPILOT SUB',
        transactionType: 'DEBIT' as const,
      };

      const candidates = findCandidateMatches(bankTx, mockLedger);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].entityId).toBe('exp-2');

      const classification = classifyTransaction(bankTx, candidates, new Set());
      expect(classification.status).toBe('NEEDS_REVIEW');
    });

    it('should default to NEEDS_REVIEW when multiple candidate expenses match the same amount', () => {
      const bankTx = {
        fingerprint: 'fp-ambiguous',
        amount: 50.0,
        postedDate: '2026-05-10',
        cleanPayee: 'Cafe Bistro Lunch',
        rawDescription: 'CAFE BISTRO',
        transactionType: 'DEBIT' as const,
      };

      const candidates = findCandidateMatches(bankTx, mockLedger);
      expect(candidates.length).toBe(2); // Both Corner Cafe and Downtown Bistro match $50

      const classification = classifyTransaction(bankTx, candidates, new Set());
      expect(classification.status).toBe('NEEDS_REVIEW');
      expect(classification.matchNotes).toContain('Multiple matching candidates found');
    });

    it('should classify unknown transaction as UNMATCHED', () => {
      const bankTx = {
        fingerprint: 'fp-unknown',
        amount: 199.99,
        postedDate: '2026-05-20',
        cleanPayee: 'Mystery Merchant LLC',
        rawDescription: 'POS DEBIT MYSTERY MERCHANT',
        transactionType: 'DEBIT' as const,
      };

      const candidates = findCandidateMatches(bankTx, mockLedger);
      expect(candidates.length).toBe(0);

      const classification = classifyTransaction(bankTx, candidates, new Set());
      expect(classification.status).toBe('UNMATCHED');
    });

    it('should detect DUPLICATE when fingerprint was previously reconciled', () => {
      const bankTx = {
        fingerprint: 'fp-already-seen',
        amount: 84.5,
        postedDate: '2026-05-01',
        cleanPayee: 'Staples',
        rawDescription: 'POS DEBIT STAPLES',
        transactionType: 'DEBIT' as const,
      };

      const existingFingerprints = new Set(['fp-already-seen']);
      const classification = classifyTransaction(bankTx, [], existingFingerprints);
      expect(classification.status).toBe('DUPLICATE');
    });

    it('should match incoming credit against paid Invoices', () => {
      const bankTx = {
        fingerprint: 'fp-inv-1',
        amount: 6500.0,
        postedDate: '2026-05-02',
        cleanPayee: 'Acme Corporation',
        rawDescription: 'DIRECT DEPOSIT ACME CORP INV-2026-001',
        transactionType: 'CREDIT' as const,
      };

      const candidates = findCandidateMatches(bankTx, mockLedger);
      expect(candidates.length).toBe(1);
      expect(candidates[0].entityType).toBe('INVOICE');
      expect(candidates[0].entityId).toBe('inv-1');
      expect(candidates[0].confidenceScore).toBeGreaterThanOrEqual(0.95);

      const classification = classifyTransaction(bankTx, candidates, new Set());
      expect(classification.status).toBe('MATCHED');
    });

    it('should match payroll disbursement against PayrollRuns', () => {
      const bankTx = {
        fingerprint: 'fp-pay-1',
        amount: 2550.0, // net pay
        postedDate: '2026-05-06',
        cleanPayee: 'Gusto Payroll',
        rawDescription: 'ACH WITHDRAWAL GUSTO PAYROLL',
        transactionType: 'DEBIT' as const,
      };

      const candidates = findCandidateMatches(bankTx, mockLedger);
      expect(candidates.length).toBe(1);
      expect(candidates[0].entityType).toBe('PAYROLL_RUN');
      expect(candidates[0].entityId).toBe('pay-1');

      const classification = classifyTransaction(bankTx, candidates, new Set());
      expect(classification.status).toBe('MATCHED');
    });

    it('should match 1099 contractor payment against ContractorPayments', () => {
      const bankTx = {
        fingerprint: 'fp-cp-1',
        amount: 750.0,
        postedDate: '2026-05-09',
        cleanPayee: 'Dave Designer',
        rawDescription: 'ACH DEBIT TO DAVE DESIGNER',
        transactionType: 'DEBIT' as const,
      };

      const candidates = findCandidateMatches(bankTx, mockLedger);
      expect(candidates.length).toBe(1);
      expect(candidates[0].entityType).toBe('CONTRACTOR_PAYMENT');
      expect(candidates[0].entityId).toBe('cp-1');

      const classification = classifyTransaction(bankTx, candidates, new Set());
      expect(classification.status).toBe('MATCHED');
    });
  });

  describe('reconcileBankBatch', () => {
    it('should process full batch and generate summary counts', () => {
      const parsedRows = [
        {
          date: '2026-05-01',
          rawDescription: 'POS DEBIT STAPLES',
          cleanPayee: 'Staples',
          amount: 84.5,
          transactionType: 'DEBIT' as const,
          fingerprint: 'fp-batch-1',
        },
        {
          date: '2026-05-05',
          rawDescription: 'GITHUB COPILOT',
          cleanPayee: 'GitHub Copilot',
          amount: 42.0,
          transactionType: 'DEBIT' as const,
          fingerprint: 'fp-batch-2',
        },
        {
          date: '2026-05-20',
          rawDescription: 'UNKNOWN DRINK SHOP',
          cleanPayee: 'Unknown Drink Shop',
          amount: 15.0,
          transactionType: 'DEBIT' as const,
          fingerprint: 'fp-batch-3',
        },
        {
          date: '2026-05-01',
          rawDescription: 'POS DEBIT STAPLES',
          cleanPayee: 'Staples',
          amount: 84.5,
          transactionType: 'DEBIT' as const,
          fingerprint: 'fp-batch-duplicate',
        },
      ];

      const existingFingerprints = new Set(['fp-batch-duplicate']);

      const result = reconcileBankBatch(
        parsedRows,
        companyId,
        'batch-1',
        mockLedger,
        existingFingerprints
      );

      expect(result.summary.total).toBe(4);
      expect(result.summary.matched).toBe(1);
      expect(result.summary.needsReview).toBe(1);
      expect(result.summary.unmatched).toBe(1);
      expect(result.summary.duplicate).toBe(1);

      expect(result.reconciledRows).toHaveLength(4);
    });
  });
});
