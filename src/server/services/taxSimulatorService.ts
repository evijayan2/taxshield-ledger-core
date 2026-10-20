import { TaxSimulationScenario, TaxSimulationResult } from '../../types';
import { getActiveRates } from '../../utils/taxEngine';

/**
 * Calculates multi-scenario S-Corp / LLC pass-through tax simulations.
 * Evaluates Schedule C / SE net profit, Section 199A QBI deduction (20%),
 * federal income tax, state income tax, and quarterly Form 1040-ES estimated payments.
 */
export function simulateTaxImpact(
  scenario: TaxSimulationScenario,
  stateTaxRate?: number
): TaxSimulationResult {
  const paStateRate = stateTaxRate !== undefined ? stateTaxRate : getActiveRates().paSitRate;

  const totalExpenses =
    scenario.ownerW2Salary +
    scenario.section179AssetExpense +
    scenario.otherDeductibleExpenses;

  const netBusinessProfit = Math.max(0, scenario.grossRevenue - totalExpenses);

  // 1. Section 199A Qualified Business Income (QBI) 20% Deduction
  const qbiDeduction = Math.round(netBusinessProfit * 0.20 * 100) / 100;

  // 2. Self-Employment Tax (Schedule SE)
  // 15.3% on 92.35% of net profit (if sole prop / single-member LLC)
  const seTaxableIncome = netBusinessProfit * 0.9235;
  const ssLimit = 168600; // 2024-2026 SS wage cap
  const ssTax = Math.min(seTaxableIncome, ssLimit) * 0.124;
  const medTax = seTaxableIncome * 0.029;
  const selfEmploymentTax = Math.round((ssTax + medTax) * 100) / 100;

  // 3. Taxable Income & Federal Income Tax
  const seDeductionHalf = selfEmploymentTax * 0.5;
  const taxableFederalIncome = Math.max(0, netBusinessProfit + scenario.ownerW2Salary - qbiDeduction - seDeductionHalf);
  const bracketFrac = scenario.ownerTaxBracketPercent / 100;
  const federalIncomeTax = Math.round(taxableFederalIncome * bracketFrac * 100) / 100;

  // 4. State Income Tax
  const stateIncomeTax = Math.round((netBusinessProfit + scenario.ownerW2Salary) * paStateRate * 100) / 100;

  // 5. Total Tax Liability & Effective Rate
  const totalTaxLiability = Math.round((federalIncomeTax + stateIncomeTax + selfEmploymentTax) * 100) / 100;
  const totalIncomeDenominator = scenario.grossRevenue > 0 ? scenario.grossRevenue : (scenario.ownerW2Salary || 0);
  const effectiveTaxRatePercent = totalTaxLiability > 0 && totalIncomeDenominator > 0
    ? Math.round((totalTaxLiability / totalIncomeDenominator) * 10000) / 100
    : 0;

  // 6. Form 1040-ES Quarterly Estimated Tax Payments
  const quarterlyEstimatedPayment = Math.round((totalTaxLiability / 4) * 100) / 100;
  const currentYear = new Date().getFullYear();

  const estimatedPaymentDates = [
    { quarter: 'Q1 1040-ES', dueDate: `${currentYear}-04-15`, amount: quarterlyEstimatedPayment },
    { quarter: 'Q2 1040-ES', dueDate: `${currentYear}-06-15`, amount: quarterlyEstimatedPayment },
    { quarter: 'Q3 1040-ES', dueDate: `${currentYear}-09-15`, amount: quarterlyEstimatedPayment },
    { quarter: 'Q4 1040-ES', dueDate: `${currentYear + 1}-01-15`, amount: quarterlyEstimatedPayment },
  ];

  // 7. Monthly Deposit & Filing Schedule (12 Months)
  const monthlyTotal = Math.round((totalTaxLiability / 12) * 100) / 100;
  const monthlyPaSit = Math.round((stateIncomeTax / 12) * 100) / 100;
  const monthlyFederal = Math.round(((federalIncomeTax + selfEmploymentTax) / 12) * 100) / 100;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const monthlyFilingSchedule = monthNames.map((monthName, idx) => {
    const monthNum = idx + 1;
    let dueYr = currentYear;
    let dueMo = monthNum + 1;
    if (dueMo > 12) {
      dueMo = 1;
      dueYr = currentYear + 1;
    }
    const dueMoStr = String(dueMo).padStart(2, '0');
    return {
      month: `${monthName} (M${monthNum})`,
      monthNumber: monthNum,
      dueDate: `${dueYr}-${dueMoStr}-15`,
      amount: monthlyTotal,
      paSitAmount: monthlyPaSit,
      federalAmount: monthlyFederal,
    };
  });

  return {
    grossRevenue: scenario.grossRevenue,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netBusinessProfit: Math.round(netBusinessProfit * 100) / 100,
    w2GrossSalary: scenario.ownerW2Salary,
    ownerDraws: scenario.ownerDraws,
    qbiDeduction,
    selfEmploymentTax,
    federalIncomeTax,
    stateIncomeTax,
    totalTaxLiability,
    effectiveTaxRatePercent,
    quarterlyEstimatedPayment,
    estimatedPaymentDates,
    monthlyFilingSchedule,
  };
}
