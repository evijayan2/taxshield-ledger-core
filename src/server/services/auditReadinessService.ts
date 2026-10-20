import {
  GeneralExpense,
  TravelExpense,
  MileageLog,
  Employee,
  AuditLogEntry,
} from '../../types';
import {
  BankTransaction,
  ContractorPayment,
  FormW9Record,
  DuplicateExpenseCandidate,
  DuplicateExpenseMatch,
  DuplicateSeverity,
  DuplicateMatchType,
  AuditReadinessTier,
  AuditReadinessPillar,
  NeedsAttentionItem,
  ExpenseAuditDetail,
  CompanyAuditReadinessReport,
} from '../../commercialTypes';

export interface DuplicateDetectionInput {
  generalExpenses: GeneralExpense[];
  travelExpenses?: TravelExpense[];
  bankTransactions?: BankTransaction[];
  dismissedPairKeys?: string[] | Set<string>;
}

export interface AuditReadinessInput {
  companyId: string;
  taxYear: number;
  generalExpenses: GeneralExpense[];
  travelExpenses?: TravelExpense[];
  mileageLogs?: MileageLog[];
  bankTransactions?: BankTransaction[];
  contractorPayments?: ContractorPayment[];
  w9Records?: FormW9Record[];
  employees?: Employee[];
  statutory1099Threshold?: number;
  dismissedDuplicateKeys?: string[] | Set<string>;
}

/**
 * Normalizes vendor/payee strings for resilient deduplication comparison.
 * Strips card terminal numbers, store IDs (#123), and corporate legal suffixes.
 */
