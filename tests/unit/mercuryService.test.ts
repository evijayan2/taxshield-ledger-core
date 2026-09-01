import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMercuryBaseUrl,
  fetchMercuryAccounts,
  createMercuryRecipient,
  disburseMercuryTaxPayment,
} from '../../server/services/mercuryService';

describe('Mercury Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return correct base URL for Sandbox and Production', () => {
    expect(getMercuryBaseUrl('SANDBOX')).toBe('https://backend-sandbox.mercury.com/api/v1');
    expect(getMercuryBaseUrl('PRODUCTION')).toBe('https://api.mercury.com/api/v1');
  });

  it('should throw an error if API key is missing when fetching accounts', async () => {
    await expect(fetchMercuryAccounts('')).rejects.toThrow('Mercury API key is required.');
  });

  it('should parse accounts from API response correctly', async () => {
    const mockAccounts = [
      { id: 'acc_123', name: 'Main Checking', accountNumber: '1234', routingNumber: '987654321', availableBalance: 5000 },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accounts: mockAccounts }),
    } as any);

    const accounts = await fetchMercuryAccounts('secret-token:api-sandbox:mock123', 'SANDBOX');
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe('acc_123');
    expect(accounts[0].availableBalance).toBe(5000);
  });

  it('should format electronicAccountType as valid Mercury API enum values (businessChecking, etc.) and include required address', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'rec_100', name: 'PA Dept of Revenue' }),
    } as any);
    globalThis.fetch = fetchSpy;

    await createMercuryRecipient('secret-token:api-sandbox:key', 'SANDBOX', {
      name: 'PA Department of Revenue',
      routingNumber: '021000021',
      accountNumber: '987654321',
      accountType: 'checking',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const bodyObj = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(bodyObj.electronicRoutingInfo.electronicAccountType).toBe('businessChecking');
    expect(bodyObj.electronicRoutingInfo.address).toBeDefined();
    expect(bodyObj.electronicRoutingInfo.address.city).toBe('Harrisburg');
  });

  it('should simulate disbursement in Sandbox mode when demo key is used', async () => {
    const result = await disburseMercuryTaxPayment('test', 'SANDBOX', {
      accountId: 'acc_123',
      amount: 450.00,
      paymentMethod: 'ach',
      txpAddenda: 'TXP*123456789*01101*260331*45000*M*~',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('SENT_SANDBOX_DEMO');
    expect(result.amount).toBe(450.00);
  });

  it('should execute 2-step recipient creation and ACH transfer with valid key', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'rec_999', name: 'PA Dept of Revenue' }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'tr_777', status: 'PROCESSING', amount: 13.00, createdAt: '2026-08-24T17:00:00Z' }),
      } as any);

    const result = await disburseMercuryTaxPayment('secret-token:api-sandbox:valid_key', 'SANDBOX', {
      accountId: 'acc_123',
      amount: 13.00,
      recipientName: 'PA Department of Revenue',
      recipientRoutingNumber: '021000021',
      recipientAccountNumber: '987654321',
      txpAddenda: 'TXP*8849102*0100*260930*1300*M*~',
    });

    expect(result.success).toBe(true);
    expect(result.transferId).toBe('tr_777');
    expect(result.amount).toBe(13.00);
  });
});
