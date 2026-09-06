import { allTaxRuleFixtures } from '../../prisma/fixtures/index';

export interface LocalTaxJurisdiction {
  state: string;
  code: string;
  name: string;
  county?: string;
  defaultRate: number;
  taxType?: 'EIT' | 'WAGE_TAX' | 'COUNTY_TAX' | 'CITY_TAX' | 'FLAT_LST';
}

/**
 * Dynamically builds the local tax jurisdictions list from sealed tax packages.
 */
function buildLocalTaxJurisdictionsFromTaxPacks(): LocalTaxJurisdiction[] {
  const localList: LocalTaxJurisdiction[] = [];

  for (const j of allTaxRuleFixtures.jurisdictions) {
    if (
      j.level === 'SCHOOL_DISTRICT' ||
      j.level === 'CITY' ||
      j.level === 'MUNICIPALITY' ||
      j.level === 'SPECIAL_TAX_DISTRICT'
    ) {
      const psdCodeClean = j.code.replace('PA-PSD-', '');
      const matchingRule = allTaxRuleFixtures.rules.find(
        (r) => r.jurisdictionCode === j.code || r.ruleCode === `PA_LOCAL_EIT_${psdCodeClean}`
      );

      const rate = (matchingRule?.version?.ruleData?.rate as number) ?? 0;
      const county = (matchingRule?.version?.ruleData?.county as string) ?? undefined;

      localList.push({
        state: j.state || (j.code.startsWith('PA-') ? 'PA' : j.code.substring(0, 2)),
        code: j.code,
        name: j.name,
        county,
        defaultRate: rate,
        taxType: j.level === 'SCHOOL_DISTRICT' ? 'EIT' : 'CITY_TAX',
      });
    }
  }
  return localList;
}

const ALL_LOCAL_JURISDICTIONS: LocalTaxJurisdiction[] = buildLocalTaxJurisdictionsFromTaxPacks();

export function getLocalJurisdictionsByState(stateCode: string): LocalTaxJurisdiction[] {
  if (!stateCode) return [];
  const cleanState = stateCode.trim().toUpperCase();
  return ALL_LOCAL_JURISDICTIONS.filter((j) => j.state === cleanState);
}

export function findLocalJurisdictionByCode(code: string): LocalTaxJurisdiction | undefined {
  if (!code) return undefined;
  const cleanCode = code.trim();
  return ALL_LOCAL_JURISDICTIONS.find(
    (j) =>
      j.code === cleanCode ||
      j.code === `PA-PSD-${cleanCode}` ||
      j.code.replace('PA-PSD-', '') === cleanCode
  );
}

export function findLocalJurisdictionByName(stateCode: string, name: string): LocalTaxJurisdiction | undefined {
  if (!name) return undefined;
  const cleanState = stateCode?.trim().toUpperCase();
  const cleanName = name.trim().toLowerCase();

  return ALL_LOCAL_JURISDICTIONS.find(
    (j) =>
      (!cleanState || j.state === cleanState) &&
      (j.name.toLowerCase() === cleanName || j.name.toLowerCase().includes(cleanName))
  );
}

export function getAllLocalJurisdictions(): LocalTaxJurisdiction[] {
  return ALL_LOCAL_JURISDICTIONS;
}
