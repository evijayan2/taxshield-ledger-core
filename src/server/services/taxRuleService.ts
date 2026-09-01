import { RuleStatus, CitationTier, RuleType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { recordAuditLog } from '../../lib/audit';

export interface CreateRuleVersionParams {
  companyId: string;
  actorId: string;
  ruleId: string;
  ruleType: RuleType;
  ruleData: Record<string, unknown>;
  sourceTitle: string;
  sourceUrl: string;
  sourcePublisher: string;
  statuteReference: string;
  citationTier: CitationTier;
  effectiveStart: Date;
  effectiveEnd?: Date;
}

export interface TransitionRuleParams {
  companyId: string;
  actorId: string;
  versionId: string;
  targetStatus: RuleStatus;
  reason?: string;
}

/**
 * Validates that all required Tier 1/2/3 source citation fields are non-empty.
 */
export function validateSourceCitation(params: Partial<CreateRuleVersionParams>): void {
  if (!params.sourceTitle || params.sourceTitle.trim().length === 0) {
    throw new Error('TaxRule contribution requires sourceTitle citation');
  }
  if (!params.sourceUrl || params.sourceUrl.trim().length === 0) {
    throw new Error('TaxRule contribution requires sourceUrl citation');
  }
  if (!params.sourcePublisher || params.sourcePublisher.trim().length === 0) {
    throw new Error('TaxRule contribution requires sourcePublisher citation');
  }
  if (!params.statuteReference || params.statuteReference.trim().length === 0) {
    throw new Error('TaxRule contribution requires statuteReference citation');
  }
}

/**
 * Creates a new Tax Rule Version in IN_REVIEW status.
 */
export async function createTaxRuleVersion(params: CreateRuleVersionParams) {
  validateSourceCitation(params);

  const lastVersion = await prisma.taxRuleVersion.findFirst({
    where: { ruleId: params.ruleId },
    orderBy: { versionNumber: 'desc' },
  });
  const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1;

  const version = await prisma.taxRuleVersion.create({
    data: {
      ruleId: params.ruleId,
      versionNumber: nextVersionNumber,
      status: RuleStatus.IN_REVIEW,
      ruleType: params.ruleType,
      ruleData: JSON.parse(JSON.stringify(params.ruleData)),
      sourceTitle: params.sourceTitle,
      sourceUrl: params.sourceUrl,
      sourcePublisher: params.sourcePublisher,
      statuteReference: params.statuteReference,
      citationTier: params.citationTier,
      effectiveStart: params.effectiveStart,
      effectiveEnd: params.effectiveEnd || null,
    },
  });

  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'TAX_RULE_VERSION',
    entityId: version.id,
    action: 'CREATE',
    actorId: params.actorId,
    newState: { versionNumber: nextVersionNumber, status: RuleStatus.IN_REVIEW },
    reason: 'New tax rule version submitted for review',
  });

  return version;
}

/**
 * Transitions a Tax Rule Version to a new lifecycle state.
 */
export async function transitionRuleStatus(params: TransitionRuleParams) {
  const version = await prisma.taxRuleVersion.findUnique({
    where: { id: params.versionId },
  });

  if (!version) {
    throw new Error(`TaxRuleVersion ${params.versionId} not found`);
  }

  const previousStatus = version.status;

  if (params.targetStatus === RuleStatus.ACTIVE) {
    // Supersede previously ACTIVE versions for the same rule
    const activeVersions = await prisma.taxRuleVersion.findMany({
      where: { ruleId: version.ruleId, status: RuleStatus.ACTIVE },
    });

    for (const activeVer of activeVersions) {
      await prisma.taxRuleVersion.update({
        where: { id: activeVer.id },
        data: { status: RuleStatus.SUPERSEDED, effectiveEnd: new Date() },
      });
      await recordAuditLog({
        companyId: params.companyId,
        entityType: 'TAX_RULE_VERSION',
        entityId: activeVer.id,
        action: 'SUPERSEDE',
        actorId: params.actorId,
        previousState: { status: RuleStatus.ACTIVE },
        newState: { status: RuleStatus.SUPERSEDED },
        reason: `Superseded by new version ${version.versionNumber}`,
      });
    }
  }

  const updatedVersion = await prisma.taxRuleVersion.update({
    where: { id: params.versionId },
    data: {
      status: params.targetStatus,
      activatedAt: params.targetStatus === RuleStatus.ACTIVE ? new Date() : version.activatedAt,
      activatedBy: params.targetStatus === RuleStatus.ACTIVE ? params.actorId : version.activatedBy,
    },
  });

  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'TAX_RULE_VERSION',
    entityId: updatedVersion.id,
    action: params.targetStatus === RuleStatus.ACTIVE ? 'ACTIVATE' : 'UPDATE',
    actorId: params.actorId,
    previousState: { status: previousStatus },
    newState: { status: params.targetStatus },
    reason: params.reason || `Rule transitioned from ${previousStatus} to ${params.targetStatus}`,
  });

  return updatedVersion;
}
