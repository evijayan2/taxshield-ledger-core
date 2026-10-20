import { Employee, EmployeeResidenceHistory, EmployeeWorkLocationHistory, JurisdictionResolution, ResolvedJurisdiction } from '../../types';
import { findDistrictByPsdCode } from '../../utils/paSchoolDistricts';

/**
 * State Reciprocity Map (statutory reciprocal tax agreements).
 * E.g., PA resident working in NJ is exempt from NJ state income tax (holds NJ Form NJ-165)
 * and pays PA state income tax.
 */
const RECIPROCITY_AGREEMENTS: Record<string, string[]> = {
  PA: ['NJ', 'IN', 'MD', 'OH', 'VA', 'WV'],
  NJ: ['PA'],
  OH: ['IN', 'KY', 'MI', 'PA', 'WV'],
};

/**
 * Resolve effective work location history entry for a given date.
 */
export function resolveEffectiveWorkLocation(
  employee: Employee,
  workHistories: EmployeeWorkLocationHistory[] = [],
  asOfDate: string
): { state: string; psdCode?: string; localJurisdictionName?: string; workEitRate?: number } {
  if (workHistories.length > 0) {
    const sorted = [...workHistories].sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
    const activeEntry = sorted.find((h) => {
      const startOk = h.effectiveDate <= asOfDate;
      const endOk = !h.endDate || h.endDate >= asOfDate;
      return startOk && endOk;
    });
    if (activeEntry) {
      return {
        state: activeEntry.state.toUpperCase(),
        psdCode: activeEntry.psdCode || undefined,
        localJurisdictionName: activeEntry.localJurisdictionName || undefined,
        workEitRate: activeEntry.workEitRate || undefined,
      };
    }
  }

  const workState = (employee.workState || employee.state || 'PA').toUpperCase();
  return {
    state: workState,
    psdCode: employee.paWorkPsdCode || employee.paPsdCode || undefined,
    localJurisdictionName: employee.localTaxJurisdictionName || undefined,
    workEitRate: employee.paWorkEitRate || employee.localTaxRate || undefined,
  };
}

/**
 * Core Jurisdiction Resolver for multi-state work arrangements.
 * Accepts employee residence history, work location history, and pay period range.
 * Determines all applicable statutory withholding jurisdictions and reciprocal exemptions.
 */
