/**
 * SSA EFW2 (Electronic Filing W-2) 512-Byte Fixed-Width Batch Generator.
 * Implements SSA Publication 42-007 fixed-width records:
 * RA (Submitter), RE (Employer), RW (Employee Wage), RS (State Wage),
 * RT (Employer Total), and RF (Final Record).
 */

import type { Employee, Organization, PayStub } from '../../types';
import { calculateW2Summaries, type W2EmployeeSummary } from '../../utils/w2w3Data';

export interface Efw2BatchResult {
  content: string;
  recordCount: number;
  employeeCount: number;
  totalBox1Wages: number;
  warnings: string[];
}

const EFW2_RECORD_LENGTH = 512;

function alpha(value: string | undefined | null, length: number): string {
  const cleaned = (value || '')
    .toUpperCase()
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
  return cleaned.slice(0, length).padEnd(length, ' ');
}

function digits(value: string | undefined | null, length: number): string {
  const cleaned = (value || '').replace(/\D/g, '');
  return cleaned.slice(0, length).padStart(length, '0');
}

function cents(amount: number, length: number = 11): string {
  const totalCents = Math.max(0, Math.round((amount || 0) * 100));
  return String(totalCents).slice(-length).padStart(length, '0');
}

function finalizeRecord(fields: string[]): string {
  const joined = fields.join('');
  if (joined.length > EFW2_RECORD_LENGTH) {
    return joined.slice(0, EFW2_RECORD_LENGTH);
  }
  return joined.padEnd(EFW2_RECORD_LENGTH, ' ');
}

function buildRaRecord(org: Organization): string {
  return finalizeRecord([
    'RA',
    digits(org.ein, 9),
    alpha('', 8),                      // User Identification (BSO assigned at upload or blank)
    alpha('', 4),                      // Software Vendor Code
    alpha('', 5),                      // Blanks
    '0',                               // Resub Indicator
    alpha('', 6),                      // Resub WFID
    alpha('99', 2),                    // Software Code (99 = In-house / self-prepared)
    alpha(org.name, 57),               // Submitter Name
    alpha(org.address, 22),            // Location Address
    alpha(org.address, 22),            // Delivery Address
    alpha(org.city, 22),               // City
    alpha(org.state || 'PA', 2),       // State
    digits(org.zip, 5),                // ZIP
    alpha('', 4),                      // ZIP Ext
    alpha('', 5),                      // Blanks
    alpha('', 23),                     // Foreign State
    alpha('', 15),                     // Foreign Postal
    alpha('', 2),                      // Country Code
    alpha(org.name, 57),               // Company Name
    alpha(org.address, 22),            // Company Location
    alpha(org.address, 22),            // Company Delivery
    alpha(org.city, 22),               // Company City
    alpha(org.state || 'PA', 2),       // Company State
    digits(org.zip, 5),                // Company ZIP
    alpha('', 4),                      // Company ZIP Ext
    alpha('', 5),                      // Blanks
    alpha('', 23),                     // Foreign State
    alpha('', 15),                     // Foreign Postal
    alpha('', 2),                      // Country Code
    alpha(org.ownerName, 27),          // Contact Name
    alpha('', 15),                     // Contact Phone
    alpha('', 5),                      // Contact Phone Ext
    alpha('', 3),                      // Blanks
    alpha(org.ownerEmail, 40),         // Contact Email
    alpha('', 3),                      // Blanks
    alpha('', 10),                     // Contact Fax
    'L',                               // Preferred Method of Problem Notification (E-mail/Letter)
    '0',                               // Preparer Code (0 = Self-Prepared)
  ]);
}

