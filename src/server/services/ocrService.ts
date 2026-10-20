import { ExtractedReceiptResult, GeneralExpenseCategory, ReceiptOcrField } from '../../types';
import { logInfo, logWarn } from '../../lib/logger';
import { KNOWN_MERCHANT_RULES, SCHEDULE_C_LINE_MAP, CATEGORY_KEYWORDS } from './ocrRules';

/**
 * Parses numeric currency strings with 2 decimal digits precision.
 */
function parseAmount(valStr: string): number | null {
  const trimmed = valStr.trim();
  const isNegative = trimmed.startsWith('-') || trimmed.endsWith('-') || /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  const rounded = Math.round(num * 100) / 100;
  return isNegative ? -rounded : rounded;
}

/**
 * Extracts a normalized YYYY-MM-DD date from receipt lines.
 */
function extractDate(lines: string[]): ReceiptOcrField<string> {
  const isoPattern = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/;
  const usPattern = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/;
  const monthMap: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const writtenPattern = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i;

  for (const line of lines) {
    const writtenMatch = line.match(writtenPattern);
    if (writtenMatch) {
      const month = monthMap[writtenMatch[1].toLowerCase().slice(0, 3)];
      const day = writtenMatch[2].padStart(2, '0');
      return { value: `${writtenMatch[3]}-${month}-${day}`, rawText: line.trim(), confidence: 'high' };
    }
    const isoMatch = line.match(isoPattern);
    if (isoMatch) {
      return { value: `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`, rawText: line.trim(), confidence: 'high' };
    }
    const usMatch = line.match(usPattern);
    if (usMatch) {
      const year = usMatch[3].length === 2 ? `20${usMatch[3]}` : usMatch[3];
      return { value: `${year}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`, rawText: line.trim(), confidence: 'high' };
    }
  }
  return { value: null, confidence: 'low' };
}

/**
 * Locates key financial figures (subtotal, tax, total) from lines.
 */
function extractAmounts(lines: string[]): { total: ReceiptOcrField<number>; subtotal?: ReceiptOcrField<number>; tax?: ReceiptOcrField<number> } {
  let totalVal: number | null = null;
  let subtotalVal: number | null = null;
  let taxVal: number | null = null;
  const numRegex = /[-$]?\s*(\d+[.,]\d{2,3})(-)?/;
  const candidateAmounts: number[] = [];

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    // Ignore lines that represent item counts, change, or barcode figures
    if (/change\s+0\.00|total\s*items|total\s*qty|total\s*quantity/i.test(line)) {
      continue;
    }
    const match = line.match(numRegex);
    if (!match) continue;

    const cleaned = match[1].replace(/[^0-9.]/g, '');
    let num = parseFloat(cleaned);
    if (isNaN(num)) continue;
    num = Math.round(num * 100) / 100;

    candidateAmounts.push(num);

    if (!totalVal && /total|balance due|amount paid|amount due|visa|mastercard|amex|credit|debit|rf\b|refund/i.test(line) && !/subtotal|sub-total|tax/i.test(line)) {
      totalVal = num;
    } else if (!subtotalVal && /subtotal|sub-total|sub total/i.test(line)) {
      subtotalVal = num;
    } else if (!taxVal && /tax|sales tax|vat/i.test(line)) {
      taxVal = num;
    }
  }

  // Cross-reconciliation: If subtotal and tax are present, verify if their sum matches an amount on the receipt
  if (subtotalVal !== null && taxVal !== null) {
    const expected = Math.round((subtotalVal + taxVal) * 100) / 100;
    if (candidateAmounts.includes(expected)) {
      totalVal = expected;
    } else if (totalVal === null) {
      totalVal = expected;
    }
  }

  // Fallback: If totalVal was not identified by keyword, but amounts exist, pick the highest amount
  if (totalVal === null && candidateAmounts.length > 0) {
    totalVal = Math.max(...candidateAmounts);
  }

  return {
    total: { value: totalVal, confidence: totalVal !== null ? 'high' : 'low' },
    subtotal: subtotalVal !== null ? { value: subtotalVal, confidence: 'high' } : undefined,
    tax: taxVal !== null ? { value: taxVal, confidence: 'high' } : undefined,
  };
}

/**
 * Extracts merchant/vendor from receipt text and header.
 */
