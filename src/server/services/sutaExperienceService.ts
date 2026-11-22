/**
 * SUTA Experience Rating Service.
 * Manages company-specific state unemployment experience rates, DOL notices,
 * statutory bounds validation, and effective-dated rate resolution.
 */

import type { CompanyTaxSetting, SutaRateResolution } from '../../types';
import { resolveActiveRuleSync } from '../rules-engine/taxRulesEngine';
import { logInfo, logWarn } from '../../lib/logger';

export interface StatutorySutaInfo {
  rate: number;
  wageCap: number;
  ceilingRate?: number;
  floorRate?: number;
  ruleCode: string;
  jurisdictionCode: string;
}

export interface SutaValidationResult {
  valid: boolean;
  error?: string;
}

export interface SutaAuditEntryPayload {
  companyId: string;
  actorId: string;
  action: string;
  details: {
    jurisdiction: string;
    previousRatePercent: string | null;
    newRatePercent: string;
    noticeReference: string | null;
    effectiveFrom: string;
  };
}

/**
 * Converts basis points (integer) to decimal representation.
 * @param bps - Basis points (e.g. 4125 bps for 41.25%, or 413 bps for 4.13%)
 */
export function bpsToDecimal(bps: number): number {
  return Math.round(bps) / 10000;
}

/**
 * Converts decimal rate representation to basis points (integer).
 * @param decimal - Decimal rate (e.g. 0.04125 -> 413 bps)
 */
export function decimalToBps(decimal: number): number {
  return Math.round(decimal * 10000);
}

/**
 * Formats decimal rate as human-readable percentage string.
 * @param rate - Decimal rate (e.g. 0.04125 -> "4.125%")
 */
export function formatRatePercent(rate: number): string {
  return `${(rate * 100).toFixed(3)}%`;
}

/**
 * Maps state code to state jurisdiction and statutory SUTA rule code.
 * @param stateCode - Two-letter state code
 */
function mapStateToSutaRule(stateCode: string): { jurisCode: string; ruleCode: string } {
  const normState = stateCode.trim().toUpperCase();
  if (normState === 'PA') return { jurisCode: 'PA-STATE', ruleCode: 'PA_UC_EMPLOYER' };
  if (normState === 'NJ') return { jurisCode: 'NJ-STATE', ruleCode: 'NJ_SUI_EMPLOYER' };
  return { jurisCode: `${normState}-STATE`, ruleCode: `${normState}_SUTA_EMPLOYER` };
}

/**
 * Resolves statutory baseline SUTA rule from the active tax rule version.
 * @param stateCode - Two-letter state code (e.g. 'PA', 'NJ')
 * @param effectiveDate - Optional effective date for rule lookup
 */
export function getStatutorySutaRule(stateCode: string, effectiveDate?: Date): StatutorySutaInfo {
  const { jurisCode, ruleCode } = mapStateToSutaRule(stateCode);
  const rule = resolveActiveRuleSync(jurisCode, ruleCode, effectiveDate);
  const payload = rule.payload;

  if (payload.rate === undefined) {
    throw new Error(`Required SUTA rule [${ruleCode}] rate missing from Tax Rules Engine`);
  }

  return {
    rate: payload.rate,
    wageCap: payload.wageCap ?? 10000,
    ceilingRate: payload.statutoryCeiling ?? payload.maxRate ?? 0.15,
    floorRate: payload.statutoryFloor ?? payload.minRate ?? 0.0,
    ruleCode,
    jurisdictionCode: jurisCode,
  };
}

/**
 * Validates an assigned SUTA experience rate against non-negativity and statutory bounds.
 * @param rate - Proposed decimal experience rate (e.g. 0.04125)
 * @param statutoryBounds - Optional statutory ceiling and floor bounds
 */
