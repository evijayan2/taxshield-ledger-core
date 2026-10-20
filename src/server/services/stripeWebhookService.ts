import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { recordAuditLog } from '../../lib/audit';
import { logInfo, logError } from '../../lib/logger';

export interface StripeWebhookSessionPayload {
  id: string;
  payment_status: string;
  amount_total: number; // in cents
  currency: string;
  payment_intent?: string;
  metadata?: {
    companyId?: string;
    invoiceId?: string;
    taxYearId?: string;
    paymentMethodType?: 'card' | 'ach';
  };
}

export interface SplitSettlementResult {
  invoiceId: string;
  invoiceNumber: string;
  grossAmount: number;
  merchantFee: number;
  netDeposit: number;
  isDuplicate: boolean;
}

/**
 * Calculates estimated Stripe processing fee based on payment rail.
 * @param amountInDollars Total transaction dollar amount.
 * @param rail Payment rail: 'card' (2.9% + $0.30) or 'ach' (0.8% capped at $5.00).
 * @returns Processing fee in dollars, rounded to 2 decimals.
 */
export function calculateStripeFee(amountInDollars: number, rail: 'card' | 'ach' = 'card'): number {
  if (amountInDollars <= 0) return 0;
  if (rail === 'ach') {
    const rawFee = amountInDollars * 0.008;
    return Math.min(Math.round(rawFee * 100) / 100, 5.00);
  }
  // Standard card: 2.9% + $0.30
  const fee = (amountInDollars * 0.029) + 0.30;
  return Math.round(fee * 100) / 100;
}

/**
 * Verifies the Stripe webhook signature header using HMAC-SHA256.
 * @param payload Raw request body string.
 * @param signatureHeader Stripe-Signature header value (t=timestamp,v1=signature).
 * @param webhookSecret Stripe webhook endpoint secret.
 * @param toleranceSeconds Max allowed age in seconds (default 300s).
 * @returns True if signature is cryptographically valid.
 */
export function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds: number = 300
): boolean {
  if (!payload || !signatureHeader || !webhookSecret) return false;

  const elements = signatureHeader.split(',');
  let timestamp = '';
  let signature = '';

  for (const element of elements) {
    const [key, val] = element.trim().split('=');
    if (key === 't') timestamp = val;
    if (key === 'v1') signature = val;
  }

  if (!timestamp || !signature) return false;

  const currentTime = Math.floor(Date.now() / 1000);
  const eventTime = parseInt(timestamp, 10);
  if (isNaN(eventTime) || Math.abs(currentTime - eventTime) > toleranceSeconds) {
    return false; // Stale or future timestamp
  }

  const signedPayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac('sha256', webhookSecret).update(signedPayload, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hmac, 'utf8'), Buffer.from(signature, 'utf8'));
}

/**
 * Atomically processes a completed Stripe checkout session and posts split ledger entries.
 * @param eventId Unique Stripe event ID for idempotency deduplication.
 * @param session Parsed session payload.
 * @returns Settlement breakdown.
 */
export async function processStripeCheckoutCompleted(
  eventId: string,
  session: StripeWebhookSessionPayload
): Promise<SplitSettlementResult> {
  const invoiceId = session.metadata?.invoiceId;
  const companyId = session.metadata?.companyId;

  if (!invoiceId || !companyId) {
    throw new Error('Stripe session metadata missing required invoiceId or companyId');
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId },
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} for company ${companyId} not found`);
  }

  // Idempotency: If invoice is already PAID, return cleanly without duplicate entries
  if (invoice.status === 'PAID') {
    logInfo('Invoice already settled; skipping duplicate event', { invoiceId, eventId });
    return {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      grossAmount: invoice.totalAmount,
      merchantFee: 0,
      netDeposit: invoice.totalAmount,
      isDuplicate: true,
    };
  }

  const grossAmount = session.amount_total / 100;
  const rail = session.metadata?.paymentMethodType || 'card';
  const merchantFee = calculateStripeFee(grossAmount, rail);
  const netDeposit = Math.round((grossAmount - merchantFee) * 100) / 100;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Mark invoice as paid
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'PAID',
          amountPaid: grossAmount,
          stripePaymentId: session.payment_intent || session.id,
        },
      });

      // 2. Post merchant processing fee as Schedule C Line 10 operating expense
      await tx.generalExpense.create({
        data: {
          companyId,
          expenseDate: new Date().toISOString().split('T')[0],
          payee: 'Stripe, Inc.',
          category: 'COMMISSIONS_AND_FEES',
          scheduleCLine: 'Line 10',
          amount: merchantFee,
          description: `Merchant processing fee for invoice ${invoice.invoiceNumber}`,
          isTaxDeductible: true,
          notes: `Auto-recorded by Stripe webhook event ${eventId}`,
        },
      });
    });

    // 3. Immutable audit trail
    await recordAuditLog({
      companyId,
      entityType: 'INVOICE',
      entityId: invoiceId,
      action: 'UPDATE',
      actorId: 'STRIPE_WEBHOOK',
      newState: { status: 'PAID', grossAmount, merchantFee, netDeposit, eventId },
      reason: `Settled via Stripe ${rail.toUpperCase()}; fee recorded under Schedule C Line 10`,
    });

    logInfo('Stripe webhook settlement completed', { invoiceId, grossAmount, merchantFee, netDeposit });
    return {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      grossAmount,
      merchantFee,
      netDeposit,
      isDuplicate: false,
    };
  } catch (error) {
    logError('Failed processing Stripe webhook settlement', error, { invoiceId, eventId });
    throw error;
  }
}
