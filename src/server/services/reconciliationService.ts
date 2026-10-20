import {
  BankTransaction,
  BankReconciliationStatus,
  BankMatchedEntityType,
  CandidateMatch,
  Invoice,
  ContractorPayment,
} from '../../commercialTypes';
import { GeneralExpense, TravelExpense, PayrollRun } from '../../types';

export interface LedgerReconciliationData {
  generalExpenses: GeneralExpense[];
  travelExpenses?: TravelExpense[];
  invoices: Invoice[];
  payrollRuns: PayrollRun[];
  contractorPayments: ContractorPayment[];
}

export interface ReconciledTransactionResult {
  transaction: BankTransaction;
  reconciliationStatus: BankReconciliationStatus;
  matchedEntityType?: BankMatchedEntityType | null;
  matchedEntityId?: string | null;
  confidenceScore?: number | null;
  matchNotes?: string | null;
  candidates: CandidateMatch[];
}

/**
 * Calculates string similarity (0.0 to 1.0) using tokenized Jaccard overlap.
 */
export function calculateTextSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const s2 = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  const tokens1 = new Set(s1.split(/\s+/).filter((t) => t.length > 2));
  const tokens2 = new Set(s2.split(/\s+/).filter((t) => t.length > 2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Computes difference in calendar days between two ISO YYYY-MM-DD dates.
 */
export function getDayDifference(dateA: string, dateB: string): number {
  const d1 = new Date(dateA).getTime();
  const d2 = new Date(dateB).getTime();
  return Math.abs(Math.round((d1 - d2) / (1000 * 60 * 60 * 24)));
}

/**
 * Finds all candidate matches across the 4 ledger entities for a single bank transaction.
 */
export function findCandidateMatches(
  bankTx: {
    amount: number;
    postedDate: string;
    cleanPayee: string;
    rawDescription: string;
    transactionType: 'DEBIT' | 'CREDIT';
  },
  ledger: LedgerReconciliationData
): CandidateMatch[] {
  const candidates: CandidateMatch[] = [];

  if (bankTx.transactionType === 'DEBIT') {
    // 1. General Expenses
    for (const exp of ledger.generalExpenses) {
      const amountDiff = Math.abs(exp.amount - bankTx.amount);
      if (amountDiff > 1.0 && Math.abs(amountDiff / bankTx.amount) > 0.05) continue;

      const dayDiff = getDayDifference(bankTx.postedDate, exp.expenseDate);
      if (dayDiff > 14) continue;

      const payeeSim = calculateTextSimilarity(bankTx.cleanPayee, exp.payee);
      const matchReasons: string[] = [];

      let score = 0;
      if (amountDiff < 0.01) {
        score += 0.5;
        matchReasons.push('Exact amount match');
      } else {
        score += 0.3;
        matchReasons.push(`Amount within $${amountDiff.toFixed(2)}`);
      }

      if (dayDiff === 0) {
        score += 0.3;
        matchReasons.push('Exact date match');
      } else if (dayDiff <= 3) {
        score += 0.2;
        matchReasons.push(`${dayDiff} days date clearance`);
      } else {
        score += 0.1;
      }

      if (payeeSim >= 0.8) {
        score += 0.2;
        matchReasons.push(`High payee match ("${exp.payee}")`);
      } else if (payeeSim >= 0.4) {
        score += 0.1;
        matchReasons.push(`Partial payee match ("${exp.payee}")`);
      }

      if (score >= 0.5) {
        candidates.push({
          entityType: 'GENERAL_EXPENSE',
          entityId: exp.id,
          label: `Expense: ${exp.payee} (${exp.category})`,
          date: exp.expenseDate,
          amount: exp.amount,
          payeeOrCustomer: exp.payee,
          confidenceScore: Math.min(1.0, Math.round(score * 100) / 100),
          matchReasons,
        });
      }
    }

    // 2. Travel Expenses
    if (ledger.travelExpenses) {
      for (const trv of ledger.travelExpenses) {
        const amountDiff = Math.abs(trv.amount - bankTx.amount);
        if (amountDiff > 1.0) continue;

        const dayDiff = getDayDifference(bankTx.postedDate, trv.expenseDate);
        if (dayDiff > 14) continue;

        const payeeSim = calculateTextSimilarity(bankTx.cleanPayee, trv.description);
        let score = 0.5; // amount match
        if (dayDiff <= 3) score += 0.2;
        if (payeeSim >= 0.4) score += 0.2;

        if (score >= 0.6) {
          candidates.push({
            entityType: 'TRAVEL_EXPENSE',
            entityId: trv.id,
            label: `Travel: ${trv.description}`,
            date: trv.expenseDate,
            amount: trv.amount,
            payeeOrCustomer: trv.description,
            confidenceScore: Math.min(1.0, Math.round(score * 100) / 100),
            matchReasons: ['Amount and travel date match'],
          });
        }
      }
    }

    // 3. Payroll Runs
    for (const run of ledger.payrollRuns) {
      const matchReasons: string[] = [];
      let matchedAmount = 0;
      let score = 0;

      // Check net pay or total company cost
      if (Math.abs(run.totalNetPay - bankTx.amount) < 1.0) {
        matchedAmount = run.totalNetPay;
        score += 0.5;
        matchReasons.push('Matches total net payroll disbursement');
      } else if (Math.abs(run.totalCompanyCost - bankTx.amount) < 1.0) {
        matchedAmount = run.totalCompanyCost;
        score += 0.5;
        matchReasons.push('Matches total company payroll cost');
      }

      if (matchedAmount > 0) {
        const dayDiff = getDayDifference(bankTx.postedDate, run.payDate);
        if (dayDiff <= 3) {
          score += 0.3;
          matchReasons.push('Within pay date banking window');
        } else if (dayDiff <= 7) {
          score += 0.15;
        }

        const isPayrollDesc = /payroll|gusto|adp|paychex|salary|wages/i.test(bankTx.rawDescription);
        if (isPayrollDesc) {
          score += 0.2;
          matchReasons.push('Payroll keywords in bank memo');
        }

        candidates.push({
          entityType: 'PAYROLL_RUN',
          entityId: run.id,
          label: `Payroll Run: ${run.payDate} (${run.stubsCount} stubs)`,
          date: run.payDate,
          amount: matchedAmount,
          payeeOrCustomer: 'Payroll Disbursement',
          confidenceScore: Math.min(1.0, Math.round(score * 100) / 100),
          matchReasons,
        });
      }
    }

    // 4. Contractor Payments
    for (const cp of ledger.contractorPayments) {
      const amountDiff = Math.abs(cp.amount - bankTx.amount);
      if (amountDiff > 1.0) continue;

      const dayDiff = getDayDifference(bankTx.postedDate, cp.paymentDate);
      if (dayDiff > 14) continue;

      let score = 0.5; // amount match
      const matchReasons: string[] = ['Exact payment amount match'];

      if (dayDiff <= 3) {
        score += 0.3;
        matchReasons.push('Within 3-day ACH disbursement window');
      }

      if (cp.description && calculateTextSimilarity(bankTx.cleanPayee, cp.description) > 0.4) {
        score += 0.2;
        matchReasons.push('Payee match');
      }

      if (score >= 0.6) {
        candidates.push({
          entityType: 'CONTRACTOR_PAYMENT',
          entityId: cp.id,
          label: `Contractor Payment: ${cp.description || 'Contractor'}`,
          date: cp.paymentDate,
          amount: cp.amount,
          payeeOrCustomer: cp.description || 'Contractor',
          confidenceScore: Math.min(1.0, Math.round(score * 100) / 100),
          matchReasons,
        });
      }
    }
  } else {
    // CREDIT: Match against Invoices
    for (const inv of ledger.invoices) {
      const amountDiff = Math.abs(inv.totalAmount - bankTx.amount);
      const paidDiff = Math.abs(inv.amountPaid - bankTx.amount);

      let isAmountMatch = false;
      let matchedAmount = inv.totalAmount;
      const matchReasons: string[] = [];

      if (amountDiff < 0.05) {
        isAmountMatch = true;
        matchReasons.push('Exact invoice amount match');
      } else if (paidDiff < 0.05) {
        isAmountMatch = true;
        matchedAmount = inv.amountPaid;
        matchReasons.push('Matches invoice paid amount');
      } else if (Math.abs(amountDiff) <= 15.0 && /stripe|processor|merchant/i.test(bankTx.rawDescription)) {
        // Stripe fee deduction difference e.g. $6,500 vs $6,495
        isAmountMatch = true;
        matchReasons.push(`Matches invoice with estimated processor fee ($${amountDiff.toFixed(2)})`);
      }

      if (isAmountMatch) {
        let score = 0.5;
        const dayDiff = getDayDifference(bankTx.postedDate, inv.issueDate);
        if (dayDiff <= 30) score += 0.2;

        if (inv.customerName && calculateTextSimilarity(bankTx.cleanPayee, inv.customerName) > 0.4) {
          score += 0.25;
          matchReasons.push(`Customer match ("${inv.customerName}")`);
        }

        if (bankTx.rawDescription.toLowerCase().includes(inv.invoiceNumber.toLowerCase())) {
          score += 0.25;
          matchReasons.push(`Invoice #${inv.invoiceNumber} in bank reference`);
        }

        candidates.push({
          entityType: 'INVOICE',
          entityId: inv.id,
          label: `Invoice #${inv.invoiceNumber}: ${inv.customerName || 'Client'}`,
          date: inv.issueDate,
          amount: matchedAmount,
          payeeOrCustomer: inv.customerName || 'Customer',
          confidenceScore: Math.min(1.0, Math.round(score * 100) / 100),
          matchReasons,
        });
      }
    }
  }

  // Sort descending by confidence score
  return candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

/**
 * Classifies a bank transaction into MATCHED, NEEDS_REVIEW, UNMATCHED, or DUPLICATE.
 * In accordance with AGENTS.md, matches default to NEEDS_REVIEW to prevent false positives
 * unless there is an unambiguous, near-perfect (>=0.95) single candidate.
 */
export function classifyTransaction(
  bankTx: {
    fingerprint: string;
    amount: number;
    postedDate: string;
    cleanPayee: string;
    rawDescription: string;
    transactionType: 'DEBIT' | 'CREDIT';
  },
  candidates: CandidateMatch[],
  existingReconciledFingerprints: Set<string>
): {
  status: BankReconciliationStatus;
  bestMatch?: CandidateMatch;
  confidenceScore: number;
  matchNotes?: string;
} {
  // 1. Check duplicate
  if (existingReconciledFingerprints.has(bankTx.fingerprint)) {
    return {
      status: 'DUPLICATE',
      confidenceScore: 1.0,
      matchNotes: 'Transaction previously imported and reconciled.',
    };
  }

  // 2. Check unmatched
  if (candidates.length === 0 || candidates[0].confidenceScore < 0.5) {
    return {
      status: 'UNMATCHED',
      confidenceScore: 0.0,
      matchNotes: 'No matching ledger entry found. Review or record as new expense/deposit.',
    };
  }

  const best = candidates[0];

  // 3. Auto-MATCHED only if near-perfect single match (>= 0.95 and no ambiguous ties)
  const hasAmbiguousTie =
    candidates.length > 1 && Math.abs(candidates[0].confidenceScore - candidates[1].confidenceScore) < 0.1;

  if (best.confidenceScore >= 0.95 && !hasAmbiguousTie) {
    return {
      status: 'MATCHED',
      bestMatch: best,
      confidenceScore: best.confidenceScore,
      matchNotes: best.matchReasons.join('; '),
    };
  }

  // 4. Default to NEEDS_REVIEW per AGENTS.md
  return {
    status: 'NEEDS_REVIEW',
    bestMatch: best,
    confidenceScore: best.confidenceScore,
    matchNotes: hasAmbiguousTie
      ? `Multiple matching candidates found (${candidates.length}). Human selection required.`
      : best.matchReasons.join('; '),
  };
}

/**
 * Reconciles an entire batch of parsed bank transactions against the active ledger.
 */
export function reconcileBankBatch(
  parsedRows: {
    date: string;
    rawDescription: string;
    cleanPayee: string;
    amount: number;
    transactionType: 'DEBIT' | 'CREDIT';
    fitid?: string;
    fingerprint: string;
  }[],
  companyId: string,
  batchId: string,
  ledger: LedgerReconciliationData,
  existingFingerprints: Set<string>
): {
  reconciledRows: ReconciledTransactionResult[];
  summary: {
    total: number;
    matched: number;
    needsReview: number;
    unmatched: number;
    duplicate: number;
  };
} {
  const reconciledRows: ReconciledTransactionResult[] = [];
  let matched = 0;
  let needsReview = 0;
  let unmatched = 0;
  let duplicate = 0;

  for (const row of parsedRows) {
    const candidates = findCandidateMatches(
      {
        amount: row.amount,
        postedDate: row.date,
        cleanPayee: row.cleanPayee,
        rawDescription: row.rawDescription,
        transactionType: row.transactionType,
      },
      ledger
    );

    const classification = classifyTransaction(
      {
        fingerprint: row.fingerprint,
        amount: row.amount,
        postedDate: row.date,
        cleanPayee: row.cleanPayee,
        rawDescription: row.rawDescription,
        transactionType: row.transactionType,
      },
      candidates,
      existingFingerprints
    );

    if (classification.status === 'MATCHED') matched++;
    else if (classification.status === 'NEEDS_REVIEW') needsReview++;
    else if (classification.status === 'UNMATCHED') unmatched++;
    else if (classification.status === 'DUPLICATE') duplicate++;

    const transaction: BankTransaction = {
      id: crypto.randomUUID(),
      companyId,
      batchId,
      fingerprint: row.fingerprint,
      postedDate: row.date,
      rawDescription: row.rawDescription,
      cleanPayee: row.cleanPayee,
      amount: row.amount,
      transactionType: row.transactionType,
      reconciliationStatus: classification.status,
      matchedEntityType: classification.bestMatch?.entityType || null,
      matchedEntityId: classification.bestMatch?.entityId || null,
      confidenceScore: classification.confidenceScore,
      matchNotes: classification.matchNotes || null,
      reconciledAt: classification.status === 'MATCHED' ? new Date().toISOString() : null,
      reconciledBy: classification.status === 'MATCHED' ? 'SYSTEM_AUTO_RECON' : null,
      createdAt: new Date().toISOString(),
    };

    reconciledRows.push({
      transaction,
      reconciliationStatus: classification.status,
      matchedEntityType: classification.bestMatch?.entityType,
      matchedEntityId: classification.bestMatch?.entityId,
      confidenceScore: classification.confidenceScore,
      matchNotes: classification.matchNotes,
      candidates,
    });
  }

  return {
    reconciledRows,
    summary: {
      total: parsedRows.length,
      matched,
      needsReview,
      unmatched,
      duplicate,
    },
  };
}
