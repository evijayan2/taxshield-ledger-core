import {
  NachaCompanyInfo,
  NachaEntryInput,
  NachaBatchOptions,
  NachaGenerationResult,
  Company,
  PayStub,
  Employee,
} from '../../types';
import { sha256Hex } from '../../lib/isomorphicCrypto';
import { resolveActiveBankAccount } from './bankHistoryService';
import {
  NachaValidationError,
  cleanDigits,
  formatField,
  buildFileHeaderRecord,
  buildBatchHeaderRecord,
  buildEntryDetailRecord,
  buildBatchControlRecord,
  buildFileControlRecord,
} from './nachaRecordBuilders';

export { NachaValidationError };

/**
 * Calculates the 10-digit entry hash (modulo 10^10) from the cumulative addends.
 */
function compute10DigitHash(cumulativeSum: number): string {
  const mod10Billion = cumulativeSum % 10000000000;
  return formatField(mod10Billion, 10, 'right', '0');
}

/**
 * Iterates through entry inputs and constructs 94-character Type 6 records with accumulators.
 */
function assembleEntryRecords(
  entries: NachaEntryInput[],
  odfi: string
): { entryLines: string[]; hashSum: number; totalCredits: number; totalDebits: number } {
  const entryLines: string[] = [];
  let hashSum = 0;
  let totalCredits = 0;
  let totalDebits = 0;

  for (let i = 0; i < entries.length; i++) {
    const seq = i + 1;
    const { line, hashAddend, creditCents, debitCents } = buildEntryDetailRecord(entries[i], odfi, seq);
    entryLines.push(line);
    hashSum += hashAddend;
    totalCredits += creditCents;
    totalDebits += debitCents;
  }

  return { entryLines, hashSum, totalCredits, totalDebits };
}

/**
 * Computes lines of fill padding and block count required for Blocking Factor 10.
 */
function computeBlockingFactor(recordsWithFileControl: number): { padLines: number; blockCount: number } {
  const rem = recordsWithFileControl % 10;
  const padLines = rem === 0 ? 0 : 10 - rem;
  const blockCount = (recordsWithFileControl + padLines) / 10;
  return { padLines, blockCount };
}

/**
 * Assembles and hashes the final file string and generation result structure.
 */
function buildNachaResult(
  lines: string[],
  entryCount: number,
  totalCredits: number,
  totalDebits: number,
  entryHash: string,
  blockCount: number,
  lineTerminator: string
): NachaGenerationResult {
  const fileContent = lines.join(lineTerminator) + lineTerminator;
  return {
    fileContent,
    lines,
    lineCount: lines.length,
    entryCount,
    totalCreditCents: totalCredits,
    totalDebitCents: totalDebits,
    entryHash,
    fileHashSha256: sha256Hex(fileContent),
    batchCount: 1,
    blockCount,
  };
}

/**
 * Generates an official 94-character fixed-width NACHA PPD direct deposit file.
 */
export function generateNachaFile(
  company: NachaCompanyInfo,
  entries: NachaEntryInput[],
  options: NachaBatchOptions
): NachaGenerationResult {
  const odfi = cleanDigits(company.odfiRoutingNumber);
  const lineTerminator = options.lineTerminator || '\r\n';
  const batchNum = options.batchNumber || 1;
  const serviceClass = options.serviceClassCode || '220';

  const lines: string[] = [
    buildFileHeaderRecord(company, options),
    buildBatchHeaderRecord(company, options, batchNum),
  ];

  const { entryLines, hashSum, totalCredits, totalDebits } = assembleEntryRecords(entries, odfi);
  lines.push(...entryLines);

  const entryHash = compute10DigitHash(hashSum);
  lines.push(buildBatchControlRecord(company, entries.length, entryHash, totalCredits, totalDebits, odfi, batchNum, serviceClass));

  const { padLines, blockCount } = computeBlockingFactor(lines.length + 1);
  lines.push(buildFileControlRecord(1, blockCount, entries.length, entryHash, totalCredits, totalDebits));

  const fillRecord = '9'.repeat(94);
  for (let p = 0; p < padLines; p++) lines.push(fillRecord);

  return buildNachaResult(lines, entries.length, totalCredits, totalDebits, entryHash, blockCount, lineTerminator);
}

/**
 * Result structure when generating NACHA direct deposit for a payroll run.
 */
export interface PayrollNachaBatchResult extends NachaGenerationResult {
  updatedPayStubs: { payStubId: string; achTraceRef: string }[];
}

/**
 * Maps paystubs and employee roster to NACHA entry inputs and trace references.
 */
