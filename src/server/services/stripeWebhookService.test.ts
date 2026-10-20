import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  calculateStripeFee,
  verifyStripeSignature,
} from './stripeWebhookService';

describe('stripeWebhookService', () => {
  describe('calculateStripeFee', () => {
    it('calculates standard card fee (2.9% + $0.30)', () => {
      // $100 * 0.029 + 0.30 = $3.20
      expect(calculateStripeFee(100, 'card')).toBe(3.20);
      // $6,500 * 0.029 + 0.30 = $188.80
      expect(calculateStripeFee(6500, 'card')).toBe(188.80);
    });

    it('calculates ACH fee (0.8% capped at $5.00)', () => {
      // $100 * 0.008 = $0.80
      expect(calculateStripeFee(100, 'ach')).toBe(0.80);
      // $500 * 0.008 = $4.00
      expect(calculateStripeFee(500, 'ach')).toBe(4.00);
      // $1000 * 0.008 = $8.00 -> capped at $5.00
      expect(calculateStripeFee(1000, 'ach')).toBe(5.00);
      // $6,500 consulting -> capped at $5.00
      expect(calculateStripeFee(6500, 'ach')).toBe(5.00);
    });

    it('returns 0 for zero or negative amount', () => {
      expect(calculateStripeFee(0)).toBe(0);
      expect(calculateStripeFee(-50)).toBe(0);
    });
  });

  describe('verifyStripeSignature', () => {
    const secret = 'whsec_test_secret_key_12345';
    const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });

    it('validates authentic signature with current timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const signedPayload = `${now}.${payload}`;
      const signature = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
      const header = `t=${now},v1=${signature}`;

      expect(verifyStripeSignature(payload, header, secret)).toBe(true);
    });

    it('rejects tampered payload', () => {
      const now = Math.floor(Date.now() / 1000);
      const signedPayload = `${now}.${payload}`;
      const signature = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
      const header = `t=${now},v1=${signature}`;

      const tamperedPayload = payload + ' ';
      expect(verifyStripeSignature(tamperedPayload, header, secret)).toBe(false);
    });

    it('rejects expired/stale timestamp (> 300s)', () => {
      const oldTime = Math.floor(Date.now() / 1000) - 500;
      const signedPayload = `${oldTime}.${payload}`;
      const signature = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
      const header = `t=${oldTime},v1=${signature}`;

      expect(verifyStripeSignature(payload, header, secret, 300)).toBe(false);
    });

    it('rejects missing or malformed header elements', () => {
      expect(verifyStripeSignature(payload, '', secret)).toBe(false);
      expect(verifyStripeSignature('', 't=123,v1=abc', secret)).toBe(false);
      expect(verifyStripeSignature(payload, 'malformed', secret)).toBe(false);
    });
  });
});
