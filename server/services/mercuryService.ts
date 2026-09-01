/**
 * Mercury Bank API Service
 * Handles Mercury Sandbox & Production REST API integration for tax disbursements.
 */

export interface MercuryAccount {
  id: string;
  name: string;
  accountNumber?: string;
  routingNumber?: string;
  availableBalance: number;
}

export interface MercuryAddressInput {
  address1?: string;
  address2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface MercuryRecipientInput {
  name: string;
  routingNumber: string;
  accountNumber: string;
  accountType?: 'businessChecking' | 'businessSavings' | 'personalChecking' | 'personalSavings' | 'checking' | 'savings' | 'CHECKING' | 'SAVINGS' | string;
  address?: MercuryAddressInput;
  note?: string;
}

export interface MercuryRecipientResult {
  id: string;
  name: string;
}

export interface MercuryPaymentInput {
  accountId?: string;
  recipientId?: string;
  recipientRoutingNumber?: string;
  recipientAccountNumber?: string;
  recipientName?: string;
  amount: number;
  paymentMethod?: 'ach' | 'wire';
  paymentReference?: string;
  txpAddenda?: string;
}

export interface MercuryPaymentResult {
  success: boolean;
  transferId: string;
  status: string;
  amount: number;
  txpAddenda?: string;
  message?: string;
  createdAt: string;
}

/**
 * Returns base URL for Mercury API based on environment.
 */
export function getMercuryBaseUrl(env: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX'): string {
  return env === 'PRODUCTION'
    ? 'https://api.mercury.com/api/v1'
    : 'https://backend-sandbox.mercury.com/api/v1';
}

/**
 * Checks whether an API key is a demo / test token.
 */
function isDemoKey(apiKey: string): boolean {
  const clean = (apiKey || '').trim().toLowerCase();
  return ['test', 'demo', 'sandbox', 'mock', 'sbx_test'].includes(clean);
}

/**
 * Fetches available accounts from Mercury API.
 */
export async function fetchMercuryAccounts(
  apiKey: string,
  env: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX'
): Promise<MercuryAccount[]> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw new Error('Mercury API key is required.');
  }

  if (env === 'SANDBOX' && isDemoKey(cleanKey)) {
    return [
      {
        id: 'sbx_acc_checking_01',
        name: 'Mercury Sandbox Checking (Demo)',
        accountNumber: '****9876',
        routingNumber: '123456789',
        availableBalance: 50000.00,
      },
      {
        id: 'sbx_acc_treasury_02',
        name: 'Mercury Sandbox Treasury (Demo)',
        accountNumber: '****5432',
        routingNumber: '123456789',
        availableBalance: 125000.00,
      },
    ];
  }

  const baseUrl = getMercuryBaseUrl(env);
  const response = await fetch(`${baseUrl}/accounts`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${cleanKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedMsg = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.errors?.message) parsedMsg = parsed.errors.message;
    } catch {
      // ignore
    }

    if (response.status === 401) {
      throw new Error(`Mercury Auth Error (401): ${parsedMsg}. Make sure to copy the full token string starting with 'secret-token:' from your Mercury Dashboard.`);
    }

    throw new Error(`Mercury API request failed (${response.status}): ${parsedMsg}`);
  }

  const data = await response.json();
  const rawAccounts = data.accounts || data || [];

  return rawAccounts.map((acc: any) => ({
    id: acc.id || acc.accountNumber || 'acc_mock',
    name: acc.name || acc.nickname || 'Mercury Checking',
    accountNumber: acc.accountNumber || '****1234',
    routingNumber: acc.routingNumber || '123456789',
    availableBalance: typeof acc.availableBalance === 'number' ? acc.availableBalance : (acc.balance || 0),
  }));
}

/**
 * Creates or retrieves a counterparty recipient in Mercury API.
 */
