import { prisma } from './prisma';
import { logInfo, logError } from './logger';

export interface AuditParams {
  companyId: string;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOCK' | 'ACTIVATE' | 'SUPERSEDE';
  actorId: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string;
}

/**
 * Records an immutable AuditLogEntry for write operations.
 */
export async function recordAuditLog(params: AuditParams): Promise<void> {
  try {
    const previousStateJson = params.previousState ? JSON.parse(JSON.stringify(params.previousState)) : null;
    const newStateJson = params.newState ? JSON.parse(JSON.stringify(params.newState)) : null;

    await prisma.auditLogEntry.create({
      data: {
        companyId: params.companyId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        actorId: params.actorId,
        previousState: previousStateJson,
        newState: newStateJson,
        reason: params.reason || null,
      },
    });

    logInfo('Audit log entry created', {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
    });
  } catch (error) {
    logError('Failed to write audit log entry', error, { params });
    // In production audit trail is critical, rethrow to prevent un-audited state mutation
    throw new Error(`Audit log entry failed for ${params.entityType}:${params.entityId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
