import { describe, it, expect } from 'vitest';
import { generateTXPAddenda, buildFederal941TXP, buildPaStateSitTXP } from '../../server/services/txpGenerator';

describe('txpGenerator Service', () => {
  it('should format a valid NACHA TXP string with cleaned tax ID and cents', () => {
    const txp = generateTXPAddenda({
      taxId: '12-3456789',
      taxTypeCode: '01101',
      taxPeriodEnd: '2026-03-31',
      amount: 1250.50,
      taxQualifier: 'T',
    });

    expect(txp).toBe('TXP*123456789*01101*260331*125050*T*~');
  });

  it('should correctly format Federal 941 TXP addenda helper', () => {
    const txp = buildFederal941TXP('98-7654321', '2026-06-30', 450.00);
    expect(txp).toBe('TXP*987654321*01101*260630*45000*M*~');
  });

  it('should correctly format PA State SIT TXP addenda helper', () => {
    const txp = buildPaStateSitTXP('PA-8849102', '2026-09-30', 307.25);
    expect(txp).toBe('TXP*8849102*0100*260930*30725*M*~');
  });
});
