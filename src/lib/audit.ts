import { prisma } from './prisma';
import { logInfo, logError } from './logger';

export interface AuditParams {
  companyId: string;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOCK' | 'ACTIVATE' | 'SUPERSEDE' | string;
  actorId: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string;
}

const SENSITIVE_KEY_PATTERN = /^(ssn|tin|accountnumber|routingnumber|password|passwordhash|secret|token|accesstoken|refreshtoken)$/i;

/**
 * Recursively redacts sensitive PII and credential keys from audit state payloads.
 * @param obj Unknown state payload to scrub.
 * @returns Cleaned state object with sensitive values masked.
 */
export function sanitizeAuditPayload(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeAuditPayload(item));
  }

  const record = obj as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(record)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '••••';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeAuditPayload(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

/**
 * Records an immutable AuditLogEntry for write operations.
 */
export async function recordAuditLog(params: AuditParams): Promise<void> {
  try {
    const cleanedPrev = params.previousState ? sanitizeAuditPayload(params.previousState) : null;
    const cleanedNew = params.newState ? sanitizeAuditPayload(params.newState) : null;

    const previousStateJson = cleanedPrev ? JSON.parse(JSON.stringify(cleanedPrev)) : null;
    const newStateJson = cleanedNew ? JSON.parse(JSON.stringify(cleanedNew)) : null;

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
