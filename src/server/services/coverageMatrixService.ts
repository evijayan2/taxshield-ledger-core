import { Company, Employee, CoverageMatrixItem, TaxRuleCoverageReport } from '../../types';
import { allTaxRuleFixtures } from '../../../prisma/fixtures/index';

/**
 * Generate a full Tax Rule Coverage Matrix report for a given company and tax year.
 * Evaluates active employees, company address history, and determines fail-closed readiness.
 */
export function generateTaxRuleCoverageReport(
  company: Company,
  employees: Employee[],
  taxYear: number = new Date().getFullYear()
): TaxRuleCoverageReport {
  const activeEmployees = employees.filter((e) => e.isActive !== false);

  const requiredMap = new Map<string, { jurisdictionCode: string; jurisdictionName: string; level: 'FEDERAL' | 'STATE' | 'LOCAL'; ruleCode: string; ruleCategory: string; count: number }>();

  const addRequired = (code: string, name: string, level: 'FEDERAL' | 'STATE' | 'LOCAL', ruleCode: string, category: string) => {
    const key = `${code}:${ruleCode}`;
    const existing = requiredMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      requiredMap.set(key, { jurisdictionCode: code, jurisdictionName: name, level, ruleCode, ruleCategory: category, count: 1 });
    }
  };

  // Standard Federal Requirements for all companies
  addRequired('US-FED', 'United States Federal Government', 'FEDERAL', 'FED_FIT_WITHHOLDING', 'WITHHOLDING');
  addRequired('US-FED', 'United States Federal Government', 'FEDERAL', 'FED_FICA_SS', 'FICA_SOCIAL_SECURITY');
  addRequired('US-FED', 'United States Federal Government', 'FEDERAL', 'FED_FICA_MEDICARE', 'FICA_MEDICARE');

  // Company Work State & Address Requirements
  const companyState = (company.state || 'PA').toUpperCase();
  if (companyState === 'PA') {
    addRequired('PA-STATE', 'Pennsylvania Department of Revenue', 'STATE', 'PA_SIT_RATE', 'INCOME_TAX');
    addRequired('PA-STATE', 'Pennsylvania Department of Labor & Industry', 'STATE', 'PA_UC_EMPLOYER', 'UNEMPLOYMENT_TAX');
  }

  // Employee Roster Location Requirements
  for (const emp of activeEmployees) {
    const resState = (emp.state || companyState).toUpperCase();
    const wrkState = (emp.workState || emp.state || companyState).toUpperCase();

    // State SIT/SUTA requirements
    if (wrkState === 'DE') {
      addRequired('DE-STATE', 'Delaware Division of Revenue', 'STATE', 'DE_SIT_BRACKETS', 'INCOME_TAX');
      addRequired('DE-STATE', 'Delaware Department of Labor', 'STATE', 'DE_SUTA_EMPLOYER', 'UNEMPLOYMENT_TAX');
      addRequired('DE-LOCAL-WILMINGTON', 'Wilmington Delaware Local Tax', 'LOCAL', 'DE_WILMINGTON_EIT', 'LOCAL_EIT');
    } else if (wrkState === 'NJ') {
      addRequired('NJ-STATE', 'New Jersey Division of Taxation', 'STATE', 'NJ_SIT_BRACKETS', 'INCOME_TAX');
      addRequired('NJ-STATE', 'New Jersey Department of Labor', 'STATE', 'NJ_SUI_EMPLOYER', 'UNEMPLOYMENT_TAX');
    } else if (wrkState === 'NY') {
      addRequired('NY-STATE', 'New York State Department of Taxation', 'STATE', 'NY_SIT_BRACKETS', 'INCOME_TAX');
      addRequired('NY-STATE', 'New York State Department of Labor', 'STATE', 'NY_SUTA_EMPLOYER', 'UNEMPLOYMENT_TAX');
    } else if (wrkState === 'OH') {
      addRequired('OH-STATE', 'Ohio Department of Taxation', 'STATE', 'OH_SIT_BRACKETS', 'INCOME_TAX');
      addRequired('OH-STATE', 'Ohio Department of Job and Family Services', 'STATE', 'OH_SUTA_EMPLOYER', 'UNEMPLOYMENT_TAX');
    } else if (wrkState === 'FL') {
      addRequired('FL-STATE', 'Florida Department of Revenue', 'STATE', 'FL_SUTA_EMPLOYER', 'UNEMPLOYMENT_TAX');
    } else if (wrkState === 'TX') {
      addRequired('TX-STATE', 'Texas Workforce Commission', 'STATE', 'TX_SUTA_EMPLOYER', 'UNEMPLOYMENT_TAX');
    } else if (wrkState === 'PA') {
      addRequired('PA-STATE', 'Pennsylvania Department of Revenue', 'STATE', 'PA_SIT_RATE', 'INCOME_TAX');
      addRequired('PA-STATE', 'Pennsylvania Department of Labor & Industry', 'STATE', 'PA_UC_EMPLOYER', 'UNEMPLOYMENT_TAX');
    } else {
      addRequired(`${wrkState}-STATE`, `${wrkState} State Department of Revenue`, 'STATE', `${wrkState}_SIT_RATE`, 'INCOME_TAX');
    }

    if (resState === 'PA' && wrkState !== 'PA') {
      addRequired('PA-STATE', 'Pennsylvania Department of Revenue', 'STATE', 'PA_SIT_RATE', 'INCOME_TAX');
    }

    // PA Local EIT / LST requirements
    const psdCode = emp.localTaxJurisdictionCode?.replace('PA-PSD-', '') || emp.paWorkPsdCode || emp.paPsdCode;
    if ((wrkState === 'PA' || resState === 'PA') && psdCode) {
      addRequired('PA-LOCAL', `PA Local EIT (PSD ${psdCode})`, 'LOCAL', `PA_LOCAL_EIT_${psdCode}`, 'LOCAL_EIT');
      addRequired('PA-LOCAL', `PA Local LST (PSD ${psdCode})`, 'LOCAL', `PA_LOCAL_LST_${psdCode}`, 'LOCAL_LST');
    }
  }

  const fixtureRuleMap = new Map<string, typeof allTaxRuleFixtures.rules[0]>();
  for (const r of allTaxRuleFixtures.rules) {
    fixtureRuleMap.set(`${r.jurisdictionCode}:${r.ruleCode}`, r);
    fixtureRuleMap.set(r.ruleCode, r);
  }

  const items: CoverageMatrixItem[] = [];
  let activeCount = 0;
  let pendingCount = 0;
  let missingCount = 0;
  const blockingJurisdictions: string[] = [];

  for (const req of Array.from(requiredMap.values())) {
    const key = `${req.jurisdictionCode}:${req.ruleCode}`;
    const fixture = fixtureRuleMap.get(key) ||
      fixtureRuleMap.get(req.ruleCode) ||
      allTaxRuleFixtures.rules.find(r => r.ruleCode === req.ruleCode) ||
      (req.ruleCode.startsWith('PA_LOCAL_LST_') ? fixtureRuleMap.get(`PA_LOCAL_EIT_${req.ruleCode.replace('PA_LOCAL_LST_', '')}`) : undefined);

    if (fixture) {
      const rawStatus = fixture.version.status;
      const status: CoverageMatrixItem['status'] = (rawStatus === 'PUBLISHED' || rawStatus === 'ACTIVE') ? 'ACTIVE' : (rawStatus as any);
      const tier = fixture.version.citationTier as CoverageMatrixItem['citationTier'];
      const isBlocked = status !== 'ACTIVE';

      items.push({
        jurisdictionCode: req.jurisdictionCode,
        jurisdictionName: req.jurisdictionName,
        level: req.level,
        ruleCode: req.ruleCode,
        ruleCategory: req.ruleCategory,
        requiredForRosterCount: req.count,
        status,
        activeVersionNumber: fixture.version.versionNumber,
        citationTier: tier,
        effectiveStart: fixture.version.effectiveStart,
        effectiveEnd: (fixture.version as any).effectiveEnd || null,
        blocksPayroll: isBlocked,
      });

      if (status === 'ACTIVE') {
        activeCount++;
      } else {
        pendingCount++;
        if (!blockingJurisdictions.includes(req.jurisdictionCode)) {
          blockingJurisdictions.push(req.jurisdictionCode);
        }
      }
    } else {
      missingCount++;
      items.push({
        jurisdictionCode: req.jurisdictionCode,
        jurisdictionName: req.jurisdictionName,
        level: req.level,
        ruleCode: req.ruleCode,
        ruleCategory: req.ruleCategory,
        requiredForRosterCount: req.count,
        status: 'MISSING',
        blocksPayroll: true,
        issueReason: `No TaxRuleVersion package registered for rule [${req.ruleCode}] in [${req.jurisdictionCode}]`,
      });
      if (!blockingJurisdictions.includes(req.jurisdictionCode)) {
        blockingJurisdictions.push(req.jurisdictionCode);
      }
    }
  }

  const total = items.length;
  const readinessPercentage = total > 0 ? Math.round((activeCount / total) * 100) : 100;
  const isPayrollBlocked = blockingJurisdictions.length > 0;

  return {
    companyId: company.id,
    taxYear,
    generatedAt: new Date().toISOString(),
    readinessPercentage,
    totalRequiredJurisdictions: total,
    activeCount,
    pendingCount,
    missingCount,
    isPayrollBlocked,
    blockingJurisdictions,
    items,
  };
}
