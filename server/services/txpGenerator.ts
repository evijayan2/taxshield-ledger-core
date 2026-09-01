/**
 * Parameters required to build a NACHA TXP (Tax Payment) Addenda Record.
 */
export interface TXPParams {
  /** 9-digit Federal EIN or State Tax Identification Number (numeric only) */
  taxId: string;
  /** NACHA Tax Type Code (e.g., "01101" for Federal 941, "0100" for PA SIT) */
  taxTypeCode: string;
  /** End date of the tax period in YYYY-MM-DD or YYMMDD format */
  taxPeriodEnd: string;
  /** Amount to remit in dollars */
  amount: number;
  /** Tax period frequency / type qualifier (e.g., "T" for Tax, "M" for Monthly, "Q" for Quarterly) */
  taxQualifier?: string;
  /** Optional secondary check or reference number */
  checkNumber?: string;
}

/**
 * Normalizes a tax ID string to contain only digits.
 */
function cleanDigits(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Formats a date string into YYMMDD format for NACHA TXP compatibility.
 */
function formatYYMMDD(dateStr: string): string {
  const clean = dateStr.replace(/\D/g, '');
  if (clean.length === 6) {
    return clean;
  }
  if (clean.length === 8) {
    // YYYYMMDD -> YYMMDD
    return clean.slice(2);
  }
  // Fallback: parse as Date
  const d = new Date(dateStr);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Generates an 80-character standardized NACHA TXP (Tax Payment) Addenda string.
 *
 * TXP Syntax: TXP*{TaxID}*{TaxTypeCode}*{YYMMDD}*{AmountInCents}*{Qualifier}*~
 *
 * @param params Details of the tax remittance
 * @returns Standardized TXP addenda string
 */
export function generateTXPAddenda(params: TXPParams): string {
  const cleanId = cleanDigits(params.taxId);
  const periodEndYYMMDD = formatYYMMDD(params.taxPeriodEnd);
  const amountCents = Math.round(params.amount * 100);
  const qualifier = params.taxQualifier || 'T';
  const checkNum = params.checkNumber || '';
  let segment = `TXP*${cleanId}*${params.taxTypeCode}*${periodEndYYMMDD}*${amountCents}*${qualifier}*`;
  if (checkNum) {
    segment += `**${checkNum}*`;
  }
  segment += '~';
  return segment;
}

/**
 * Helper to build Federal Form 941 Withholding TXP addenda.
 */
export function buildFederal941TXP(ein: string, quarterEndDate: string, amount: number): string {
  return generateTXPAddenda({
    taxId: ein,
    taxTypeCode: '01101', // 941 Payroll Withholding
    taxPeriodEnd: quarterEndDate,
    amount,
    taxQualifier: 'M',
  });
}

/**
 * Helper to build PA State Income Tax (PA-W3 / SIT) Withholding TXP addenda.
 */
export function buildPaStateSitTXP(stateTaxId: string, periodEndDate: string, amount: number): string {
  return generateTXPAddenda({
    taxId: stateTaxId,
    taxTypeCode: '0100', // PA Employer Withholding
    taxPeriodEnd: periodEndDate,
    amount,
    taxQualifier: 'M',
  });
}
