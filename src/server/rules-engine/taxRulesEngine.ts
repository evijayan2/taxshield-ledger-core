import { RuleType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logWarn } from '../../lib/logger';
import { allTaxRuleFixtures } from '../../../prisma/fixtures/index';

export interface TaxRulePayload {
  rate?: number;
  ratePerMile?: number;
  wageCap?: number;
  standardAllowances?: Record<string, number>;
  brackets?: Record<string, Array<{ max: number | null; rate: number; baseTax: number; over: number }>>;
}

export interface ResolvedRule {
  versionId: string;
  ruleCode: string;
  ruleType: RuleType;
  payload: TaxRulePayload;
}

/**
 * Dynamically builds initial in-memory cache of active rules from external JSON seed fixture.
 */
function buildInitialCache(): Record<string, ResolvedRule> {
  const cache: Record<string, ResolvedRule> = {};
  for (const r of allTaxRuleFixtures.rules) {
    cache[r.ruleCode] = {
      versionId: `${r.ruleCode.toLowerCase()}_v${r.version.versionNumber}`,
      ruleCode: r.ruleCode,
      ruleType: r.version.ruleType as RuleType,
      payload: r.version.ruleData as unknown as TaxRulePayload,
    };
  }
  return cache;
}

const ACTIVE_RULE_CACHE: Record<string, ResolvedRule> = buildInitialCache();

/**
 * Refreshes or updates the in-memory active rule cache.
 */
export function refreshActiveRuleCache(updatedRules?: Record<string, ResolvedRule>): void {
  if (updatedRules) {
    Object.assign(ACTIVE_RULE_CACHE, updatedRules);
  } else {
    const fresh = buildInitialCache();
    for (const key of Object.keys(ACTIVE_RULE_CACHE)) {
      delete ACTIVE_RULE_CACHE[key];
    }
    Object.assign(ACTIVE_RULE_CACHE, fresh);
  }
}

/**
 * Synchronously resolves an active tax rule version from the cache/registry.
 */
export function resolveActiveRuleSync(jurisdictionCode: string, ruleCode: string): ResolvedRule {
  const cached = ACTIVE_RULE_CACHE[ruleCode];
  if (cached) {
    return cached;
  }
  throw new Error(`No active rule cached for jurisdiction=${jurisdictionCode}, code=${ruleCode}`);
}

/**
 * Asynchronously resolves active tax rule from database and updates cache.
 */
export async function resolveActiveRule(
  jurisdictionCode: string,
  ruleCode: string,
  effectiveDate: Date = new Date()
): Promise<ResolvedRule> {
  try {
    const version = await prisma.taxRuleVersion.findFirst({
      where: {
        status: 'ACTIVE',
        effectiveStart: { lte: effectiveDate },
        OR: [{ effectiveEnd: null }, { effectiveEnd: { gte: effectiveDate } }],
        rule: {
          ruleCode,
          jurisdiction: { code: jurisdictionCode },
        },
      },
      include: { rule: true },
      orderBy: { versionNumber: 'desc' },
    });

    if (version) {
      const resolved: ResolvedRule = {
        versionId: version.id,
        ruleCode: version.rule.ruleCode,
        ruleType: version.ruleType,
        payload: version.ruleData as unknown as TaxRulePayload,
      };
      ACTIVE_RULE_CACHE[ruleCode] = resolved;
      return resolved;
    }
  } catch (error) {
    logWarn('Database lookup failed, returning cached rule version', { jurisdictionCode, ruleCode });
  }

  return resolveActiveRuleSync(jurisdictionCode, ruleCode);
}

/**
 * Computes Federal Income Tax withholding based on active rule version payload.
 */
export function computeFederalWithholdingFromRule(
  annualizedGross: number,
  w4Status: string,
  rule: ResolvedRule
): number {
  const payload = rule.payload;
  const allowance = payload.standardAllowances?.[w4Status] ?? 0;
  const taxableAnnual = Math.max(0, annualizedGross - allowance);
  if (taxableAnnual <= 0) return 0;

  const bracketList: any[] | undefined = payload.brackets?.[w4Status] ?? (Array.isArray(payload.brackets) ? payload.brackets : undefined);
  if (!bracketList || bracketList.length === 0) {
    throw new Error(`No tax brackets found for W-4 filing status [${w4Status}] in tax rule [${rule.ruleCode}].`);
  }
  for (const b of bracketList) {
    const maxVal = b.max ?? b.incomeTo ?? null;
    const overVal = b.over ?? b.incomeFrom ?? 0;
    const rateVal = b.rate ?? b.marginalRate ?? 0;
    if (maxVal === null || taxableAnnual <= maxVal) {
      return (b.baseTax || 0) + (taxableAnnual - overVal) * rateVal;
    }
  }
  return 0;
}

/**
 * Saves a CalculationSnapshot record to preserve calculation provenance.
 */
export async function createCalculationSnapshot(
  calculationType: string,
  entityId: string,
  ruleVersionIds: string[],
  snapshotData: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.calculationSnapshot.create({
      data: {
        calculationType,
        entityId,
        ruleVersionIds: JSON.parse(JSON.stringify(ruleVersionIds)),
        snapshotData: JSON.parse(JSON.stringify(snapshotData)),
      },
    });
  } catch (err) {
    logWarn('Could not save calculation snapshot to database', { calculationType, entityId });
  }
}
