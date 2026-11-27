import { sha256Hex } from '../../lib/isomorphicCrypto';
import type { Company, Employee, PayStub, PayrollRun } from '../../types';

export type UploadPortalKey =
  | 'PA_KEYSTONE_EIT'
  | 'PA_KEYSTONE_LST'
  | 'PA_MYPATH_WITHHOLDING'
  | 'PA_UC_QUARTERLY'
  | 'CUSTOM';

export type UploadFileFormat = 'CSV' | 'MMREF_1' | 'TXT';

export interface UploadPortalOption {
  portalKey: UploadPortalKey;
  portalLabel: string;
  jurisdiction: string;
  supportedFormats: UploadFileFormat[];
  defaultFormat: UploadFileFormat;
  portalUrl?: string;
  specUrl?: string;
  description: string;
}

export interface TaxFilingUploadTemplateRecord {
  id?: string;
  companyId: string;
  portalKey: UploadPortalKey | string;
  portalLabel: string;
  jurisdiction: string;
  fileFormat: UploadFileFormat | string;
  isEnabled: boolean;
  templateFileName: string;
  templateContent: string;
  templateHashSha256: string;
  detectedHeaders?: string[];
  businessLocationPsd?: string | null;
  notes?: string | null;
  updatedAt?: string;
}

export interface ParsedTemplateResult {
  fileFormat: UploadFileFormat;
  templateHashSha256: string;
  detectedHeaders: string[];
  warnings: string[];
}

export interface GenerateUploadExportInput {
  template: TaxFilingUploadTemplateRecord;
  company: Pick<Company, 'id' | 'name' | 'ein' | 'stateTaxId' | 'address' | 'city' | 'state' | 'zip'>;
  payrollRun: Pick<PayrollRun, 'id' | 'periodStart' | 'periodEnd' | 'payDate'>;
  payStubs: PayStub[];
  employees: Employee[];
}

export interface GeneratedUploadExport {
  fileName: string;
  mimeType: string;
  content: string;
  rowCount: number;
  warnings: string[];
}

export const SUPPORTED_UPLOAD_PORTALS: UploadPortalOption[] = [
  {
    portalKey: 'PA_KEYSTONE_EIT',
    portalLabel: 'PA Local EIT — Keystone Collections Group',
    jurisdiction: 'PA-LOCAL',
    supportedFormats: ['CSV', 'MMREF_1'],
    defaultFormat: 'CSV',
    portalUrl: 'https://business.KeystoneCollects.com/',
    specUrl: 'https://keystonecollects.com/businesses/electronic-file-specifications/',
    description: 'Act 32 Earned Income Tax quarterly upload (CSV or PA Standard MMREF-1).',
  },
  {
    portalKey: 'PA_KEYSTONE_LST',
    portalLabel: 'PA Local LST — Keystone Collections Group',
    jurisdiction: 'PA-LOCAL',
    supportedFormats: ['CSV', 'MMREF_1'],
    defaultFormat: 'CSV',
    portalUrl: 'https://business.KeystoneCollects.com/',
    specUrl: 'https://keystonecollects.com/businesses/electronic-file-specifications/',
    description: 'Local Services Tax quarterly upload (CSV or PA Standard MMREF-1).',
  },
  {
    portalKey: 'PA_MYPATH_WITHHOLDING',
    portalLabel: 'PA Employer Withholding (W-3 / REV-1667) — myPATH',
    jurisdiction: 'PA',
    supportedFormats: ['CSV', 'TXT'],
    defaultFormat: 'CSV',
    portalUrl: 'https://mypath.pa.gov/',
    specUrl: 'https://mypath.pa.gov/',
    description: 'PA state employer withholding upload template for myPATH.',
  },
  {
    portalKey: 'PA_UC_QUARTERLY',
    portalLabel: 'PA UC Quarterly Wage Report (UC-2A) — UCTS',
    jurisdiction: 'PA',
    supportedFormats: ['CSV', 'TXT'],
    defaultFormat: 'CSV',
    portalUrl: 'https://www.uctax.pa.gov/',
    specUrl: 'https://www.uctax.pa.gov/',
    description: 'Pennsylvania Unemployment Compensation quarterly wage upload.',
  },
  {
    portalKey: 'CUSTOM',
    portalLabel: 'Custom Tax Portal Upload',
    jurisdiction: 'CUSTOM',
    supportedFormats: ['CSV', 'TXT', 'MMREF_1'],
    defaultFormat: 'CSV',
    description: 'Custom municipal, state, or third-party electronic upload template.',
  },
];

