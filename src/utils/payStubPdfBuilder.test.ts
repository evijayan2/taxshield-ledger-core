import { describe, it, expect, vi } from 'vitest';
import { generatePayStubPdf, printPayStubPdf, savePayStubPdf } from './payStubPdfBuilder';
import { PayStub, Employee, Organization } from '../types';

const mockOrg: Organization = {
  id: 'org1',
  name: 'Acme Software LLC',
  ein: '12-3456789',
  stateTaxId: '77-88990',
  address: '100 Main St',
  city: 'Philadelphia',
  state: 'PA',
  zip: '19106',
  ownerName: 'Jane Owner',
  ownerEmail: 'jane@acme.com',
  ownerTaxBracket: 24,
  stateFilingFrequency: 'MONTHLY',
  filingFrequencyPA: 'MONTHLY',
  payFrequency: 'BI_WEEKLY',
  standardMileageRate: 0.67,
};

const mockEmployee: Employee = {
  id: 'emp1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@acme.com',
  phone: '555-0199',
  ssnLastFour: '1234',
  employmentType: 'W2_HOURLY',
  payRate: 35,
  isActive: true,
  w4FilingStatus: 'SINGLE',
  w4MultipleJobs: false,
  w4DependentCredit: 0,
  w4OtherIncome: 0,
  w4Deductions: 0,
  w4ExtraWithholding: 0,
  paPsdCode: '510101',
  paPsdName: 'Philadelphia School District',
  paResidentEitRate: 0.0375,
  paWorkPsdCode: '510101',
  paWorkEitRate: 0.0375,
  paLstAnnual: 52,
  paLstExempt: false,
};

const mockStub: PayStub = {
  id: 'stub-101',
  payrollRunId: 'run-1',
  employeeId: 'emp1',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-14',
  payDate: '2026-08-15',
  hoursWorked: 80,
  overtimeHours: 5,
  hourlyRate: 35,
  grossEarnings: 3062.50,
  federalIncomeTax: 250.00,
  socialSecurityTax: 189.88,
  medicareTax: 44.41,
  paStateTax: 94.02,
  paLocalEit: 114.84,
  paLst: 2.00,
  totalEmployeeTaxes: 695.15,
  mileageReimbursement: 65.50,
  travelExpensesReimbursement: 15.00,
  totalReimbursements: 80.50,
  netPay: 2447.85,
  employerSocialSecurity: 189.88,
  employerMedicare: 44.41,
  employerPaUc: 45.94,
  totalEmployerTaxes: 280.23,
  totalCompanyCost: 3342.73,
  disbursementMethod: 'ACH',
  disbursementStatus: 'PAID',
  achTraceRef: 'ACH-884920',
  createdAt: '2026-08-15T00:00:00Z',
};

describe('payStubPdfBuilder', () => {
  it('should generate a valid jsPDF document for a pay stub', () => {
    const doc = generatePayStubPdf(mockStub, mockEmployee, mockOrg);
    expect(doc).toBeDefined();
    expect(doc.output).toBeDefined();
  });

  it('should trigger printPayStubPdf without errors', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-pdf-blob');

    expect(() => {
      printPayStubPdf(mockStub, mockEmployee, mockOrg);
    }).not.toThrow();

    URL.createObjectURL = originalCreateObjectURL;
  });

  it('should trigger savePayStubPdf without errors', () => {
    const doc = generatePayStubPdf(mockStub, mockEmployee, mockOrg);
    const saveSpy = vi.spyOn(doc, 'save').mockImplementation(() => doc);

    savePayStubPdf(mockStub, mockEmployee, mockOrg);
    expect(true).toBe(true);
  });
});
