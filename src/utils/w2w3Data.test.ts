import { describe, it, expect } from 'vitest';
import { 
  calculateEmployeeW2, 
  calculateW2Summaries, 
  calculateW3Summary, 
  formatCurrency,
  formatMaskedSsn
} from './w2w3Data';
import { Employee, Organization, PayStub } from '../types';

const sampleOrg: Organization = {
  id: 'org1',
  name: 'Acme Advisory LLC',
  ein: '12-3456789',
  stateTaxId: '77-88990',
  address: '100 Innovation Way',
  city: 'Bala Cynwyd',
  state: 'PA',
  zip: '19004',
  ownerName: 'Jane Doe',
  ownerEmail: 'jane@acme.com',
  ownerTaxBracket: 24,
  stateFilingFrequency: 'MONTHLY',
  filingFrequencyPA: 'MONTHLY',
  standardMileageRate: 0.67
};

const sampleEmployee: Employee = {
  id: 'emp1',
  firstName: 'John',
  lastName: 'Smith',
  email: 'john@acme.com',
  phone: '555-0199',
  ssnLastFour: '1234',
  employmentType: 'W2_SALARY',
  payRate: 80000,
  payFrequency: 'BI_WEEKLY',
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
  bankName: 'Chase',
  accountType: 'CHECKING',
  routingNumber: '021000021',
  accountNumber: '987654321',
  bankAccountMasked: '•••• 4321',
  isActive: true
};

const samplePayStub: PayStub = {
  id: 'stub1',
  payrollRunId: 'run1',
  employeeId: 'emp1',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-15',
  payDate: '2026-01-16',
  hoursWorked: 80,
  overtimeHours: 0,
  hourlyRate: 38.46,
  grossEarnings: 3076.92,
  federalIncomeTax: 369.23,
  socialSecurityTax: 190.77,
  medicareTax: 44.62,
  paStateTax: 94.46,
  paLocalEit: 30.77,
  paLst: 1.00,
  totalEmployeeTaxes: 730.85,
  mileageReimbursement: 0,
  travelExpensesReimbursement: 0,
  totalReimbursements: 0,
  netPay: 2346.07,
  employerSocialSecurity: 190.77,
  employerMedicare: 44.62,
  employerPaUc: 117.60,
  totalEmployerTaxes: 352.99,
  totalCompanyCost: 3429.91,
  disbursementMethod: 'ACH',
  disbursementStatus: 'PAID',
  createdAt: '2026-01-16'
};

describe('W2 & W3 Data Engine', () => {
  it('should format currency correctly', () => {
    expect(formatCurrency(1234.567)).toBe('$1,234.57');
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('should format masked SSN correctly', () => {
    expect(formatMaskedSsn('1234')).toBe('XXX-XX-1234');
    expect(formatMaskedSsn('123456789')).toBe('123-45-6789');
  });

  it('should calculate individual W2 boxes from pay stubs', () => {
    const summary = calculateEmployeeW2(sampleEmployee, [samplePayStub], sampleOrg, 2026);
    expect(summary.employeeName).toBe('John Smith');
    expect(summary.boxes.box1Wages).toBe(3076.92);
    expect(summary.boxes.box2FedTax).toBe(369.23);
    expect(summary.boxes.box3SsWages).toBe(3076.92);
    expect(summary.boxes.box4SsTax).toBe(190.77);
    expect(summary.boxes.box5MedWages).toBe(3076.92);
    expect(summary.boxes.box6MedTax).toBe(44.62);
    expect(summary.boxes.box15State).toBe('PA');
    expect(summary.boxes.box16StateWages).toBe(3076.92);
    expect(summary.boxes.box17StateTax).toBe(94.46);
  });

  it('should leave employee address blank when not provided', () => {
    const summary = calculateEmployeeW2(sampleEmployee, [samplePayStub], sampleOrg, 2026);
    expect(summary.employeeAddress).toBe('');
    expect(summary.employeeCityStateZip).toBe('');
  });

  it('should use custom employee address when provided', () => {
    const customEmp: Employee = {
      ...sampleEmployee,
      streetAddress: '456 Oak Lane',
      city: 'Conshohocken',
      state: 'PA',
      zip: '19428'
    };
    const summary = calculateEmployeeW2(customEmp, [samplePayStub], sampleOrg, 2026);
    expect(summary.employeeAddress).toBe('456 Oak Lane');
    expect(summary.employeeCityStateZip).toBe('Conshohocken, PA 19428');
  });

  it('should aggregate multiple W2 summaries into W3 transmittal totals', () => {
    const w2Summaries = calculateW2Summaries(sampleOrg, [sampleEmployee], [samplePayStub], 2026);
    const w3Summary = calculateW3Summary(sampleOrg, w2Summaries, 2026);

    expect(w3Summary.totalFormsW2).toBe(1);
    expect(w3Summary.totalBox1Wages).toBe(3076.92);
    expect(w3Summary.totalBox2FedTax).toBe(369.23);
    expect(w3Summary.employerEin).toBe('12-3456789');
  });

  it('should render Downingtown Area School District in Box 20 when employee is in Downingtown SD', () => {
    const downingtownEmp: Employee = {
      ...sampleEmployee,
      paPsdCode: '150201',
      paPsdName: 'Downingtown Area School District',
      localTaxJurisdictionCode: 'PA-PSD-150201',
      localTaxJurisdictionName: 'Downingtown Area School District',
    };
    const downingtownStub: PayStub = {
      ...samplePayStub,
      localityName: 'Downingtown Area School District',
      localityCode: 'PA-PSD-150201',
    };
    const summary = calculateEmployeeW2(downingtownEmp, [downingtownStub], sampleOrg, 2026);
    expect(summary.boxes.box20Locality).toBe('Downingtown Area School District');
  });

  it('should collect multi-locality lines in W2 boxes when pay stub contains itemized taxLines', () => {
    const multiLocalityStub: PayStub = {
      ...samplePayStub,
      taxLines: [
        {
          id: 'tl-1',
          payStubId: 'stub1',
          jurisdictionType: 'LOCAL_EIT',
          jurisdictionCode: 'PA-PSD-700101',
          jurisdictionName: 'Pittsburgh SD',
          taxableWages: 2000,
          taxRate: 0.03,
          taxWithheld: 60.00
        },
        {
          id: 'tl-2',
          payStubId: 'stub1',
          jurisdictionType: 'LOCAL_EIT',
          jurisdictionCode: 'PA-PSD-700204',
          jurisdictionName: 'Mt Lebanon SD',
          taxableWages: 2000,
          taxRate: 0.015,
          taxWithheld: 30.00
        }
      ]
    };
    const summary = calculateEmployeeW2(sampleEmployee, [multiLocalityStub], sampleOrg, 2026);
    expect(summary.boxes.localLines).toBeDefined();
    expect(summary.boxes.localLines?.length).toBe(2);
    expect(summary.boxes.localLines?.[0].localityName).toBe('Pittsburgh SD');
    expect(summary.boxes.localLines?.[0].localTax).toBe(60);
    expect(summary.boxes.localLines?.[1].localityName).toBe('Mt Lebanon SD');
    expect(summary.boxes.localLines?.[1].localTax).toBe(30);
  });
});