function buildReRecord(org: Organization, taxYear: number): string {
  return finalizeRecord([
    'RE',
    digits(String(taxYear), 4),       // Tax Year
    ' ',                               // Agent Indicator
    digits(org.ein, 9),                // Employer EIN
    alpha('', 9),                      // Agent For EIN
    '0',                               // Terminating Business Indicator
    alpha('', 4),                      // Establishment Number
    alpha('', 9),                      // Other EIN
    alpha(org.name, 57),               // Employer Name
    alpha(org.address, 22),            // Location Address
    alpha(org.address, 22),            // Delivery Address
    alpha(org.city, 22),               // City
    alpha(org.state || 'PA', 2),       // State
    digits(org.zip, 5),                // ZIP
    alpha('', 4),                      // ZIP Ext
    'N',                               // Kind of Employer (N = None apply / standard private)
    alpha('', 4),                      // Blanks
    alpha('', 23),                     // Foreign State
    alpha('', 15),                     // Foreign Postal
    alpha('', 2),                      // Country Code
    'R',                               // Employment Code (R = Regular)
    ' ',                               // Tax Jurisdiction Code
    '0',                               // Third-Party Sick Pay Indicator
    alpha(org.ownerName, 27),          // Contact Name
    alpha('', 15),                     // Contact Phone
    alpha('', 5),                      // Contact Phone Ext
    alpha('', 10),                     // Contact Fax
    alpha(org.ownerEmail, 40),         // Contact Email
  ]);
}

function resolveSsn9(summary: W2EmployeeSummary, emp: Employee | undefined, decryptedSsnMap?: Record<string, string>): string {
  const fromMap = emp?.id ? (decryptedSsnMap?.[emp.id] || '').replace(/\D/g, '') : '';
  if (fromMap.length === 9) return fromMap;
  const rawSsn = (emp?.ssnLastFour || '').replace(/\D/g, '');
  return rawSsn.length === 9 ? rawSsn : rawSsn.padStart(9, '0');
}

function buildRwRecord(summary: W2EmployeeSummary, emp: Employee | undefined, decryptedSsnMap?: Record<string, string>): string {
  const ssn9 = resolveSsn9(summary, emp, decryptedSsnMap);

  return finalizeRecord([
    'RW',
    ssn9,                              // Employee SSN (9 digits)
    alpha(summary.employeeFirstName, 15),
    alpha('', 15),                     // Middle Name
    alpha(summary.employeeLastName, 20),
    alpha('', 4),                      // Suffix
    alpha(summary.employeeAddress, 22),// Location Address
    alpha(summary.employeeAddress, 22),// Delivery Address
    alpha(emp?.city || '', 22),        // City
    alpha(emp?.state || summary.boxes.box15State || 'PA', 2), // State
    digits(emp?.zip || '', 5),         // ZIP
    alpha('', 4),                      // ZIP Ext
    alpha('', 5),                      // Blanks
    alpha('', 23),                     // Foreign State
    alpha('', 15),                     // Foreign Postal
    alpha('', 2),                      // Country Code
    cents(summary.boxes.box1Wages, 11),
    cents(summary.boxes.box2FedTax, 11),
    cents(summary.boxes.box3SsWages, 11),
    cents(summary.boxes.box4SsTax, 11),
    cents(summary.boxes.box5MedWages, 11),
    cents(summary.boxes.box6MedTax, 11),
  ]);
}

function buildRsRecord(summary: W2EmployeeSummary, org: Organization, emp: Employee | undefined, decryptedSsnMap?: Record<string, string>): string {
  const ssn9 = resolveSsn9(summary, emp, decryptedSsnMap);
  const stateCode = (summary.boxes.box15State || org.state || 'PA').toUpperCase();
  const stateFips = stateCode === 'PA' ? '42' : '00';

  return finalizeRecord([
    'RS',
    alpha(stateFips, 2),               // State Code (FIPS: 42 = PA)
    alpha('', 5),                      // Taxing Entity Code
    ssn9,                              // Employee SSN
    alpha(summary.employeeFirstName, 15),
    alpha('', 15),                     // Middle Name
    alpha(summary.employeeLastName, 20),
    alpha('', 4),                      // Suffix
    alpha(summary.employeeAddress, 22),
    alpha(summary.employeeAddress, 22),
    alpha(emp?.city || '', 22),
    alpha(stateCode, 2),
    digits(emp?.zip || '', 5),
    alpha('', 4),                      // ZIP Ext
    alpha('', 5),                      // Blanks
    alpha('', 23),                     // Foreign State
    alpha('', 15),                     // Foreign Postal
    alpha('', 2),                      // Country Code
    alpha('', 2),                      // Optional Code
    alpha('', 6),                      // Reporting Period
    alpha('', 8),                      // Date First Employed
    alpha('', 8),                      // Date of Separation
    alpha('', 5),                      // Blanks
    alpha(org.stateTaxId, 20),         // State Employer Account Number
    alpha('', 6),                      // Blanks
    alpha(stateFips, 2),               // State Code
    cents(summary.boxes.box16StateWages, 11),
    cents(summary.boxes.box17StateTax, 11),
    alpha('', 10),                     // Other State Data
    'C',                               // Tax Type Code (C = City/Local EIT)
    cents(summary.boxes.box18LocalWages, 11),
    cents(summary.boxes.box19LocalTax, 11),
    alpha(summary.boxes.box20Locality, 7),
  ]);
}

