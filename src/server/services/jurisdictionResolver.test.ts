import { describe, it, expect } from 'vitest';
import { resolveEmployeeJurisdictions } from './jurisdictionResolver';
import { Employee } from '../../types';

describe('Jurisdiction Resolver Service', () => {
  const baseEmployee: Employee = {
    id: 'emp-101',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '555-0199',
    ssnLastFour: '1234',
    state: 'PA',
    workState: 'PA',
    employmentType: 'W2_HOURLY',
    payRate: 35.0,
    payFrequency: 'BI_WEEKLY',
    w4FilingStatus: 'SINGLE',
    w4MultipleJobs: false,
    w4DependentCredit: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    w4ExtraWithholding: 0,
    isActive: true,
    paPsdCode: '150901',
  };

  it('should resolve standard single-state PA jurisdictions (FIT, FICA, PA SIT, PA SUTA, PA EIT, PA LST)', () => {
    const res = resolveEmployeeJurisdictions(baseEmployee, [], [], '2026-09-01', '2026-09-14');

    expect(res.residenceState).toBe('PA');
    expect(res.workState).toBe('PA');
    expect(res.resolvedJurisdictions.length).toBeGreaterThanOrEqual(6);

    const codes = res.resolvedJurisdictions.map((j) => j.code);
    expect(codes).toContain('US-FED-FIT');
    expect(codes).toContain('US-FED-SS');
    expect(codes).toContain('US-FED-MED');
    expect(codes).toContain('PA-STATE-SIT');
    expect(codes).toContain('PA-STATE-SUTA');
    expect(codes.some((c) => c.startsWith('PA-LOCAL-EIT-'))).toBe(true);
    expect(codes.some((c) => c.startsWith('PA-LOCAL-LST-'))).toBe(true);
  });

  it('should apply PA/NJ reciprocity agreement for PA resident working in NJ', () => {
    const empNjWork: Employee = {
      ...baseEmployee,
      state: 'PA',
      workState: 'NJ',
    };

    const res = resolveEmployeeJurisdictions(empNjWork, [], [], '2026-09-01', '2026-09-14');

    expect(res.residenceState).toBe('PA');
    expect(res.workState).toBe('NJ');

    const paSit = res.resolvedJurisdictions.find((j) => j.code === 'PA-STATE-SIT');
    const njSit = res.resolvedJurisdictions.find((j) => j.code === 'NJ-STATE-SIT');

    expect(paSit).toBeDefined();
    expect(paSit?.isReciprocalExempt).toBe(false);

    expect(njSit).toBeDefined();
    expect(njSit?.isReciprocalExempt).toBe(true);
    expect(njSit?.reciprocalExemptionReason).toContain('Reciprocal agreement');

    const njSuta = res.resolvedJurisdictions.find((j) => j.code === 'NJ-STATE-SUTA');
    expect(njSuta).toBeDefined();
  });

  it('should resolve Delaware work location with Wilmington local wage tax', () => {
    const empDeWork: Employee = {
      ...baseEmployee,
      state: 'DE',
      workState: 'DE',
    };

    const res = resolveEmployeeJurisdictions(empDeWork, [], [], '2026-09-01', '2026-09-14');

    expect(res.workState).toBe('DE');

    const deSit = res.resolvedJurisdictions.find((j) => j.code === 'DE-STATE-SIT');
    const deSuta = res.resolvedJurisdictions.find((j) => j.code === 'DE-STATE-SUTA');
    const wilmington = res.resolvedJurisdictions.find((j) => j.code === 'DE-LOCAL-WILMINGTON');

    expect(deSit).toBeDefined();
    expect(deSuta).toBeDefined();
    expect(wilmington).toBeDefined();
    expect(wilmington?.rate).toBe(0.0125);
  });
});
