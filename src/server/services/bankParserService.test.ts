import { describe, it, expect } from 'vitest';
import {
  parseBankCsv,
  normalizeDate,
  parseCurrencyAmount,
  cleanBankPayee,
  generateTransactionFingerprint,
} from './bankParserService';

describe('bankParserService', () => {
  const companyId = 'comp-test-123';

  describe('normalizeDate', () => {
    it('should parse YYYY-MM-DD directly', () => {
      expect(normalizeDate('2026-04-15')).toBe('2026-04-15');
    });

    it('should parse MM/DD/YYYY and M/D/YYYY', () => {
      expect(normalizeDate('04/15/2026')).toBe('2026-04-15');
      expect(normalizeDate('4/5/2026')).toBe('2026-04-05');
      expect(normalizeDate('12/31/2026')).toBe('2026-12-31');
    });

    it('should parse MM-DD-YYYY', () => {
      expect(normalizeDate('05-02-2026')).toBe('2026-05-02');
    });

    it('should return null on invalid input', () => {
      expect(normalizeDate('not-a-date')).toBeNull();
      expect(normalizeDate('')).toBeNull();
    });
  });

  describe('parseCurrencyAmount', () => {
    it('should parse standard positive and negative dollars', () => {
      expect(parseCurrencyAmount('$100.50')).toEqual({ amount: 100.5, isNegative: false });
      expect(parseCurrencyAmount('-$45.20')).toEqual({ amount: 45.2, isNegative: true });
      expect(parseCurrencyAmount('-45.20')).toEqual({ amount: 45.2, isNegative: true });
    });

    it('should handle commas, parenthesis and trailing minus signs', () => {
      expect(parseCurrencyAmount('$1,250.75')).toEqual({ amount: 1250.75, isNegative: false });
      expect(parseCurrencyAmount('(500.00)')).toEqual({ amount: 500, isNegative: true });
      expect(parseCurrencyAmount('75.25-')).toEqual({ amount: 75.25, isNegative: true });
    });

    it('should return null for non-numeric input', () => {
      expect(parseCurrencyAmount('N/A')).toBeNull();
      expect(parseCurrencyAmount('')).toBeNull();
    });
  });

  describe('cleanBankPayee', () => {
    it('should strip common POS, ACH, and card prefixes', () => {
      expect(cleanBankPayee('POS DEBIT STAPLES #0129')).toBe('STAPLES');
      expect(cleanBankPayee('ACH WITHDRAWAL - GUSTO PAYROLL REF#928472')).toBe('GUSTO PAYROLL');
      expect(cleanBankPayee('DEPOSIT STRIPE PAYOUTS')).toBe('STRIPE PAYOUTS');
      expect(cleanBankPayee('CHECKCARD GITHUB INC SAN FRANCISCO CA')).toBe('GITHUB INC');
    });

    it('should preserve regular clean vendor names', () => {
      expect(cleanBankPayee('Amazon Web Services')).toBe('Amazon Web Services');
    });
  });

  describe('generateTransactionFingerprint', () => {
    it('should produce deterministic SHA-256 hash', () => {
      const h1 = generateTransactionFingerprint(companyId, '2026-04-15', 45.99, 'DEBIT', 'Staples');
      const h2 = generateTransactionFingerprint(companyId, '2026-04-15', 45.99, 'DEBIT', 'Staples');
      const h3 = generateTransactionFingerprint(companyId, '2026-04-15', 45.99, 'CREDIT', 'Staples');

      expect(h1).toHaveLength(64);
      expect(h1).toBe(h2);
      expect(h1).not.toBe(h3);
    });
  });

  describe('parseBankCsv', () => {
    it('should parse Mercury format (Date, Description, Amount, FITID)', () => {
      const mercuryCsv = `
"Date","Description","Amount","FITID"
"2026-05-01","Amazon Web Services","-$142.50","mercury_tx_1"
"2026-05-03","Stripe Payout","$6495.00","mercury_tx_2"
"2026-05-05","Gusto Payroll","-$2450.00","mercury_tx_3"
      `.trim();

      const result = parseBankCsv(mercuryCsv, companyId);
      expect(result.success).toBe(true);
      expect(result.totalRows).toBe(3);
      expect(result.totalDebits).toBe(2592.5); // 142.50 + 2450.00
      expect(result.totalCredits).toBe(6495.0);
      expect(result.netAmount).toBe(3902.5);

      expect(result.rows[0]).toMatchObject({
        date: '2026-05-01',
        cleanPayee: 'Amazon Web Services',
        amount: 142.5,
        transactionType: 'DEBIT',
        fitid: 'mercury_tx_1',
      });

      expect(result.rows[1]).toMatchObject({
        date: '2026-05-03',
        cleanPayee: 'Stripe Payout',
        amount: 6495.0,
        transactionType: 'CREDIT',
        fitid: 'mercury_tx_2',
      });
    });

    it('should parse Chase format with separate Type and Balance columns', () => {
      const chaseCsv = `
Posting Date,Description,Amount,Type,Balance,Check or Slip #
04/12/2026,POS DEBIT STAPLES #0129,-45.99,DEBIT,12450.00,
04/14/2026,DIRECT DEPOSIT CLIENT INVOICE,3200.00,CREDIT,15650.00,
      `.trim();

      const result = parseBankCsv(chaseCsv, companyId);
      expect(result.success).toBe(true);
      expect(result.totalRows).toBe(2);
      expect(result.rows[0].date).toBe('2026-04-12');
      expect(result.rows[0].cleanPayee).toBe('STAPLES');
      expect(result.rows[0].amount).toBe(45.99);
      expect(result.rows[0].transactionType).toBe('DEBIT');

      expect(result.rows[1].date).toBe('2026-04-14');
      expect(result.rows[1].amount).toBe(3200.0);
      expect(result.rows[1].transactionType).toBe('CREDIT');
    });

    it('should parse split Debit and Credit columns format (Wells Fargo / BofA)', () => {
      const splitColsCsv = `
Account Ending in 4492
Date,Description,Withdrawal,Deposit
05/10/2026,GOOGLE *WORKSPACE,24.00,
05/15/2026,WIRE TRANSFER IN,,5000.00
      `.trim();

      const result = parseBankCsv(splitColsCsv, companyId);
      expect(result.success).toBe(true);
      expect(result.accountMask).toBe('4492');
      expect(result.totalRows).toBe(2);
      expect(result.rows[0].transactionType).toBe('DEBIT');
      expect(result.rows[0].amount).toBe(24.0);
      expect(result.rows[1].transactionType).toBe('CREDIT');
      expect(result.rows[1].amount).toBe(5000.0);
    });

    it('should return error for empty or header-only CSV', () => {
      const emptyResult = parseBankCsv('', companyId);
      expect(emptyResult.success).toBe(false);
      expect(emptyResult.totalRows).toBe(0);

      const headerOnly = parseBankCsv('Date,Description,Amount\n', companyId);
      expect(headerOnly.success).toBe(false);
      expect(headerOnly.totalRows).toBe(0);
    });
  });
});
