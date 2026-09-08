import { Employee, Organization, PayStub } from '../types';
import { findDistrictByPsdCode } from './paSchoolDistricts';

export interface W2LocalLine {
  localWages: number;
  localTax: number;
  localityName: string;
  psdCode?: string;
}

export interface W2StateLine {
  state: string;
  stateId: string;
  stateWages: number;
  stateTax: number;
}

export interface W2BoxValues {
  box1Wages: number;
  box2FedTax: number;
  box3SsWages: number;
  box4SsTax: number;
  box5MedWages: number;
  box6MedTax: number;
  box13Statutory: boolean;
  box13RetirementPlan: boolean;
  box13ThirdPartySick: boolean;
  box14Other: string;
  box15State: string;
  box15StateId: string;
  box16StateWages: number;
  box17StateTax: number;
  box18LocalWages: number;
  box19LocalTax: number;
  box20Locality: string;
  localLines?: W2LocalLine[];
  stateLines?: W2StateLine[];
}

export interface W2EmployeeSummary {
  employeeId: string;
  employeeName: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeSsn: string;
  employeeAddress: string;
  employeeCityStateZip: string;
  boxes: W2BoxValues;
}

export interface W3TransmittalSummary {
  taxYear: number;
  employerName: string;
  employerEin: string;
  employerStateId: string;
  employerAddress: string;
  employerCityStateZip: string;
  totalFormsW2: number;
  kindOfPayer: string;
  totalBox1Wages: number;
  totalBox2FedTax: number;
  totalBox3SsWages: number;
  totalBox4SsTax: number;
  totalBox5MedWages: number;
  totalBox6MedTax: number;
  totalBox16StateWages: number;
  totalBox17StateTax: number;
  totalBox18LocalWages: number;
  totalBox19LocalTax: number;
}

/**
 * Formats a raw number as a standard USD currency string ($X,XXX.XX).
 * @param amount Numeric value to format
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formats an unformatted SSN suffix or full string into standard XXX-XX-XXXX format.
 * @param ssnLastFour Last 4 digits of SSN
 * @returns Standard masked or formatted SSN string
 */
export function formatMaskedSsn(ssnLastFour: string): string {
  if (!ssnLastFour) return 'XXX-XX-0000';
  if (ssnLastFour.length === 9 && !ssnLastFour.includes('-')) {
    return `${ssnLastFour.slice(0, 3)}-${ssnLastFour.slice(3, 5)}-${ssnLastFour.slice(5)}`;
  }
  return `XXX-XX-${ssnLastFour.padStart(4, '0')}`;
}

/**
 * Calculates individual W-2 box figures for a given employee based on paid pay stubs.
 * @param employee Target employee record
 * @param payStubs List of all organization pay stubs
 * @param org Organization details
 * @param year Optional filing tax year (defaults to current year)
 * @returns Complete W-2 employee summary object
 */
export function calculateEmployeeW2(
  employee: Employee,
  payStubs: PayStub[],
  org: Organization,
  year: number = new Date().getFullYear()
): W2EmployeeSummary {
  const empStubs = payStubs.filter(s => s.employeeId === employee.id);

  let gross = empStubs.reduce((sum, s) => sum + (s.grossEarnings || 0), 0);
  let fedTax = empStubs.reduce((sum, s) => sum + (s.federalIncomeTax || 0), 0);
  let ssTax = empStubs.reduce((sum, s) => sum + (s.socialSecurityTax || 0), 0);
  let medTax = empStubs.reduce((sum, s) => sum + (s.medicareTax || 0), 0);
  let stateTax = empStubs.reduce((sum, s) => sum + (s.stateIncomeTax ?? s.paStateTax ?? 0), 0);
  let localTax = empStubs.reduce((sum, s) => sum + (s.localIncomeTax ?? s.paLocalEit ?? 0), 0);
  let localFlat = empStubs.reduce((sum, s) => sum + (s.localFlatTax ?? s.paLst ?? 0), 0);

  const ssCap = 168600;
  const ssWages = Math.min(gross, ssCap);

  const empState = (employee.state || employee.workState || org.state || 'PA').toUpperCase();

  // Multi-locality collection from PayStub.taxLines
  const localMap: Record<string, W2LocalLine> = {};

  for (const stub of empStubs) {
    if (stub.taxLines && stub.taxLines.length > 0) {
      for (const line of stub.taxLines) {
        if (line.jurisdictionType === 'LOCAL_EIT') {
          const key = line.jurisdictionCode || line.jurisdictionName;
          if (!localMap[key]) {
            localMap[key] = {
              localWages: 0,
              localTax: 0,
              localityName: line.jurisdictionName,
              psdCode: line.jurisdictionCode?.replace('PA-PSD-', ''),
            };
          }
          localMap[key].localWages += line.taxableWages;
          localMap[key].localTax += line.taxWithheld;
        }
      }
    }
  }

  const localLines = Object.values(localMap);

  const stubLocality = empStubs.find(s => s.localityName && s.localityName.trim() !== '')?.localityName;

  let psdDistrictName: string | undefined = undefined;
  if (employee.paPsdCode) {
    psdDistrictName = findDistrictByPsdCode(employee.paPsdCode)?.name;
  } else if (employee.localTaxJurisdictionCode) {
    const cleanCode = employee.localTaxJurisdictionCode.replace('PA-PSD-', '');
    psdDistrictName = findDistrictByPsdCode(cleanCode)?.name;
  }

  const profileLocality = (employee.localTaxJurisdictionName && !employee.localTaxJurisdictionName.includes('Lower Merion / Montgomery'))
    ? employee.localTaxJurisdictionName
    : (employee.paPsdName && !employee.paPsdName.includes('Lower Merion / Montgomery') ? employee.paPsdName : undefined);

  const locality = localLines.length > 0
    ? localLines[0].localityName
    : (stubLocality
      || psdDistrictName
      || profileLocality
      || employee.localTaxJurisdictionName
      || employee.paPsdName
      || (empState === 'DE' ? 'City of Wilmington' : 'PA Local Tax Resident'));

  const box14Parts: string[] = [];
  if (localFlat > 0) {
    const flatLabel = empState === 'PA' ? 'PA LST' : 'Local Flat Tax';
    box14Parts.push(`${flatLabel} ${formatCurrency(localFlat)}`);
  }

  return {
    employeeId: employee.id,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    employeeFirstName: employee.firstName,
    employeeLastName: employee.lastName,
    employeeSsn: formatMaskedSsn(employee.ssnLastFour),
    employeeAddress: employee.streetAddress || '',
    employeeCityStateZip: (employee.city || employee.state || employee.zip)
      ? `${employee.city || ''}${employee.city && employee.state ? ', ' : ''}${employee.state || ''} ${employee.zip || ''}`.trim()
      : '',
    boxes: {
      box1Wages: gross,
      box2FedTax: fedTax,
      box3SsWages: ssWages,
      box4SsTax: ssTax,
      box5MedWages: gross,
      box6MedTax: medTax,
      box13Statutory: false,
      box13RetirementPlan: false,
      box13ThirdPartySick: false,
      box14Other: box14Parts.join(' | ') || '',
      box15State: empState,
      box15StateId: org.stateTaxId || '77-88990',
      box16StateWages: gross,
      box17StateTax: stateTax,
      box18LocalWages: gross,
      box19LocalTax: localTax,
      box20Locality: locality,
      localLines: localLines.length > 0 ? localLines : undefined,
    }
  };
}

