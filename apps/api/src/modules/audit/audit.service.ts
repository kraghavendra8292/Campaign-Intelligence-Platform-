import type { AuditAction } from '@rk/types';
import { redactSensitive } from '@rk/utils';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import { getLogger } from '../../logging/logger';

/**
 * Append-only audit trail for security-relevant actions.
 *
 * Two rules define this module:
 *
 * 1. WRITE-ONLY. There is no update or delete path anywhere in application
 *    code, so a compromised admin account cannot rewrite history. Correcting a
 *    record is a database-administration task, not an API operation.
 *
 * 2. NEVER RECORD A SECRET. `metadata` passes through the shared redactor
 *    before it is written, so a caller that carelessly forwards a request body
 *    cannot persist a password, token or cookie into a table that is, by
 *    design, widely readable within a tenant.
 */

export interface AuditEntry {
  readonly action: AuditAction;
  /** Null for platform-level events that belong to no single tenant. */
  readonly organizationId?: string | null;
  readonly campaignId?: string | null;
  /** Null when the actor is anonymous, e.g. a failed login. */
  readonly actorUserId?: string | null;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly correlationId?: string | null;
}

/**
 * Keys that are dropped outright rather than redacted.
 *
 * The shared redactor masks these to `[REDACTED]`, but an audit row should not
 * even record that a password was present in the payload - the marker itself is
 * noise, and the key name can hint at what a caller submitted.
 */
const FORBIDDEN_METADATA_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'resettoken',
  'invitationtoken',
  'tokenhash',
  'passwordhash',
  'authorization',
  'cookie',
  'secret',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, '');
}

/** Strips forbidden keys, then redacts whatever remains. */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(normalizeKey(key))) continue;
    filtered[key] = value;
  }

  const redacted = redactSensitive(filtered);
  return Object.keys(redacted).length > 0 ? redacted : null;
}

export const auditService = {
  /**
   * Writes one audit record.
   *
   * Failures are logged and swallowed on purpose: an audit write must never
   * turn a successful login into a 500, or a failed one into a different
   * response than usual. The trade-off is accepted deliberately - losing a row
   * is preferable to breaking authentication, and the failure is still visible
   * in the application log.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      const metadata = sanitizeAuditMetadata(entry.metadata);

      await prisma.auditLog.create({
        data: {
          action: entry.action,
          organizationId: entry.organizationId ?? null,
          campaignId: entry.campaignId ?? null,
          actorUserId: entry.actorUserId ?? null,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          // Omit the column entirely when there is nothing safe to record.
          ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent?.slice(0, 500) ?? null,
          correlationId: entry.correlationId ?? null,
        },
      });
    } catch (error) {
      getLogger().error(
        { err: error, action: entry.action, correlationId: entry.correlationId },
        'Failed to write audit record',
      );
    }
  },
};