function stripKeystoneUnsafeChars(value: string | undefined | null): string {
  return String(value ?? '').replace(/[",]/g, ' ').replace(/\s+/g, ' ').trim();
}

function digitsOnly(value: string | undefined | null): string {
  return String(value ?? '').replace(/\D/g, '');
}

function getYearAndQuarter(dateStr: string): { taxYear: string; quarter: string } {
  const parsed = new Date(dateStr);
  const year = Number.isNaN(parsed.getTime()) ? new Date().getUTCFullYear() : parsed.getUTCFullYear();
  const month = Number.isNaN(parsed.getTime()) ? new Date().getUTCMonth() + 1 : parsed.getUTCMonth() + 1;
  return { taxYear: String(year), quarter: String(Math.ceil(month / 3)) };
}

function detectFormat(fileName: string, lines: string[], preferred?: UploadFileFormat): UploadFileFormat {
  if (preferred) return preferred;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return 'CSV';
  const mmrefPrefixes = new Set(['RA', 'RE', 'RW', 'RO', 'RS', 'RT', 'RU', 'RF']);
  if (lines.some((l) => mmrefPrefixes.has(l.slice(0, 2).toUpperCase()))) {
    return 'MMREF_1';
  }
  return 'TXT';
}

/**
 * Parses and validates a user-uploaded tax portal template file.
 */
export function parseTaxUploadTemplate(
  fileName: string,
  content: string,
  preferredFormat?: UploadFileFormat
): ParsedTemplateResult {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    throw new Error('Template file cannot be empty.');
  }

  const lines = normalized.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  const fileFormat = detectFormat(fileName, lines, preferredFormat);
  const templateHashSha256 = sha256Hex(normalized);
  const warnings: string[] = [];

  let detectedHeaders: string[] = [];
  if (fileFormat === 'CSV') {
    detectedHeaders = lines[0].split(',').map((col) => col.trim().replace(/^['"]|['"]$/g, ''));
    if (normalized.includes('"')) {
      warnings.push('Template contains double quotes ("). Keystone CSV uploads forbid quotation marks.');
    }
  } else if (fileFormat === 'MMREF_1') {
    const prefixes = Array.from(new Set(lines.map((l) => l.slice(0, 2).toUpperCase())));
    detectedHeaders = prefixes;
  } else {
    detectedHeaders = lines[0].split(/\s+|\|/).filter(Boolean).slice(0, 20);
  }

  return { fileFormat, templateHashSha256, detectedHeaders, warnings };
}

function mapCsvColumnValue(
  header: string,
  ctx: {
    company: GenerateUploadExportInput['company'];
    employee?: Employee;
    stub?: PayStub;
    taxYear: string;
    quarter: string;
    psdCode: string;
    isLst: boolean;
  }
): string {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  const emp = ctx.employee;
  const stub = ctx.stub;
  const taxVal = ctx.isLst ? Number(stub?.localFlatTax || 0) : Number(stub?.localIncomeTax || 0);

  if (h === 'year' || h === 'taxyear') return ctx.taxYear;
  if (h === 'quarter' || h === 'taxquarter' || h === 'qtr') return ctx.quarter;
  if (h === 'ein' || h === 'fein' || h === 'employerid') return digitsOnly(ctx.company.ein);
  if (h.includes('company') || h === 'employername') return stripKeystoneUnsafeChars(ctx.company.name);
  if (h.includes('ssn')) return digitsOnly(emp?.ssnLast4 ? `00000${emp.ssnLast4}` : '');
  if (h === 'firstname' || h === 'first') return stripKeystoneUnsafeChars(emp?.firstName);
  if (h === 'lastname' || h === 'last') return stripKeystoneUnsafeChars(emp?.lastName);
  if (h === 'employeename' || h === 'name') {
    return stripKeystoneUnsafeChars(`${emp?.firstName || ''} ${emp?.lastName || ''}`);
  }
  if (h.includes('workpsd') || h.includes('businesspsd')) return ctx.psdCode;
  if (h.includes('psd')) return stripKeystoneUnsafeChars(emp?.residentPsdCode || ctx.psdCode);
  if (h.includes('gross') || h.includes('wage')) return Number(stub?.grossEarnings || 0).toFixed(2);
  if (h.includes('eit') || h.includes('lst') || h.includes('local') || h.includes('withheld') || h.includes('tax')) {
    return taxVal.toFixed(2);
  }
  if (h.includes('address')) return stripKeystoneUnsafeChars(emp?.address || ctx.company.address);
  if (h === 'city') return stripKeystoneUnsafeChars(emp?.city || ctx.company.city);
  if (h === 'state') return stripKeystoneUnsafeChars(emp?.state || ctx.company.state);
  if (h.includes('zip')) return digitsOnly(emp?.zip || ctx.company.zip).slice(0, 5);
  return '';
}

function buildKeystoneCsvRows(input: GenerateUploadExportInput, taxYear: string, quarter: string): string[] {
  const { template, company, payStubs, employees } = input;
  const isLst = template.portalKey === 'PA_KEYSTONE_LST';
  const recordCode = isLst ? 'L' : 'E';
  const ein9 = digitsOnly(company.ein);
  const psd = digitsOnly(template.businessLocationPsd) || '000000';

  const employerLine = [
    recordCode,
    taxYear,
    quarter,
    ein9,
    digitsOnly(company.stateTaxId) || '0',
    stripKeystoneUnsafeChars(company.name),
    stripKeystoneUnsafeChars(company.address),
    stripKeystoneUnsafeChars(company.city),
    stripKeystoneUnsafeChars(company.state),
    digitsOnly(company.zip).slice(0, 5),
    psd,
  ].join(',');

  const employeeLines = payStubs.map((stub) => {
    const emp = employees.find((e) => e.id === stub.employeeId);
    const withheld = isLst ? Number(stub.localFlatTax || 0) : Number(stub.localIncomeTax || 0);
    return [
      digitsOnly(emp?.ssnLast4 ? `00000${emp.ssnLast4}` : ''),
      stripKeystoneUnsafeChars(emp?.firstName),
      stripKeystoneUnsafeChars(emp?.lastName),
      stripKeystoneUnsafeChars(emp?.address),
      stripKeystoneUnsafeChars(emp?.city),
      stripKeystoneUnsafeChars(emp?.state || company.state),
      digitsOnly(emp?.zip || company.zip).slice(0, 5),
      digitsOnly(emp?.residentPsdCode || stub.localityCode || psd),
      Number(stub.grossEarnings || 0).toFixed(2),
      withheld.toFixed(2),
    ].join(',');
  });

  return [employerLine, ...employeeLines];
}

/**
 * Generates an electronic tax upload file from a company's configured template and payroll run.
 */
export function generateTaxUploadExport(input: GenerateUploadExportInput): GeneratedUploadExport {
  const { template, company, payrollRun, payStubs, employees } = input;
  if (!template.isEnabled || !template.templateContent?.trim()) {
    throw new Error(`Upload template for ${template.portalLabel} is not enabled or has no template file.`);
  }

  const { taxYear, quarter } = getYearAndQuarter(payrollRun.payDate || payrollRun.periodEnd);
  const warnings: string[] = [];
  const isLst = template.portalKey === 'PA_KEYSTONE_LST';
  const isKeystone = template.portalKey === 'PA_KEYSTONE_EIT' || isLst;
  const psdCode = digitsOnly(template.businessLocationPsd);

  if (isKeystone && !psdCode) {
    warnings.push('Business Location PSD code is blank; set it in Company Upload Settings.');
  }

  if (payStubs.some((s) => !employees.find((e) => e.id === s.employeeId)?.ssnLast4)) {
    warnings.push('One or more employees are missing SSN data; verify SSNs before portal upload.');
  }

  const lines = template.templateContent.replace(/\r\n/g, '\n').split('\n').filter(Boolean);
  const firstLineCols = lines[0]?.split(',').map((c) => c.trim()) ?? [];
  const looksLikeKeystoneEmployerRow =
    isKeystone && (firstLineCols[0] === 'E' || firstLineCols[0] === 'L') && firstLineCols.length >= 6;

  let outputLines: string[];
  if (template.fileFormat === 'CSV' && looksLikeKeystoneEmployerRow) {
    outputLines = buildKeystoneCsvRows(input, taxYear, quarter);
  } else if (template.fileFormat === 'CSV' && firstLineCols.length > 1) {
    const headerRow = firstLineCols.map((h) => stripKeystoneUnsafeChars(h)).join(',');
    const dataRows = payStubs.map((stub) => {
      const employee = employees.find((e) => e.id === stub.employeeId);
      return firstLineCols
        .map((col) =>
          mapCsvColumnValue(col, { company, employee, stub, taxYear, quarter, psdCode, isLst })
        )
        .join(',');
    });
    outputLines = [headerRow, ...dataRows];
  } else {
    outputLines = lines.map((line) =>
      line
        .replace(/\{\{COMPANY_NAME\}\}/g, stripKeystoneUnsafeChars(company.name))
        .replace(/\{\{EIN\}\}/g, digitsOnly(company.ein))
        .replace(/\{\{TAX_YEAR\}\}/g, taxYear)
        .replace(/\{\{QUARTER\}\}/g, quarter)
        .replace(/\{\{PSD_CODE\}\}/g, psdCode)
    );
  }

  const ext = template.fileFormat === 'CSV' ? 'csv' : 'txt';
  const safePortal = template.portalKey.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return {
    fileName: `${safePortal}-${taxYear}-q${quarter}.${ext}`,
    mimeType: template.fileFormat === 'CSV' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8',
    content: outputLines.join('\r\n'),
    rowCount: outputLines.length,
    warnings,
  };
}
