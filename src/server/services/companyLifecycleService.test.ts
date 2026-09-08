import { describe, it, expect } from 'vitest';
import { resolveCompanyAddressForDate, dissolveCompanyWorkflow } from './companyLifecycleService';
import { Company, CompanyAddressHistory, Employee, PayStub, ComplianceTask } from '../../types';

describe('companyLifecycleService', () => {
  const sampleCompany: Company = {
    id: 'comp-1',
    name: 'Acme Advisory LLC',
    ein: '12-3456789',
    stateTaxId: '77-88990',
    address: '1500 Market St',
    city: 'Philadelphia',
    state: 'PA',
    zip: '19102',
    ownerName: 'Jane Doe',
    ownerEmail: 'jane@acme.com',
    ownerTaxBracket: 24,
    status: 'ACTIVE',
  };

  it('resolves primary Philadelphia work location before move without hardcoded fallback rate', () => {
    const activeLoc = resolveCompanyAddressForDate(sampleCompany, [], '2026-03-15');
    expect(activeLoc.city).toBe('Philadelphia');
    expect(activeLoc.workEitRate).toBeUndefined();
    expect(activeLoc.psdCode).toBe('PHILLY');
  });

  it('resolves Downingtown location EIT rate (1.0%) after relocation on 2026-07-01', () => {
    const history: CompanyAddressHistory[] = [
      {
        id: 'cah-1',
        companyId: 'comp-1',
        streetAddress: '1500 Market St',
        city: 'Philadelphia',
        state: 'PA',
        zip: '19102',
        psdCode: 'PHILLY',
        localJurisdictionName: 'Philadelphia City Wage Tax',
        workEitRate: 0.0344,
        effectiveDate: '2026-01-01',
        endDate: '2026-06-30',
      },
      {
        id: 'cah-2',
        companyId: 'comp-1',
        streetAddress: '100 Wallace Ave',
        city: 'Downingtown',
        state: 'PA',
        zip: '19335',
        psdCode: '150201',
        localJurisdictionName: 'Downingtown Area SD',
        workEitRate: 0.01,
        effectiveDate: '2026-07-01',
        endDate: null,
      },
    ];

    // Pre-move date (May 2026) -> Philly (3.44%)
    const preMove = resolveCompanyAddressForDate(sampleCompany, history, '2026-05-15');
    expect(preMove.city).toBe('Philadelphia');
    expect(preMove.workEitRate).toBe(0.0344);
    expect(preMove.psdCode).toBe('PHILLY');

    // Post-move date (August 2026) -> Downingtown (1.0%)
    const postMove = resolveCompanyAddressForDate(sampleCompany, history, '2026-08-15');
    expect(postMove.city).toBe('Downingtown');
    expect(postMove.workEitRate).toBe(0.01);
    expect(postMove.psdCode).toBe('150201');
  });

  it('executes company dissolution workflow cleanly', () => {
    const sampleEmp: Employee = {
      id: 'emp-1',
      firstName: 'John',
      lastName: 'Smith',
      email: 'john@acme.com',
      phone: '555-1234',
      ssnLastFour: '1234',
      employmentType: 'W2_SALARY',
      payRate: 80000,
      w4FilingStatus: 'SINGLE',
      w4MultipleJobs: false,
      w4DependentCredit: 0,
      w4OtherIncome: 0,
      w4Deductions: 0,
      w4ExtraWithholding: 0,
      isActive: true,
    };

    const sampleTask: ComplianceTask = {
      id: 'task-941',
      jurisdiction: 'FEDERAL_IRS',
      formIdentifier: 'FORM_941',
      title: 'Form 941 Q3',
      taxPeriodLabel: '2026 Q3',
      dueDate: '2026-10-31',
      status: 'READY_TO_FILE',
      amountDue: 0,
      boxValues: {},
    };

    const result = dissolveCompanyWorkflow(
      sampleCompany,
      [sampleEmp],
      [],
      [sampleTask],
      '2026-09-30',
      'Owner Retirement'
    );

    expect(result.company.status).toBe('DISSOLVED');
    expect(result.company.closedAt).toBe('2026-09-30');
    expect(result.company.closureReason).toBe('Owner Retirement');

    expect(result.terminatedEmployees[0].isActive).toBe(false);

    expect(result.finalComplianceTasks[0].boxValues['box17_final_return']).toBeDefined();
    expect(result.finalComplianceTasks[0].boxValues['box17_final_return'].value).toContain('2026-09-30');

    expect(result.acceleratedW2Summaries.length).toBe(1);
    expect(result.acceleratedW2Summaries[0].employeeName).toBe('John Smith');
  });
});
