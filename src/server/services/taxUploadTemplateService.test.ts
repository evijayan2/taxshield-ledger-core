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
});