export function validateSutaRateBounds(
  rate: number,
  statutoryBounds?: { ceilingRate?: number; floorRate?: number }
): SutaValidationResult {
  if (rate < 0) {
    return { valid: false, error: 'SUTA experience rate cannot be negative' };
  }

  const ceiling = statutoryBounds?.ceilingRate ?? 0.15;
  if (rate > ceiling) {
    return {
      valid: false,
      error: `SUTA rate ${formatRatePercent(rate)} exceeds state statutory ceiling of ${formatRatePercent(ceiling)}`,
    };
  }

  const floor = statutoryBounds?.floorRate ?? 0.0;
  if (rate < floor) {
    return {
      valid: false,
      error: `SUTA rate ${formatRatePercent(rate)} is below state statutory floor of ${formatRatePercent(floor)}`,
    };
  }

  return { valid: true };
}

/**
 * Resolves the effective SUTA rate for a company in a state at a given date.
 * If company has a valid assigned experience rate, returns ASSIGNED_EXPERIENCE_RATE.
 * Otherwise, falls back to the active statutory tax rule's STATUTORY_DEFAULT rate.
 * @param params - stateCode, optional companyTaxSettings, optional effectiveDate
 */
export function resolveSutaRate(params: {
  stateCode: string;
  companyTaxSettings?: CompanyTaxSetting[];
  effectiveDate?: Date;
}): SutaRateResolution {
  const normState = params.stateCode.trim().toUpperCase();
  const evalDate = params.effectiveDate ? new Date(params.effectiveDate) : new Date();
  const statutory = getStatutorySutaRule(normState, evalDate);

  const matchedSetting = params.companyTaxSettings?.find(
    (s) => s.jurisdiction.toUpperCase() === normState && s.taxKind === 'SUTA' && s.status === 'ACTIVE'
  );

  if (matchedSetting?.rateHistories && matchedSetting.rateHistories.length > 0) {
    const validHistory = matchedSetting.rateHistories
      .filter((h) => {
        if (h.status !== 'ACTIVE') return false;
        const fromDate = new Date(h.effectiveFrom);
        if (evalDate < fromDate) return false;
        if (h.effectiveTo) {
          const toDate = new Date(h.effectiveTo);
          if (evalDate > toDate) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];

    if (validHistory) {
      const activeRate = Number(validHistory.rateDecimal);
      const wageCap = validHistory.wageBaseOverride ? Number(validHistory.wageBaseOverride) : statutory.wageCap;
      logInfo('Resolved assigned SUTA experience rate', { state: normState, rate: activeRate });
      return {
        rate: activeRate,
        rateBps: validHistory.rateBps,
        source: 'ASSIGNED_EXPERIENCE_RATE',
        state: normState,
        wageCap,
        noticeReference: validHistory.noticeReference ?? null,
        settingId: matchedSetting.id,
        historyId: validHistory.id,
      };
    }
  }

  logInfo('Falling back to statutory default SUTA rate', { state: normState, rate: statutory.rate });
  return {
    rate: statutory.rate,
    rateBps: decimalToBps(statutory.rate),
    source: 'STATUTORY_DEFAULT',
    state: normState,
    wageCap: statutory.wageCap,
    noticeReference: null,
  };
}

/**
 * Creates structured audit log payload for SUTA experience rate mutations.
 * @param params - companyId, actorId, stateCode, oldRate, newRate, noticeReference, effectiveFrom
 */
export function createSutaAuditEntry(params: {
  companyId: string;
  actorId: string;
  stateCode: string;
  oldRate?: number;
  newRate: number;
  noticeReference?: string;
  effectiveFrom: string | Date;
}): SutaAuditEntryPayload {
  const fromStr =
    params.effectiveFrom instanceof Date
      ? params.effectiveFrom.toISOString().slice(0, 10)
      : String(params.effectiveFrom).slice(0, 10);

  return {
    companyId: params.companyId,
    actorId: params.actorId,
    action: 'UPDATE_SUTA_RATE',
    details: {
      jurisdiction: params.stateCode.trim().toUpperCase(),
      previousRatePercent: params.oldRate !== undefined ? formatRatePercent(params.oldRate) : null,
      newRatePercent: formatRatePercent(params.newRate),
      noticeReference: params.noticeReference ?? null,
      effectiveFrom: fromStr,
    },
  };
}
