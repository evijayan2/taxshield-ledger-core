import { describe, it, expect } from 'vitest';
import { parseReceiptText, processReceiptScan } from './ocrService';

describe('Receipt OCR Extraction Engine (ocrService)', () => {
  it('should parse standard office supply receipt with ISO date and totals', () => {
    const rawReceipt = `
      STAPLES STORE #0412
      1234 MARKET STREET, PHILADELPHIA, PA
      DATE: 2026-04-12 14:32
      TRANSACTION #882194

      COPY PAPER 24LB 10-REAM     $38.99
      BALLPOINT PENS 12-PK        $6.99
      ---------------------------------
      SUBTOTAL:                   $45.98
      PA SALES TAX (6%):           $2.76
      TOTAL AMOUNT:               $48.74
      PAID BY: VISA ENDING 1234
    `;

    const result = parseReceiptText(rawReceipt, { fileName: 'staples_0412.pdf' });

    expect(result.status).toBe('unconfirmed');
    expect(result.vendor.value).toBe('Staples');
    expect(result.vendor.confidence).toBe('high');
    expect(result.date.value).toBe('2026-04-12');
    expect(result.date.confidence).toBe('high');
    expect(result.totalAmount.value).toBe(48.74);
    expect(result.subtotal?.value).toBe(45.98);
    expect(result.taxAmount?.value).toBe(2.76);
    expect(result.suggestedCategory.value).toBe('OFFICE_SUPPLIES');
    expect(result.suggestedScheduleCLine.value).toContain('Line 18');
    expect(result.receiptFileName).toBe('staples_0412.pdf');
  });

  it('should parse cloud infrastructure invoice with US slash date and Schedule C Line 27a', () => {
    const rawInvoice = `
      AMAZON WEB SERVICES, INC.
      INVOICE SUMMARY
      Invoice Date: 05/01/2026
      Account ID: 1234-5678-9012

      AWS EC2 Linux Compute Hours    $120.00
      AWS S3 Standard Storage         $22.50
      --------------------------------------
      Total Due:                     $142.50
      Payment Method: Auto-Debit Checking
    `;

    const result = parseReceiptText(rawInvoice);

    expect(result.status).toBe('unconfirmed');
    expect(result.vendor.value).toBe('Amazon Web Services');
    expect(result.vendor.confidence).toBe('high');
    expect(result.date.value).toBe('2026-05-01');
    expect(result.totalAmount.value).toBe(142.50);
    expect(result.suggestedCategory.value).toBe('SOFTWARE_TECH');
    expect(result.suggestedScheduleCLine.value).toContain('Line 27a');
  });

  it('should parse written date formats like Oct 14, 2026', () => {
    const receiptText = `
      VERIZON WIRELESS
      Statement Date: Oct 14, 2026
      Monthly Business Unlimited Plan: $85.00
      Total: $85.00
    `;

    const result = parseReceiptText(receiptText);

    expect(result.status).toBe('unconfirmed');
    expect(result.vendor.value).toBe('Verizon');
    expect(result.date.value).toBe('2026-10-14');
    expect(result.totalAmount.value).toBe(85.00);
    expect(result.suggestedCategory.value).toBe('PHONE_INTERNET');
    expect(result.suggestedScheduleCLine.value).toContain('Line 25');
  });

  it('should categorize marketing and legal vendors correctly', () => {
    const metaReceipt = `
      META ADS BILLING
      Date: 2026-06-15
      Amount Paid: $250.00
    `;
    const metaRes = parseReceiptText(metaReceipt);
    expect(metaRes.suggestedCategory.value).toBe('MARKETING');
    expect(metaRes.suggestedScheduleCLine.value).toContain('Line 8');

    const legalReceipt = `
      LEGALZOOM LLC FORMATION
      Date: 2026-02-10
      Total: $349.00
    `;
    const legalRes = parseReceiptText(legalReceipt);
    expect(legalRes.suggestedCategory.value).toBe('LEGAL_ACCOUNTING');
    expect(legalRes.suggestedScheduleCLine.value).toContain('Line 17');
  });

  it('should handle degraded/empty text gracefully with low confidence and unconfirmed status', () => {
    const degradedText = '/// blurry receipt image scan unreadable ///';
    const result = parseReceiptText(degradedText);

    expect(result.status).toBe('unconfirmed');
    expect(result.vendor.confidence).not.toBe('high');
    expect(result.date.value).toBeNull();
    expect(result.date.confidence).toBe('low');
    expect(result.totalAmount.value).toBeNull();
    expect(result.totalAmount.confidence).toBe('low');
    expect(result.suggestedCategory.value).toBe('OTHER');
  });

  it('should process base64 payload via processReceiptScan', async () => {
    const sampleText = `
      GITHUB, INC.
      Date: 2026-07-01
      Total: $21.00
      Team Subscription
    `;
    const base64Data = Buffer.from(sampleText, 'utf-8').toString('base64');

    const result = await processReceiptScan({
      base64Data,
      fileName: 'github-receipt.txt',
    });

    expect(result.status).toBe('unconfirmed');
    expect(result.vendor.value).toBe('GitHub');
    expect(result.date.value).toBe('2026-07-01');
    expect(result.totalAmount.value).toBe(21.00);
    expect(result.suggestedCategory.value).toBe('SOFTWARE_TECH');
    expect(result.receiptFileName).toBe('github-receipt.txt');
  });

  it('should parse retail return/refund receipt with trailing minuses and known merchant matching', () => {
    const bjsReceipt = `
      BJ'S WHOLESALE CLUB #086
      1008 E. LANCASTER AVENUE, DOWNINGTOWN, PA
      09/26/26 02:51PM
      MEMBERSHIP ID: *******5600
      RETURNS
      1920083566 LYSOL TBC 9.99-T
      **** SUBTOTAL 9.99-
      PA 6% TAX 0.60-
      **** TOTAL 10.59-
      REFUND 00 APPROVED
      CHANGE 0.00
      TOTAL ITEMS= 0
      the BJ's app
    `;

    const result = parseReceiptText(bjsReceipt, { fileName: 'bjs_return.jpg' });

    expect(result.status).toBe('unconfirmed');
    expect(result.vendor.value).toBe("BJ's Wholesale Club");
    expect(result.vendor.confidence).toBe('high');
    expect(result.date.value).toBe('2026-09-26');
    expect(result.totalAmount.value).toBe(10.59);
    expect(result.subtotal?.value).toBe(9.99);
    expect(result.taxAmount?.value).toBe(0.60);
    expect(result.suggestedCategory.value).toBe('OFFICE_SUPPLIES');
    expect(result.suggestedScheduleCLine.value).toContain('Line 18');
    expect(result.notes).toContain('return/refund');
  });
});