export function resolveEmployeeJurisdictions(
  employee: Employee,
  residenceHistories: EmployeeResidenceHistory[] = [],
  workHistories: EmployeeWorkLocationHistory[] = [],
  periodStart: string,
  periodEnd: string
): JurisdictionResolution {
  const asOfDate = periodEnd || periodStart || new Date().toISOString().split('T')[0];

  // 1. Determine Residence Location as of period date
  const sortedResidence = [...residenceHistories].sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
  const activeResidence = sortedResidence.find((h) => h.effectiveDate <= asOfDate && (!h.endDate || h.endDate >= asOfDate));
  const residenceState = (activeResidence?.state || employee.state || 'PA').toUpperCase();
  const residencePsdCode = activeResidence?.psdCode || employee.paPsdCode || undefined;

  // 2. Determine Work Location as of period date
  const activeWork = resolveEffectiveWorkLocation(employee, workHistories, asOfDate);
  const workState = activeWork.state;
  const workPsdCode = activeWork.psdCode;

  const resolvedJurisdictions: ResolvedJurisdiction[] = [];

  // 3. Federal Jurisdiction (FIT, Social Security, Medicare)
  resolvedJurisdictions.push({
    code: 'US-FED-FIT',
    name: 'Federal Income Tax Withholding',
    level: 'FEDERAL',
    taxType: 'FIT',
  });
  resolvedJurisdictions.push({
    code: 'US-FED-SS',
    name: 'Social Security (FICA)',
    level: 'FEDERAL',
    taxType: 'FICA_SS',
  });
  resolvedJurisdictions.push({
    code: 'US-FED-MED',
    name: 'Medicare (FICA)',
    level: 'FEDERAL',
    taxType: 'FICA_MED',
  });

  // 4. State Income Tax (SIT) & Reciprocity Resolution
  const isReciprocal =
    residenceState !== workState &&
    RECIPROCITY_AGREEMENTS[residenceState] &&
    RECIPROCITY_AGREEMENTS[residenceState].includes(workState);

  if (isReciprocal) {
    // Residence state gets primary SIT withholding due to reciprocal agreement
    resolvedJurisdictions.push({
      code: `${residenceState}-STATE-SIT`,
      name: `${residenceState} State Personal Income Tax (Reciprocal Residence)`,
      level: 'STATE',
      taxType: 'SIT',
      state: residenceState,
      isReciprocalExempt: false,
    });
    // Work state SIT is exempt
    resolvedJurisdictions.push({
      code: `${workState}-STATE-SIT`,
      name: `${workState} State Personal Income Tax (Exempt via Reciprocity)`,
      level: 'STATE',
      taxType: 'SIT',
      state: workState,
      isReciprocalExempt: true,
      reciprocalExemptionReason: `Reciprocal agreement between ${residenceState} and ${workState}`,
    });
  } else {
    // Standard work state SIT withholding (or residence state if work state is non-SIT like FL/TX)
    resolvedJurisdictions.push({
      code: `${workState}-STATE-SIT`,
      name: `${workState} State Personal Income Tax`,
      level: 'STATE',
      taxType: 'SIT',
      state: workState,
      isReciprocalExempt: false,
    });

    if (residenceState !== workState && (workState === 'FL' || workState === 'TX')) {
      resolvedJurisdictions.push({
        code: `${residenceState}-STATE-SIT`,
        name: `${residenceState} State Personal Income Tax (Resident Withholding)`,
        level: 'STATE',
        taxType: 'SIT',
        state: residenceState,
        isReciprocalExempt: false,
      });
    }
  }

  // 5. State Unemployment Insurance (SUTA / SUI) - always based on work state location
  resolvedJurisdictions.push({
    code: `${workState}-STATE-SUTA`,
    name: `${workState} State Unemployment Insurance (SUTA)`,
    level: 'STATE',
    taxType: 'SUTA',
    state: workState,
  });

  // 6. Local Earned Income Tax (EIT) & Local Services Tax (LST)
  if (workState === 'PA' || residenceState === 'PA') {
    const paPsd = workPsdCode || residencePsdCode || '510101'; // Default Philadelphia / Downingtown area PSD
    const districtMatch = findDistrictByPsdCode(paPsd);
    const localityName = districtMatch ? districtMatch.name : activeWork.localJurisdictionName || 'PA Local PSD';

    resolvedJurisdictions.push({
      code: `PA-LOCAL-EIT-${paPsd}`,
      name: `PA Local Earned Income Tax (${localityName})`,
      level: 'LOCAL',
      taxType: 'LOCAL_EIT',
      state: 'PA',
      localityCode: paPsd,
      localityName,
      rate: activeWork.workEitRate || districtMatch?.defaultEitRate || 0.01,
    });

    resolvedJurisdictions.push({
      code: `PA-LOCAL-LST-${paPsd}`,
      name: `PA Local Services Tax (${localityName})`,
      level: 'LOCAL',
      taxType: 'LOCAL_LST',
      state: 'PA',
      localityCode: paPsd,
      localityName,
      annualFlatAmount: 52.0,
    });
  } else if (workState === 'DE') {
    resolvedJurisdictions.push({
      code: 'DE-LOCAL-WILMINGTON',
      name: 'Wilmington Delaware City Wage Tax',
      level: 'LOCAL',
      taxType: 'LOCAL_EIT',
      state: 'DE',
      localityCode: 'DE-LOCAL-WILMINGTON',
      localityName: 'City of Wilmington',
      rate: 0.0125,
    });
  }

  return {
    employeeId: employee.id,
    residenceState,
    workState,
    residencePsdCode,
    workPsdCode,
    periodStart,
    periodEnd,
    resolvedJurisdictions,
  };
}
