import { HomeOfficeExpense, HomeOfficeDeductionResult } from '../../types';

/**
 * Calculates Home Office Deduction (IRS Form 8829 / Schedule C Line 30).
 * Compares Simplified Method ($5/sq ft up to 300 sq ft) against Actual Expense Method.
 */
export function calculateHomeOfficeDeduction(
  expense: HomeOfficeExpense,
  netBusinessProfitBeforeHomeOffice: number = 100000
): HomeOfficeDeductionResult {
  const totalSqFt = Math.max(1, expense.totalHomeSquareFeet);
  const officeSqFt = Math.min(totalSqFt, Math.max(0, expense.officeSquareFeet));

  const businessPercentage = Math.round((officeSqFt / totalSqFt) * 10000) / 100;
  const businessFrac = businessPercentage / 100;

  // 1. Simplified Method: $5.00/sq ft, capped at 300 sq ft ($1,500 max)
  const simplifiedSqFt = Math.min(300, officeSqFt);
  const simplifiedDeduction = Math.round(simplifiedSqFt * 5.0 * 100) / 100;

  // 2. Actual Expense Method (Form 8829)
  const actualDirectExpenses = Math.round(expense.otherDirectExpenses * 100) / 100;
  const rawIndirect =
    (expense.mortgageInterest || 0) +
    (expense.realEstateTaxes || 0) +
    (expense.homeInsurance || 0) +
    (expense.utilities || 0) +
    (expense.rent || 0) +
    (expense.repairsMaintenance || 0) +
    (expense.otherIndirectExpenses || 0);

  const actualIndirectExpenses = Math.round(rawIndirect * 100) / 100;
  const allocatedIndirectExpenses = Math.round(actualIndirectExpenses * businessFrac * 100) / 100;
  const actualTotalDeduction = Math.round((actualDirectExpenses + allocatedIndirectExpenses) * 100) / 100;

  // 3. Selection & Business Income Limitation
  const chosenRawDeduction = expense.calculationMethod === 'ACTUAL' ? actualTotalDeduction : simplifiedDeduction;

  const allowedDeduction = Math.max(0, Math.min(chosenRawDeduction, netBusinessProfitBeforeHomeOffice));
  const netIncomeLimitApplied = chosenRawDeduction > netBusinessProfitBeforeHomeOffice;

  const recommendedMethod: 'SIMPLIFIED' | 'ACTUAL' = actualTotalDeduction > simplifiedDeduction ? 'ACTUAL' : 'SIMPLIFIED';

  return {
    companyId: expense.companyId,
    taxYearId: expense.taxYearId,
    calculationMethod: expense.calculationMethod,
    totalHomeSquareFeet: totalSqFt,
    officeSquareFeet: officeSqFt,
    businessPercentage,
    simplifiedDeduction,
    actualDirectExpenses,
    actualIndirectExpenses,
    allocatedIndirectExpenses,
    actualTotalDeduction,
    allowedDeduction,
    scheduleCLine30Amount: allowedDeduction,
    netIncomeLimitApplied,
    recommendedMethod,
  };
}
