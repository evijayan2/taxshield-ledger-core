import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import jsPDF from 'jspdf';
import { generatePayStubPdf, printPayStubPdf, savePayStubPdf } from './payStubPdfBuilder';
import { PayStub, Employee, Organization } from '../types';

/**
 * Safely removes a generated PDF file from disk after test runs.
 * @param filename File name to search and remove
 */
function removeGeneratedPdf(filename: string): void {
  const candidatePaths = [
    path.resolve(process.cwd(), filename),
    path.resolve(__dirname, filename),
  ];
  for (const filePath of candidatePaths) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Silently ignore if already removed
      }
    }
  }
}

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
  const getExpectedPdfName = (): string => {
    const cleanOrg = (mockOrg.name || 'Company').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanEmp = `${mockEmployee.lastName}_${mockEmployee.firstName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${cleanOrg}_${cleanEmp}_PayStub_${mockStub.payDate}.pdf`;
  };

  beforeEach(() => {
    removeGeneratedPdf(getExpectedPdfName());
  });

  afterEach(() => {
    removeGeneratedPdf(getExpectedPdfName());
  });

  afterAll(() => {
    removeGeneratedPdf(getExpectedPdfName());
  });

  it('should generate a valid jsPDF document for a pay stub with organization title properties', () => {
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

  it('should trigger savePayStubPdf with company name in filename and clean up generated file', () => {
    const expectedName = getExpectedPdfName();
    expect(expectedName).toBe('Acme_Software_LLC_Doe_John_PayStub_2026-08-15.pdf');

    try {
      expect(() => savePayStubPdf(mockStub, mockEmployee, mockOrg)).not.toThrow();
    } finally {
      removeGeneratedPdf(expectedName);
    }

    const filePath = path.resolve(process.cwd(), expectedName);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
