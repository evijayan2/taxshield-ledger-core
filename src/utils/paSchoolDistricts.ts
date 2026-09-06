import {
  findLocalJurisdictionByCode,
  findLocalJurisdictionByName,
  getAllLocalJurisdictions,
} from './localTaxDistricts';

export interface PASchoolDistrict {
  name: string;
  psdCode: string;
  defaultEitRate: number;
  county: string;
}

export const PA_SCHOOL_DISTRICTS: PASchoolDistrict[] = getAllLocalJurisdictions()
  .filter((j) => j.state === 'PA')
  .map((j) => ({
    name: j.name,
    psdCode: j.code.replace('PA-PSD-', ''),
    defaultEitRate: j.defaultRate,
    county: j.county || '',
  }));

export function findDistrictByPsdCode(code: string): PASchoolDistrict | undefined {
  if (!code) return undefined;
  const match = findLocalJurisdictionByCode(code);
  if (match && match.state === 'PA') {
    return {
      name: match.name,
      psdCode: match.code.replace('PA-PSD-', ''),
      defaultEitRate: match.defaultRate,
      county: match.county || '',
    };
  }
  return PA_SCHOOL_DISTRICTS.find((d) => d.psdCode === code.trim());
}

export function findDistrictByName(name: string): PASchoolDistrict | undefined {
  if (!name) return undefined;
  const match = findLocalJurisdictionByName('PA', name);
  if (match) {
    return {
      name: match.name,
      psdCode: match.code.replace('PA-PSD-', ''),
      defaultEitRate: match.defaultRate,
      county: match.county || '',
    };
  }
  const clean = name.trim().toLowerCase();
  return PA_SCHOOL_DISTRICTS.find(
    (d) => d.name.toLowerCase() === clean || d.name.toLowerCase().includes(clean)
  );
}