export function normalizePayeeForDedupe(raw: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/(?:#\s*\d+|\b(?:store|loc)\s*\d+)/gi, '')
    .replace(/\b(?:inc|llc|corp|corporation|co|company|ltd|p?c|com|\.com)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates absolute days difference between two ISO date strings (YYYY-MM-DD).
 */
export function getDaysDifference(dateA: string, dateB: string): number {
  if (!dateA || !dateB) return 999;
  const da = new Date(dateA);
  const db = new Date(dateB);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 999;
  const diffMs = Math.abs(da.getTime() - db.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculates token similarity between two normalized payee strings.
 */
function calculatePayeeSimilarity(normA: string, normB: string): number {
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.85;

  const tokensA = new Set(normA.split(' ').filter((t) => t.length > 2));
  const tokensB = new Set(normB.split(' ').filter((t) => t.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Detects duplicate expenses across General Expenses, Travel Expenses, and Bank Transactions.
 * Complies with AGENTS.md: identifies suspected duplicates without auto-deleting or auto-merging.
 */
export function detectDuplicateExpenses(input: DuplicateDetectionInput): DuplicateExpenseMatch[] {
  const dismissed = input.dismissedPairKeys
    ? input.dismissedPairKeys instanceof Set
      ? input.dismissedPairKeys
      : new Set(input.dismissedPairKeys)
    : new Set<string>();

  const candidates: DuplicateExpenseCandidate[] = [];

  for (const exp of input.generalExpenses || []) {
    candidates.push({
      entityType: 'GENERAL_EXPENSE',
      id: exp.id,
      date: exp.expenseDate,
      amount: exp.amount,
      payee: exp.payee,
      description: exp.description || '',
      category: exp.category,
      receiptUrl: exp.receiptUrl,
    });
  }

  for (const trv of input.travelExpenses || []) {
    candidates.push({
      entityType: 'TRAVEL_EXPENSE',
      id: trv.id,
      date: trv.expenseDate,
      amount: trv.amount,
      payee: trv.description,
      description: trv.description || '',
      category: trv.category,
      receiptUrl: trv.receiptUrl,
    });
  }

  // Include bank debits to catch bank import collisions
  for (const btx of input.bankTransactions || []) {
    if (btx.transactionType === 'DEBIT') {
      candidates.push({
        entityType: 'BANK_TRANSACTION',
        id: btx.id,
        date: btx.postedDate,
        amount: btx.amount,
        payee: btx.cleanPayee,
        description: btx.rawDescription,
        matchedEntityId: btx.matchedEntityId,
      });
    }
  }

  const matches: DuplicateExpenseMatch[] = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];

      // If both are bank transactions, duplicate import is already handled by fingerprinting
      if (a.entityType === 'BANK_TRANSACTION' && b.entityType === 'BANK_TRANSACTION') {
        continue;
      }

      // If bank transaction is already matched/reconciled to this ledger entity, it's not a duplicate collision
      if (
        (a.entityType === 'BANK_TRANSACTION' && a.matchedEntityId === b.id) ||
        (b.entityType === 'BANK_TRANSACTION' && b.matchedEntityId === a.id)
      ) {
        continue;
      }

      // Check dismissed key in either order
      const pairKey1 = `${a.id}_${b.id}`;
      const pairKey2 = `${b.id}_${a.id}`;
      if (dismissed.has(pairKey1) || dismissed.has(pairKey2)) {
        continue;
      }

      // Exact or near amount match (within $0.01)
      const amountDiff = Math.abs(a.amount - b.amount);
      if (amountDiff > 0.01) {
        continue;
      }

      const daysDiff = getDaysDifference(a.date, b.date);
      if (daysDiff > 3) {
        continue;
      }

      const normPayeeA = normalizePayeeForDedupe(a.payee);
      const normPayeeB = normalizePayeeForDedupe(b.payee);
      const payeeSim = calculatePayeeSimilarity(normPayeeA, normPayeeB);

      // Must have some vendor similarity or exact amount on same date
      if (daysDiff === 0 && payeeSim >= 0.5) {
        // High severity exact / near match
        const isBankCollision = a.entityType === 'BANK_TRANSACTION' || b.entityType === 'BANK_TRANSACTION';
        const matchType: DuplicateMatchType = isBankCollision
          ? 'BANK_COLLISION'
          : normPayeeA === normPayeeB
          ? 'EXACT_MATCH'
          : 'FUZZY_PAYEE_MATCH';

        const severity: DuplicateSeverity = 'HIGH';
        const confidence = normPayeeA === normPayeeB ? 0.98 : 0.88;
        const reasons = [
          `Identical transaction amount: $${a.amount.toFixed(2)}`,
          `Same transaction date: ${a.date}`,
          normPayeeA === normPayeeB
            ? `Exact vendor match: "${a.payee}"`
            : `Similar vendor names: "${a.payee}" vs "${b.payee}"`,
        ];

        matches.push({
          id: pairKey1,
          primary: a,
          duplicate: b,
          matchType,
          severity,
          confidence,
          dateDeltaDays: 0,
          reasons,
          suggestedAction: isBankCollision
            ? 'Bank line matches ledger expense. Link via Bank Reconciliation to certify.'
            : 'Review duplicate candidates. Keep both if distinct purchases, or delete duplicate.',
        });
      } else if (daysDiff <= 3 && payeeSim >= 0.6) {
        // Near-date match within 3-day clearance window
        const isBankCollision = a.entityType === 'BANK_TRANSACTION' || b.entityType === 'BANK_TRANSACTION';
        const matchType: DuplicateMatchType = isBankCollision
          ? 'BANK_COLLISION'
          : normPayeeA === normPayeeB
          ? 'NEAR_DATE_MATCH'
          : 'FUZZY_PAYEE_MATCH';

        const severity: DuplicateSeverity = daysDiff <= 1 ? 'HIGH' : 'MEDIUM';
        const confidence = 0.82 - daysDiff * 0.05;
        const reasons = [
          `Identical transaction amount: $${a.amount.toFixed(2)}`,
          `Dates within ${daysDiff} day${daysDiff === 1 ? '' : 's'} (${a.date} vs ${b.date})`,
          `Matching vendor: "${a.payee}" / "${b.payee}"`,
        ];

        matches.push({
          id: pairKey1,
          primary: a,
          duplicate: b,
          matchType,
          severity,
          confidence,
          dateDeltaDays: daysDiff,
          reasons,
          suggestedAction: isBankCollision
            ? 'Possible bank clearance lag. Reconcile with ledger expense or dismiss.'
            : 'Confirm whether this is a repeated charge or accidental duplicate entry.',
        });
      }
    }
  }

  // Sort by HIGH severity first, then by confidence descending
  return matches.sort((x, y) => {
    if (x.severity === 'HIGH' && y.severity !== 'HIGH') return -1;
    if (x.severity !== 'HIGH' && y.severity === 'HIGH') return 1;
    return y.confidence - x.confidence;
  });
}

/**
 * Evaluates audit readiness for an individual GeneralExpense.
 */
export function evaluateExpenseAudit(
  expense: GeneralExpense,
  isReconciled: boolean = false,
  hasDuplicate: boolean = false
): ExpenseAuditDetail {
  const checks: ExpenseAuditDetail['checks'] = [];
  let score = 100;

  // Check 1: Receipt Attachment (IRS IRC § 274(d) - mandatory for >= $75)
  const isOver75 = expense.amount >= 75;
  const hasReceipt = Boolean(expense.receiptUrl && expense.receiptUrl.trim().length > 0);

  if (hasReceipt) {
    checks.push({
      checkName: 'Receipt Attached',
      passed: true,
      message: 'Documentary evidence (receipt) attached to transaction.',
      irsRule: isOver75 ? 'IRS IRC § 274(d) Compliant' : 'IRS Best Practice',
    });
  } else if (isOver75) {
    score -= 35;
    checks.push({
      checkName: 'Receipt Required (≥ $75)',
      passed: false,
      message: `Amount ($${expense.amount.toFixed(2)}) exceeds $75. IRS IRC § 274(d) mandates documentary evidence.`,
      irsRule: 'IRS IRC § 274(d) Violation Risk',
    });
  } else {
    // Under $75 without receipt is allowed by IRS, but receipt is best practice
    score -= 10;
    checks.push({
      checkName: 'Receipt Optional (< $75)',
      passed: true,
      message: 'Under $75 threshold. Receipt recommended for complete CPA audit trail.',
      irsRule: 'IRS Rev. Proc. 95-48 Exemption',
    });
  }

  // Check 2: Business Purpose Quality
  const purpose = (expense.description || '').trim();
  const hasPurpose = purpose.length >= 5 && !/^(expense|stuff|misc|na|n\/a)$/i.test(purpose);

  if (hasPurpose) {
    checks.push({
      checkName: 'Business Purpose',
      passed: true,
      message: `Documented purpose: "${purpose}".`,
      irsRule: 'IRS Treas. Reg. § 1.274-5T',
    });
  } else {
    score -= 25;
    checks.push({
      checkName: 'Business Purpose Missing',
      passed: false,
      message: 'Specific business purpose is required to substantiate deductible business necessity.',
      irsRule: 'IRS IRC § 162',
    });
  }

  // Check 3: Schedule C Category Assigned
  const hasScheduleC = Boolean(expense.scheduleCLine && expense.scheduleCLine.trim().length > 0);
  if (hasScheduleC) {
    checks.push({
      checkName: 'Schedule C Line Mapped',
      passed: true,
      message: `Mapped to IRS Form 1040 Schedule C (${expense.scheduleCLine}).`,
    });
  } else {
    score -= 15;
    checks.push({
      checkName: 'Schedule C Line Missing',
      passed: false,
      message: 'Assign a Schedule C line to ensure clean tax-year filing.',
    });
  }

  // Check 4: Bank Reconciled
  if (isReconciled) {
    checks.push({
      checkName: 'Bank Reconciled',
      passed: true,
      message: 'Verified against cleared bank statement line item.',
    });
  } else {
    score -= 15;
    checks.push({
      checkName: 'Bank Reconciliation Pending',
      passed: false,
      message: 'Not yet reconciled against cleared bank statement.',
    });
  }

  // Check 5: Duplicate Warning
  if (hasDuplicate) {
    score -= 20;
    checks.push({
      checkName: 'Duplicate Warning',
      passed: false,
      message: 'Suspected duplicate entry detected with another transaction.',
    });
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    expenseId: expense.id,
    score: finalScore,
    checks,
    hasReceipt,
    hasPurpose,
    hasScheduleC,
    isBankReconciled: isReconciled,
    hasDuplicateWarning: hasDuplicate,
  };
}

/**
 * Calculates the comprehensive 6-pillar Company Audit Readiness Report (0–100%).
 * Evaluates receipt coverage, business purpose quality, bank reconciliation, mileage 5-point logs,
 * contractor 1099 compliance, and duplicate transaction health.
 */
export function calculateAuditReadiness(input: AuditReadinessInput): CompanyAuditReadinessReport {
  const {
    companyId,
    taxYear,
    generalExpenses = [],
    travelExpenses = [],
    mileageLogs = [],
    bankTransactions = [],
    contractorPayments = [],
    w9Records = [],
    statutory1099Threshold = 600,
    dismissedDuplicateKeys,
  } = input;

  // Filter items to active tax year
  const yearFilter = (dateStr?: string) => {
    if (!dateStr) return false;
    return dateStr.startsWith(String(taxYear));
  };

  const activeGeneralExpenses = generalExpenses.filter((e) => yearFilter(e.expenseDate));
  const activeTravelExpenses = travelExpenses.filter((t) => yearFilter(t.expenseDate));
  const activeMileageLogs = mileageLogs.filter((m) => yearFilter(m.tripDate));
  const activeBankTransactions = bankTransactions.filter((b) => yearFilter(b.postedDate));
  const activeContractorPayments = contractorPayments.filter((c) => yearFilter(c.paymentDate));

  const allExpensesCount = activeGeneralExpenses.length + activeTravelExpenses.length;
  const totalExpensesAmount =
    activeGeneralExpenses.reduce((s, e) => s + e.amount, 0) +
    activeTravelExpenses.reduce((s, t) => s + t.amount, 0);

  // Run duplicate detection
  const duplicates = detectDuplicateExpenses({
    generalExpenses: activeGeneralExpenses,
    travelExpenses: activeTravelExpenses,
    bankTransactions: activeBankTransactions,
    dismissedPairKeys: dismissedDuplicateKeys,
  });

  const duplicateExpenseIds = new Set<string>();
  for (const d of duplicates) {
    duplicateExpenseIds.add(d.primary.id);
    duplicateExpenseIds.add(d.duplicate.id);
  }

  // Set of reconciled entity IDs from bank transactions
  const reconciledEntityIds = new Set<string>();
  for (const b of activeBankTransactions) {
    if (b.reconciliationStatus === 'MATCHED' && b.matchedEntityId) {
      reconciledEntityIds.add(b.matchedEntityId);
    }
  }

  // Action items accumulator
  const actionItems: NeedsAttentionItem[] = [];
  const perExpenseDetails: Record<string, ExpenseAuditDetail> = {};

  // ----------------------------------------------------
  // PILLAR 1: RECEIPT ATTACHMENT COVERAGE (25% Weight)
  // ----------------------------------------------------
  let highExpensesCount = 0;
  let highExpensesCompliant = 0;
  let lowExpensesCount = 0;
  let lowExpensesWithReceipt = 0;

  for (const exp of activeGeneralExpenses) {
    const isOver75 = exp.amount >= 75;
    const hasReceipt = Boolean(exp.receiptUrl && exp.receiptUrl.trim().length > 0);
    const isReconciled = reconciledEntityIds.has(exp.id);
    const hasDupe = duplicateExpenseIds.has(exp.id);

    perExpenseDetails[exp.id] = evaluateExpenseAudit(exp, isReconciled, hasDupe);

    if (isOver75) {
      highExpensesCount += 1;
      if (hasReceipt) {
        highExpensesCompliant += 1;
      } else {
        actionItems.push({
          id: `missing_receipt_${exp.id}`,
          severity: 'CRITICAL',
          title: `Missing Receipt for $${exp.amount.toFixed(2)} (${exp.payee})`,
          description: `IRS IRC § 274(d) requires documentary evidence for expenses of $75 or more.`,
          entityType: 'EXPENSE',
          entityId: exp.id,
          actionRoute: 'EXPENSES',
          suggestedFix: 'Attach receipt image or scan with Receipt OCR Scanner.',
          irsReference: 'IRC § 274(d)',
        });
      }
    } else {
      lowExpensesCount += 1;
      if (hasReceipt) lowExpensesWithReceipt += 1;
    }
  }

  for (const trv of activeTravelExpenses) {
    const isOver75 = trv.amount >= 75;
    const hasReceipt = Boolean(trv.receiptUrl && trv.receiptUrl.trim().length > 0);

    if (isOver75) {
      highExpensesCount += 1;
      if (hasReceipt) {
        highExpensesCompliant += 1;
      } else {
        actionItems.push({
          id: `missing_receipt_trv_${trv.id}`,
          severity: 'CRITICAL',
          title: `Missing Travel Receipt for $${trv.amount.toFixed(2)} (${trv.category})`,
          description: `Travel expense exceeds $75 threshold without attached receipt documentation.`,
          entityType: 'EXPENSE',
          entityId: trv.id,
          actionRoute: 'MILEAGE',
          suggestedFix: 'Attach receipt photo or note in Mileage & Travel view.',
          irsReference: 'IRS Pub. 463',
        });
      }
    } else {
      lowExpensesCount += 1;
      if (hasReceipt) lowExpensesWithReceipt += 1;
    }
  }

  let receiptScore = 100;
  if (highExpensesCount > 0) {
    const highRatio = highExpensesCompliant / highExpensesCount;
    const lowBonus = lowExpensesCount > 0 ? (lowExpensesWithReceipt / lowExpensesCount) * 10 : 10;
    receiptScore = Math.round(highRatio * 90 + lowBonus);
  } else if (allExpensesCount > 0) {
    receiptScore = Math.round(75 + (lowExpensesWithReceipt / allExpensesCount) * 25);
  }

  const receiptPillar: AuditReadinessPillar = {
    id: 'receiptCoverage',
    name: 'Receipt Attachment Coverage',
    score: receiptScore,
    weight: 0.25,
    status: receiptScore >= 90 ? 'EXCELLENT' : receiptScore >= 75 ? 'GOOD' : receiptScore >= 50 ? 'NEEDS_WORK' : 'CRITICAL',
    description: 'IRS IRC § 274(d) documentary proof for business deductions (mandatory ≥ $75).',
    metrics: {
      totalItems: highExpensesCount,
      compliantItems: highExpensesCompliant,
      percentage: highExpensesCount > 0 ? Math.round((highExpensesCompliant / highExpensesCount) * 100) : 100,
      detail: `${highExpensesCompliant}/${highExpensesCount} expenses ≥ $75 documented with receipts`,
    },
  };

  // ----------------------------------------------------
  // PILLAR 2: BUSINESS PURPOSE QUALITY (15% Weight)
  // ----------------------------------------------------
  let totalPurposeItems = 0;
  let validPurposeItems = 0;

  for (const exp of activeGeneralExpenses) {
    totalPurposeItems += 1;
    const p = (exp.description || '').trim();
    if (p.length >= 5 && !/^(expense|misc|na|n\/a)$/i.test(p)) {
      validPurposeItems += 1;
    } else {
      actionItems.push({
        id: `missing_purpose_${exp.id}`,
        severity: 'WARNING',
        title: `Vague or Missing Business Purpose (${exp.payee} - $${exp.amount.toFixed(2)})`,
        description: 'IRS requires clear business purpose explaining the deductible necessity of the expense.',
        entityType: 'EXPENSE',
        entityId: exp.id,
        actionRoute: 'EXPENSES',
        suggestedFix: 'Edit expense description to include the project, client, or business purpose.',
        irsReference: 'IRC § 162',
      });
    }
  }

  for (const log of activeMileageLogs) {
    totalPurposeItems += 1;
    const p = (log.businessPurpose || '').trim();
    if (p.length >= 5) {
      validPurposeItems += 1;
    } else {
      actionItems.push({
        id: `missing_purpose_mileage_${log.id}`,
        severity: 'WARNING',
        title: `Missing Business Purpose for Mileage Trip (${log.tripDate})`,
        description: 'IRS requires specific business purpose (e.g. client meeting, site visit) for mileage deduction.',
        entityType: 'MILEAGE',
        entityId: log.id,
        actionRoute: 'MILEAGE',
        suggestedFix: 'Add business purpose to mileage trip record.',
        irsReference: 'IRS Pub. 463',
      });
    }
  }

  const purposeScore = totalPurposeItems === 0
    ? 100
    : Math.round((validPurposeItems / totalPurposeItems) * 100);

  const purposePillar: AuditReadinessPillar = {
    id: 'businessPurposeQuality',
    name: 'Business Purpose Quality',
    score: purposeScore,
    weight: 0.15,
    status: purposeScore >= 90 ? 'EXCELLENT' : purposeScore >= 75 ? 'GOOD' : purposeScore >= 50 ? 'NEEDS_WORK' : 'CRITICAL',
    description: 'Clear business justification substantiating ordinary and necessary business operations.',
    metrics: {
      totalItems: totalPurposeItems,
      compliantItems: validPurposeItems,
      percentage: purposeScore,
      detail: `${validPurposeItems}/${totalPurposeItems} transactions documented with specific purpose`,
    },
  };

  // ----------------------------------------------------
  // PILLAR 3: BANK STATEMENT RECONCILIATION (25% Weight)
  // ----------------------------------------------------
  const totalBankTxs = activeBankTransactions.length;
  const matchedBankTxs = activeBankTransactions.filter((b) => b.reconciliationStatus === 'MATCHED').length;
  const unreconciledBankTxs = activeBankTransactions.filter(
    (b) => b.reconciliationStatus === 'UNMATCHED' || b.reconciliationStatus === 'NEEDS_REVIEW'
  ).length;

  let bankScore = 100;
  if (totalBankTxs === 0) {
    // If no bank statements uploaded, baseline is 60% with notification to import statement
    bankScore = 60;
    actionItems.push({
      id: 'missing_bank_statement',
      severity: 'WARNING',
      title: 'No Bank Statement Imported for Tax Year',
      description: 'Importing bank CSV statements provides certified verification against third-party records.',
      entityType: 'BANK_TRANSACTION',
      entityId: 'batch_upload',
      actionRoute: 'RECONCILIATION',
      suggestedFix: 'Upload Mercury, Chase, or bank CSV statement in Bank Reconciliation view.',
    });
  } else {
    bankScore = Math.round((matchedBankTxs / totalBankTxs) * 100);
    if (unreconciledBankTxs > 0) {
      actionItems.push({
        id: 'unreconciled_bank_transactions',
        severity: unreconciledBankTxs > 5 ? 'CRITICAL' : 'WARNING',
        title: `${unreconciledBankTxs} Unreconciled Bank Statement Transaction${unreconciledBankTxs === 1 ? '' : 's'}`,
        description: 'Reconcile open bank statement lines against ledger expenses or convert to deductible expenses.',
        entityType: 'BANK_TRANSACTION',
        entityId: 'unreconciled_list',
        actionRoute: 'RECONCILIATION',
        suggestedFix: 'Open Bank Reconciliation to match or convert pending bank items.',
      });
    }
  }

  const bankPillar: AuditReadinessPillar = {
    id: 'bankReconciliation',
    name: 'Bank Statement Reconciliation',
    score: bankScore,
    weight: 0.25,
    status: bankScore >= 90 ? 'EXCELLENT' : bankScore >= 75 ? 'GOOD' : bankScore >= 50 ? 'NEEDS_WORK' : 'CRITICAL',
    description: 'Third-party bank verification proving financial disbursements cleared company accounts.',
    metrics: {
      totalItems: totalBankTxs,
      compliantItems: matchedBankTxs,
      percentage: totalBankTxs > 0 ? Math.round((matchedBankTxs / totalBankTxs) * 100) : 60,
      detail: totalBankTxs > 0 ? `${matchedBankTxs}/${totalBankTxs} bank statement lines matched` : 'No statement uploaded',
    },
  };

  // ----------------------------------------------------
  // PILLAR 4: MILEAGE LOG 5-POINT COMPLETENESS (15% Weight)
  // ----------------------------------------------------
  let compliantMileageTrips = 0;
  for (const trip of activeMileageLogs) {
    const hasOrigin = Boolean(trip.originLocation && trip.originLocation.trim().length > 0);
    const hasDest = Boolean(trip.destinationLocation && trip.destinationLocation.trim().length > 0);
    const hasPurpose = Boolean(trip.businessPurpose && trip.businessPurpose.trim().length > 0);
    const hasMiles = trip.calculatedMiles > 0 || (trip.endOdometer > trip.startOdometer);

    if (hasOrigin && hasDest && hasPurpose && hasMiles) {
      compliantMileageTrips += 1;
    } else {
      actionItems.push({
        id: `incomplete_mileage_${trip.id}`,
        severity: 'WARNING',
        title: `Incomplete 5-Point Mileage Record (${trip.tripDate})`,
        description: 'IRS requires 5 points: date, origin, destination, purpose, and distance/odometer.',
        entityType: 'MILEAGE',
        entityId: trip.id,
        actionRoute: 'MILEAGE',
        suggestedFix: 'Fill in missing origin, destination, or odometer values.',
        irsReference: 'IRS Pub. 463',
      });
    }
  }

  const mileageScore = activeMileageLogs.length === 0
    ? 100
    : Math.round((compliantMileageTrips / activeMileageLogs.length) * 100);

  const mileagePillar: AuditReadinessPillar = {
    id: 'mileageCompleteness',
    name: 'Mileage Log 5-Point Completeness',
    score: mileageScore,
    weight: 0.15,
    status: mileageScore >= 90 ? 'EXCELLENT' : mileageScore >= 75 ? 'GOOD' : mileageScore >= 50 ? 'NEEDS_WORK' : 'CRITICAL',
    description: 'IRS Pub. 463 contemporaneous mileage log standards (Date, Origin, Destination, Purpose, Miles).',
    metrics: {
      totalItems: activeMileageLogs.length,
      compliantItems: compliantMileageTrips,
      percentage: mileageScore,
      detail: `${compliantMileageTrips}/${activeMileageLogs.length} trips fully compliant with 5-point standard`,
    },
  };

  // ----------------------------------------------------
  // PILLAR 5: CONTRACTOR 1099 COMPLIANCE (10% Weight)
  // ----------------------------------------------------
  const employeeMap = new Map((input.employees || []).map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));

  // Group payments by contractor (employeeId)
  const contractorTotals = new Map<string, number>();
  for (const pay of activeContractorPayments) {
    const prev = contractorTotals.get(pay.employeeId) || 0;
    contractorTotals.set(pay.employeeId, prev + pay.amount);
  }

  const certifiedW9EmployeeIds = new Set(
    (w9Records || [])
      .filter((w) => Boolean(w.certifiedSignature || w.tinMasked || w.tinEncrypted))
      .map((w) => w.employeeId)
  );

  let thresholdContractors = 0;
  let compliantContractors = 0;

  for (const [empId, totalPaid] of contractorTotals.entries()) {
    if (totalPaid >= statutory1099Threshold) {
      thresholdContractors += 1;
      const hasW9 = certifiedW9EmployeeIds.has(empId);

      if (hasW9) {
        compliantContractors += 1;
      } else {
        const contractorName = employeeMap.get(empId) || `Contractor #${empId.slice(0, 8)}`;
        actionItems.push({
          id: `missing_w9_${empId}`,
          severity: 'CRITICAL',
          title: `Missing Form W-9 for Contractor ${contractorName} ($${totalPaid.toFixed(2)} YTD)`,
          description: `Contractor exceeds statutory Form 1099-NEC threshold ($${statutory1099Threshold.toFixed(2)}) without certified W-9 TIN.`,
          entityType: 'CONTRACTOR',
          entityId: empId,
          actionRoute: 'CONTRACTORS',
          suggestedFix: 'Send secure W-9 onboarding invite from Contractor 1099 Hub.',
          irsReference: 'IRC § 6041A / Form 1099-NEC',
        });
      }
    }
  }

  const contractorScore = thresholdContractors === 0
    ? 100
    : Math.round((compliantContractors / thresholdContractors) * 100);

  const contractorPillar: AuditReadinessPillar = {
    id: 'contractorCompliance',
    name: 'Contractor 1099 Compliance',
    score: contractorScore,
    weight: 0.10,
    status: contractorScore >= 90 ? 'EXCELLENT' : contractorScore >= 75 ? 'GOOD' : contractorScore >= 50 ? 'NEEDS_WORK' : 'CRITICAL',
    description: 'W-9 encrypted TIN collection for non-employee contractors meeting statutory filing thresholds.',
    metrics: {
      totalItems: thresholdContractors,
      compliantItems: compliantContractors,
      percentage: contractorScore,
      detail: `${compliantContractors}/${thresholdContractors} contractors ≥ $${statutory1099Threshold} with verified W-9`,
    },
  };

  // ----------------------------------------------------
  // PILLAR 6: DUPLICATE HEALTH (10% Weight)
  // ----------------------------------------------------
  const highDupesCount = duplicates.filter((d) => d.severity === 'HIGH').length;
  const medDupesCount = duplicates.filter((d) => d.severity === 'MEDIUM').length;

  for (const dupe of duplicates) {
    actionItems.push({
      id: `duplicate_match_${dupe.id}`,
      severity: dupe.severity === 'HIGH' ? 'CRITICAL' : 'WARNING',
      title: `Suspected Duplicate Expense: $${dupe.primary.amount.toFixed(2)} (${dupe.primary.payee})`,
      description: dupe.reasons.join(' · '),
      entityType: 'DUPLICATE',
      entityId: dupe.id,
      actionRoute: 'EXPENSES',
      suggestedFix: dupe.suggestedAction,
    });
  }

  const duplicateScore = Math.max(0, Math.round(100 - highDupesCount * 25 - medDupesCount * 10));

  const duplicatePillar: AuditReadinessPillar = {
    id: 'duplicateHealth',
    name: 'Duplicate Transaction Integrity',
    score: duplicateScore,
    weight: 0.10,
    status: duplicateScore >= 90 ? 'EXCELLENT' : duplicateScore >= 75 ? 'GOOD' : duplicateScore >= 50 ? 'NEEDS_WORK' : 'CRITICAL',
    description: 'Scanning across expenses and bank lines for accidental double-claims or ghost entries.',
    metrics: {
      totalItems: duplicates.length,
      compliantItems: duplicates.length === 0 ? 1 : 0,
      percentage: duplicateScore,
      detail: duplicates.length === 0 ? 'Zero suspected duplicates' : `${duplicates.length} duplicate alert${duplicates.length === 1 ? '' : 's'} pending review`,
    },
  };

  // ----------------------------------------------------
  // COMPOSITE READINESS SCORE
  // ----------------------------------------------------
  const weightedScore = Math.round(
    receiptPillar.score * receiptPillar.weight +
    purposePillar.score * purposePillar.weight +
    bankPillar.score * bankPillar.weight +
    mileagePillar.score * mileagePillar.weight +
    contractorPillar.score * contractorPillar.weight +
    duplicatePillar.score * duplicatePillar.weight
  );

  const overallScore = Math.max(0, Math.min(100, weightedScore));

  const tier: AuditReadinessTier =
    overallScore >= 90
      ? 'AUDIT_READY'
      : overallScore >= 75
      ? 'GOOD_STANDING'
      : overallScore >= 50
      ? 'NEEDS_ATTENTION'
      : 'AUDIT_RISK';

  // Sort action items: CRITICAL first, then WARNING, then INFO
  actionItems.sort((a, b) => {
    const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return rank[a.severity] - rank[b.severity];
  });

  return {
    companyId,
    taxYear,
    overallScore,
    tier,
    evaluatedAt: new Date().toISOString(),
    pillars: {
      receiptCoverage: receiptPillar,
      businessPurposeQuality: purposePillar,
      bankReconciliation: bankPillar,
      mileageCompleteness: mileagePillar,
      contractorCompliance: contractorPillar,
      duplicateHealth: duplicatePillar,
    },
    duplicates,
    actionItems,
    perExpenseDetails,
    summaryStats: {
      totalExpensesCount: allExpensesCount,
      totalExpensesAmount,
      reconciledExpensesCount: reconciledEntityIds.size,
      missingReceiptsOver75Count: highExpensesCount - highExpensesCompliant,
      unresolvedDuplicatesCount: duplicates.length,
      mileageTripsCount: activeMileageLogs.length,
      mileageTripsCompliantCount: compliantMileageTrips,
      contractorsOverThresholdCount: thresholdContractors,
      missingW9Count: thresholdContractors - compliantContractors,
    },
  };
}
