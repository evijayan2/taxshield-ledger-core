import { describe, it, expect } from 'vitest';
import {
  formatField,
  formatDateYYMMDD,
  buildFileHeaderRecord,
  buildBatchHeaderRecord,
  buildEntryDetailRecord,
  buildBatchControlRecord,
  buildFileControlRecord,
  NachaValidationError,
} from './nachaRecordBuilders';

describe('NACHA Record Builders & Formatters (94-char enforcement)', () => {
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

  describe('formatField and date helpers', () => {
    it('should pad and truncate left-aligned text fields to exact length', () => {
      expect(formatField('Hello', 10, 'left')).toBe('HELLO     ');
      expect(formatField('A very long string exceeding limit', 10, 'left')).toBe('A VERY LON');
    });

    it('should pad right-aligned numeric fields with zeroes', () => {
      expect(formatField(12345, 10, 'right', '0')).toBe('0000012345');
    });

    it('should strip non-printable ASCII characters', () => {
      expect(formatField('Café \x00Test', 10, 'left')).toBe('CAF TEST  ');
    });

    it('should format dates as YYMMDD correctly', () => {
      expect(formatDateYYMMDD('2026-11-22')).toBe('261122');
      expect(formatDateYYMMDD('261122')).toBe('261122');
      expect(formatDateYYMMDD('20261122')).toBe('261122');
    });
  });

  describe('Individual Record Type Builders', () => {
    it('should build File Header Record (Type 1) of exactly 94 characters', () => {
      const line = buildFileHeaderRecord(testCompany, {
        effectiveEntryDate: '2026-11-22',
        fileCreationDate: '2026-11-22',
        fileCreationTime: '0930',
        fileIdModifier: 'A',
      });
      expect(line.length).toBe(94);
      expect(line.startsWith('101')).toBe(true);
      expect(line.slice(3, 13)).toBe(' ' + validOdfiRouting);
      expect(line.slice(13, 23)).toBe('1123456789');
      expect(line.slice(34, 37)).toBe('094');
      expect(line.slice(37, 39)).toBe('10');
      expect(line.slice(39, 40)).toBe('1');
    });

    it('should reject File Header with invalid ODFI routing', () => {
      expect(() =>
        buildFileHeaderRecord(
          { ...testCompany, odfiRoutingNumber: '111111111' },
          { effectiveEntryDate: '2026-11-22' }
        )
      ).toThrow(NachaValidationError);
    });

    it('should build Batch Header Record (Type 5) of exactly 94 characters', () => {
      const line = buildBatchHeaderRecord(testCompany, {
        effectiveEntryDate: '2026-11-25',
        standardEntryClass: 'PPD',
        companyEntryDescription: 'PAYROLL',
      });
      expect(line.length).toBe(94);
      expect(line.startsWith('5220')).toBe(true);
      expect(line.slice(50, 53)).toBe('PPD');
      expect(line.slice(53, 63)).toBe('PAYROLL   ');
      expect(line.slice(69, 75)).toBe('261125');
    });

    it('should build Entry Detail Record (Type 6) for Checking (22) and Savings (32)', () => {
      const checking = buildEntryDetailRecord(testEntries[0], validOdfiRouting, 1);
      expect(checking.line.length).toBe(94);
      expect(checking.line.startsWith('622')).toBe(true);
      expect(checking.line.slice(3, 11)).toBe('12100024');
      expect(checking.line.slice(11, 12)).toBe('8');
      expect(checking.line.slice(29, 39)).toBe('0000250050');
      expect(checking.creditCents).toBe(250050);
      expect(checking.hashAddend).toBe(12100024);

      const savings = buildEntryDetailRecord(testEntries[1], validOdfiRouting, 2);
      expect(savings.line.length).toBe(94);
      expect(savings.line.startsWith('632')).toBe(true);
      expect(savings.line.slice(29, 39)).toBe('0000175025');
      expect(savings.creditCents).toBe(175025);
    });

    it('should build Pre-Note Entry with zero amount using codes 23 and 33', () => {
      const prenoteChecking = buildEntryDetailRecord(
        { ...testEntries[0], amount: 0, paymentType: 'PRENOTE' },
        validOdfiRouting,
        1
      );
      expect(prenoteChecking.line.startsWith('623')).toBe(true);
      expect(prenoteChecking.line.slice(29, 39)).toBe('0000000000');

      const prenoteSavings = buildEntryDetailRecord(
        { ...testEntries[1], amount: 0, paymentType: 'PRENOTE' },
        validOdfiRouting,
        2
      );
      expect(prenoteSavings.line.startsWith('633')).toBe(true);
    });

    it('should reject Entry Detail with invalid employee bank routing', () => {
      expect(() =>
        buildEntryDetailRecord(
          { ...testEntries[0], routingNumber: '021000022' },
          validOdfiRouting,
          1
        )
      ).toThrow(NachaValidationError);
    });

    it('should reject Entry Detail with negative payment amount', () => {
      expect(() =>
        buildEntryDetailRecord(
          { ...testEntries[0], amount: -50 },
          validOdfiRouting,
          1
        )
      ).toThrow(NachaValidationError);
    });

    it('should build Batch Control (Type 8) and File Control (Type 9) of exactly 94 characters', () => {
      const bCtrl = buildBatchControlRecord(
        testCompany,
        2,
        '015210029',
        425075,
        0,
        validOdfiRouting,
        1
      );
      expect(bCtrl.length).toBe(94);
      expect(bCtrl.startsWith('8220')).toBe(true);

      const fCtrl = buildFileControlRecord(1, 1, 2, '015210029', 425075, 0);
      expect(fCtrl.length).toBe(94);
      expect(fCtrl.startsWith('9000001')).toBe(true);
    });
  });
});
