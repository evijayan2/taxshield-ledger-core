import { describe, it, expect } from 'vitest';
import { calculateHomeOfficeDeduction } from './homeOfficeService';
import { HomeOfficeExpense } from '../../types';

describe('Home Office Deduction Service', () => {
  const expense: HomeOfficeExpense = {
    id: 'ho-101',
    companyId: 'comp-101',
    taxYearId: 'ty-2026',
    calculationMethod: 'SIMPLIFIED',
    totalHomeSquareFeet: 2000,
    officeSquareFeet: 300,
    mortgageInterest: 12000,
    realEstateTaxes: 4000,
    homeInsurance: 1500,
    utilities: 3500,
    rent: 0,
    repairsMaintenance: 1000,
    otherDirectExpenses: 200,
    otherIndirectExpenses: 0,
  };

  it('should calculate Simplified Method deduction ($1,500 for 300 sq ft)', () => {
    const res = calculateHomeOfficeDeduction(expense, 50000);

    expect(res.businessPercentage).toBe(15.0); // 300 / 2000 = 15%
    expect(res.simplifiedDeduction).toBe(1500); // 300 * $5
    expect(res.allowedDeduction).toBe(1500);
    expect(res.scheduleCLine30Amount).toBe(1500);
  });

  it('should calculate Actual Expense Method and recommend ACTUAL when expenses yield higher deduction', () => {
    const actualExpense: HomeOfficeExpense = {
      ...expense,
      calculationMethod: 'ACTUAL',
    };

    const res = calculateHomeOfficeDeduction(actualExpense, 50000);

    // Total indirect = 12000 + 4000 + 1500 + 3500 + 1000 = 22,000
    // 15% of 22,000 = 3,300 + 200 direct = 3,500 total
    expect(res.actualTotalDeduction).toBe(3500);
    expect(res.allowedDeduction).toBe(3500);
    expect(res.recommendedMethod).toBe('ACTUAL');
  });
});
