import { prisma } from '../../lib/prisma';
import { recordAuditLog } from '../../lib/audit';
import { logInfo, logError } from '../../lib/logger';
import type { Invoice, InvoiceStatus, Customer, InvoiceLineItem } from '../../commercialTypes';

export type { InvoiceStatus };

export interface CreateLineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export type PaymentTerms = 'DUE_ON_RECEIPT' | 'NET_15' | 'NET_30' | 'NET_60';

export interface CreateInvoiceInput {
  customerId: string;
  taxYearId: string;
  issueDate: string; // ISO date YYYY-MM-DD
  paymentTerms: PaymentTerms;
  dueDate?: string; // Optional override
  lineItems: CreateLineItemInput[];
  taxAmount?: number;
  notes?: string;
}

export interface InvoiceFilters {
  status?: InvoiceStatus;
  customerId?: string;
  taxYearId?: string;
}

/**
 * Calculates due date based on issue date and payment terms.
 * @param issueDate ISO date string YYYY-MM-DD.
 * @param terms Selected payment terms.
 * @returns Computed due date string YYYY-MM-DD.
 */
export function calculateDueDate(issueDate: string, terms: PaymentTerms): string {
  const date = new Date(issueDate);
  const daysToAdd = terms === 'NET_15' ? 15 : terms === 'NET_30' ? 30 : terms === 'NET_60' ? 60 : 0;
  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().split('T')[0];
}

/**
 * Validates allowed state transitions for the invoice lifecycle.
 * @param current Current invoice status.
 * @param next Proposed next status.
 * @returns True if legal transition.
 */
export function isValidStatusTransition(current: InvoiceStatus, next: InvoiceStatus): boolean {
  if (current === next) return true;
  if (next === 'VOID') return current === 'DRAFT' || current === 'SENT' || current === 'OVERDUE';
  if (current === 'DRAFT') return next === 'SENT';
  if (current === 'SENT') return next === 'VIEWED' || next === 'PAID' || next === 'OVERDUE' || next === 'PARTIALLY_PAID';
  if (current === 'VIEWED') return next === 'PAID' || next === 'OVERDUE' || next === 'PARTIALLY_PAID';
  if (current === 'OVERDUE') return next === 'PAID' || next === 'PARTIALLY_PAID';
  if (current === 'PARTIALLY_PAID') return next === 'PAID' || next === 'OVERDUE';
  return false;
}

/**
 * Allocates a gapless sequential invoice number for a company.
 * @param companyId Target company UUID.
 * @param year Optional 4-digit fiscal year prefix.
 * @returns Formatted sequence string (e.g. "INV-2026-001").
 */
export async function allocateInvoiceNumber(companyId: string, year: string = new Date().getFullYear().toString()): Promise<string> {
  // Query existing highest count as fallback or sequence increment
  const count = await prisma.invoice.count({ where: { companyId } });
  const nextNum = count + 1;
  return `INV-${year}-${String(nextNum).padStart(3, '0')}`;
}

/**
 * Creates a new itemized commercial invoice.
 * @param companyId Scoped company UUID.
 * @param actorId Authenticated user ID.
 * @param input Invoice payload.
 * @returns Newly created invoice record.
 */
