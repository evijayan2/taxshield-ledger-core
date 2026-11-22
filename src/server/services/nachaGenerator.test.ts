import { describe, it, expect } from 'vitest';
import {
  generateNachaFile,
  generatePayrollNachaBatch,
  parseNachaFileSummary,
  NachaValidationError,
} from './nachaGenerator';
import { Company, Employee, PayStub } from '../../types';

describe('NACHA Direct Deposit Generator & Payroll Integration (Story 4)', () => {
  const validOdfiRouting = '021000021'; // JPMorgan Chase NYC
  const validReceivingRouting1 = '121000248'; // Wells Fargo San Francisco
  const validReceivingRouting2 = '031000053'; // PNC Bank Philadelphia

  const testCompany = {
    companyName: 'ACME INNOVATIONS LLC',
    ein: '12-3456789',
    odfiRoutingNumber: validOdfiRouting,
    destinationName: 'CHASE NA',
    originName: 'ACME INNOVATIONS',
  };

  const testEntries = [
    {
      employeeId: 'EMP-001',
      employeeName: 'DOE JOHN',
      routingNumber: validReceivingRouting1,
      accountNumber: '1234567890',
      accountType: 'CHECKING' as const,
      amount: 2500.5,
    },
    {
      employeeId: 'EMP-002',
      employeeName: 'SMITH JANE',
      routingNumber: validReceivingRouting2,
      accountNumber: '987654321',
      accountType: 'SAVINGS' as const,
      amount: 1750.25,
    },
  ];

  describe('Full NACHA File Generation & Blocking Factor', () => {
    it('should generate a valid NACHA file with blocking factor 10 line padding', () => {
      const result = generateNachaFile(testCompany, testEntries, {
        effectiveEntryDate: '2026-11-25',
        fileCreationDate: '2026-11-22',
        fileCreationTime: '1000',
      });

      expect(result.lineCount).toBe(10);
      expect(result.lines.length).toBe(10);
      expect(result.blockCount).toBe(1);
      expect(result.entryCount).toBe(2);
      expect(result.totalCreditCents).toBe(425075); // $4,250.75
      expect(result.totalDebitCents).toBe(0);

      result.lines.forEach(line => expect(line.length).toBe(94));

      expect(result.lines[6]).toBe('9'.repeat(94));
      expect(result.lines[7]).toBe('9'.repeat(94));
      expect(result.lines[8]).toBe('9'.repeat(94));
      expect(result.lines[9]).toBe('9'.repeat(94));

      expect(result.fileHashSha256).toMatch(/^[a-f0-9]{64}$/);

      const summary = parseNachaFileSummary(result.fileContent);
      expect(summary.isValid).toBe(true);
      expect(summary.lineCount).toBe(10);
      expect(summary.blockCount).toBe(1);
      expect(summary.entryCount).toBe(2);
      expect(summary.totalCreditCents).toBe(425075);
    });

    it('should compute entry hash correctly with 10-digit rollover modulo 10^10', () => {
      const result = generateNachaFile(testCompany, testEntries, {
        effectiveEntryDate: '2026-11-25',
      });
      expect(result.entryHash).toBe('0015200029');
    });

    it('should handle zero fill lines when total records is already a multiple of 10', () => {
      const sixEntries = [
        ...testEntries,
        { ...testEntries[0], employeeId: 'EMP-003' },
        { ...testEntries[1], employeeId: 'EMP-004' },
        { ...testEntries[0], employeeId: 'EMP-005' },
        { ...testEntries[1], employeeId: 'EMP-006' },
      ];
      const result = generateNachaFile(testCompany, sixEntries, {
        effectiveEntryDate: '2026-11-25',
      });
      expect(result.lineCount).toBe(10);
      expect(result.blockCount).toBe(1);
      expect(result.lines[result.lines.length - 1].startsWith('9')).toBe(true);
      expect(result.lines[result.lines.length - 1]).not.toBe('9'.repeat(94));
    });

    it('should handle 9 fill lines when records = 11 (2 blocks)', () => {
      const sevenEntries = [
        ...testEntries,
        { ...testEntries[0], employeeId: 'EMP-003' },
        { ...testEntries[1], employeeId: 'EMP-004' },
        { ...testEntries[0], employeeId: 'EMP-005' },
        { ...testEntries[1], employeeId: 'EMP-006' },
        { ...testEntries[0], employeeId: 'EMP-007' },
      ];
      const result = generateNachaFile(testCompany, sevenEntries, {
        effectiveEntryDate: '2026-11-25',
      });
      expect(result.lineCount).toBe(20);
      expect(result.blockCount).toBe(2);
      expect(result.lines[10].startsWith('9000001')).toBe(true);
      for (let i = 11; i < 20; i++) {
        expect(result.lines[i]).toBe('9'.repeat(94));
      }
    });

    it('should reject malformed file in parseNachaFileSummary', () => {
      expect(() => parseNachaFileSummary('SHORT LINE\n')).toThrow(NachaValidationError);
      expect(() => parseNachaFileSummary('101' + 'X'.repeat(91))).toThrow(NachaValidationError);
    });
  });

  describe('Payroll Run Integration (generatePayrollNachaBatch)', () => {
    const mockCompany: Company = {
      id: 'comp-100',
      name: 'Acme Software LLC',
      ein: '12-3456789',
      stateTaxId: '88776655',
      address: '100 Market St',
      city: 'Philadelphia',
      state: 'PA',
      zip: '19103',
      ownerName: 'Alice Owner',
      ownerEmail: 'alice@example.com',
      routingNumber: validOdfiRouting,
      bankName: 'JPMorgan Chase Bank',
    };

    function makeEmp(id: string, firstName: string, lastName: string, routing?: string, acct?: string, acctType: 'CHECKING' | 'SAVINGS' = 'CHECKING') {
      return {
        id, firstName, lastName, email: `${firstName.toLowerCase()}@example.com`, phone: '215-555-0101', ssnLastFour: '1234',
        employmentType: 'W2_HOURLY', payRate: 35, w4FilingStatus: 'SINGLE', w4MultipleJobs: false,
        w4DependentCredit: 0, w4OtherIncome: 0, w4Deductions: 0, w4ExtraWithholding: 0,
        routingNumber: routing, accountNumber: acct, accountType: acctType, isActive: true,
      } as unknown as Employee;
    }

    function makeStub(id: string, empId: string, gross: number, net: number, method: 'ACH' | 'CHECK' = 'ACH') {
      return {
        id, payrollRunId: 'run-01', employeeId: empId, periodStart: '2026-11-01', periodEnd: '2026-11-15',
        payDate: '2026-11-20', hoursWorked: 80, overtimeHours: 0, hourlyRate: 35, grossEarnings: gross,
        federalIncomeTax: 250, socialSecurityTax: 173.6, medicareTax: 40.6, stateIncomeTax: 85.96,
        localTax: 56, totalTaxes: gross - net, netPay: net, totalEmployerTaxes: 329,
        totalCompanyCost: gross + 329, disbursementMethod: method, disbursementStatus: 'PENDING',
        createdAt: '2026-11-16T00:00:00Z',
      } as unknown as PayStub;
    }

    const mockEmployees = [
      makeEmp('emp-1', 'John', 'Doe', validReceivingRouting1, '111222333', 'CHECKING'),
      makeEmp('emp-2', 'Jane', 'Smith', validReceivingRouting2, '444555666', 'SAVINGS'),
      makeEmp('emp-3', 'Bob', 'PaperCheck'),
    ];

    const mockPayStubs = [
      makeStub('stub-1', 'emp-1', 2800, 2193.84, 'ACH'),
      makeStub('stub-2', 'emp-2', 3200, 2472.96, 'ACH'),
      makeStub('stub-3', 'emp-3', 1000, 792.8, 'CHECK'),
    ];

    it('should generate NACHA file exclusively for ACH paystubs and return updated trace refs', () => {
      const result = generatePayrollNachaBatch(mockCompany, mockPayStubs, mockEmployees, {
        effectiveEntryDate: '2026-11-20',
      });

      expect(result.entryCount).toBe(2);
      expect(result.updatedPayStubs.length).toBe(2);
      expect(result.updatedPayStubs[0].payStubId).toBe('stub-1');
      expect(result.updatedPayStubs[0].achTraceRef).toBe('021000020000001');
      expect(result.updatedPayStubs[1].payStubId).toBe('stub-2');
      expect(result.updatedPayStubs[1].achTraceRef).toBe('021000020000002');
      expect(result.totalCreditCents).toBe(466680);

      const summary = parseNachaFileSummary(result.fileContent);
      expect(summary.entryCount).toBe(2);
      expect(summary.totalCreditCents).toBe(466680);
    });

    it('should throw if company has no bank routing number', () => {
      expect(() =>
        generatePayrollNachaBatch(
          { ...mockCompany, routingNumber: undefined },
          mockPayStubs,
          mockEmployees,
          { effectiveEntryDate: '2026-11-20' }
        )
      ).toThrow(NachaValidationError);
    });

    it('should throw if no ACH paystubs are found in the run', () => {
      const checkOnlyStubs = [mockPayStubs[2]];
      expect(() =>
        generatePayrollNachaBatch(mockCompany, checkOnlyStubs, mockEmployees, {
          effectiveEntryDate: '2026-11-20',
        })
      ).toThrow(NachaValidationError);
    });
  });
});
