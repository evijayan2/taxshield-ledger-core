/**
 * Pure CSV parser supporting Gusto, QuickBooks Online, and generic payroll register exports.
 */
import type { ProviderType, ProviderPayrollRow } from '../../providerAuditTypes';

export function parseCurrency(val?: string | number): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val * 100) / 100;
  const str = String(val).trim();
  if (!str) return 0;
  const isParenNegative = /^\(.*\)$/.test(str);
  const clean = str.replace(/[$,\s()]/g, '');
  const num = parseFloat(clean);
  if (isNaN(num)) return 0;
  const signed = isParenNegative ? -Math.abs(num) : num;
  return Math.round(signed * 100) / 100;
}

export function detectProviderDialect(headers: string[]): ProviderType {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const hasGusto = norm.some((h) => h.includes('gusto') || h.includes('employeefica') || h.includes('grosspay'));
  if (hasGusto) return 'GUSTO';
  const hasQbo = norm.some((h) => h.includes('quickbooks') || h.includes('totalpay') || h.includes('federalwithholding'));
  if (hasQbo) return 'QUICKBOOKS';
  return 'GENERIC';
}

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
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsvRows(csvContent: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && !values[0])) continue;
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || '';
    });
    rows.push(rowObj);
  }
  return { headers, rows };
}

function findHeaderValue(row: Record<string, string>, keywords: string[]): string {
  const keys = Object.keys(row);
  for (const kw of keywords) {
    const match = keys.find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(kw.toLowerCase()));
    if (match && row[match]) return row[match];
  }
  return '';
}

function mapGustoRow(row: Record<string, string>): ProviderPayrollRow {
  const empName = findHeaderValue(row, ['employee', 'name']) || 'Unknown Employee';
  const checkDate = findHeaderValue(row, ['checkdate', 'paydate', 'date']) || new Date().toISOString().split('T')[0];
  const pStart = findHeaderValue(row, ['periodstart', 'startdate']) || checkDate;
  const pEnd = findHeaderValue(row, ['periodend', 'enddate']) || checkDate;
  return {
    employeeName: empName,
    ssnLast4: findHeaderValue(row, ['ssn', 'last4']),
    periodStart: pStart,
    periodEnd: pEnd,
    checkDate,
    grossWages: parseCurrency(findHeaderValue(row, ['grosspay', 'gross'])),
    fitWithheld: parseCurrency(findHeaderValue(row, ['federalincometax', 'fit', 'fedtax'])),
    ficaSsWithheld: parseCurrency(findHeaderValue(row, ['socialsecurity', 'sswithholding', 'fica'])),
    ficaMedWithheld: parseCurrency(findHeaderValue(row, ['medicare', 'medtax'])),
    stateWithheld: parseCurrency(findHeaderValue(row, ['statetax', 'statewithholding', 'pasit', 'sit'])),
    localWithheld: parseCurrency(findHeaderValue(row, ['localtax', 'eit', 'lst'])),
    netPay: parseCurrency(findHeaderValue(row, ['netpay', 'net'])),
    employerSuta: parseCurrency(findHeaderValue(row, ['suta', 'employersui', 'pauc'])),
    employerFuta: parseCurrency(findHeaderValue(row, ['futa'])),
    sCorpHealth: parseCurrency(findHeaderValue(row, ['scorpealth', '2pchealth', 'shareholderhealth'])),
    rawLine: row,
  };
}

function mapQboRow(row: Record<string, string>): ProviderPayrollRow {
  const empName = findHeaderValue(row, ['employee', 'worker']) || 'Unknown Employee';
  const checkDate = findHeaderValue(row, ['paydate', 'checkdate']) || new Date().toISOString().split('T')[0];
  const pStart = findHeaderValue(row, ['payperiodstart', 'periodstart']) || checkDate;
  const pEnd = findHeaderValue(row, ['payperiodend', 'periodend']) || checkDate;
  return {
    employeeName: empName,
    ssnLast4: findHeaderValue(row, ['ssn', 'ssntin']),
    periodStart: pStart,
    periodEnd: pEnd,
    checkDate,
    grossWages: parseCurrency(findHeaderValue(row, ['totalpay', 'grosspay', 'gross'])),
    fitWithheld: parseCurrency(findHeaderValue(row, ['federalwithholding', 'fedwithheld'])),
    ficaSsWithheld: parseCurrency(findHeaderValue(row, ['socialsecurityemployee', 'socsec'])),
    ficaMedWithheld: parseCurrency(findHeaderValue(row, ['medicareemployee', 'medicare'])),
    stateWithheld: parseCurrency(findHeaderValue(row, ['statewithholding', 'paic'])),
    localWithheld: parseCurrency(findHeaderValue(row, ['localwithholding', 'localtax'])),
    netPay: parseCurrency(findHeaderValue(row, ['netpay', 'netamount'])),
    employerSuta: parseCurrency(findHeaderValue(row, ['suiemployer', 'suta'])),
    employerFuta: parseCurrency(findHeaderValue(row, ['futaemployer'])),
    sCorpHealth: parseCurrency(findHeaderValue(row, ['scorphealth', 'healthins'])),
    rawLine: row,
  };
}

function mapGenericRow(row: Record<string, string>): ProviderPayrollRow {
  const empName = findHeaderValue(row, ['employee', 'name', 'payee']) || 'Unknown Employee';
  const checkDate = findHeaderValue(row, ['date', 'checkdate', 'paydate']) || new Date().toISOString().split('T')[0];
  return {
    employeeName: empName,
    ssnLast4: findHeaderValue(row, ['ssn']),
    periodStart: findHeaderValue(row, ['start', 'periodstart']) || checkDate,
    periodEnd: findHeaderValue(row, ['end', 'periodend']) || checkDate,
    checkDate,
    grossWages: parseCurrency(findHeaderValue(row, ['gross'])),
    fitWithheld: parseCurrency(findHeaderValue(row, ['fit', 'federal'])),
    ficaSsWithheld: parseCurrency(findHeaderValue(row, ['ss', 'socialsecurity'])),
    ficaMedWithheld: parseCurrency(findHeaderValue(row, ['med', 'medicare'])),
    stateWithheld: parseCurrency(findHeaderValue(row, ['state', 'sit'])),
    localWithheld: parseCurrency(findHeaderValue(row, ['local', 'eit'])),
    netPay: parseCurrency(findHeaderValue(row, ['net'])),
    employerSuta: parseCurrency(findHeaderValue(row, ['suta', 'sui'])),
    employerFuta: parseCurrency(findHeaderValue(row, ['futa'])),
    sCorpHealth: parseCurrency(findHeaderValue(row, ['health'])),
    rawLine: row,
  };
}

export function parseProviderPayrollCsv(csvContent: string): {
  provider: ProviderType;
  rows: ProviderPayrollRow[];
  warnings: string[];
} {
  const { headers, rows: rawRows } = parseCsvRows(csvContent);
  const warnings: string[] = [];
  if (headers.length === 0 || rawRows.length === 0) {
    return { provider: 'GENERIC', rows: [], warnings: ['CSV is empty or missing headers.'] };
  }
  const provider = detectProviderDialect(headers);
  const parsedRows: ProviderPayrollRow[] = rawRows.map((r) => {
    if (provider === 'GUSTO') return mapGustoRow(r);
    if (provider === 'QUICKBOOKS') return mapQboRow(r);
    return mapGenericRow(r);
  });
  if (parsedRows.some((r) => r.grossWages === 0)) {
    warnings.push('One or more rows have $0.00 gross wages. Please verify column mapping.');
  }
  return { provider, rows: parsedRows, warnings };
}
