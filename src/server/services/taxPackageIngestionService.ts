import { createHash } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { recordAuditLog } from '../../lib/audit';
import { logInfo, logWarn, logError } from '../../lib/logger';
import { stringifyCanonicalJson } from './canonicalJson';
import { refreshActiveRuleCache } from '../rules-engine/taxRulesEngine';

export interface IRemotePackageCatalogItem {
  packageCode: string;
  name: string;
  version: string;
  jurisdictionCode: string;
  manifestChecksum: string;
  ruleCount: number;
  sizeBytes: number;
  fileName: string;
  downloadUrl: string;
  generatedAt: string;
}

export interface IIngestionResult {
  success: boolean;
  packageCode: string;
  jurisdictionCode: string;
  rulesIngested: number;
  versionsCreated: number;
  manifestChecksum: string;
  testCasesEvaluated?: number;
  error?: string;
}

export interface IBatchIngestionResult {
  success: boolean;
  totalPackages: number;
  ingestedPackages: number;
  totalRules: number;
  totalVersions: number;
  results: IIngestionResult[];
  timestamp: string;
  error?: string;
}

export interface IIngestionOptions {
  companyId?: string;
  actorId: string;
  activateImmediately?: boolean;
  dryRun?: boolean;
}

/**
 * Normalizes base server URL by trimming trailing slashes.
 */
function normalizeServerUrl(url?: string): string {
  const base = url || process.env.TAX_PACKAGE_SERVER_URL || 'http://localhost:3333';
  return base.replace(/\/+$/, '');
}

/**
 * Computes a SHA-256 hash string prefixed with sha256:.
 * @param content - UTF-8 string to hash
 * @returns Prefixed hex hash string
 */