function buildRtRecord(summaries: W2EmployeeSummary[]): string {
  const totalBox1 = summaries.reduce((s, w) => s + w.boxes.box1Wages, 0);
  const totalBox2 = summaries.reduce((s, w) => s + w.boxes.box2FedTax, 0);
  const totalBox3 = summaries.reduce((s, w) => s + w.boxes.box3SsWages, 0);
  const totalBox4 = summaries.reduce((s, w) => s + w.boxes.box4SsTax, 0);
  const totalBox5 = summaries.reduce((s, w) => s + w.boxes.box5MedWages, 0);
  const totalBox6 = summaries.reduce((s, w) => s + w.boxes.box6MedTax, 0);

  return finalizeRecord([
    'RT',
    digits(String(summaries.length), 7),
    cents(totalBox1, 15),
    cents(totalBox2, 15),
    cents(totalBox3, 15),
    cents(totalBox4, 15),
    cents(totalBox5, 15),
    cents(totalBox6, 15),
  ]);
}

function buildRfRecord(employeeCount: number): string {
  return finalizeRecord([
    'RF',
    alpha('', 5),
    digits(String(employeeCount), 9),
  ]);
}

/**
 * Generates an SSA Pub. 42-007 compliant 512-byte EFW2 electronic W-2 batch file.
 */
export function generateEfw2Batch(
  org: Organization,
  employees: Employee[],
  payStubs: PayStub[],
  taxYear: number,
  decryptedSsnMap?: Record<string, string>
): Efw2BatchResult {
  const warnings: string[] = [];
  if (!org.ein || org.ein.replace(/\D/g, '').length !== 9) {
    warnings.push('Company EIN is missing or invalid (9 digits required for SSA BSO submission).');
  }

  const summaries = calculateW2Summaries(org, employees, payStubs, taxYear).filter(
    (s) => s.boxes.box1Wages > 0 || s.boxes.box2FedTax > 0
  );

  const empMap = new Map((employees || []).map((e) => [e.id, e]));
  const lines: string[] = [];

  lines.push(buildRaRecord(org));
  lines.push(buildReRecord(org, taxYear));

  for (const summary of summaries) {
    const emp = empMap.get(summary.employeeId);
    const decrypted = emp?.id ? (decryptedSsnMap?.[emp.id] || '').replace(/\D/g, '') : '';
    const rawSsn = decrypted.length === 9 ? decrypted : (emp?.ssnLastFour || '').replace(/\D/g, '');
    if (rawSsn.length < 9) {
      warnings.push(
        `Employee ${summary.employeeName} has only ${rawSsn.length} SSN digit(s) on file; full 9-digit SSN is required before uploading to SSA BSO.`
      );
    }
    lines.push(buildRwRecord(summary, emp, decryptedSsnMap));
    lines.push(buildRsRecord(summary, org, emp, decryptedSsnMap));
  }

  lines.push(buildRtRecord(summaries));
  lines.push(buildRfRecord(summaries.length));

  const totalBox1Wages = Math.round(summaries.reduce((s, w) => s + w.boxes.box1Wages, 0) * 100) / 100;

  return {
    content: lines.join('\r\n') + '\r\n',
    recordCount: lines.length,
    employeeCount: summaries.length,
    totalBox1Wages,
    warnings,
  };
}
