import { describe, it, expect } from 'vitest';
import { simulateTaxImpact } from './taxSimulatorService';
import { TaxSimulationScenario } from '../../types';

describe('Tax Impact Simulator Service', () => {
  const scenario: TaxSimulationScenario = {
    ownerTaxBracketPercent: 24,
    grossRevenue: 150000,
    ownerW2Salary: 50000,
    ownerDraws: 40000,
    section179AssetExpense: 10000,
    homeOfficeMethod: 'SIMPLIFIED',
    otherDeductibleExpenses: 15000,
  };

  it('should calculate QBI 20% deduction and quarterly estimated payments', () => {
    const res = simulateTaxImpact(scenario, 0.0307);

    // Revenue 150,000 - Expenses (50,000 + 10,000 + 15,000 = 75,000) = 75,000 Net Profit
    expect(res.netBusinessProfit).toBe(75000);
    expect(res.qbiDeduction).toBe(15000); // 20% of 75,000
    expect(res.totalTaxLiability).toBeGreaterThan(0);
    expect(res.quarterlyEstimatedPayment).toBeGreaterThan(0);
    expect(res.estimatedPaymentDates.length).toBe(4);
  });
});
