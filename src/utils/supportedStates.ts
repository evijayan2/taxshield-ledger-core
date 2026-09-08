import { TaxFilingFrequency } from '../types';

export interface SupportedState {
  code: string;
  name: string;
  fullName: string;
  hasStateIncomeTax: boolean;
  hasLocalIncomeTax: boolean;
  defaultFilingFrequency: TaxFilingFrequency;
  taxDescription: string;
}

/**
 * Authoritative registry of states that have verified tax rules in the ledger engine.
 * Only states with active tax calculation fixtures and jurisdiction rules are listed.
 */
export const SUPPORTED_STATES: readonly SupportedState[] = [
  {
    code: 'PA',
    name: 'Pennsylvania',
    fullName: 'Commonwealth of Pennsylvania (PA)',
    hasStateIncomeTax: true,
    hasLocalIncomeTax: true,
    defaultFilingFrequency: 'MONTHLY',
    taxDescription: 'Statutory Flat PIT, PA UC Employer Tax, Act 32 Local EIT & LST',
  },
  {
    code: 'DE',
    name: 'Delaware',
    fullName: 'State of Delaware (DE)',
    hasStateIncomeTax: true,
    hasLocalIncomeTax: true,
    defaultFilingFrequency: 'MONTHLY',
    taxDescription: 'Graduated SIT, Delaware SUI, Wilmington City Wage Tax',
  },
  {
    code: 'FL',
    name: 'Florida',
    fullName: 'State of Florida (FL)',
    hasStateIncomeTax: false,
    hasLocalIncomeTax: false,
    defaultFilingFrequency: 'QUARTERLY',
    taxDescription: 'No Personal Income Tax, Florida Reemployment SUTA Tax',
  },
  {
    code: 'NJ',
    name: 'New Jersey',
    fullName: 'State of New Jersey (NJ)',
    hasStateIncomeTax: true,
    hasLocalIncomeTax: false,
    defaultFilingFrequency: 'MONTHLY',
    taxDescription: 'Graduated Gross Income Tax, NJ SUI/FLI/SDI',
  },
  {
    code: 'NY',
    name: 'New York',
    fullName: 'State of New York (NY)',
    hasStateIncomeTax: true,
    hasLocalIncomeTax: true,
    defaultFilingFrequency: 'MONTHLY',
    taxDescription: 'Graduated SIT (4.0%–10.9%), NY SUI, MCTMT, NYC Local Withholding',
  },
  {
    code: 'OH',
    name: 'Ohio',
    fullName: 'State of Ohio (OH)',
    hasStateIncomeTax: true,
    hasLocalIncomeTax: true,
    defaultFilingFrequency: 'MONTHLY',
    taxDescription: 'Graduated State PIT (2.75%–3.5%), Ohio SUTA, RITA/CCA Municipal Taxes',
  },
  {
    code: 'TX',
    name: 'Texas',
    fullName: 'State of Texas (TX)',
    hasStateIncomeTax: false,
    hasLocalIncomeTax: false,
    defaultFilingFrequency: 'QUARTERLY',
    taxDescription: '0% State Personal Income Tax, Texas Workforce Commission (TWC) SUTA',
  },
] as const;

/**
 * Returns the list of all supported states with verified tax rule details.
 */
export function getSupportedStates(): readonly SupportedState[] {
  return SUPPORTED_STATES;
}

/**
 * Checks if a 2-letter state code is supported by the tax engine.
 */
export function isStateSupported(stateCode: string): boolean {
  if (!stateCode) return false;
  const upper = stateCode.trim().toUpperCase();
  return SUPPORTED_STATES.some((s) => s.code === upper);
}

/**
 * Finds metadata for a specific supported state.
 */
export function getSupportedStateByCode(stateCode: string): SupportedState | undefined {
  if (!stateCode) return undefined;
  const upper = stateCode.trim().toUpperCase();
  return SUPPORTED_STATES.find((s) => s.code === upper);
}

/**
 * Authoritative registry of all 50 US States + DC for address input.
 */
export interface StateOption {
  code: string;
  name: string;
}

export const ALL_US_STATES: readonly StateOption[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
] as const;

/**
 * Gets the display name for a state code, falling back to the raw code if unlisted.
 */
export function getStateDisplayName(stateCode: string): string {
  const match = getSupportedStateByCode(stateCode);
  return match ? match.fullName : stateCode;
}


