import { randomHex, sha256Hex } from '../../lib/isomorphicCrypto';
import { prisma } from '../../lib/prisma';
import { recordAuditLog } from '../../lib/audit';
import { logInfo, logError } from '../../lib/logger';
import { encryptTIN, maskTIN, decryptTIN } from '../../lib/tinCrypto';
import type {
  Contractor1099Status,
  ContractorComplianceSummary,
  FormW9Record,
  TaxClassification,
} from '../../commercialTypes';

import { resolveActiveRuleSync } from '../rules-engine/taxRulesEngine';

/**
 * Resolves the statutory 1099-NEC reporting threshold dynamically from the active tax rule.
 * Never hardcodes the statutory threshold, strictly adhering to project invariants.
 * @param effectiveDate Optional effective date for rule resolution.
 * @returns Statutory threshold amount in dollars (e.g. 600.00).
 */
export function resolve1099NecThreshold(effectiveDate: Date = new Date()): number {
  const rule = resolveActiveRuleSync('US-FED', 'FED_1099_NEC_THRESHOLD', effectiveDate);
  const threshold = rule.payload.threshold ?? rule.payload.rate;
  if (threshold === undefined || threshold === null) {
    throw new Error('TaxRule FED_1099_NEC_THRESHOLD does not have a threshold or rate defined.');
  }
  return threshold;
}

export interface CertifyW9Input {
  companyId: string;
  employeeId: string;
  businessName?: string;
  taxClassification: TaxClassification | string;
  tinType: 'SSN' | 'EIN';
  tin: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  certifiedSignature: string;
  ipAddress?: string;
}

export interface IrisPayeeExport {
  tinType: '1' | '2'; // 1=EIN, 2=SSN
  tinPlain: string;
  legalName: string;
  businessName?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  compensationAmount: number;
}

/**
 * Determines if a tax classification is exempt from standard Form 1099-NEC filing.
 * @param classification Tax classification enum string.
 * @returns True if entity is a C-Corp or S-Corp (exempt from nonemployee compensation reporting).
 */
export function isCorporateExempt(classification?: string | null): boolean {
  if (!classification) return false;
  const c = classification.toUpperCase();
  return c === 'C_CORPORATION' || c === 'S_CORPORATION' || c === 'LLC_C_CORP' || c === 'LLC_S_CORP';
}

/**
 * Evaluates contractor compliance and 1099-NEC threshold status.
 * @param ytdAmount Total nonemployee compensation paid to date in tax year.
 * @param threshold Statutory threshold resolved from TaxRulesEngine.
 * @param hasW9 Whether a certified FormW9Record exists.
 * @param classification Contractor's federal tax classification.
 * @returns Evaluated status enum.
 */
export function evaluateContractor1099Status(
  ytdAmount: number,
  threshold: number,
  hasW9: boolean,
  classification?: string | null
): Contractor1099Status {
  if (isCorporateExempt(classification)) {
    return 'EXEMPT_ENTITY';
  }
  if (!hasW9) {
    return 'MISSING_W9';
  }
  if (ytdAmount >= threshold) {
    return 'THRESHOLD_MET';
  }
  return 'BELOW_THRESHOLD';
}

/**
 * Generates a high-entropy single-use token and SHA-256 hash for W-9 invite links.
 * @returns Raw token to send in URL and hash to persist.
 */
