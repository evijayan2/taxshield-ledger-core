import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { sha256Hex, randomHex } from './isomorphicCrypto';

describe('isomorphicCrypto', () => {
  describe('sha256Hex', () => {
    it('matches known NIST standard test vectors', () => {
      // Empty string
      expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

      // Simple ASCII
      expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

      // Longer sentence
      expect(sha256Hex('The quick brown fox jumps over the lazy dog')).toBe(
        'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'
      );
    });

    it('matches node:crypto createHash on various dynamic strings and bank payloads', () => {
      const testCases = [
        'company_123:2026-05-01:142.50:DEBIT:amazon web services',
        'company_abc:2026-04-15:84.20:DEBIT:staples #0129',
        'company_xyz:2026-06-30:6500.00:CREDIT:stripe payouts',
        'Unicode test: Café & Resumé — $100.00 🚀',
        JSON.stringify({ a: 1, b: 'two', c: [3, 4, 5], d: { nested: true } }),
      ];

      for (const str of testCases) {
        const expected = crypto.createHash('sha256').update(str).digest('hex');
        const actual = sha256Hex(str);
        expect(actual).toBe(expected);
      }
    });

    it('handles exact multi-block strings crossing 64-byte boundaries', () => {
      const longStr = 'a'.repeat(250);
      const expected = crypto.createHash('sha256').update(longStr).digest('hex');
      expect(sha256Hex(longStr)).toBe(expected);
    });
  });

  describe('randomHex', () => {
    it('generates random hex strings of requested byte length', () => {
      const hex16 = randomHex(16);
      expect(hex16).toHaveLength(32);
      expect(/^[0-9a-f]{32}$/.test(hex16)).toBe(true);

      const hex32 = randomHex(32);
      expect(hex32).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hex32)).toBe(true);

      const hex32_2 = randomHex(32);
      expect(hex32).not.toBe(hex32_2);
    });
  });
});
