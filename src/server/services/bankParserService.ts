import { sha256Hex } from '../../lib/isomorphicCrypto';
import { ParsedBankRow } from '../../commercialTypes';

export interface BankCsvParseResult {
  success: boolean;
  rows: ParsedBankRow[];
  totalRows: number;
  totalDebits: number;
  totalCredits: number;
  netAmount: number;
  warnings: string[];
  accountMask?: string;
}

/**
 * Normalizes date strings (MM/DD/YYYY, YYYY-MM-DD, M/D/YYYY, etc.) into ISO YYYY-MM-DD.
 */
export function normalizeDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();

  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // Match MM/DD/YYYY or M/D/YYYY
  const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0');
    const day = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Match MM-DD-YYYY or M-D-YYYY
  const dashMatch = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const month = dashMatch[1].padStart(2, '0');
    const day = dashMatch[2].padStart(2, '0');
    const year = dashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Cleans currency strings into numeric float.
 * Handles: "$1,250.00", "-$45.50", "(45.50)", "45.50-"
 */
export function parseCurrencyAmount(rawStr: string): { amount: number; isNegative: boolean } | null {
  if (!rawStr) return null;
  let str = rawStr.trim();

  // Check for trailing minus e.g. "45.50-"
  let isNegative = false;
  if (str.endsWith('-')) {
    isNegative = true;
    str = str.slice(0, -1).trim();
  } else if (str.startsWith('-')) {
    isNegative = true;
    str = str.slice(1).trim();
  } else if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.slice(1, -1).trim();
  }

  // Strip dollar signs, commas, extra spaces
  str = str.replace(/[$,\s]/g, '');
  const val = parseFloat(str);
  if (isNaN(val)) return null;

  return {
    amount: Math.abs(val),
    isNegative: isNegative || val < 0,
  };
}

/**
 * Extracts and cleans bank description text into human-readable payee / merchant string.
 * Strips noisy terminal IDs, store numbers, card prefixes, ACH references.
 */
