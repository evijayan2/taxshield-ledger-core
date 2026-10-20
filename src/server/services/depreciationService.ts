import { CapitalAsset, AssetDepreciationSchedule, AssetDepreciationYearSchedule } from '../../types';

/**
 * Standard IRS MACRS Half-Year Convention Percentage Tables (IRS Publication 946).
 */
const MACRS_200_DB_TABLES: Record<number, number[]> = {
  3: [33.33, 44.45, 14.81, 7.41],
  5: [20.0, 32.0, 19.2, 11.52, 11.52, 5.76],
  7: [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46],
  15: [5.0, 9.5, 8.55, 7.7, 6.93, 6.23, 5.9, 5.9, 5.9, 5.9, 5.9, 5.9, 5.9, 5.9, 5.9, 2.95],
};

/**
 * Calculate full depreciation schedule and Schedule C / Form 4562 mappings for a CapitalAsset.
 */
export function calculateAssetDepreciationSchedule(asset: CapitalAsset, targetTaxYear?: number): AssetDepreciationSchedule {
  const currentYear = targetTaxYear || new Date().getFullYear();
  const placedYear = parseInt(asset.datePlacedInService.split('-')[0] || String(currentYear), 10);

  const businessUseFrac = Math.min(100, Math.max(0, asset.businessUsePercent)) / 100;
  const businessBasis = Math.round(asset.costBasis * businessUseFrac * 100) / 100;

  const section179Claimed = Math.min(businessBasis, Math.max(0, asset.section179Claimed || 0));
  const remainingBasisForMacrs = businessBasis - section179Claimed;

  const recoveryYears = asset.recoveryPeriodYears || 5;
  const yearByYear: AssetDepreciationYearSchedule[] = [];

  let accumulatedDep = 0;
  let remainingBasis = businessBasis;
  let currentYearDep = 0;

  if (asset.depreciationMethod === 'SECTION_179') {
    // Full Section 179 immediate expense election
    const full179 = businessBasis;
    yearByYear.push({
      year: placedYear,
      beginningBasis: businessBasis,
      section179Deduction: full179,
      regularDepreciation: 0,
      totalAnnualDepreciation: full179,
      endingBasis: 0,
      accumulatedDepreciation: full179,
    });
    accumulatedDep = full179;
    remainingBasis = 0;
    currentYearDep = placedYear === currentYear ? full179 : 0;
  } else {
    // MACRS or Straight Line depreciation
    const rates = MACRS_200_DB_TABLES[recoveryYears] || MACRS_200_DB_TABLES[5];
    const totalPeriods = rates.length;

    let begBasis = remainingBasisForMacrs;
    let runningAccum = section179Claimed;

    for (let i = 0; i < totalPeriods; i++) {
      const yr = placedYear + i;
      const pct = rates[i] / 100;
      const regDep = Math.round(remainingBasisForMacrs * pct * 100) / 100;
      const sec179ThisYr = i === 0 ? section179Claimed : 0;
      const totalYrDep = regDep + sec179ThisYr;

      runningAccum += totalYrDep;
      const endBasis = Math.max(0, Math.round((businessBasis - runningAccum) * 100) / 100);

      yearByYear.push({
        year: yr,
        beginningBasis: begBasis,
        section179Deduction: sec179ThisYr,
        regularDepreciation: regDep,
        totalAnnualDepreciation: totalYrDep,
        endingBasis: endBasis,
        accumulatedDepreciation: Math.round(runningAccum * 100) / 100,
      });

      begBasis = endBasis;

      if (yr === currentYear) {
        currentYearDep = totalYrDep;
      }
    }

    accumulatedDep = yearByYear.reduce((sum, y) => (y.year <= currentYear ? sum + y.totalAnnualDepreciation : sum), 0);
    remainingBasis = Math.max(0, Math.round((businessBasis - accumulatedDep) * 100) / 100);
  }

  const scheduleCLine13Amount = currentYearDep;
  const form4562Part1Section179 = section179Claimed;

  return {
    assetId: asset.id,
    assetName: asset.assetName,
    costBasis: asset.costBasis,
    businessBasis,
    section179Claimed,
    currentYearDepreciation: currentYearDep,
    accumulatedDepreciation: accumulatedDep,
    remainingBasis,
    scheduleCLine13Amount,
    form4562Part1Section179,
    yearByYear,
  };
}
