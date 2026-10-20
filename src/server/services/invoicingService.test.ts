import { describe, it, expect } from 'vitest';
import {
  calculateDueDate,
  isValidStatusTransition,
} from './invoicingService';
import type { InvoiceStatus, PaymentTerms } from './invoicingService';

describe('invoicingService', () => {
  describe('calculateDueDate', () => {
    const baseDate = '2026-05-01';

    it('returns same date for DUE_ON_RECEIPT', () => {
      expect(calculateDueDate(baseDate, 'DUE_ON_RECEIPT')).toBe('2026-05-01');
    });

    it('adds 15 days for NET_15', () => {
      expect(calculateDueDate(baseDate, 'NET_15')).toBe('2026-05-16');
    });

    it('adds 30 days for NET_30', () => {
      expect(calculateDueDate(baseDate, 'NET_30')).toBe('2026-05-31');
    });

    it('adds 60 days for NET_60 crossing month boundary', () => {
      expect(calculateDueDate(baseDate, 'NET_60')).toBe('2026-06-30');
    });
  });

  describe('isValidStatusTransition', () => {
    it('allows identity transition (no-op)', () => {
      expect(isValidStatusTransition('DRAFT', 'DRAFT')).toBe(true);
      expect(isValidStatusTransition('PAID', 'PAID')).toBe(true);
    });

    it('allows legal forward transitions', () => {
      expect(isValidStatusTransition('DRAFT', 'SENT')).toBe(true);
      expect(isValidStatusTransition('SENT', 'VIEWED')).toBe(true);
      expect(isValidStatusTransition('SENT', 'PAID')).toBe(true);
      expect(isValidStatusTransition('VIEWED', 'PAID')).toBe(true);
      expect(isValidStatusTransition('SENT', 'OVERDUE')).toBe(true);
      expect(isValidStatusTransition('OVERDUE', 'PAID')).toBe(true);
    });

    it('allows voiding unpaid invoices', () => {
      expect(isValidStatusTransition('DRAFT', 'VOID')).toBe(true);
      expect(isValidStatusTransition('SENT', 'VOID')).toBe(true);
      expect(isValidStatusTransition('OVERDUE', 'VOID')).toBe(true);
    });

    it('strictly forbids illegal transitions', () => {
      // Cannot skip SENT directly to PAID from DRAFT
      expect(isValidStatusTransition('DRAFT', 'PAID')).toBe(false);
      // Cannot void an already settled PAID invoice
      expect(isValidStatusTransition('PAID', 'VOID')).toBe(false);
      // Cannot move backwards from PAID to DRAFT or SENT
      expect(isValidStatusTransition('PAID', 'DRAFT')).toBe(false);
      expect(isValidStatusTransition('PAID', 'SENT')).toBe(false);
      // Cannot un-void a VOID invoice
      expect(isValidStatusTransition('VOID', 'DRAFT')).toBe(false);
      expect(isValidStatusTransition('VOID', 'SENT')).toBe(false);
    });
  });
});
