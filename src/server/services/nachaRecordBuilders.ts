import { NachaCompanyInfo, NachaEntryInput, NachaBatchOptions } from '../../types';
import { isValidAbaRouting } from '../../utils/validators';

/**
 * Custom error thrown when NACHA validation fails.
 */
export class NachaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NachaValidationError';
  }
}

/**
 * Strips all non-digit characters from a string.
 */
export function cleanDigits(input?: string | null): string {
  if (!input) return '';
  return input.replace(/\D/g, '');
}

/**
 * Formats a field to exact length, alignment, and padding character in uppercase ASCII.
 */
export function formatField(
  value: string | number | undefined | null,
  length: number,
  align: 'left' | 'right',
  padChar: string = ' '
): string {
  const strVal = (value !== undefined && value !== null ? String(value) : '')
    .toUpperCase()
    .replace(/[^\x20-\x7E]/g, ''); // ASCII printable only

  if (strVal.length > length) {
    return align === 'right' ? strVal.slice(-length) : strVal.slice(0, length);
  }

  return align === 'right'
    ? strVal.padStart(length, padChar)
    : strVal.padEnd(length, padChar);
}

/**
 * Formats a date string or Date object into 6-digit YYMMDD format.
 */
export function formatDateYYMMDD(dateVal?: string | Date | null): string {
  if (!dateVal) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }

  if (typeof dateVal === 'string') {
    const digits = dateVal.replace(/\D/g, '');
    if (digits.length === 6) return digits;
    if (digits.length === 8) return digits.slice(2); // YYYYMMDD -> YYMMDD
  }

  const d = new Date(dateVal);
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Formats time into 4-digit HHMM format.
 */
