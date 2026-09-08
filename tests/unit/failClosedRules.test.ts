import { describe, it, expect } from 'vitest';
import { calculateGrossToNet } from '../../src/utils/taxEngine';
import { resolveActiveRuleSync } from '../../src/server/rules-engine/taxRulesEngine';
import { Employee } from '../../src/types';

describe('Fail-Closed Tax Rule Enforcement', () => {
  const baseEmployee: Employee = {
    id: 'emp-failclosed',
    companyId: 'comp-1',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    phone: '555-0100',
    ssnLastFour: '9999',
    employmentType: 'W2_FULL_TIME',
    payRate: 25.0,
    payFrequency: 'BI_WEEKLY',
    w4FilingStatus: 'SINGLE',
    w4MultipleJobs: false,
    w4DependentCredit: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    w4ExtraWithholding: 0,
    state: 'PA',
    workState: 'PA',
    localTaxJurisdictionCode: 'INVALID-JURISDICTION-CODE',
    isActive: true,
  };

  it('fails closed when calculating gross-to-net payroll for unmapped local jurisdiction', () => {
    expect(() => calculateGrossToNet(baseEmployee, 40)).toThrow(
      /Local tax jurisdiction \[INVALID-JURISDICTION-CODE\] is not mapped/
    );
  });

  it('fails closed when resolving an active rule for an unknown jurisdiction or rule code', () => {
    expect(() => resolveActiveRuleSync('UNKNOWN-JURISDICTION', 'UNKNOWN-RULE-CODE')).toThrow(
      /No active rule cached for jurisdiction=UNKNOWN-JURISDICTION, code=UNKNOWN-RULE-CODE/
    );
  });
});