function extractVendor(lines: string[]): { vendor: ReceiptOcrField<string>; matchedRuleCategory?: GeneralExpenseCategory } {
  // First, check full receipt text for known merchant aliases with word-boundary matching
  const fullTextUpper = lines.join('\n').toUpperCase();
  for (const rule of KNOWN_MERCHANT_RULES) {
    for (const alias of rule.aliases) {
      const escaped = alias.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const pattern = new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, 'i');
      if (pattern.test(fullTextUpper)) {
        return {
          vendor: { value: rule.name, rawText: alias, confidence: 'high' },
          matchedRuleCategory: rule.category,
        };
      }
    }
  }

  // Second, examine top 10 header lines, filtering out noise, symbols, and receipt boilerplate terms
  const headerLines = lines.slice(0, 10);
  const boilerplateRegex = /invoice|receipt|order|return|refund|cashier|customer|member|terminal|transaction|subtotal|total|balance due|change|items|visa|mastercard|amex|entry:?|approved|auth\b|welcome|store\s*#|reg:\s*\d+/i;

  for (const line of headerLines) {
    const cleaned = line.trim().replace(/^[^a-zA-Z0-9]+/, '');
    const letterCount = cleaned.replace(/[^a-zA-Z]/g, '').length;
    const hasVowel = /[aeiouy]/i.test(cleaned);
    const nonSymbolLength = cleaned.replace(/[^a-zA-Z0-9\s]/g, '').length;
    const ratio = nonSymbolLength / Math.max(1, cleaned.length);

    if (
      letterCount >= 3 &&
      hasVowel &&
      ratio > 0.6 &&
      !boilerplateRegex.test(cleaned) &&
      !/^\d+$/.test(cleaned) &&
      !/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cleaned)
    ) {
      return { vendor: { value: cleaned, rawText: cleaned, confidence: 'medium' } };
    }
  }

  return { vendor: { value: null, confidence: 'low' } };
}

/**
 * Recommends Schedule C category and line based on vendor and keywords.
 */
function suggestCategory(vendorName: string | null, fullText: string, ruleCategory?: GeneralExpenseCategory): {
  category: ReceiptOcrField<GeneralExpenseCategory>;
  scheduleCLine: ReceiptOcrField<string>;
} {
  if (ruleCategory) {
    const lineInfo = SCHEDULE_C_LINE_MAP[ruleCategory];
    return {
      category: { value: ruleCategory, confidence: 'high' },
      scheduleCLine: { value: `${lineInfo.line} (${lineInfo.description})`, confidence: 'high' },
    };
  }
  const lowerText = `${vendorName ?? ''} ${fullText}`.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [GeneralExpenseCategory, string[]][]) {
    if (keywords.some((kw) => lowerText.includes(kw))) {
      const lineInfo = SCHEDULE_C_LINE_MAP[cat];
      return {
        category: { value: cat, confidence: 'medium' },
        scheduleCLine: { value: `${lineInfo.line} (${lineInfo.description})`, confidence: 'medium' },
      };
    }
  }
  return {
    category: { value: 'OTHER', confidence: 'low' },
    scheduleCLine: { value: 'Line 27a (Other expenses)', confidence: 'low' },
  };
}

/**
 * Parses raw receipt OCR text into structured expense fields.
 * Always returns with status: 'unconfirmed' per AGENTS.md safety rules.
 *
 * @param rawText - Plain text extracted by OCR engine
 * @param options - Optional file metadata (name, url)
 * @returns ExtractedReceiptResult with detected fields and confidence ratings
 */
export function parseReceiptText(
  rawText: string,
  options?: { fileName?: string; fileUrl?: string }
): ExtractedReceiptResult {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dateField = extractDate(lines);
  const amounts = extractAmounts(lines);
  const { vendor, matchedRuleCategory } = extractVendor(lines);
  const { category, scheduleCLine } = suggestCategory(vendor.value, rawText, matchedRuleCategory);
  const isRefund = /return|refund/i.test(rawText);
  const notes = isRefund ? 'Detected receipt return/refund' : undefined;

  return {
    scanId: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: 'unconfirmed',
    vendor,
    date: dateField,
    totalAmount: amounts.total,
    subtotal: amounts.subtotal,
    taxAmount: amounts.tax,
    suggestedCategory: category,
    suggestedScheduleCLine: scheduleCLine,
    receiptFileName: options?.fileName,
    receiptFileUrl: options?.fileUrl,
    rawExtractedText: rawText,
    notes,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Asynchronously processes receipt scan payloads from client uploads.
 * Supports raw text, base64 data, and image URLs via Tesseract OCR engine.
 *
 * @param payload - Scan payload containing rawText or base64 data
 * @returns Promise resolving to ExtractedReceiptResult
 */
export async function processReceiptScan(payload: {
  rawText?: string;
  base64Data?: string;
  fileName?: string;
  fileUrl?: string;
}): Promise<ExtractedReceiptResult> {
  let text = payload.rawText || '';

  // If rawText is not provided, but an image fileUrl or base64 data is present, run OCR
  if (!text) {
    const isImage = (payload.fileUrl && payload.fileUrl.startsWith('data:image/')) ||
      (payload.fileName && /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(payload.fileName));

    if (isImage) {
      try {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        const imgSource = payload.fileUrl || (payload.base64Data ? Buffer.from(payload.base64Data, 'base64') : null);
        if (imgSource) {
          const ret = await worker.recognize(imgSource);
          text = ret.data.text;
        }
        await worker.terminate();
      } catch (ocrErr) {
        logWarn('OCR image extraction error, falling back to text decode', { error: ocrErr });
      }
    } else if (payload.base64Data) {
      try {
        const buffer = Buffer.from(payload.base64Data, 'base64');
        text = buffer.toString('utf-8');
      } catch (err) {
        logWarn('Failed to decode base64 receipt text', { error: err });
      }
    }
  }

  logInfo('Processing receipt OCR scan', { fileName: payload.fileName, textLength: text.length });
  return parseReceiptText(text, { fileName: payload.fileName, fileUrl: payload.fileUrl });
}
