import { describe, it, expect } from 'vitest';
import {
  buildForm941Worksheet,
  buildForm940Worksheet,
  generateForm941Csv,
  generateForm940Csv,
} from './form941And940Service';
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
  ownerName: 'Owner',
  ownerEmail: 'owner@keystone.test',
  entityType: 'LLC_SINGLE_MEMBER',
  filingFrequencyPA: 'MONTHLY',
  payFrequency: 'BI_WEEKLY',
};

const employees: Employee[] = [
  {
    id: 'emp_spouse',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@keystone.test',
    phone: '5551112222',
    ssnLastFour: '1111',
    relationshipToOwner: 'SPOUSE',
    employmentType: 'W2_SALARY',
    payRate: 2000,
    payFrequency: 'BI_WEEKLY',
    w4FilingStatus: 'MARRIED_FILING_JOINTLY',
    w4MultipleJobs: false,
    w4DependentCredit: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    w4ExtraWithholding: 0,
    state: 'PA',
    workState: 'PA',
    isActive: true,
  },
  {
    id: 'emp_unrelated',
    firstName: 'Alex',
    lastName: 'Smith',
    email: 'alex@keystone.test',
    phone: '5553334444',
    ssnLastFour: '2222',
    relationshipToOwner: 'NONE',
    employmentType: 'W2_HOURLY',
    payRate: 50,
    payFrequency: 'BI_WEEKLY',
    w4FilingStatus: 'SINGLE',
    w4MultipleJobs: false,
    w4DependentCredit: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    w4ExtraWithholding: 0,
    state: 'PA',
    workState: 'PA',
    isActive: true,
  },
];

const stubs: PayStub[] = [
  {
    id: 'stub_1',
    createdAt: '2026-01-15T00:00:00Z',
    payrollRunId: 'run_1',
    employeeId: 'emp_spouse',
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
    employerFuta: 0,
    totalEmployerTaxes: 153,
    totalCompanyCost: 2153,
    disbursementMethod: 'ACH',
    disbursementStatus: 'PAID',
  },
  {
    id: 'stub_2',
    createdAt: '2026-02-15T00:00:00Z',
    payrollRunId: 'run_2',
    employeeId: 'emp_unrelated',
    periodStart: '2026-02-01',
    periodEnd: '2026-02-14',
    payDate: '2026-02-15',
    hoursWorked: 80,
    overtimeHours: 0,
    hourlyRate: 50,
    grossEarnings: 9000,
    federalIncomeTax: 1200,
    socialSecurityTax: 558,
    medicareTax: 130.5,
    paStateTax: 276.3,
    paLocalEit: 90,
    paLst: 0,
    totalEmployeeTaxes: 2254.8,
    mileageReimbursement: 0,
    travelExpensesReimbursement: 0,
    totalReimbursements: 0,
    netPay: 6745.2,
    employerSocialSecurity: 558,
    employerMedicare: 130.5,
    employerPaUc: 315,
    employerFuta: 42,
    totalEmployerTaxes: 1045.5,
    totalCompanyCost: 10045.5,
    disbursementMethod: 'ACH',
    disbursementStatus: 'PAID',
  },
];

describe('form941And940Service', () => {
  it('builds Form 941 quarterly worksheet with monthly depositor breakdown', () => {
    const ws = buildForm941Worksheet(org, stubs, 2026, 1);
    expect(ws.line1EmployeesCount).toBe(2);
    expect(ws.line2WagesTipsComp).toBe(11000);
    expect(ws.line3FederalIncomeTaxWithheld).toBe(1350);
    expect(ws.line5aSsTax).toBe(1364); // (124+124) + (558+558)
    expect(ws.line5cMedTax).toBe(319); // (29+29) + (130.5+130.5)
    expect(ws.line10TotalTaxesAfterAdjustments).toBe(3033);
    expect(ws.monthlyLiabilityBreakdown[0].monthLabel).toBe('January');
    expect(ws.monthlyLiabilityBreakdown[0].taxLiability).toBe(456);
    expect(ws.monthlyLiabilityBreakdown[1].monthLabel).toBe('February');
    expect(ws.monthlyLiabilityBreakdown[1].taxLiability).toBe(2577);

    const csv = generateForm941Csv(ws);
    expect(csv).toContain('"Line 10","Total taxes after adjustments","3033.00"');
  });

  it('builds Form 940 annual FUTA worksheet respecting family exemption and $7,000 cap', () => {
    const ws = buildForm940Worksheet(org, employees, stubs, 2026);
    expect(ws.futaRate).toBe(0.006);
    expect(ws.futaWageCap).toBe(7000);
    expect(ws.line3TotalPaymentsToAllEmployees).toBe(11000);
    expect(ws.line4ExemptPayments).toBe(2000); // Sole prop spouse exempt
    expect(ws.line5PaymentsExceedingWageCap).toBe(2000); // $9,000 - $7,000 cap
    expect(ws.line7TotalTaxableFutaWages).toBe(7000);
    expect(ws.line12TotalFutaTaxAfterAdjustments).toBe(42); // 7000 * 0.006

    const csv = generateForm940Csv(ws);
    expect(csv).toContain('"Line 12","Total FUTA tax after adjustments","42.00"');
  });
});