export function cleanBankPayee(rawDesc: string): string {
  if (!rawDesc) return 'Unknown Payee';
  let clean = rawDesc.trim();

  // Remove common banking transaction prefix markers
  clean = clean.replace(/^(POS DEBIT|POS PURCHASE|ACH DEBIT|ACH WITHDRAWAL|DIRECT DEPOSIT|ELECTRONIC WITHDRAWAL|CHECKCARD|DEBIT CARD PURCHASE|CHECK #\s*\d+|DEPOSIT)\s*[-:]?\s*/i, '');
  
  // Remove reference tags like REF#12345, TRACE#1234, ID:1234
  clean = clean.replace(/\b(REF|TRACE|TRANS|SEQ|ID|CONF)\s*#?:?\s*[A-Z0-9-]+\b/gi, '');

  // Remove trailing location noise like "SAN FRANCISCO CA 94107 US" or "NEW YORK NY"
  clean = clean.replace(/\s+[A-Za-z\s]{2,15}\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)(?:\s+\d{5})?$/i, '');

  // Remove store numbers like "#0129" or "STORE 0291"
  clean = clean.replace(/(?:#\s*\d+|\b(?:STORE|LOC)\s*\d+)/gi, '');

  // Strip extra whitespace and non-alphanumeric punctuation from start/end
  clean = clean.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').replace(/\s{2,}/g, ' ').trim();

  return clean || rawDesc.trim();
}

/**
 * Computes deterministic SHA-256 fingerprint for idempotency & duplicate detection.
 */
export function generateTransactionFingerprint(
  companyId: string,
  postedDate: string,
  amount: number,
  transactionType: 'DEBIT' | 'CREDIT',
  cleanPayee: string
): string {
  const payload = `${companyId}:${postedDate}:${amount.toFixed(2)}:${transactionType}:${cleanPayee.toLowerCase().trim()}`;
  return sha256Hex(payload);
}

/**
 * Parses simple CSV row respecting quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === ',' || char === '\t' || char === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Universal Bank CSV Parser.
 * Automatically discovers header row, maps column indexes, and normalizes rows.
 */
export function parseBankCsv(
  csvContent: string,
  companyId: string
): BankCsvParseResult {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const warnings: string[] = [];
  if (lines.length === 0) {
    return {
      success: false,
      rows: [],
      totalRows: 0,
      totalDebits: 0,
      totalCredits: 0,
      netAmount: 0,
      warnings: ['CSV file is empty.'],
    };
  }

  // Scan for metadata (e.g. account mask)
  let accountMask: string | undefined;
  for (const line of lines.slice(0, 10)) {
    const maskMatch = line.match(/(?:Account|Acct|Card).*?(?:[*xX]{3,}|ending in\s*)(\d{4})/i);
    if (maskMatch) {
      accountMask = maskMatch[1];
      break;
    }
  }

  // Detect header row index
  let headerIndex = -1;
  let dateCol = -1;
  let descCol = -1;
  let amountCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let typeCol = -1;
  let idCol = -1;

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cols = parseCsvLine(lines[i]).map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));

    const dIdx = cols.findIndex((c) => c.includes('date') || c === 'posted');
    const descIdx = cols.findIndex((c) => c.includes('desc') || c.includes('payee') || c.includes('merchant') || c.includes('memo') || c === 'name');
    const amtIdx = cols.findIndex((c) => c === 'amount' || c.includes('netamount') || c === 'amt');
    const debIdx = cols.findIndex((c) => c.includes('debit') || c.includes('withdrawal') || c.includes('outflow') || c === 'payment');
    const credIdx = cols.findIndex((c) => c.includes('credit') || c.includes('deposit') || c.includes('inflow') || c === 'addition');
    const tIdx = cols.findIndex((c) => c === 'type' || c === 'transactiontype');
    const fitIdx = cols.findIndex((c) => c.includes('fitid') || c.includes('reference') || c.includes('transid') || c.includes('refnum'));

    if (dIdx !== -1 && (descIdx !== -1 || amtIdx !== -1 || debIdx !== -1)) {
      headerIndex = i;
      dateCol = dIdx;
      descCol = descIdx;
      amountCol = amtIdx;
      debitCol = debIdx;
      creditCol = credIdx;
      typeCol = tIdx;
      idCol = fitIdx;
      break;
    }
  }

  // Fallback if no header found: default 3-column [Date, Description, Amount]
  if (headerIndex === -1) {
    headerIndex = 0;
    dateCol = 0;
    descCol = 1;
    amountCol = 2;
    warnings.push('Standard headers not detected. Defaulted to column mapping: Date (1), Description (2), Amount (3).');
  }

  const parsedRows: ParsedBankRow[] = [];
  let totalDebits = 0;
  let totalCredits = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const cols = parseCsvLine(rawLine);
    if (cols.length < 2) continue;

    // Date
    const rawDate = cols[dateCol];
    const isoDate = normalizeDate(rawDate);
    if (!isoDate) {
      warnings.push(`Row ${i + 1}: Skipped invalid date "${rawDate}".`);
      continue;
    }

    // Description / Payee
    const rawDescription = descCol !== -1 && cols[descCol] ? cols[descCol] : 'Transaction';
    const cleanPayee = cleanBankPayee(rawDescription);

    // FITID / Reference ID
    const fitid = idCol !== -1 ? cols[idCol] : undefined;

    // Amount & Type resolution
    let finalAmount = 0;
    let transactionType: 'DEBIT' | 'CREDIT' = 'DEBIT';

    if (debitCol !== -1 && creditCol !== -1) {
      // Split debit / credit columns
      const debParsed = parseCurrencyAmount(cols[debitCol]);
      const credParsed = parseCurrencyAmount(cols[creditCol]);

      if (debParsed && debParsed.amount > 0) {
        finalAmount = debParsed.amount;
        transactionType = 'DEBIT';
      } else if (credParsed && credParsed.amount > 0) {
        finalAmount = credParsed.amount;
        transactionType = 'CREDIT';
      } else {
        warnings.push(`Row ${i + 1}: No valid debit or credit amount found.`);
        continue;
      }
    } else if (amountCol !== -1) {
      // Single amount column
      const amtParsed = parseCurrencyAmount(cols[amountCol]);
      if (!amtParsed || amtParsed.amount === 0) {
        warnings.push(`Row ${i + 1}: Invalid or zero amount "${cols[amountCol]}".`);
        continue;
      }

      finalAmount = amtParsed.amount;
      // Check type column if present
      if (typeCol !== -1 && cols[typeCol]) {
        const rawType = cols[typeCol].toUpperCase();
        if (rawType.includes('CREDIT') || rawType.includes('CR') || rawType.includes('DEP')) {
          transactionType = 'CREDIT';
        } else {
          transactionType = 'DEBIT';
        }
      } else {
        transactionType = amtParsed.isNegative ? 'DEBIT' : 'CREDIT';
      }
    } else {
      warnings.push(`Row ${i + 1}: Could not determine amount column.`);
      continue;
    }

    if (transactionType === 'DEBIT') {
      totalDebits += finalAmount;
    } else {
      totalCredits += finalAmount;
    }

    const fingerprint = generateTransactionFingerprint(
      companyId,
      isoDate,
      finalAmount,
      transactionType,
      cleanPayee
    );

    parsedRows.push({
      date: isoDate,
      rawDescription,
      cleanPayee,
      amount: Math.round(finalAmount * 100) / 100,
      transactionType,
      fitid,
      fingerprint,
    });
  }

  const netAmount = Math.round((totalCredits - totalDebits) * 100) / 100;

  return {
    success: parsedRows.length > 0,
    rows: parsedRows,
    totalRows: parsedRows.length,
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    netAmount,
    warnings,
    accountMask,
  };
}