export async function createInvoice(
  companyId: string,
  actorId: string,
  input: CreateInvoiceInput
): Promise<Invoice> {
  if (!input.lineItems || input.lineItems.length === 0) {
    throw new Error('Invoice must contain at least one line item');
  }

  const computedDueDate = input.dueDate || calculateDueDate(input.issueDate, input.paymentTerms);
  const invoiceNumber = await allocateInvoiceNumber(companyId);

  const subtotal = input.lineItems.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const taxAmount = input.taxAmount || 0;
  const totalAmount = subtotal + taxAmount;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          companyId,
          customerId: input.customerId,
          taxYearId: input.taxYearId,
          invoiceNumber,
          issueDate: input.issueDate,
          dueDate: computedDueDate,
          status: 'DRAFT',
          subtotal,
          taxAmount,
          totalAmount,
          amountPaid: 0,
          notes: input.notes || null,
          lineItems: {
            create: input.lineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.quantity * item.unitPrice,
            })),
          },
        },
        include: { lineItems: true, customer: true },
      });

      return inv;
    });

    await recordAuditLog({
      companyId,
      entityType: 'INVOICE',
      entityId: created.id,
      action: 'CREATE',
      actorId,
      newState: { invoiceNumber: created.invoiceNumber, totalAmount: created.totalAmount, status: created.status },
      reason: 'Created new customer invoice',
    });

    logInfo('Invoice created successfully', { companyId, invoiceId: created.id, invoiceNumber });
    return mapInvoiceRecord(created);
  } catch (error) {
    logError('Failed to create invoice', error, { companyId, input });
    throw error;
  }
}

/**
 * Transitions an invoice's lifecycle status with audit recording.
 * @param companyId Scoped company UUID.
 * @param invoiceId Invoice UUID.
 * @param actorId Authenticated user ID.
 * @param newStatus Target status.
 * @param reason Optional audit reason.
 * @returns Updated invoice.
 */
export async function updateInvoiceStatus(
  companyId: string,
  invoiceId: string,
  actorId: string,
  newStatus: InvoiceStatus,
  reason?: string
): Promise<Invoice> {
  const existing = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId },
    include: { lineItems: true, customer: true },
  });

  if (!existing) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const currentStatus = existing.status as InvoiceStatus;
  if (!isValidStatusTransition(currentStatus, newStatus)) {
    throw new Error(`Illegal invoice state transition from ${currentStatus} to ${newStatus}`);
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: newStatus },
    include: { lineItems: true, customer: true },
  });

  await recordAuditLog({
    companyId,
    entityType: 'INVOICE',
    entityId: invoiceId,
    action: 'UPDATE',
    actorId,
    previousState: { status: currentStatus },
    newState: { status: newStatus },
    reason: reason || `Updated invoice status to ${newStatus}`,
  });

  return mapInvoiceRecord(updated);
}

/**
 * Lists invoices for a company matching optional filters.
 * @param companyId Scoped company UUID.
 * @param filters Optional status, customer, or year filters.
 * @returns Array of invoices.
 */
export async function listInvoices(companyId: string, filters: InvoiceFilters = {}): Promise<Invoice[]> {
  const records = await prisma.invoice.findMany({
    where: {
      companyId,
      ...(filters.status && { status: filters.status }),
      ...(filters.customerId && { customerId: filters.customerId }),
      ...(filters.taxYearId && { taxYearId: filters.taxYearId }),
    },
    include: { lineItems: true, customer: true },
    orderBy: { createdAt: 'desc' },
  });

  return records.map(mapInvoiceRecord);
}

/**
 * Maps raw Prisma invoice database entity to domain Invoice interface.
 * @param raw Prisma record with relations.
 * @returns Formatted Invoice.
 */
function mapInvoiceRecord(raw: any): Invoice {
  return {
    id: raw.id,
    companyId: raw.companyId,
    customerId: raw.customerId,
    customerName: raw.customer?.name,
    taxYearId: raw.taxYearId,
    invoiceNumber: raw.invoiceNumber,
    issueDate: raw.issueDate,
    dueDate: raw.dueDate,
    status: raw.status as InvoiceStatus,
    subtotal: raw.subtotal,
    taxAmount: raw.taxAmount,
    totalAmount: raw.totalAmount,
    amountPaid: raw.amountPaid,
    stripePaymentId: raw.stripePaymentId,
    stripePaymentUrl: raw.stripePaymentUrl,
    notes: raw.notes,
    lineItems: (raw.lineItems || []).map((li: any): InvoiceLineItem => ({
      id: li.id,
      invoiceId: li.invoiceId,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      amount: li.amount,
    })),
    createdAt: raw.createdAt?.toISOString(),
    updatedAt: raw.updatedAt?.toISOString(),
  };
}