/**
 * Calculates W-2 summaries for all active W-2 employees in the organization.
 * @param org Organization metadata
 * @param employees List of employees
 * @param payStubs List of pay stubs
 * @param year Target filing year
 * @returns Array of employee W-2 summaries
 */
export function calculateW2Summaries(
  org: Organization,
  employees: Employee[],
  payStubs: PayStub[],
  year: number = new Date().getFullYear()
): W2EmployeeSummary[] {
  const w2Employees = employees.filter(e => e.employmentType !== '1099_CONTRACTOR');
  return w2Employees.map(emp => calculateEmployeeW2(emp, payStubs, org, year));
}

/**
 * Aggregates individual W-2 summaries into employer Form W-3 transmittal figures.
 * @param org Organization metadata
 * @param w2Summaries Array of employee W-2 summaries
 * @param year Target filing year
 * @returns Form W-3 transmittal summary object
 */
export function calculateW3Summary(
  org: Organization,
  w2Summaries: W2EmployeeSummary[],
  year: number = new Date().getFullYear()
): W3TransmittalSummary {
  const totalForms = w2Summaries.length;
  const totalBox1 = w2Summaries.reduce((sum, w) => sum + w.boxes.box1Wages, 0);
  const totalBox2 = w2Summaries.reduce((sum, w) => sum + w.boxes.box2FedTax, 0);
  const totalBox3 = w2Summaries.reduce((sum, w) => sum + w.boxes.box3SsWages, 0);
  const totalBox4 = w2Summaries.reduce((sum, w) => sum + w.boxes.box4SsTax, 0);
  const totalBox5 = w2Summaries.reduce((sum, w) => sum + w.boxes.box5MedWages, 0);
  const totalBox6 = w2Summaries.reduce((sum, w) => sum + w.boxes.box6MedTax, 0);
  const totalBox16 = w2Summaries.reduce((sum, w) => sum + w.boxes.box16StateWages, 0);
  const totalBox17 = w2Summaries.reduce((sum, w) => sum + w.boxes.box17StateTax, 0);
  const totalBox18 = w2Summaries.reduce((sum, w) => sum + w.boxes.box18LocalWages, 0);
  const totalBox19 = w2Summaries.reduce((sum, w) => sum + w.boxes.box19LocalTax, 0);

  return {
    taxYear: year,
    employerName: org.name,
    employerEin: org.ein,
    employerStateId: org.stateTaxId,
    employerAddress: org.address,
    employerCityStateZip: `${org.city}, ${org.state} ${org.zip}`,
    totalFormsW2: totalForms,
    kindOfPayer: '941',
    totalBox1Wages: totalBox1,
    totalBox2FedTax: totalBox2,
    totalBox3SsWages: totalBox3,
    totalBox4SsTax: totalBox4,
    totalBox5MedWages: totalBox5,
    totalBox6MedTax: totalBox6,
    totalBox16StateWages: totalBox16,
    totalBox17StateTax: totalBox17,
    totalBox18LocalWages: totalBox18,
    totalBox19LocalTax: totalBox19
  };
}
