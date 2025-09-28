import { Injectable, Logger } from '@nestjs/common';
import { DataTier, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantContext, currentTenant } from '../tenant/tenant-context';

/**
 * Field names whose *values* must never reach the audit log.
 *
 * PRD §11.1 classes these Tier 1. The log records that salary changed and who
 * changed it — never the figure. An audit trail that quietly becomes a second
 * copy of everyone's bank details is a liability, not a control.
 */
const REDACTED_FIELDS = new Set([
  'salaryAmount',
  'bankAccountNumber',
  'rsaPin',
  'nin',
  'bvn',
  'taxId',
  'passwordHash',
  'password',
  'tokenHash',
]);

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Mandatory wherever the PRD requires a justification. */
  reason?: string | null;
  changes?: Record<string, unknown> | null;
  dataTier?: DataTier;
  /** Overrides the context's company — used for group-level actions. */
  companyId?: string | null;
}

/**
 * Append-only record of every sensitive action (PRD §2.1, §11.3).
 *
 * Writes go outside the caller's transaction on purpose. If an approval succeeds
 * the audit entry must survive, and if the approval rolls back we still want the
 * attempt recorded. A failure to log is reported but never propagated — losing an
 * audit line is bad, failing the user's action because of it is worse.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, context: TenantContext | null = currentTenant()): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          companyId: entry.companyId ?? context?.companyId ?? null,
          actorId: context?.userId ?? null,
          actorEmail: context?.email ?? null,
          actorRole: context?.role ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          reason: entry.reason ?? null,
          changes: (redact(entry.changes) ?? undefined) as Prisma.InputJsonValue | undefined,
          dataTier: entry.dataTier ?? DataTier.TIER_3_OPERATIONAL,
          ipAddress: context?.ipAddress ?? null,
          userAgent: context?.userAgent ?? null,
          requestId: context?.requestId ?? null,
        },
      });
    } catch (cause) {
      this.logger.error(
        `Failed to write audit entry ${entry.action} on ${entry.entityType}:${entry.entityId}`,
        cause instanceof Error ? cause.stack : String(cause)
      );
    }
  }

  /**
   * Convenience for the common "field X went from A to B" shape.
   * Unchanged fields are dropped so the log stays readable.
   */
  diff<T extends Record<string, unknown>>(before: T, after: Partial<T>): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const [key, next] of Object.entries(after)) {
      const previous = before[key];
      if (previous === next) continue;
      changes[key] = { from: previous, to: next };
    }
    return changes;
  }
}

/** Replace Tier 1 values with a marker, recursively. */
function redact(changes: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!changes) return null;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (REDACTED_FIELDS.has(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? redact(value as Record<string, unknown>)
        : value;
  }
  return out;
}
