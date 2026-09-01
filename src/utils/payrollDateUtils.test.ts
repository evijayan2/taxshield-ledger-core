import { describe, it, expect } from 'vitest';
import { calculateNextPayrollPeriod, resolvePrimaryPayFrequency } from './payrollDateUtils';
import { Company, Employee, PayrollRun, TimesheetEntry } from '../types';

const mockCompany: Company = {
  id: 'comp_main',
  name: 'Acme LLC',
  ein: '12-3456789',
  stateTaxId: '12345',
  address: '123 Main St',
  city: 'Bala Cynwyd',
  state: 'PA',
  zip: '19004',
  ownerName: 'Jane Owner',
  ownerEmail: 'jane@acme.com',
  ownerTaxBracket: 24,
  stateFilingFrequency: 'MONTHLY',
  filingFrequencyPA: 'MONTHLY',
  payFrequency: 'BI_WEEKLY',
  standardMileageRate: 0.67,
};

const mockEmployees: Employee[] = [
  {
    id: 'emp1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '555-0100',
    ssnLastFour: '1234',
    employmentType: 'W2_HOURLY',
    payRate: 35,
    w4FilingStatus: 'SINGLE',
    w4MultipleJobs: false,
    w4DependentCredit: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    w4ExtraWithholding: 0,
    paPsdCode: '460401',
    paPsdName: 'Lower Merion',
    paResidentEitRate: 0.01,
    paWorkPsdCode: '460401',
    paWorkEitRate: 0.01,
    paLstAnnual: 52,
    paLstExempt: false,
    bankName: 'TD Bank',
    accountType: 'CHECKING',
    routingNumber: '031201360',
    accountNumber: '111222333',
    bankAccountMasked: '•••• 2333',
    isActive: true,
  },
];

describe('payrollDateUtils', () => {
  it('resolves primary pay frequency from Company LLC setup', () => {
    expect(resolvePrimaryPayFrequency(mockCompany, mockEmployees)).toBe('BI_WEEKLY');
    expect(resolvePrimaryPayFrequency({ ...mockCompany, payFrequency: 'WEEKLY' })).toBe('WEEKLY');
    expect(resolvePrimaryPayFrequency(undefined, mockEmployees)).toBe('BI_WEEKLY');
  });

  it('calculates next period from previous payroll run rollover (Bi-Weekly)', () => {
    const pastRun: PayrollRun = {
      id: 'run-1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-14',
      payDate: '2026-08-19',
      status: 'LOCKED',
      totalGross: 2800,
      totalEmployeeTaxes: 400,
      totalReimbursements: 0,
      totalNetPay: 2400,
      totalEmployerTaxes: 250,
      totalCompanyCost: 3050,
      stubsCount: 1,
      createdAt: '2026-08-14T00:00:00Z',
    };

    const result = calculateNextPayrollPeriod(mockEmployees, [pastRun], [], mockCompany);

    expect(result.periodStart).toBe('2026-08-15');
    expect(result.periodEnd).toBe('2026-08-28');
    expect(result.payDate).toBe('2026-09-02');
    expect(result.source).toBe('LAST_RUN_ROLLOVER');
    expect(result.payFrequency).toBe('BI_WEEKLY');
  });

  it('calculates next period for Weekly pay frequency from LLC setup', () => {
    const weeklyCompany: Company = { ...mockCompany, payFrequency: 'WEEKLY' };
    const pastRun: PayrollRun = {
      id: 'run-1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-07',
      payDate: '2026-08-12',
      status: 'LOCKED',
      totalGross: 1400,
      totalEmployeeTaxes: 200,
      totalReimbursements: 0,
      totalNetPay: 1200,
      totalEmployerTaxes: 125,
      totalCompanyCost: 1525,
      stubsCount: 1,
      createdAt: '2026-08-07T00:00:00Z',
    };

    const result = calculateNextPayrollPeriod(mockEmployees, [pastRun], [], weeklyCompany);

    expect(result.periodStart).toBe('2026-08-08');
    expect(result.periodEnd).toBe('2026-08-14');
    expect(result.payDate).toBe('2026-08-19');
    expect(result.source).toBe('LAST_RUN_ROLLOVER');
  });

  it('calculates next period for Semi-Monthly pay frequency (15th rollover)', () => {
    const semiCompany: Company = { ...mockCompany, payFrequency: 'SEMI_MONTHLY' };
    const pastRun: PayrollRun = {
      id: 'run-1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-15',
      payDate: '2026-08-20',
      status: 'LOCKED',
      totalGross: 3000,
      totalEmployeeTaxes: 500,
      totalReimbursements: 0,
      totalNetPay: 2500,
      totalEmployerTaxes: 300,
      totalCompanyCost: 3300,
      stubsCount: 1,
      createdAt: '2026-08-15T00:00:00Z',
    };

    const result = calculateNextPayrollPeriod(mockEmployees, [pastRun], [], semiCompany);

    expect(result.periodStart).toBe('2026-08-16');
    expect(result.periodEnd).toBe('2026-08-31');
    expect(result.payDate).toBe('2026-09-05');
  });

  it('falls back to approved timesheets when no prior runs exist', () => {
    const timesheets: TimesheetEntry[] = [
      {
        id: 'ts1',
        employeeId: 'emp1',
        workDate: '2026-08-03',
        startTime: '09:00',
        endTime: '17:00',
        unpaidBreakMinutes: 30,
        regularHours: 7.5,
        overtimeHours: 0,
        status: 'APPROVED',
        createdAt: '2026-08-03T00:00:00Z',
      },
      {
        id: 'ts2',
        employeeId: 'emp1',
        workDate: '2026-08-10',
        startTime: '09:00',
        endTime: '17:00',
        unpaidBreakMinutes: 30,
        regularHours: 7.5,
        overtimeHours: 0,
        status: 'APPROVED',
        createdAt: '2026-08-10T00:00:00Z',
      },
    ];

    const result = calculateNextPayrollPeriod(mockEmployees, [], timesheets, mockCompany);

    expect(result.periodStart).toBe('2026-08-03');
    expect(result.periodEnd).toBe('2026-08-10');
    expect(result.payDate).toBe('2026-08-15');
    expect(result.source).toBe('APPROVED_TIMESHEETS');
  });

  it('falls back to default calendar period when no runs or timesheets exist', () => {
    const result = calculateNextPayrollPeriod(mockEmployees, [], [], mockCompany, '2026-08-10');

    expect(result.periodStart).toBe('2026-08-01');
    expect(result.periodEnd).toBe('2026-08-14');
    expect(result.payDate).toBe('2026-08-19');
    expect(result.source).toBe('DEFAULT_CALENDAR');
  });
});
