import { describe, it, expect } from 'vitest';
import { calculateAssetDepreciationSchedule } from './depreciationService';
import { CapitalAsset } from '../../types';

describe('Asset Depreciation Service', () => {
  const asset5Yr: CapitalAsset = {
    id: 'ast-101',
    companyId: 'comp-101',
    assetName: 'MacBook Pro & Workstation Equipment',
    category: 'COMPUTERS_SOFTWARE',
    datePlacedInService: '2026-01-15',
    costBasis: 5000,
    businessUsePercent: 100,
    depreciationMethod: 'MACRS_200_DB',
    recoveryPeriodYears: 5,
    section179Claimed: 0,
    priorDepreciation: 0,
  };

  it('should calculate MACRS 5-year 200% DB schedule with Year 1 20% depreciation', () => {
    const sched = calculateAssetDepreciationSchedule(asset5Yr, 2026);

    expect(sched.costBasis).toBe(5000);
    expect(sched.businessBasis).toBe(5000);
    expect(sched.currentYearDepreciation).toBe(1000); // 20% of 5000
    expect(sched.scheduleCLine13Amount).toBe(1000);
    expect(sched.remainingBasis).toBe(4000);
    expect(sched.yearByYear.length).toBe(6);
  });

  it('should calculate Section 179 full immediate deduction', () => {
    const asset179: CapitalAsset = {
      ...asset5Yr,
      depreciationMethod: 'SECTION_179',
      section179Claimed: 5000,
    };

    const sched = calculateAssetDepreciationSchedule(asset179, 2026);

    expect(sched.currentYearDepreciation).toBe(5000);
    expect(sched.remainingBasis).toBe(0);
    expect(sched.form4562Part1Section179).toBe(5000);
  });
});