export async function createMercuryRecipient(
  apiKey: string,
  env: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX',
  recipient: MercuryRecipientInput
): Promise<MercuryRecipientResult> {
  const cleanKey = apiKey.trim();
  const baseUrl = getMercuryBaseUrl(env);

  const rawType = (recipient.accountType || '').toLowerCase();
  let electronicAccountType = 'businessChecking';
  if (rawType.includes('personal') && rawType.includes('savings')) {
    electronicAccountType = 'personalSavings';
  } else if (rawType.includes('personal')) {
    electronicAccountType = 'personalChecking';
  } else if (rawType.includes('savings')) {
    electronicAccountType = 'businessSavings';
  } else {
    electronicAccountType = 'businessChecking';
  }

  const recipientAddr = recipient.address || {};
  const address = {
    address1: recipientAddr.address1 || '100 State St',
    city: recipientAddr.city || 'Harrisburg',
    region: recipientAddr.region || 'PA',
    postalCode: recipientAddr.postalCode || '17101',
    country: recipientAddr.country || 'US',
  };

  const payload = {
    name: recipient.name,
    emails: ['tax-remittance@taxledger.local'],
    electronicRoutingInfo: {
      accountNumber: recipient.accountNumber,
      routingNumber: recipient.routingNumber,
      electronicAccountType,
      address,
    },
  };

  const response = await fetch(`${baseUrl}/recipients`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cleanKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mercury Recipient Creation Failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return {
    id: data.id || `rec_${Date.now()}`,
    name: data.name || recipient.name,
  };
}

/**
 * Resolves a valid account ID for Mercury transfer.
 */
async function resolveAccountId(apiKey: string, env: 'SANDBOX' | 'PRODUCTION', accountId?: string): Promise<string> {
  if (accountId && accountId !== 'acc_default' && accountId !== 'sbx_acc_simulated') {
    return accountId;
  }
  const accounts = await fetchMercuryAccounts(apiKey, env);
  if (accounts.length === 0) {
    throw new Error('No Mercury checking accounts found for this API key.');
  }
  const checkingAcc = accounts.find(a => {
    const nameLower = (a.name || '').toLowerCase();
    return nameLower.includes('checking') || !nameLower.includes('savings');
  });
  return checkingAcc ? checkingAcc.id : accounts[0].id;
}

/**
 * Disburses a tax payment via Mercury API.
 */
export async function disburseMercuryTaxPayment(
  apiKey: string,
  env: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX',
  payment: MercuryPaymentInput
): Promise<MercuryPaymentResult> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw new Error('Mercury API key is required.');
  }
  if (payment.amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  // Handle Demo Mode
  if (env === 'SANDBOX' && isDemoKey(cleanKey)) {
    const mockId = `tr_sbx_${Date.now()}`;
    return {
      success: true,
      transferId: mockId,
      status: 'SENT_SANDBOX_DEMO',
      amount: payment.amount,
      txpAddenda: payment.txpAddenda,
      message: `Demo Mercury ACH tax payment simulated successfully (${mockId}).`,
      createdAt: new Date().toISOString(),
    };
  }

  const baseUrl = getMercuryBaseUrl(env);
  const targetAccountId = await resolveAccountId(cleanKey, env, payment.accountId);

  // Step 1: Create Recipient in Mercury
  let recipientId = payment.recipientId;
  if (!recipientId) {
    const recResult = await createMercuryRecipient(cleanKey, env, {
      name: payment.recipientName || 'PA Department of Revenue',
      routingNumber: payment.recipientRoutingNumber || '021000021',
      accountNumber: payment.recipientAccountNumber || '987654321',
    });
    recipientId = recResult.id;
  }

  // Step 2: Issue Transfer via Mercury API
  const idempotencyKey = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const transferPayload = {
    recipientId,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod || 'ach',
    paymentReference: payment.txpAddenda || payment.paymentReference || 'Tax Remittance',
    idempotencyKey,
  };

  const endpoints = [
    `${baseUrl}/account/${targetAccountId}/send-money`,
    `${baseUrl}/account/${targetAccountId}/transactions`,
  ];

  let lastError = '';
  let response: Response | null = null;

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transferPayload),
      });

      if (res.status === 404) {
        lastError = await res.text();
        continue;
      }

      response = res;
      break;
    } catch (err: any) {
      lastError = err.message;
    }
  }

  if (!response) {
    throw new Error(`Mercury ACH Transfer Failed (404): ${lastError || 'Endpoint not found'}`);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMsg = errorBody;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.message || parsed.errors?.message) {
        errorMsg = parsed.message || parsed.errors.message;
      }
    } catch {
      // ignore
    }
    throw new Error(`Mercury ACH Transfer Failed (${response.status}): ${errorMsg}`);
  }

  const data = await response.json();
  return {
    success: true,
    transferId: data.id || `tr_${Date.now()}`,
    status: data.status || 'SENT',
    amount: data.amount || payment.amount,
    txpAddenda: payment.txpAddenda,
    message: `Tax payment successfully transmitted to Mercury API. Transfer ID: ${data.id || 'tr_created'}`,
    createdAt: data.createdAt || new Date().toISOString(),
  };
}
