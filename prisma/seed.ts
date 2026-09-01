import { PrismaClient, RuleStatus, CitationTier, RuleType } from '@prisma/client';
import { allTaxRuleFixtures } from './fixtures/index';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding TaxLedger database from fixtures...');

  // 1. Tax Jurisdictions
  const jurisdictionMap = new Map<string, string>();
  for (const j of allTaxRuleFixtures.jurisdictions) {
    const record = await prisma.taxJurisdiction.upsert({
      where: { code: j.code },
      update: { name: j.name, level: j.level as string, state: j.state },
      create: {
        code: j.code,
        name: j.name,
        level: j.level as string,
        state: j.state,
      },
    });
    jurisdictionMap.set(j.code, record.id);
  }

  // 2. Tax Rules & Versions
  for (const r of allTaxRuleFixtures.rules) {
    const jurisdictionId = jurisdictionMap.get(r.jurisdictionCode);
    if (!jurisdictionId) {
      throw new Error(`Jurisdiction ${r.jurisdictionCode} not found in fixture.`);
    }

    const ruleRecord = await prisma.taxRule.upsert({
      where: {
        jurisdictionId_ruleCode: {
          jurisdictionId,
          ruleCode: r.ruleCode,
        },
      },
      update: {
        name: r.name,
        category: r.category,
        description: r.description,
      },
      create: {
        jurisdictionId,
        ruleCode: r.ruleCode,
        name: r.name,
        category: r.category,
        description: r.description,
      },
    });

    const v = r.version;
    const existingVersion = await prisma.taxRuleVersion.findFirst({
      where: {
        ruleId: ruleRecord.id,
        versionNumber: v.versionNumber,
      },
    });

    const versionData = {
      ruleId: ruleRecord.id,
      versionNumber: v.versionNumber,
      status: v.status as RuleStatus,
      ruleType: v.ruleType as RuleType,
      ruleData: JSON.parse(JSON.stringify(v.ruleData)),
      sourceTitle: v.sourceTitle,
      sourceUrl: v.sourceUrl,
      sourcePublisher: v.sourcePublisher,
      statuteReference: v.statuteReference,
      citationTier: v.citationTier as CitationTier,
      effectiveStart: new Date(v.effectiveStart),
      activatedAt: new Date(),
      activatedBy: 'system_seed',
    };

    if (existingVersion) {
      await prisma.taxRuleVersion.update({
        where: { id: existingVersion.id },
        data: versionData,
      });
    } else {
      await prisma.taxRuleVersion.create({
        data: versionData,
      });
    }
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