export function generateW9TokenPair(): { rawToken: string; tokenHash: string } {
  const rawToken = randomHex(32);
  const tokenHash = sha256Hex(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Certifies and stores a Form W-9 submission with encrypted TIN and audit record.
 * @param input Submitted W-9 form fields.
 * @returns Saved FormW9Record entity.
 */
export async function certifyFormW9(input: CertifyW9Input): Promise<FormW9Record> {
  const tinEncrypted = encryptTIN(input.tin);
  const tinMasked = maskTIN(input.tin, input.tinType);
  const isEligible = !isCorporateExempt(input.taxClassification);

  try {
    const record = await prisma.formW9Record.upsert({
      where: { employeeId: input.employeeId },
      create: {
        companyId: input.companyId,
        employeeId: input.employeeId,
        businessName: input.businessName || null,
        taxClassification: input.taxClassification,
        tinType: input.tinType,
        tinMasked,
        tinEncrypted,
        address: input.address,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        certifiedSignature: input.certifiedSignature,
        certifiedAt: new Date(),
        ipAddress: input.ipAddress || null,
        is1099Eligible: isEligible,
      },
      update: {
        businessName: input.businessName || null,
        taxClassification: input.taxClassification,
        tinType: input.tinType,
        tinMasked,
        tinEncrypted,
        address: input.address,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        certifiedSignature: input.certifiedSignature,
        certifiedAt: new Date(),
        ipAddress: input.ipAddress || null,
        is1099Eligible: isEligible,
      },
    });

    await recordAuditLog({
      companyId: input.companyId,
      entityType: 'FORM_W9',
      entityId: record.id,
      action: 'UPDATE',
      actorId: input.employeeId,
      newState: { tinMasked, taxClassification: input.taxClassification, isEligible },
      reason: 'Contractor submitted and certified Form W-9 signature',
    });

    logInfo('Form W-9 certified successfully', { employeeId: input.employeeId, isEligible });
    return mapW9Record(record);
  } catch (error) {
    logError('Failed to certify Form W-9', error, { employeeId: input.employeeId });
    throw error;
  }
}

/**
 * Builds an IRS Publication 1220 compliant CSV manifest for IRIS/FIRE electronic 1099-NEC transmission.
 * @param payerEin Company EIN without hyphens.
 * @param payerName Company legal name.
 * @param taxYear 4-digit tax year string.
 * @param payees Array of payees meeting filing threshold.
 * @returns Formatted CSV manifest string.
 */
export function generateIrisCsvManifest(
  payerEin: string,
  payerName: string,
  taxYear: string,
  payees: IrisPayeeExport[]
): string {
  const cleanPayerEin = payerEin.replace(/[^0-9]/g, '');
  const headers = [
    'RecordType',
    'PayerTIN',
    'PayerName',
    'TaxYear',
    'PayeeTINType',
    'PayeeTIN',
    'PayeeName',
    'PayeeBusinessName',
    'PayeeAddress',
    'PayeeCity',
    'PayeeState',
    'PayeeZip',
    'Box1NonemployeeComp',
  ];

  const rows = payees.map((p) => [
    'B',
    cleanPayerEin,
    `"${payerName.replace(/"/g, '""')}"`,
    taxYear,
    p.tinType,
    p.tinPlain.replace(/[^0-9]/g, ''),
    `"${p.legalName.replace(/"/g, '""')}"`,
    p.businessName ? `"${p.businessName.replace(/"/g, '""')}"` : '""',
    `"${p.address.replace(/"/g, '""')}"`,
    `"${p.city.replace(/"/g, '""')}"`,
    p.state,
    p.zipCode.replace(/[^0-9]/g, ''),
    p.compensationAmount.toFixed(2),
  ]);

  const totalComp = payees.reduce((acc, p) => acc + p.compensationAmount, 0);
  const footerRow = [
    'C',
    cleanPayerEin,
    `"${payerName.replace(/"/g, '""')}"`,
    taxYear,
    payees.length.toString(),
    totalComp.toFixed(2),
  ];

  return [headers.join(','), ...rows.map((r) => r.join(',')), footerRow.join(',')].join('\n');
}

/**
 * Maps raw database FormW9Record to domain FormW9Record interface.
 * @param raw Prisma database entity.
 * @returns Clean interface.
 */
function mapW9Record(raw: any): FormW9Record {
  return {
    id: raw.id,
    companyId: raw.companyId,
    employeeId: raw.employeeId,
    businessName: raw.businessName,
    taxClassification: raw.taxClassification,
    tinType: raw.tinType,
    tinMasked: raw.tinMasked,
    tinEncrypted: raw.tinEncrypted,
    exemptPayeeCode: raw.exemptPayeeCode,
    fatcaCode: raw.fatcaCode,
    address: raw.address,
    city: raw.city,
    state: raw.state,
    zipCode: raw.zipCode,
    certifiedSignature: raw.certifiedSignature,
    certifiedAt: raw.certifiedAt?.toISOString(),
    ipAddress: raw.ipAddress,
    is1099Eligible: raw.is1099Eligible,
    createdAt: raw.createdAt?.toISOString(),
    updatedAt: raw.updatedAt?.toISOString(),
  };
}