export function formatTimeHHMM(timeVal?: string | null): string {
  if (timeVal) {
    const digits = timeVal.replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(0, 4);
  }
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}${mm}`;
}

/**
 * Constructs a 94-character NACHA File Header Record (Record Type 1).
 */
export function buildFileHeaderRecord(
  company: NachaCompanyInfo,
  options: NachaBatchOptions
): string {
  const odfi = cleanDigits(company.odfiRoutingNumber);
  if (!isValidAbaRouting(odfi)) {
    throw new NachaValidationError(`Invalid ODFI routing transit number: ${company.odfiRoutingNumber}`);
  }

  const dest = ' ' + formatField(odfi, 9, 'left');
  const prefix = company.companyIdPrefix || '1';
  const orig = formatField(prefix + cleanDigits(company.ein), 10, 'left');
  const dateStr = formatDateYYMMDD(options.fileCreationDate);
  const timeStr = formatTimeHHMM(options.fileCreationTime);
  const mod = formatField(options.fileIdModifier || 'A', 1, 'left');
  const destName = formatField(company.destinationName || company.companyName, 23, 'left');
  const origName = formatField(company.originName || company.companyName, 23, 'left');
  const refCode = formatField('', 8, 'left');

  return `101${dest}${orig}${dateStr}${timeStr}${mod}094101${destName}${origName}${refCode}`;
}

/**
 * Constructs a 94-character NACHA Company / Batch Header Record (Record Type 5).
 */
export function buildBatchHeaderRecord(
  company: NachaCompanyInfo,
  options: NachaBatchOptions,
  batchNumber: number = 1
): string {
  const scc = options.serviceClassCode || '220'; // 220 = Credits Only
  const compName = formatField(company.companyName, 16, 'left');
  const discData = formatField(company.discretionaryData || '', 20, 'left');
  const prefix = company.companyIdPrefix || '1';
  const compId = formatField(prefix + cleanDigits(company.ein), 10, 'left');
  const sec = formatField(options.standardEntryClass || 'PPD', 3, 'left');
  const desc = formatField(options.companyEntryDescription || 'PAYROLL', 10, 'left');
  const descDate = formatField(options.companyDescriptiveDate ? formatDateYYMMDD(options.companyDescriptiveDate) : '', 6, 'left');
  const effDate = formatDateYYMMDD(options.effectiveEntryDate);
  const odfi8 = cleanDigits(company.odfiRoutingNumber).slice(0, 8);
  const batchNum = formatField(batchNumber, 7, 'right', '0');

  return `5${scc}${compName}${discData}${compId}${sec}${desc}${descDate}${effDate}   1${odfi8}${batchNum}`;
}

/**
 * Constructs a 94-character NACHA Entry Detail Record (Record Type 6).
 */
export function buildEntryDetailRecord(
  entry: NachaEntryInput,
  odfiRouting: string,
  seq: number
): { line: string; hashAddend: number; creditCents: number; debitCents: number } {
  const rDfi = cleanDigits(entry.routingNumber);
  if (!isValidAbaRouting(rDfi)) {
    throw new NachaValidationError(`Invalid receiving routing transit: ${entry.routingNumber}`);
  }
  if (entry.amount < 0) {
    throw new NachaValidationError(`Negative payment amount not permitted: ${entry.amount}`);
  }

  const isSavings = entry.accountType === 'SAVINGS';
  const isPrenote = entry.paymentType === 'PRENOTE' || entry.amount === 0;
  const txCode = isSavings ? (isPrenote ? '33' : '32') : (isPrenote ? '23' : '22');
  const rDfi8 = rDfi.slice(0, 8);
  const checkDigit = rDfi.slice(8, 9);
  const acct = formatField(cleanDigits(entry.accountNumber), 17, 'left');
  const cents = Math.round(entry.amount * 100);
  const amtStr = formatField(cents, 10, 'right', '0');
  const empId = formatField(entry.employeeId, 15, 'left');
  const empName = formatField(entry.employeeName, 22, 'left');
  const disc = formatField(entry.discretionaryData || '', 2, 'left');
  const odfi8 = cleanDigits(odfiRouting).slice(0, 8);
  const trace = `${odfi8}${formatField(seq, 7, 'right', '0')}`;

  const line = `6${txCode}${rDfi8}${checkDigit}${acct}${amtStr}${empId}${empName}${disc}0${trace}`;
  return {
    line,
    hashAddend: parseInt(rDfi8, 10),
    creditCents: cents,
    debitCents: 0,
  };
}

/**
 * Constructs a 94-character NACHA Batch Control Record (Record Type 8).
 */
export function buildBatchControlRecord(
  company: NachaCompanyInfo,
  entryCount: number,
  entryHash: string,
  totalCredits: number,
  totalDebits: number,
  odfiRouting: string,
  batchNumber: number = 1,
  serviceClass: string = '220'
): string {
  const cnt = formatField(entryCount, 6, 'right', '0');
  const hash = formatField(entryHash, 10, 'right', '0');
  const debits = formatField(totalDebits, 12, 'right', '0');
  const credits = formatField(totalCredits, 12, 'right', '0');
  const prefix = company.companyIdPrefix || '1';
  const compId = formatField(prefix + cleanDigits(company.ein), 10, 'left');
  const mac = formatField('', 19, 'left');
  const reserved = formatField('', 6, 'left');
  const odfi8 = cleanDigits(odfiRouting).slice(0, 8);
  const batchNum = formatField(batchNumber, 7, 'right', '0');

  return `8${serviceClass}${cnt}${hash}${debits}${credits}${compId}${mac}${reserved}${odfi8}${batchNum}`;
}

/**
 * Constructs a 94-character NACHA File Control Record (Record Type 9).
 */
export function buildFileControlRecord(
  batchCount: number,
  blockCount: number,
  entryCount: number,
  entryHash: string,
  totalCredits: number,
  totalDebits: number
): string {
  const bCnt = formatField(batchCount, 6, 'right', '0');
  const blkCnt = formatField(blockCount, 6, 'right', '0');
  const eCnt = formatField(entryCount, 8, 'right', '0');
  const hash = formatField(entryHash, 10, 'right', '0');
  const debits = formatField(totalDebits, 12, 'right', '0');
  const credits = formatField(totalCredits, 12, 'right', '0');
  const reserved = formatField('', 39, 'left');

  return `9${bCnt}${blkCnt}${eCnt}${hash}${debits}${credits}${reserved}`;
}
