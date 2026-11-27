import { describe, it, expect } from 'vitest';
import {
  parseTaxUploadTemplate,
  generateTaxUploadExport,
  SUPPORTED_UPLOAD_PORTALS,
  type TaxFilingUploadTemplateRecord,
} from './taxUploadTemplateService';

describe('taxUploadTemplateService', () => {
  it('exposes Keystone EIT and LST portals with electronic specification links', () => {
    const eit = SUPPORTED_UPLOAD_PORTALS.find((p) => p.portalKey === 'PA_KEYSTONE_EIT');
    expect(eit).toBeDefined();
    expect(eit?.specUrl).toContain('keystonecollects.com/businesses/electronic-file-specifications');
  });

  it('parses CSV template headers, computes SHA-256, and warns on quotes', () => {
    const parsed = parseTaxUploadTemplate('keystone_eit.csv', 'SSN,"First Name",Last Name,Gross Wages,EIT\n');
    expect(parsed.fileFormat).toBe('CSV');
    expect(parsed.templateHashSha256).toHaveLength(64);
    expect(parsed.detectedHeaders).toEqual(['SSN', 'First Name', 'Last Name', 'Gross Wages', 'EIT']);
    expect(parsed.warnings[0]).toContain('double quotes');
  });

  it('detects MMREF-1 record prefixes', () => {
    const parsed = parseTaxUploadTemplate('pa_standard.txt', 'RA123456\nRE987654\nRS111111\n');
    expect(parsed.fileFormat).toBe('MMREF_1');
    expect(parsed.detectedHeaders).toEqual(['RA', 'RE', 'RS']);
  });

  it('throws if template content is empty', () => {
    expect(() => parseTaxUploadTemplate('empty.csv', '   ')).toThrow(/empty/i);
  });

  it('generates populated CSV export from header-based template without quotes or commas in fields', () => {
    const template: TaxFilingUploadTemplateRecord = {
      companyId: 'comp-1',
      portalKey: 'PA_KEYSTONE_EIT',
      portalLabel: 'PA Local EIT — Keystone Collections Group',
      jurisdiction: 'PA-LOCAL',
      fileFormat: 'CSV',
      isEnabled: true,
      templateFileName: 'keystone-template.csv',
      templateContent: 'TaxYear,Quarter,CompanyName,FirstName,LastName,ResidentPSD,GrossWages,EITWithheld\n',
      templateHashSha256: 'abc',
      businessLocationPsd: '150302',
    };

    const result = generateTaxUploadExport({
      template,
      company: {
        id: 'comp-1',
        name: 'ImpactFlow, "Labs" LLC',
        ein: '42-4656601',
        stateTaxId: '20443336',
        address: '542 Prizer Ct',
        city: 'Downingtown',
        state: 'PA',
        zip: '19335',
      },
      payrollRun: {
        id: 'run-1',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-15',
        payDate: '2026-11-20',
      },
      payStubs: [
        {
          id: 'stub-1',
          payrollRunId: 'run-1',
          employeeId: 'emp-1',
          periodStart: '2026-11-01',
          periodEnd: '2026-11-15',
          payDate: '2026-11-20',
          hoursWorked: 80,
          overtimeHours: 0,
          hourlyRate: 50,
          grossEarnings: 4000,
          federalIncomeTax: 400,
          socialSecurityTax: 248,
          medicareTax: 58,
          stateIncomeTax: 122.8,
          localIncomeTax: 40,
          totalEmployeeTaxes: 868.8,
          netPay: 3131.2,
          employerFicaTax: 306,
          employerFutaTax: 24,
          employerSutaTax: 147.6,
          reimbursementAmount: 0,
          totalCheckAmount: 3131.2,
          createdAt: '2026-11-20T00:00:00Z',
        },
      ],
      employees: [
        {
          id: 'emp-1',
          firstName: 'Vijayanathan',
          lastName: 'Elangovan',
          email: 'tovijayan@gmail.com',
          ssnLast4: '1234',
          payType: 'W2_SALARY',
          hourlyRate: 50,
          annualSalary: 104000,
          state: 'PA',
          residentPsdCode: '150302',
          filingStatus: 'SINGLE',
          w4Allowances: 0,
          additionalWithholding: 0,
          isActive: true,
        },
      ],
    });

    expect(result.fileName).toBe('pa_keystone_eit-2026-q4.csv');
    expect(result.rowCount).toBe(2);
    expect(result.content).not.toContain('"');
    const lines = result.content.split('\r\n');
    expect(lines[1]).toBe('2026,4,ImpactFlow Labs LLC,Vijayanathan,Elangovan,150302,4000.00,40.00');
  });

  it('generates Keystone E-record EIT CSV with 11-column employee rows matching Keystone spec', () => {
    const template: TaxFilingUploadTemplateRecord = {
      companyId: 'comp-1',
      portalKey: 'PA_KEYSTONE_EIT',
      portalLabel: 'PA Local EIT — Keystone Collections Group',
      jurisdiction: 'PA-LOCAL',
      fileFormat: 'CSV',
      isEnabled: true,
      templateFileName: 'keystone-eit-template.csv',
      templateContent: 'E,2026,1,259638527,7001,SAMPLE CO,100 MAIN ST,IRWIN,PA,15642,02180\n',
      templateHashSha256: 'abc',
      businessLocationPsd: '150302',
    };

    const result = generateTaxUploadExport({
      template,
      company: {
        id: 'comp-1',
        name: 'ImpactFlow Labs LLC',
        ein: '42-4656601',
        stateTaxId: '00000000',
        address: '542 Prizer Ct',
        city: 'Downingtown',
        state: 'PA',
        zip: '19335',
      },
      payrollRun: {
        id: 'run-1',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-15',
        payDate: '2026-10-20',
      },
      payStubs: [
        {
          id: 'stub-1',
          payrollRunId: 'run-1',
          employeeId: 'emp-1',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-15',
          payDate: '2026-10-20',
          hoursWorked: 40,
          overtimeHours: 0,
          hourlyRate: 20,
          grossEarnings: 800,
          federalIncomeTax: 0,
          socialSecurityTax: 49.6,
          medicareTax: 11.6,
          stateIncomeTax: 24.56,
          localIncomeTax: 9,
          totalEmployeeTaxes: 94.76,
          netPay: 705.24,
          employerFicaTax: 61.2,
          employerFutaTax: 4.8,
          employerSutaTax: 29.52,
          reimbursementAmount: 0,
          totalCheckAmount: 705.24,
          createdAt: '2026-10-20T00:00:00Z',
        },
      ],
      employees: [
        {
          id: 'emp-1',
          firstName: 'Abirami',
          lastName: 'Natarajan',
          email: 'abi@example.com',
          ssnLast4: '5678',
          payType: 'W2_HOURLY',
          hourlyRate: 20,
          annualSalary: 0,
          address: '100 Oak Ln',
          city: 'Downingtown',
          state: 'pa',
          zip: '19335',
          residentPsdCode: '150202',
          filingStatus: 'SINGLE',
          w4Allowances: 0,
          additionalWithholding: 0,
          isActive: true,
        },
      ],
    });

    const lines = result.content.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'E,2026,4,424656601,00000000,ImpactFlow Labs LLC,542 Prizer Ct,Downingtown,PA,19335,150302'
    );
    // Col A=SSN, B=Last First, C=Address, D=City, E=State(2), F=Zip, G=Year, H=Quarter, I=Wages, J=Withheld, K=PSD
    expect(lines[1]).toBe(
      '000005678,Natarajan Abirami,100 Oak Ln,Downingtown,PA,19335,2026,4,800.00,9.00,150202'
    );
    const empCols = lines[1].split(',');
    expect(empCols).toHaveLength(11);
    expect(empCols[4]).toBe('PA');
    expect(empCols[4]).toHaveLength(2);
  });

  it('throws when template is disabled', () => {
    expect(() =>
      generateTaxUploadExport({
        template: {
          companyId: 'comp-1',
          portalKey: 'PA_KEYSTONE_EIT',
          portalLabel: 'Keystone',
          jurisdiction: 'PA-LOCAL',
          fileFormat: 'CSV',
          isEnabled: false,
          templateFileName: 't.csv',
          templateContent: 'a,b',
          templateHashSha256: 'abc',
        },
        company: {
          id: 'comp-1',
          name: 'Test LLC',
          ein: '42-4656601',
          stateTaxId: '20443336',
          address: '1 Main St',
          city: 'Downingtown',
          state: 'PA',
          zip: '19335',
        },
        payrollRun: {
          id: 'run-1',
          periodStart: '2026-11-01',
          periodEnd: '2026-11-15',
          payDate: '2026-11-20',
        },
        payStubs: [],
        employees: [],
      })
    ).toThrow(/not enabled/i);
  });

  it('uses Prisma Employee fields (ssn, streetAddress, localTaxJurisdictionCode, residenceHistory) in Keystone E-record CSV', () => {
    const template: TaxFilingUploadTemplateRecord = {
      companyId: 'comp-1',
      portalKey: 'PA_KEYSTONE_EIT',
      portalLabel: 'PA Local EIT — Keystone Collections Group',
      jurisdiction: 'PA-LOCAL',
      fileFormat: 'CSV',
      isEnabled: true,
      templateFileName: 'keystone-eit-template.csv',
      templateContent: 'E,2026,1,259638527,7001,SAMPLE CO,100 MAIN ST,IRWIN,PA,15642,02180\n',
      templateHashSha256: 'abc',
      businessLocationPsd: '150302',
    };

    const result = generateTaxUploadExport({
      template,
      company: {
        id: 'comp-1',
        name: 'ImpactFlow Labs LLC',
        ein: '42-4656601',
        stateTaxId: '00000000',
        address: '542 Prizer Ct',
        city: 'Downingtown',
        state: 'PA',
        zip: '19335',
      },
      payrollRun: {
        id: 'run-1',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-15',
        payDate: '2026-10-20',
      },
      payStubs: [
        {
          id: 'stub-1',
          payrollRunId: 'run-1',
          employeeId: 'emp-1',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-15',
          payDate: '2026-10-20',
          hoursWorked: 40,
          overtimeHours: 0,
          hourlyRate: 20,
          grossEarnings: 800,
          federalIncomeTax: 0,
          socialSecurityTax: 49.6,
          medicareTax: 11.6,
          stateIncomeTax: 24.56,
          localIncomeTax: 9,
          totalEmployeeTaxes: 94.76,
          netPay: 705.24,
          createdAt: '2026-10-20T00:00:00Z',
        } as any,
        {
          id: 'stub-2',
          payrollRunId: 'run-1',
          employeeId: 'emp-2',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-15',
          payDate: '2026-10-20',
          hoursWorked: 32,
          overtimeHours: 0,
          hourlyRate: 20,
          grossEarnings: 640,
          federalIncomeTax: 0,
          socialSecurityTax: 39.68,
          medicareTax: 9.28,
          stateIncomeTax: 19.65,
          localIncomeTax: 7.2,
          totalEmployeeTaxes: 75.81,
          netPay: 564.19,
          createdAt: '2026-10-20T00:00:00Z',
        } as any,
      ],
      employees: [
        {
          id: 'emp-1',
          firstName: 'Abirami',
          lastName: 'Natarajan',
          email: 'abi@example.com',
          phone: '555-0001',
          ssnLastFour: '5678',
          ssn: '123-45-5678',
          employmentType: 'W2_HOURLY',
          payRate: 20,
          w4FilingStatus: 'SINGLE',
          w4MultipleJobs: false,
          w4DependentCredit: 0,
          w4OtherIncome: 0,
          w4Deductions: 0,
          w4ExtraWithholding: 0,
          streetAddress: '100 Oak Ln',
          city: 'Downingtown',
          state: 'PA',
          zip: '19335',
          localTaxJurisdictionCode: '150202',
          isActive: true,
        } as any,
        {
          id: 'emp-2',
          firstName: 'Vighnesh',
          lastName: 'Vijayanathan',
          email: 'vig@example.com',
          phone: '555-0002',
          ssnLastFour: '9999',
          employmentType: 'W2_HOURLY',
          payRate: 20,
          w4FilingStatus: 'SINGLE',
          w4MultipleJobs: false,
          w4DependentCredit: 0,
          w4OtherIncome: 0,
          w4Deductions: 0,
          w4ExtraWithholding: 0,
          residenceHistory: [
            {
              streetAddress: '200 Pine Ave',
              city: 'Downingtown',
              state: 'PA',
              zip: '19335',
              psdCode: '150202',
              endDate: null,
            },
          ],
          isActive: true,
        } as any,
      ],
    });

    const lines = result.content.split('\r\n');
    expect(lines[1]).toBe('123455678,Natarajan Abirami,100 Oak Ln,Downingtown,PA,19335,2026,4,800.00,9.00,150202');
    expect(lines[2]).toBe('000009999,Vijayanathan Vighnesh,200 Pine Ave,Downingtown,PA,19335,2026,4,640.00,7.20,150202');
    expect(result.warnings).toContain(
      'One or more employees only have last-4 SSN available; verify full 9-digit SSNs before portal upload.'
    );
  });
});
