import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeSha256,
  computeVersionChecksum,
  computePackageChecksum,
  verifyPackageChecksum,
  evaluatePackageTestCases,
  fetchRemotePackageCatalog,
  fetchAndVerifyPackage,
  ingestPackageIntoLedger,
  syncAllAvailablePackages,
} from '../../src/server/services/taxPackageIngestionService';
import { prisma } from '../../src/lib/prisma';
import { recordAuditLog } from '../../src/lib/audit';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    taxJurisdiction: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    taxRule: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    taxRuleVersion: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

describe('taxPackageIngestionService (Shared Core)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Cryptographic Checksum Utilities', () => {
    it('computes deterministic SHA-256 string prefixed with sha256:', () => {
      const hash1 = computeSha256('TaxShield 2026');
      const hash2 = computeSha256('TaxShield 2026');
      expect(hash1).toBe(hash2);
      expect(hash1.startsWith('sha256:')).toBe(true);
    });

    it('verifies valid package checksum and rejects tampered packages', () => {
      const validPkg = {
        packageCode: 'TEST-PKG-2026',
        version: '1.0.0',
        jurisdictionCode: 'TEST',
        jurisdictions: [{ code: 'TEST', name: 'Test Jurisdiction', level: 'STATE' }],
        rules: [
          {
            ruleCode: 'TEST_RATE',
            taxType: 'STATE_INCOME_TAX',
            category: 'WITHHOLDING',
            jurisdictionCode: 'TEST',
            versions: [
              {
                versionCode: 'TEST-v1',
                versionNumber: 1,
                ruleType: 'FLAT_RATE',
                ruleData: { rate: 0.05 },
                effectiveFrom: '2026-01-01',
                effectiveTo: null,
                citations: [{ title: 'Test Statute' }],
              },
            ],
          },
        ],
      };

      const manifestChecksum = computePackageChecksum(validPkg);
      const pkgWithChecksum = { ...validPkg, manifestChecksum };

      expect(verifyPackageChecksum(pkgWithChecksum)).toBe(true);

      const tamperedPkg = {
        ...pkgWithChecksum,
        packageCode: 'TAMPERED-PKG',
      };
      expect(verifyPackageChecksum(tamperedPkg)).toBe(false);
    });
  });

  describe('evaluatePackageTestCases', () => {
    it('evaluates flat rate test cases successfully', () => {
      const pkg = {
        rules: [
          {
            ruleCode: 'PA_PIT',
            versions: [
              {
                ruleType: 'FLAT_RATE',
                ruleData: { rate: 0.0307 },
                testCases: [
                  {
                    id: 'tc-01',
                    inputPayload: { grossWages: 1000 },
                    expectedOutput: { taxAmount: 30.7 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const evalRes = evaluatePackageTestCases(pkg);
      expect(evalRes.passed).toBe(true);
      expect(evalRes.totalTested).toBe(1);
      expect(evalRes.errors).toHaveLength(0);
    });

    it('flags test failures when output diverges from expected', () => {
      const pkg = {
        rules: [
          {
            ruleCode: 'BAD_RULE',
            versions: [
              {
                ruleType: 'FLAT_RATE',
                ruleData: { rate: 0.05 },
                testCases: [
                  {
                    id: 'tc-fail',
                    inputPayload: { grossWages: 1000 },
                    expectedOutput: { taxAmount: 999 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const evalRes = evaluatePackageTestCases(pkg);
      expect(evalRes.passed).toBe(false);
      expect(evalRes.errors.length).toBeGreaterThan(0);
    });

    it('evaluates progressive bracket test cases with object-keyed brackets successfully', () => {
      const pkg = {
        rules: [
          {
            ruleCode: 'US_FIT',
            versions: [
              {
                ruleType: 'BRACKET_PERCENTAGE',
                ruleData: {
                  brackets: {
                    SINGLE: [
                      {
                        incomeFrom: 0,
                        incomeTo: 10000,
                        marginalRate: 0.1,
                        baseTax: 0,
                      },
                    ],
                  },
                },
                testCases: [
                  {
                    id: 'tc-bracket-obj',
                    inputPayload: { grossWages: 5000, filingStatus: 'SINGLE' },
                    expectedOutput: { taxAmount: 500 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const evalRes = evaluatePackageTestCases(pkg);
      expect(evalRes.passed).toBe(true);
      expect(evalRes.totalTested).toBe(1);
      expect(evalRes.errors).toHaveLength(0);
    });
  });

  describe('fetchRemotePackageCatalog', () => {
    it('fetches packages from server successfully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          packages: [
            {
              packageCode: 'US-FED-2026',
              name: 'Federal Rules',
              version: '1.0.0',
              jurisdictionCode: 'US-FED',
              manifestChecksum: 'sha256:fed123',
              ruleCount: 3,
              sizeBytes: 4096,
              fileName: 'US-FED-2026.taxpack.json',
              downloadUrl: '/packages/US-FED-2026.taxpack.json',
              generatedAt: '2026-01-01',
            },
          ],
        }),
      } as any);

      const res = await fetchRemotePackageCatalog('http://localhost:3333');
      expect(res.success).toBe(true);
      expect(res.packages).toHaveLength(1);
      expect(res.packages[0].packageCode).toBe('US-FED-2026');
    });

    it('returns error when package server connection fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));
      const res = await fetchRemotePackageCatalog('http://localhost:3333');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Could not connect to package server');
    });
  });

  describe('fetchAndVerifyPackage', () => {
    it('rejects tampered packages whose manifest checksum does not match', async () => {
      const fakePkg = {
        packageCode: 'FAKE-2026',
        rules: [],
        manifestChecksum: 'sha256:invalid_checksum',
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(fakePkg),
      } as any);

      const res = await fetchAndVerifyPackage('http://localhost:3333', 'FAKE-2026.taxpack.json');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Manifest checksum verification failed');
    });
  });

  describe('ingestPackageIntoLedger', () => {
    it('upserts jurisdiction, rule, and creates version with audit logging', async () => {
      const validPkg = {
        packageCode: 'PA-STATE-2026',
        name: 'Pennsylvania 2026',
        version: '1.0.0',
        jurisdictionCode: 'PA',
        jurisdictions: [{ code: 'PA', name: 'Pennsylvania', level: 'STATE', state: 'PA' }],
        rules: [
          {
            ruleCode: 'PA_PIT_RATE',
            name: 'PA Income Tax',
            category: 'WITHHOLDING',
            jurisdictionCode: 'PA',
            versions: [
              {
                versionCode: 'PA-PIT-v1',
                versionNumber: 1,
                ruleType: 'FLAT_RATE',
                ruleData: { rate: 0.0307 },
                effectiveFrom: '2026-01-01',
                citations: [{ title: 'REV-419' }],
                testCases: [
                  {
                    id: 'tc-pa',
                    inputPayload: { grossWages: 1000 },
                    expectedOutput: { taxAmount: 30.7 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const manifestChecksum = computePackageChecksum(validPkg);
      const pkg = { ...validPkg, manifestChecksum };

      vi.mocked(prisma.taxJurisdiction.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.taxJurisdiction.create).mockResolvedValueOnce({ id: 'j_pa' } as any);
      vi.mocked(prisma.taxRule.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.taxRule.create).mockResolvedValueOnce({ id: 'r_pa' } as any);
      vi.mocked(prisma.taxRuleVersion.create).mockResolvedValueOnce({ id: 'v_pa' } as any);

      const res = await ingestPackageIntoLedger(pkg, {
        actorId: 'admin_user',
        companyId: 'comp_pa',
        activateImmediately: true,
      });

      expect(res.success).toBe(true);
      expect(res.rulesIngested).toBe(1);
      expect(res.versionsCreated).toBe(1);
      expect(prisma.taxRuleVersion.updateMany).toHaveBeenCalled();
      expect(recordAuditLog).toHaveBeenCalled();
    });

    it('supports dry-run mode without modifying database', async () => {
      const pkg = {
        packageCode: 'DRY-RUN-PKG',
        jurisdictionCode: 'FED',
        rules: [{ ruleCode: 'FED_FIT', versions: [] }],
        manifestChecksum: 'sha256:dryrun',
      };

      const res = await ingestPackageIntoLedger(pkg, {
        actorId: 'tester',
        dryRun: true,
      });

      expect(res.success).toBe(true);
      expect(prisma.taxJurisdiction.create).not.toHaveBeenCalled();
      expect(prisma.taxRule.create).not.toHaveBeenCalled();
    });
  });
});
