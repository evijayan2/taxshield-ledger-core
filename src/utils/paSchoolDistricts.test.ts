import { describe, it, expect } from 'vitest';
import {
  PA_SCHOOL_DISTRICTS,
  findDistrictByPsdCode,
  findDistrictByName,
} from './paSchoolDistricts';

describe('paSchoolDistricts utility', () => {
  it('contains a valid array of PA School Districts', () => {
    expect(PA_SCHOOL_DISTRICTS.length).toBeGreaterThan(10);
    const lowerMerion = PA_SCHOOL_DISTRICTS.find(d => d.psdCode === '460401');
    expect(lowerMerion).toBeDefined();
    expect(lowerMerion?.name).toBe('Lower Merion School District');
    expect(lowerMerion?.defaultEitRate).toBe(0.0100);
  });

  it('finds district by PSD code correctly', () => {
    const philly = findDistrictByPsdCode('510101');
    expect(philly).toBeDefined();
    expect(philly?.name).toBe('Philadelphia City School District');
    expect(philly?.defaultEitRate).toBe(0.0375);

    const nonExistent = findDistrictByPsdCode('999999');
    expect(nonExistent).toBeUndefined();
  });

  it('finds district by name correctly', () => {
    const centralBucks = findDistrictByName('Central Bucks School District');
    expect(centralBucks).toBeDefined();
    expect(centralBucks?.psdCode).toBe('090201');

    const partialMatch = findDistrictByName('Lower Merion');
    expect(partialMatch).toBeDefined();
    expect(partialMatch?.psdCode).toBe('460401');
  });
});
