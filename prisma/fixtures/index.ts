import federalRules from './tax-rules.json';
import deRules from './states/de.json';
import paRules from './states/pa.json';
import njRules from './states/nj.json';
import nyRules from './states/ny.json';
import ohRules from './states/oh.json';
import flRules from './states/fl.json';
import txRules from './states/tx.json';

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
 * Combines federal tax rules and all state-specific tax rule fixtures.
 */
export function getAllTaxRuleFixtures(): TaxRulesBundle {
  const stateBundles: any[] = [
    deRules,
    paRules,
    njRules,
    nyRules,
    ohRules,
    flRules,
    txRules,
  ];

  const jurisdictions: TaxJurisdictionFixture[] = [
    ...(federalRules.jurisdictions as TaxJurisdictionFixture[]),
    ...stateBundles.flatMap((s) => s.jurisdictions as TaxJurisdictionFixture[]),
  ];

  const rules: TaxRuleFixture[] = [
    ...(federalRules.rules as unknown as TaxRuleFixture[]),
    ...stateBundles.flatMap((s) => s.rules as unknown as TaxRuleFixture[]),
  ];

  return { jurisdictions, rules };
}

export const allTaxRuleFixtures = getAllTaxRuleFixtures();