export function computeSha256(content: string): string {
  const hash = createHash('sha256').update(content, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Computes canonical SHA-256 checksum for a tax rule version payload.
 * @param version - The tax rule version object
 * @returns Canonical checksum string
 */
export function computeVersionChecksum(version: any): string {
  const canonicalPayload = {
    versionCode: version.versionCode,
    versionNumber: version.versionNumber,
    ruleType: version.ruleType,
    ruleData: version.ruleData,
    effectiveFrom: version.effectiveFrom,
    effectiveTo: version.effectiveTo ?? null,
    citations: version.citations,
  };
  return computeSha256(stringifyCanonicalJson(canonicalPayload));
}

/**
 * Computes canonical composite manifest checksum for an entire TaxRulePackage.
 * @param pkg - The package object
 * @returns Canonical SHA-256 manifest checksum
 */
export function computePackageChecksum(pkg: any): string {
  const canonicalPayload = {
    packageCode: pkg.packageCode,
    version: pkg.version,
    jurisdictionCode: pkg.jurisdictionCode,
    jurisdictions: pkg.jurisdictions,
    rules: (pkg.rules || []).map((r: any) => ({
      ruleCode: r.ruleCode,
      taxType: r.taxType,
      category: r.category,
      jurisdictionCode: r.jurisdictionCode,
      versions: (r.versions || []).map((v: any) => ({
        versionCode: v.versionCode,
        checksum: v.checksum ?? computeVersionChecksum(v),
      })),
    })),
  };
  return computeSha256(stringifyCanonicalJson(canonicalPayload));
}

/**
 * Verifies that a package matches its manifest checksum.
 * @param pkg - The package object to verify
 * @returns True if manifest matches computed hash
 */
export function verifyPackageChecksum(pkg: any): boolean {
  if (!pkg.manifestChecksum) return false;
  const expected = computePackageChecksum(pkg);
  return pkg.manifestChecksum === expected;
}

/**
 * Evaluates flat-rate tax calculation test case.
 */
function evaluateFlatRateTest(version: any, input: Record<string, unknown>): number {
  const gross = Number(input.grossWages ?? 0);
  const prior = Number(input.priorCumulativeWages ?? 0);
  const rate = Number(version.ruleData?.rate ?? 0);
  const wageCap = version.ruleData?.wageCap ? Number(version.ruleData.wageCap) : undefined;

  let taxable = gross;
  if (wageCap !== undefined) {
    const remainingCap = Math.max(0, wageCap - prior);
    taxable = Math.min(gross, remainingCap);
  }
  return Math.round((taxable * rate + Number.EPSILON) * 100) / 100;
}

/**
 * Evaluates progressive tax bracket calculation test case.
 */
function evaluateBracketTest(version: any, input: Record<string, unknown>): number {
  const gross = Number(input.grossWages ?? 0);
  const status = String(input.filingStatus ?? 'SINGLE');
  const rawBrackets = version.ruleData?.brackets;

  const bracketList: any[] = Array.isArray(rawBrackets)
    ? rawBrackets.filter((b: any) => !b.filingStatus || b.filingStatus === status)
    : rawBrackets && typeof rawBrackets === 'object'
    ? (rawBrackets[status] as any[]) ?? (rawBrackets['SINGLE'] as any[]) ?? []
    : [];

  const matched = [...bracketList].sort((a, b) => {
    if (a.bracketSequence !== undefined && b.bracketSequence !== undefined) {
      return a.bracketSequence - b.bracketSequence;
    }
    const aFrom = a.incomeFrom ?? a.over ?? 0;
    const bFrom = b.incomeFrom ?? b.over ?? 0;
    return aFrom - bFrom;
  });

  let taxAmount = 0;
  for (const b of matched) {
    const low = b.incomeFrom ?? b.over ?? 0;
    const high = b.incomeTo ?? b.max ?? null;
    const base = b.baseTax ?? 0;
    const rate = b.marginalRate ?? b.rate ?? 0;

    if (gross > low) {
      const top = high !== null && high !== undefined ? high : gross;
      const taxable = Math.min(gross - low, top - low);
      taxAmount = Math.round((base + taxable * rate + Number.EPSILON) * 100) / 100;
    }
  }
  return taxAmount;
}

/**
 * Evaluates a single rule version's test case.
 */
function evaluateSingleTestCase(version: any, tc: any): { pass: boolean; reason?: string } {
  let computedAmount = 0;
  if (version.ruleType === 'BRACKET_PERCENTAGE') {
    computedAmount = evaluateBracketTest(version, tc.inputPayload || {});
  } else {
    computedAmount = evaluateFlatRateTest(version, tc.inputPayload || {});
  }

  const expectedAmount = tc.expectedOutput?.taxAmount;
  if (expectedAmount !== undefined && Math.abs(computedAmount - Number(expectedAmount)) > 0.01) {
    return {
      pass: false,
      reason: `Test ${tc.id}: Expected ${expectedAmount}, computed ${computedAmount}`,
    };
  }
  return { pass: true };
}

/**
 * Evaluates all embedded golden test cases in a package.
 * @param pkg - The package object containing rules and versions
 * @returns Verification result summary
 */
export function evaluatePackageTestCases(
  pkg: any
): { passed: boolean; totalTested: number; errors: string[] } {
  const errors: string[] = [];
  let totalTested = 0;

  for (const rule of pkg.rules || []) {
    for (const ver of rule.versions || []) {
      for (const tc of ver.testCases || []) {
        totalTested++;
        const res = evaluateSingleTestCase(ver, tc);
        if (!res.pass && res.reason) {
          errors.push(res.reason);
        }
      }
    }
  }

  return { passed: errors.length === 0, totalTested, errors };
}

/**
 * Fetches the available sealed packages catalog from package server.
 * @param serverUrl - Optional base URL of package distribution server
 * @returns Remote package catalog or error message
 */
export async function fetchRemotePackageCatalog(
  serverUrl?: string
): Promise<{ success: boolean; packages: IRemotePackageCatalogItem[]; error?: string }> {
  const targetUrl = `${normalizeServerUrl(serverUrl)}/packages`;
  try {
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { success: false, packages: [], error: `HTTP ${res.status}: ${res.statusText}` };
    }
    const data = (await res.json()) as { packages?: IRemotePackageCatalogItem[] };
    return { success: true, packages: Array.isArray(data.packages) ? data.packages : [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logWarn(`Failed to connect to package distribution server at ${targetUrl}: ${msg}`);
    return { success: false, packages: [], error: `Could not connect to package server: ${msg}` };
  }
}

/**
 * Downloads and cryptographically verifies a sealed package.
 * @param serverUrl - Package server base URL
 * @param fileName - File name of package (e.g. US-FED-2026.taxpack.json)
 * @returns Verified package payload or validation error
 */
export async function fetchAndVerifyPackage(
  serverUrl: string,
  fileName: string
): Promise<{ success: boolean; package?: any; error?: string }> {
  const targetUrl = `${normalizeServerUrl(serverUrl)}/packages/${encodeURIComponent(fileName)}`;
  try {
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { success: false, error: `Failed to download package: HTTP ${res.status}` };
    }
    const pkg = JSON.parse(await res.text());
    if (!pkg.packageCode || !Array.isArray(pkg.rules)) {
      return { success: false, error: 'Package payload is missing required schema fields' };
    }
    if (!verifyPackageChecksum(pkg)) {
      return { success: false, error: `Manifest checksum verification failed for ${pkg.packageCode}` };
    }
    return { success: true, package: pkg };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Package download/verification error: ${msg}` };
  }
}

/**
 * Upserts a tax jurisdiction record in database.
 */
async function upsertJurisdiction(j: { code: string; name: string; level: string; state?: string | null }) {
  const existing = await prisma.taxJurisdiction.findUnique({ where: { code: j.code } });
  if (existing) {
    return prisma.taxJurisdiction.update({
      where: { code: j.code },
      data: { name: j.name, level: j.level, state: j.state || null },
    });
  }
  return prisma.taxJurisdiction.create({
    data: { code: j.code, name: j.name, level: j.level, state: j.state || null },
  });
}

/**
 * Ingests a rule and version into database.
 */
async function persistRuleAndVersion(rule: any, jId: string, options: IIngestionOptions): Promise<number> {
  let ruleRec = await prisma.taxRule.findFirst({
    where: { jurisdictionId: jId, ruleCode: rule.ruleCode },
  });
  if (!ruleRec) {
    ruleRec = await prisma.taxRule.create({
      data: {
        jurisdictionId: jId,
        ruleCode: rule.ruleCode,
        name: rule.name,
        category: rule.category,
        description: rule.description || null,
      },
    });
  }

  for (const ver of rule.versions || []) {
    if (options.activateImmediately) {
      await prisma.taxRuleVersion.updateMany({
        where: { ruleId: ruleRec.id, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED', effectiveEnd: new Date(ver.effectiveFrom || Date.now()) },
      });
    }
    const citation = ver.citations?.[0] || {};
    const statusVal = options.activateImmediately ? 'ACTIVE' : 'IN_REVIEW';
    const extendedRuleData = {
      ...(ver.ruleData || {}),
      versionCode: ver.versionCode,
      checksum: ver.checksum,
      testCases: ver.testCases,
    };

    await prisma.taxRuleVersion.create({
      data: {
        ruleId: ruleRec.id,
        versionNumber: ver.versionNumber || 1,
        status: statusVal as any,
        ruleType: (ver.ruleType || 'FLAT_RATE') as any,
        ruleData: extendedRuleData as any,
        sourceTitle: citation.title || 'Official Regulatory Citation',
        sourceUrl: citation.sourceUrl || 'https://www.irs.gov',
        sourcePublisher: citation.authority || 'GOVERNMENT_AUTHORITY',
        statuteReference: citation.statuteReference || 'Statutory Authority',
        citationTier: (citation.citationTier || 'TIER_1_OFFICIAL') as any,
        effectiveStart: new Date(ver.effectiveFrom || Date.now()),
        effectiveEnd: ver.effectiveTo ? new Date(ver.effectiveTo) : null,
        activatedAt: options.activateImmediately ? new Date() : null,
        activatedBy: options.activateImmediately ? options.actorId : null,
      },
    });
  }
  return (rule.versions || []).length;
}

/**
 * Ingests an entire verified package into the database with audit tracking.
 * @param pkg - The verified package object
 * @param options - Ingestion options (companyId, actorId, activateImmediately, dryRun)
 * @returns Result summary
 */
export async function ingestPackageIntoLedger(
  pkg: any,
  options: IIngestionOptions
): Promise<IIngestionResult> {
  const result: IIngestionResult = {
    success: false,
    packageCode: pkg.packageCode,
    jurisdictionCode: pkg.jurisdictionCode,
    rulesIngested: 0,
    versionsCreated: 0,
    manifestChecksum: pkg.manifestChecksum,
  };

  const testEval = evaluatePackageTestCases(pkg);
  result.testCasesEvaluated = testEval.totalTested;
  if (!testEval.passed) {
    result.error = `Test case validation failed: ${testEval.errors.join('; ')}`;
    return result;
  }

  if (options.dryRun) {
    result.success = true;
    result.rulesIngested = (pkg.rules || []).length;
    result.versionsCreated = (pkg.rules || []).reduce((acc: number, r: any) => acc + (r.versions?.length || 0), 0);
    return result;
  }

  try {
    const jMap = new Map<string, string>();
    for (const j of pkg.jurisdictions || []) {
      const rec = await upsertJurisdiction(j);
      jMap.set(j.code, rec.id);
    }
    for (const rule of pkg.rules || []) {
      const jId = jMap.get(rule.jurisdictionCode || pkg.jurisdictionCode);
      if (!jId) continue;
      const count = await persistRuleAndVersion(rule, jId, options);
      result.rulesIngested++;
      result.versionsCreated += count;
    }
    if (options.companyId) {
      await recordAuditLog({
        companyId: options.companyId,
        entityType: 'TaxRulePackage',
        entityId: pkg.packageCode,
        action: options.activateImmediately ? 'ACTIVATE' : 'CREATE',
        actorId: options.actorId,
        newState: {
          packageCode: pkg.packageCode,
          manifestChecksum: pkg.manifestChecksum,
          rulesIngested: result.rulesIngested,
          versionsCreated: result.versionsCreated,
        },
        reason: `Ingested regulatory tax package ${pkg.packageCode} (${pkg.manifestChecksum})`,
      });
    }
    result.success = true;
    refreshActiveRuleCache();
    logInfo(`Successfully ingested package ${pkg.packageCode}`);
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(`Failed to ingest package ${pkg.packageCode}`, err);
    result.error = msg;
    return result;
  }
}

/**
 * Synchronizes all packages available from distribution server.
 * @param serverUrl - Base URL of distribution server
 * @param options - Ingestion and activation options
 * @returns Batch synchronization report
 */
export async function syncAllAvailablePackages(
  serverUrl?: string,
  options?: IIngestionOptions
): Promise<IBatchIngestionResult> {
  const opt: IIngestionOptions = options || { actorId: 'system_sync' };
  const catalogRes = await fetchRemotePackageCatalog(serverUrl);
  if (!catalogRes.success || catalogRes.packages.length === 0) {
    return {
      success: false,
      totalPackages: 0,
      ingestedPackages: 0,
      totalRules: 0,
      totalVersions: 0,
      results: [],
      timestamp: new Date().toISOString(),
      error: catalogRes.error || 'No packages found on distribution server',
    };
  }

  const results: IIngestionResult[] = [];
  let totalRules = 0;
  let totalVersions = 0;

  for (const item of catalogRes.packages) {
    const fetchRes = await fetchAndVerifyPackage(serverUrl || 'http://localhost:3333', item.fileName);
    if (!fetchRes.success || !fetchRes.package) {
      results.push({
        success: false,
        packageCode: item.packageCode,
        jurisdictionCode: item.jurisdictionCode,
        rulesIngested: 0,
        versionsCreated: 0,
        manifestChecksum: item.manifestChecksum,
        error: fetchRes.error,
      });
      continue;
    }
    const ingRes = await ingestPackageIntoLedger(fetchRes.package, opt);
    results.push(ingRes);
    if (ingRes.success) {
      totalRules += ingRes.rulesIngested;
      totalVersions += ingRes.versionsCreated;
    }
  }

  const allSucceeded = results.every((r) => r.success);
  return {
    success: allSucceeded,
    totalPackages: catalogRes.packages.length,
    ingestedPackages: results.filter((r) => r.success).length,
    totalRules,
    totalVersions,
    results,
    timestamp: new Date().toISOString(),
  };
}
