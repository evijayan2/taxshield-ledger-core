import fedPack from './US-FED-2026.taxpack.json';
import paStatePack from './PA-STATE-2026.taxpack.json';
import paLocalPack from './PA-LOCAL-2026.taxpack.json';
import deStatePack from './DE-STATE-2026.taxpack.json';
import txStatePack from './TX-STATE-2026.taxpack.json';
import njStatePack from './NJ-STATE-2026.taxpack.json';
import nyStatePack from './NY-STATE-2026.taxpack.json';
import ohStatePack from './OH-STATE-2026.taxpack.json';
import flStatePack from './FL-STATE-2026.taxpack.json';

export interface TaxJurisdictionFixture {
  code: string;
  name: string;
  level: string;
  state: string | null;
}

export interface TaxRuleVersionFixture {
  versionNumber: number;
  status: string;
  ruleType: string;
  ruleData: Record<string, unknown>;
  sourceTitle: string;
  sourceUrl: string;
  sourcePublisher: string;
  statuteReference: string;
  citationTier: string;
  effectiveStart: string;
}

export interface TaxRuleFixture {
  jurisdictionCode: string;
  ruleCode: string;
  name: string;
  category: string;
  description: string;
  version: TaxRuleVersionFixture;
}

export interface TaxRulesBundle {
  jurisdictions: TaxJurisdictionFixture[];
  rules: TaxRuleFixture[];
}

/**
 * Extracts jurisdictions and rules exclusively from a compiled .taxpack.json package.
 */
function extractFromTaxpack(taxpack: any): TaxRulesBundle {
  const jurisdictions: TaxJurisdictionFixture[] = (taxpack.jurisdictions || []).map((j: any) => ({
    code: j.code,
    name: j.name,
    level: j.level,
    state: j.state || null,
  }));

  const rules: TaxRuleFixture[] = [];
  for (const r of taxpack.rules || []) {
    const v = r.versions?.[0];
    if (!v) continue;
    const citation = v.citations?.[0] || {};
    rules.push({
      jurisdictionCode: r.jurisdictionCode,
      ruleCode: r.ruleCode,
      name: r.name,
      category: r.category,
      description: r.description || '',
      version: {
        versionNumber: v.versionNumber || 1,
        status: v.status || 'ACTIVE',
        ruleType: v.ruleType || 'FLAT_RATE',
        ruleData: v.ruleData || {},
        sourceTitle: citation.title || 'Official Citation',
        sourceUrl: citation.sourceUrl || 'https://www.irs.gov',
        sourcePublisher: citation.authority || 'GOVERNMENT_AUTHORITY',
        statuteReference: citation.statuteReference || 'Statutory Authority',
        citationTier: citation.citationTier || 'TIER_1_OFFICIAL',
        effectiveStart: v.effectiveFrom || '2026-01-01T00:00:00.000Z',
      },
    });
  }

  return { jurisdictions, rules };
}

/**
 * Combines all tax rule packages sealed by the packaging engine.
 */
export function getAllTaxRuleFixtures(): TaxRulesBundle {
  const taxpacks = [
    fedPack,
    paStatePack,
    paLocalPack,
    deStatePack,
    txStatePack,
    njStatePack,
    nyStatePack,
    ohStatePack,
    flStatePack,
  ];
  const packBundles = taxpacks.map(extractFromTaxpack);

  const jurisdictions: TaxJurisdictionFixture[] = packBundles.flatMap((b) => b.jurisdictions);
  const rules: TaxRuleFixture[] = packBundles.flatMap((b) => b.rules);

  // Deduplicate by jurisdictionCode:ruleCode
  const uniqueRulesMap = new Map<string, TaxRuleFixture>();
  for (const r of rules) {
    const key = `${r.jurisdictionCode}:${r.ruleCode}`;
    if (!uniqueRulesMap.has(key)) {
      uniqueRulesMap.set(key, r);
    }
  }

  const uniqueJurisdictionsMap = new Map<string, TaxJurisdictionFixture>();
  for (const j of jurisdictions) {
    if (!uniqueJurisdictionsMap.has(j.code)) {
      uniqueJurisdictionsMap.set(j.code, j);
    }
  }

  return {
    jurisdictions: Array.from(uniqueJurisdictionsMap.values()),
    rules: Array.from(uniqueRulesMap.values()),
  };
}

export const allTaxRuleFixtures = getAllTaxRuleFixtures();
