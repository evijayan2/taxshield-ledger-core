import Nacha from '@midlandsbank/node-nacha';
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
import { isValidAbaRouting } from '../../utils/validators';
import { resolveActiveBankAccount } from './bankHistoryService';
import {
  NachaValidationError,
  cleanDigits,
  formatField,
} from './nachaRecordBuilders';

export { NachaValidationError };

/**
 * Parses a YYYY-MM-DD date string into a local Date without UTC day-shift.
 */
function parseLocalDate(dateVal?: string | Date | null): Date {
  if (dateVal instanceof Date) return dateVal;
  if (typeof dateVal === 'string') {
    const match = dateVal.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    const parsed = new Date(dateVal);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * Formats a 9-digit EIN into a 10-character NACHA Company ID.
 */
function formatNachaCompanyId(ein?: string): string {
  const digits = cleanDigits(ein);
  if (digits.length === 9) return `1${digits}`;
  return formatField(digits, 10, 'right', '0');
}

/**
 * Validates company ODFI routing and all receiving entry fields before NACHA generation.
 */
function validateNachaInputs(company: NachaCompanyInfo, entries: NachaEntryInput[]): string {
  const odfi = cleanDigits(company.odfiRoutingNumber);
  if (!isValidAbaRouting(odfi)) {
    throw new NachaValidationError(`Invalid ODFI routing transit: ${company.odfiRoutingNumber}`);
  }
  if (!entries || entries.length === 0) {
    throw new NachaValidationError('At least one NACHA entry is required');
  }
  for (const entry of entries) {
    const rdfi = cleanDigits(entry.routingNumber);
    if (!isValidAbaRouting(rdfi)) {
      throw new NachaValidationError(`Invalid receiving routing transit: ${entry.routingNumber}`);
    }
    if (!cleanDigits(entry.accountNumber)) {
      throw new NachaValidationError(`Missing account number for ${entry.employeeName}`);
    }
    if (entry.amount <= 0) {
      throw new NachaValidationError(`Entry amount must be positive for ${entry.employeeName}`);
    }
  }
  return odfi;
}

/**
 * Builds a configured @midlandsbank/node-nacha PPD file instance.
 */
function buildNachaInstance(
  company: NachaCompanyInfo,
  entries: NachaEntryInput[],
  options: NachaBatchOptions,
  odfi: string
): Nacha {
  const odfi8 = odfi.slice(0, 8);
  const nacha = new Nacha({
    origin: {
      name: (company.originName || company.companyName || 'COMPANY').slice(0, 23),
      routing: odfi,
    },
    destination: {
      name: (company.destinationName || 'ORIGINATING DFI').slice(0, 23),
      routing: odfi,
    },
    fileIdModifier: (options.fileIdModifier || 'A').slice(0, 1).toUpperCase(),
    creationDate: parseLocalDate(options.fileCreationDate),
  });

  const batch = nacha.ppd({
    company: {
      name: (company.companyName || 'COMPANY').slice(0, 16),
      id: formatNachaCompanyId(company.ein),
    },
    entryDescription: (options.companyEntryDescription || 'PAYROLL').slice(0, 10),
    effectiveDate: parseLocalDate(options.effectiveEntryDate),
  });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const traceNumber = `${odfi8}${formatField(i + 1, 7, 'right', '0')}`;
    batch.addEntry({
      direction: 'credit',
      accountType: entry.accountType === 'SAVINGS' ? 'Savings' : 'Checking',
      amount: entry.amount,
      routingNumber: cleanDigits(entry.routingNumber),
      accountNumber: entry.accountNumber.trim(),
      name: entry.employeeName.slice(0, 22),
      idNumber: entry.employeeId.slice(0, 15),
      traceNumber,
    });
  }

  return batch.done();
}

/**
 * Generates an official 94-character fixed-width NACHA PPD direct deposit file
 * using @midlandsbank/node-nacha.
 */
export function generateNachaFile(
  company: NachaCompanyInfo,
  entries: NachaEntryInput[],
  options: NachaBatchOptions
): NachaGenerationResult {
  const odfi = validateNachaInputs(company, entries);
  const nacha = buildNachaInstance(company, entries, options, odfi);
  const lineTerminator = options.lineTerminator || '\r\n';
  const rawLines = nacha.toString().split(/\r?\n/).filter(line => line.length > 0);
  // @midlandsbank/node-nacha appends 10 fill lines when record count is an exact multiple of 10
  const lines = rawLines.slice(0, nacha.blockCount * 10);
  const fileContent = lines.join(lineTerminator) + lineTerminator;
  const entryHash = formatField(nacha.entryHash % 10000000000, 10, 'right', '0');

  return {
    fileContent,
    lines,
    lineCount: lines.length,
    entryCount: nacha.entryAndAddendaCount,
    totalCreditCents: Math.round(nacha.totalCredits),
    totalDebitCents: Math.round(nacha.totalDebits),
    entryHash,
    fileHashSha256: sha256Hex(fileContent),
    batchCount: nacha.batchCount,
    blockCount: nacha.blockCount,
  };
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
 * Parses and verifies summary metrics from a raw 94-character NACHA file string
 * using @midlandsbank/node-nacha.
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

  let parsed: ReturnType<typeof Nacha.parse>;
  try {
    parsed = Nacha.parse(lines.join('\n'));
  } catch (err: any) {
    throw new NachaValidationError(err?.message || 'Invalid NACHA file format');
  }

  return {
    isValid: true,
    lineCount: lines.length,
    blockCount: parsed.footer.blockCount,
    entryCount: parsed.footer.entryAndAddendaCount,
    entryHash: formatField(parsed.footer.entryHash % 10000000000, 10, 'right', '0'),
    totalCreditCents: Math.round(parsed.footer.totalCredits),
    totalDebitCents: Math.round(parsed.footer.totalDebits),
  };
}
