import { describe, it, expect } from 'vitest';
import { generateEfw2Batch } from './efw2Generator';
import type { Employee, Organization, PayStub } from '../../types';

const org: Organization = {
  id: 'org_1',
  name: 'Keystone Micro LLC',
  ein: '12-3456789',
  stateTaxId: 'PA-12345678',
  address: '100 Main St',
  city: 'Philadelphia',
  state: 'PA',
  zip: '19102',
  ownerName: 'John Doe',
  ownerEmail: 'owner@keystone.test',
  filingFrequencyPA: 'MONTHLY',
  payFrequency: 'BI_WEEKLY',
};

const employees: Employee[] = [
  {
    id: 'emp_1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@keystone.test',
    phone: '5551112222',
    ssnLastFour: '123456789',
    streetAddress: '200 Oak Ave',
    city: 'Philadelphia',
    state: 'PA',
    zip: '19103',
    workState: 'PA',
    employmentType: 'W2_SALARY',
    payRate: 2000,
    payFrequency: 'BI_WEEKLY',
    w4FilingStatus: 'MARRIED_FILING_JOINTLY',
    w4MultipleJobs: false,
    w4DependentCredit: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    w4ExtraWithholding: 0,
    isActive: true,
  },
];

const stubs: PayStub[] = [
  {
    id: 'stub_1',
    createdAt: '2026-01-15T00:00:00Z',
    payrollRunId: 'run_1',
    employeeId: 'emp_1',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-14',
    payDate: '2026-01-15',
    hoursWorked: 80,
    overtimeHours: 0,
    hourlyRate: 2000,
    grossEarnings: 2000,
    federalIncomeTax: 150,
    socialSecurityTax: 124,
    medicareTax: 29,
    paStateTax: 61.4,
    paLocalEit: 20,
    paLst: 0,
    totalEmployeeTaxes: 384.4,
    mileageReimbursement: 0,
    travelExpensesReimbursement: 0,
    totalReimbursements: 0,
    netPay: 1615.6,
    employerSocialSecurity: 124,
    employerMedicare: 29,
    employerPaUc: 0,
    totalEmployerTaxes: 153,
    totalCompanyCost: 2153,
    disbursementMethod: 'ACH',
    disbursementStatus: 'PAID',
  },
];

describe('efw2Generator', () => {
  it('generates SSA 512-byte fixed-width EFW2 records (RA, RE, RW, RS, RT, RF)', () => {
    const result = generateEfw2Batch(org, employees, stubs, 2026);
    expect(result.employeeCount).toBe(1);
    expect(result.totalBox1Wages).toBe(2000);
    expect(result.warnings).toHaveLength(0);

    const lines = result.content.split('\r\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(6); // RA, RE, RW, RS, RT, RF
    expect(lines.map((l) => l.slice(0, 2))).toEqual(['RA', 'RE', 'RW', 'RS', 'RT', 'RF']);
    for (const line of lines) {
      expect(line.length).toBe(512);
    }
    expect(lines[1].slice(2, 6)).toBe('2026');
    expect(lines[2].slice(2, 11)).toBe('123456789');
  });

  it('warns when employee only has 4-digit SSN on file', () => {
    const maskedEmp = [{ ...employees[0], ssnLastFour: '6789' }];
    const result = generateEfw2Batch(org, maskedEmp, stubs, 2026);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('9-digit SSN');
  });

  it('uses decrypted 9-digit SSN map when provided for encrypted employee SSNs', () => {
    const maskedEmp = [{ ...employees[0], ssnLastFour: '6789', ssnEncrypted: 'iv:tag:cipher' }];
    const result = generateEfw2Batch(org, maskedEmp, stubs, 2026, { emp_1: '987656789' });
    expect(result.warnings).toHaveLength(0);
    const lines = result.content.split('\r\n').filter((l) => l.length > 0);
    expect(lines[2].slice(2, 11)).toBe('987656789');
  });
});
