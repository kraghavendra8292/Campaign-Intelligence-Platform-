import type { AuthContext } from '@rk/types';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import { authorizationService } from '../auth/authorization.service';

/**
 * Reading the audit trail.
 *
 * Separated from `audit.service.ts` on purpose: that module only ever writes,
 * this one only ever reads. Keeping them apart makes it obvious at a glance
 * that no code path updates or deletes an audit row.
 *
 * Tenant scoping here is strict. A tenant administrator sees only rows carrying
 * their `organizationId`; platform-level rows (organizationId = null) are
 * visible to platform admins alone, since they describe cross-tenant activity.
 */

const AUDIT_SELECT = {
  id: true,
  organizationId: true,
  campaignId: true,
  actorUserId: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  actor: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.AuditLogSelect;

export type AuditRecord = Prisma.AuditLogGetPayload<{ select: typeof AUDIT_SELECT }>;

export interface AuditPageArgs {
  readonly first: number;
  readonly afterCursor?: string | null;
  readonly action?: string | null;
  readonly actorUserId?: string | null;
}

export const auditQueryService = {
  async list(
    auth: AuthContext,
    args: AuditPageArgs,
  ): Promise<{ records: AuditRecord[]; hasNextPage: boolean; totalCount: number }> {
    authorizationService.requirePermission(auth, 'AUDIT_READ');

    // A platform admin without an active tenant reads the whole trail;
    // otherwise the query is pinned to the caller's organisation.
    const tenantFilter: Prisma.AuditLogWhereInput =
      auth.isPlatformAdmin && !auth.organizationId
        ? {}
        : { organizationId: authorizationService.requireOrganization(auth).organizationId };

    const where: Prisma.AuditLogWhereInput = {
      ...tenantFilter,
      ...(args.action ? { action: args.action } : {}),
      ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select: AUDIT_SELECT,
        // Newest first: an operator reviewing an incident wants recent events.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: args.first + 1,
        ...(args.afterCursor ? { cursor: { id: args.afterCursor }, skip: 1 } : {}),
      }),
      prisma.auditLog.count({ where }),
    ]);

    const hasNextPage = rows.length > args.first;
    return { records: hasNextPage ? rows.slice(0, args.first) : rows, hasNextPage, totalCount };
  },
};