function buildNachaEntriesFromPayStubs(
  achPayStubs: PayStub[],
  empMap: Map<string, Employee>,
  odfi8: string,
  effectiveDate: string
): { entries: NachaEntryInput[]; updatedPayStubs: { payStubId: string; achTraceRef: string }[] } {
  const entries: NachaEntryInput[] = [];
  const updatedPayStubs: { payStubId: string; achTraceRef: string }[] = [];

  for (let i = 0; i < achPayStubs.length; i++) {
    const ps = achPayStubs[i];
    const emp = empMap.get(ps.employeeId);
    if (!emp) throw new NachaValidationError(`Employee ${ps.employeeId} not found in roster`);

    const bank = resolveActiveBankAccount(emp, emp.bankHistory, effectiveDate);
    if (!bank.routingNumber || !bank.accountNumber) {
      throw new NachaValidationError(`Employee ${emp.firstName} ${emp.lastName} missing direct deposit bank details`);
    }

    const seq = i + 1;
    const traceRef = `${odfi8}${formatField(seq, 7, 'right', '0')}`;
    entries.push({
      employeeId: emp.id,
      employeeName: `${emp.lastName} ${emp.firstName}`.trim(),
      routingNumber: bank.routingNumber,
      accountNumber: bank.accountNumber,
      accountType: bank.accountType,
      amount: ps.netPay,
    });
    updatedPayStubs.push({ payStubId: ps.id, achTraceRef: traceRef });
  }

  return { entries, updatedPayStubs };
}

/**
 * Validates company routing info and filters qualifying ACH paystubs.
 */
function getValidAchPayStubs(company: Company, payStubs: PayStub[]): PayStub[] {
  if (!company.routingNumber) throw new NachaValidationError('Company routing number is required');
  const achPayStubs = payStubs.filter(ps => ps.disbursementMethod === 'ACH' && ps.netPay > 0);
  if (achPayStubs.length === 0) throw new NachaValidationError('No qualifying ACH paystubs found in payroll run');
  return achPayStubs;
}

/**
 * Generates NACHA PPD direct deposit file from a PayrollRun and PayStubs.
 */
export function generatePayrollNachaBatch(
  company: Company,
  payStubs: PayStub[],
  employees: Employee[],
  options: {
    effectiveEntryDate: string;
    fileIdModifier?: string;
    companyEntryDescription?: string;
    batchNumber?: number;
  }
): PayrollNachaBatchResult {
  const achPayStubs = getValidAchPayStubs(company, payStubs);
  const empMap = new Map<string, Employee>();
  employees.forEach(e => empMap.set(e.id, e));
  const odfi8 = cleanDigits(company.routingNumber).slice(0, 8);

  const { entries, updatedPayStubs } = buildNachaEntriesFromPayStubs(
    achPayStubs,
    empMap,
    odfi8,
    options.effectiveEntryDate
  );

  const nachaResult = generateNachaFile(
    {
      companyName: company.name,
      ein: company.ein,
      odfiRoutingNumber: company.routingNumber || '',
      originName: company.name,
      destinationName: company.bankName || 'ORIGINATING DFI',
    },
    entries,
    {
      effectiveEntryDate: options.effectiveEntryDate,
      fileIdModifier: options.fileIdModifier || 'A',
      companyEntryDescription: options.companyEntryDescription || 'PAYROLL',
      batchNumber: options.batchNumber || 1,
    }
  );

  return { ...nachaResult, updatedPayStubs };
}

/**
 * Validates that all lines in raw NACHA text are strictly 94 characters.
 */
function validateNachaLineLengths(lines: string[]): void {
  if (lines.length === 0 || lines.length % 10 !== 0) {
    throw new NachaValidationError(`File line count ${lines.length} must be non-zero multiple of 10`);
  }
  for (let idx = 0; idx < lines.length; idx++) {
    if (lines[idx].length !== 94) {
      throw new NachaValidationError(`Line ${idx + 1} has invalid length ${lines[idx].length}; must be 94 chars`);
    }
  }
}

/**
 * Parses and verifies summary metrics from a raw 94-character NACHA file string.
 */
export function parseNachaFileSummary(fileContent: string): {
  isValid: boolean;
  lineCount: number;
  blockCount: number;
  entryCount: number;
  entryHash: string;
  totalCreditCents: number;
  totalDebitCents: number;
} {
  const lines = fileContent.split(/\r?\n/).filter(line => line.length > 0);
  validateNachaLineLengths(lines);

  const fileControl = lines.find(l => l.startsWith('9') && l !== '9'.repeat(94));
  if (!fileControl) throw new NachaValidationError('File Control Record (Record Type 9) not found');

  return {
    isValid: true,
    lineCount: lines.length,
    blockCount: parseInt(fileControl.slice(7, 13), 10),
    entryCount: parseInt(fileControl.slice(13, 21), 10),
    entryHash: fileControl.slice(21, 31),
    totalDebitCents: parseInt(fileControl.slice(31, 43), 10),
    totalCreditCents: parseInt(fileControl.slice(43, 55), 10),
  };
}
