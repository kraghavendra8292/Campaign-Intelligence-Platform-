import {
  ISSUE_LIMITS,
  type AuthContext,
  type IssuePriority,
  type IssueStatus,
  type ModerationStatus,
} from '@rk/types';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { auditService } from '../../audit/audit.service';
import { enqueueNotification } from '../../communication/notificationQueue';
import {
  assertTransition,
  canReadContact,
  clampIssuePageSize,
  clampOffset,
  humanStatus,
  optionalCoordinate,
  optionalText,
  requireIssueAccess,
} from '../shared/issueGuards';

/**
 * Administration of citizen submissions.
 *
 * Every method follows the shape established in Phases 3 and 4: check the
 * permission, resolve the tenant from the authenticated context, then load the
 * target SCOPED TO THAT TENANT. The scoped load is what makes cross-tenant
 * access impossible rather than merely unlikely.
 *
 * One rule is specific to this module and appears everywhere below: **contact
 * details are redacted unless the caller holds `ISSUE_CONTACT_READ`**, and the
 * redaction happens in the mapper rather than at each call site, so a new query
 * cannot forget it.
 */

/** Client metadata forwarded to the audit trail. */
export interface RequestMeta {
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly correlationId?: string | null;
}

const ISSUE_SELECT = {
  id: true,
  referenceNumber: true,
  type: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  moderationStatus: true,
  source: true,
  ward: true,
  locality: true,
  area: true,
  addressDescription: true,
  latitude: true,
  longitude: true,
  isAnonymous: true,
  contactName: true,
  contactPhone: true,
  contactEmail: true,
  consentGiven: true,
  consentAt: true,
  submittedAt: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, key: true, label: true } },
  campaign: { select: { id: true, name: true } },
  qrCode: { select: { id: true, code: true, name: true } },
  assignedTo: { select: { id: true, fullName: true, email: true } },
  _count: { select: { attachments: true, notes: true } },
} satisfies Prisma.IssueSelect;

type IssueRow = Prisma.IssueGetPayload<{ select: typeof ISSUE_SELECT }>;

/**
 * Shapes a row for the API, redacting what the caller may not see.
 *
 * THE SINGLE PLACE CONTACT DETAILS ARE GATED. Returning nulls rather than
 * omitting the fields keeps the response shape stable, and `contactProvided`
 * still tells a triager that a reply is possible - which is what they actually
 * need to know - without telling them the number.
 */
export function mapIssue(row: IssueRow, auth: AuthContext | null) {
  const showContact = canReadContact(auth);

  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    moderationStatus: row.moderationStatus,
    source: row.source,
    ward: row.ward,
    locality: row.locality,
    area: row.area,
    addressDescription: row.addressDescription,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),

    isAnonymous: row.isAnonymous,
    /** True when a reply is possible, regardless of who may read the details. */
    contactProvided: !row.isAnonymous,
    contactName: showContact ? row.contactName : null,
    contactPhone: showContact ? row.contactPhone : null,
    contactEmail: showContact ? row.contactEmail : null,
    contactVisible: showContact,
    consentGiven: row.consentGiven,
    consentAt: row.consentAt,

    submittedAt: row.submittedAt,
    resolvedAt: row.resolvedAt,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,

    category: row.category,
    campaign: row.campaign,
    qrCode: row.qrCode,
    assignedTo: row.assignedTo,
    attachmentCount: row._count.attachments,
    noteCount: row._count.notes,
  };
}

export interface IssueListArgs {
  readonly first?: number | null;
  readonly offset?: number | null;
  readonly status?: IssueStatus | null;
  readonly priority?: IssuePriority | null;
  readonly type?: string | null;
  readonly categoryId?: string | null;
  readonly source?: string | null;
  readonly moderationStatus?: ModerationStatus | null;
  readonly ward?: string | null;
  readonly locality?: string | null;
  readonly assignedToUserId?: string | null;
  readonly unassignedOnly?: boolean | null;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly search?: string | null;
  readonly campaignId?: string | null;
  readonly qrCodeId?: string | null;
}

function parseDate(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw AppError.validation('Enter a valid date.', { details: { field } });
  }
  return parsed;
}

/**
 * Builds the tenant-scoped filter for the inbox.
 *
 * `organizationId` is set FIRST and is never conditional, so no combination of
 * client-supplied filters can widen the scope beyond the caller's tenant.
 */
function buildWhere(organizationId: string, args: IssueListArgs): Prisma.IssueWhereInput {
  const from = parseDate(args.from, 'from');
  const to = parseDate(args.to, 'to');

  const search = args.search?.trim();

  return {
    organizationId,
    ...(args.status ? { status: args.status } : {}),
    ...(args.priority ? { priority: args.priority } : {}),
    ...(args.type ? { type: args.type as never } : {}),
    ...(args.categoryId ? { categoryId: args.categoryId } : {}),
    ...(args.source ? { source: args.source as never } : {}),
    ...(args.moderationStatus ? { moderationStatus: args.moderationStatus } : {}),
    ...(args.ward ? { ward: { equals: args.ward, mode: 'insensitive' as const } } : {}),
    ...(args.locality ? { locality: { equals: args.locality, mode: 'insensitive' as const } } : {}),
    ...(args.unassignedOnly ? { assignedToUserId: null } : {}),
    ...(!args.unassignedOnly && args.assignedToUserId
      ? { assignedToUserId: args.assignedToUserId }
      : {}),
    ...(args.campaignId ? { campaignId: args.campaignId } : {}),
    ...(args.qrCodeId ? { qrCodeId: args.qrCodeId } : {}),
    ...(from || to
      ? { submittedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    // Reference and title only. NOT the description: a free-text search across
    // what citizens wrote would turn the inbox into a way to find people by
    // whatever personal detail they happened to mention.
    ...(search
      ? {
          OR: [
            { referenceNumber: { contains: search.toUpperCase() } },
            { title: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

export const issueService = {
  async list(auth: AuthContext, args: IssueListArgs) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_READ');

    const take = clampIssuePageSize(args.first);
    const skip = clampOffset(args.offset);
    const where = buildWhere(organizationId, args);

    const [rows, totalCount] = await Promise.all([
      prisma.issue.findMany({
        where,
        select: ISSUE_SELECT,
        // Newest first: an inbox is worked from the top.
        orderBy: [{ submittedAt: 'desc' }],
        take,
        skip,
      }),
      prisma.issue.count({ where }),
    ]);

    return {
      nodes: rows.map((row) => mapIssue(row, auth)),
      totalCount,
      hasMore: skip + rows.length < totalCount,
    };
  },

  async getById(auth: AuthContext, id: string) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_READ');

    const row = await prisma.issue.findFirst({
      where: { id, organizationId },
      select: ISSUE_SELECT,
    });

    if (!row) throw AppError.notFound('This submission is not available.');
    return mapIssue(row, auth);
  },

  /**
   * Records that somebody opened a citizen's contact details.
   *
   * The only READ this platform audits. Every other read goes unlogged, but a
   * staff member looking at a phone number is a disclosure of personal data
   * volunteered for one narrow purpose, and it should leave a trace. The number
   * itself never enters the audit row.
   */
  async revealContact(auth: AuthContext, id: string, meta: RequestMeta) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_CONTACT_READ');

    const row = await prisma.issue.findFirst({
      where: { id, organizationId },
      select: {
        referenceNumber: true,
        isAnonymous: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
      },
    });

    if (!row) throw AppError.notFound('This submission is not available.');

    if (row.isAnonymous) {
      return { contactName: null, contactPhone: null, contactEmail: null };
    }

    await auditService.record({
      action: 'ISSUE_CONTACT_VIEWED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Issue',
      entityId: id,
      metadata: { reference: row.referenceNumber },
      ...meta,
    });

    return {
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      contactEmail: row.contactEmail,
    };
  },

  /**
   * Moves a submission through its workflow.
   *
   * The transition is checked against the permitted map, so a submission cannot
   * jump from SUBMITTED to CLOSED and skip the acknowledgement a citizen is
   * waiting on. `resolvedAt` and `closedAt` are stamped once and preserved, so
   * a reopened-then-re-resolved report keeps its original resolution date.
   */
  async updateStatus(auth: AuthContext, id: string, next: IssueStatus, meta: RequestMeta) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_STATUS_UPDATE');

    const existing = await prisma.issue.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true, referenceNumber: true, resolvedAt: true, closedAt: true },
    });
    if (!existing) throw AppError.notFound('This submission is not available.');

    assertTransition(existing.status, next);

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.issue.update({
        where: { id: existing.id },
        data: {
          status: next,
          resolvedAt: next === 'RESOLVED' ? (existing.resolvedAt ?? now) : existing.resolvedAt,
          closedAt:
            next === 'CLOSED' || next === 'REJECTED'
              ? (existing.closedAt ?? now)
              : existing.closedAt,
        },
        select: ISSUE_SELECT,
      });

      await tx.issueHistory.create({
        data: {
          organizationId,
          issueId: existing.id,
          action: 'STATUS_CHANGED',
          previousStatus: existing.status,
          newStatus: next,
          performedByUserId: auth.userId,
        },
      });

      return row;
    });

    await auditService.record({
      action: 'ISSUE_STATUS_CHANGED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Issue',
      entityId: existing.id,
      metadata: { reference: existing.referenceNumber, from: existing.status, to: next },
      ...meta,
    });

    /**
     * Phase 8 hand-off. One of two lines of that phase in this service.
     *
     * Not awaited, returns void, catches everything internally, and runs AFTER
     * the transaction has committed and the audit record is written. A staff
     * member moving a submission must never see an error because a mail
     * provider is unreachable, and when notifications are disabled - the
     * default - it is a no-op.
     *
     * `subject` is the NEW STATUS, which is what makes the event unique: moving
     * an issue to RESOLVED twice is the same fact and must not send twice,
     * while moving it on to CLOSED is a different fact and should.
     */
    enqueueNotification({
      issueId: existing.id,
      event: next === 'RESOLVED' ? 'ISSUE_RESOLVED' : 'ISSUE_STATUS_CHANGED',
      subject: next,
      actorUserId: auth.userId,
      correlationId: meta.correlationId,
    });

    return mapIssue(updated, auth);
  },

  async updatePriority(auth: AuthContext, id: string, next: IssuePriority, meta: RequestMeta) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_PRIORITY_UPDATE');

    const existing = await prisma.issue.findFirst({
      where: { id, organizationId },
      select: { id: true, priority: true, referenceNumber: true },
    });
    if (!existing) throw AppError.notFound('This submission is not available.');

    if (existing.priority === next) {
      throw AppError.validation(`This submission is already ${next.toLowerCase()} priority.`, {
        details: { field: 'priority' },
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.issue.update({
        where: { id: existing.id },
        data: { priority: next },
        select: ISSUE_SELECT,
      });

      await tx.issueHistory.create({
        data: {
          organizationId,
          issueId: existing.id,
          action: 'PRIORITY_CHANGED',
          previousPriority: existing.priority,
          newPriority: next,
          performedByUserId: auth.userId,
        },
      });

      return row;
    });

    await auditService.record({
      action: 'ISSUE_PRIORITY_CHANGED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Issue',
      entityId: existing.id,
      metadata: { reference: existing.referenceNumber, from: existing.priority, to: next },
      ...meta,
    });

    return mapIssue(updated, auth);
  },

  /**
   * Assigns, reassigns or unassigns.
   *
   * The assignee is verified to be a MEMBER OF THE SAME ORGANISATION before the
   * write. Without that check, a valid user id from another tenant would give
   * somebody outside the campaign a queue of its citizens' reports - which is a
   * cross-tenant leak dressed up as an ordinary assignment.
   */
  async assign(auth: AuthContext, id: string, userId: string | null, meta: RequestMeta) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_ASSIGN');

    const existing = await prisma.issue.findFirst({
      where: { id, organizationId },
      select: { id: true, referenceNumber: true, assignedToUserId: true },
    });
    if (!existing) throw AppError.notFound('This submission is not available.');

    let assigneeName: string | null = null;

    if (userId) {
      const membership = await prisma.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { user: { select: { id: true, fullName: true, status: true } } },
      });

      if (!membership) {
        throw AppError.validation('That person is not a member of this organisation.', {
          details: { field: 'assignedToUserId' },
        });
      }
      if (membership.user.status !== 'ACTIVE') {
        throw AppError.validation('That account is not active.', {
          details: { field: 'assignedToUserId' },
        });
      }
      assigneeName = membership.user.fullName;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.issue.update({
        where: { id: existing.id },
        data: { assignedToUserId: userId },
        select: ISSUE_SELECT,
      });

      await tx.issueHistory.create({
        data: {
          organizationId,
          issueId: existing.id,
          action: userId ? 'ASSIGNED' : 'UNASSIGNED',
          detail: assigneeName,
          performedByUserId: auth.userId,
        },
      });

      return row;
    });

    await auditService.record({
      action: userId ? 'ISSUE_ASSIGNED' : 'ISSUE_UNASSIGNED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Issue',
      entityId: existing.id,
      metadata: { reference: existing.referenceNumber, assignedToUserId: userId },
      ...meta,
    });

    return mapIssue(updated, auth);
  },

  /** Recategorises and corrects the location a citizen described. */
  async update(
    auth: AuthContext,
    id: string,
    input: {
      categoryId?: string | null;
      ward?: string | null;
      locality?: string | null;
      area?: string | null;
      addressDescription?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    },
    meta: RequestMeta,
  ) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_UPDATE');

    const existing = await prisma.issue.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        referenceNumber: true,
        categoryId: true,
        category: { select: { label: true } },
      },
    });
    if (!existing) throw AppError.notFound('This submission is not available.');

    let categoryLabel: string | null = null;
    if (input.categoryId !== undefined && input.categoryId !== null) {
      const category = await prisma.issueCategory.findFirst({
        where: { id: input.categoryId, organizationId },
        select: { id: true, label: true },
      });
      if (!category) {
        throw AppError.validation('That category is not available.', {
          details: { field: 'categoryId' },
        });
      }
      categoryLabel = category.label;
    }

    const categoryChanged =
      input.categoryId !== undefined && input.categoryId !== existing.categoryId;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.issue.update({
        where: { id: existing.id },
        data: {
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.ward !== undefined
            ? { ward: optionalText(input.ward, 'ward', ISSUE_LIMITS.locationTextMax) }
            : {}),
          ...(input.locality !== undefined
            ? { locality: optionalText(input.locality, 'locality', ISSUE_LIMITS.locationTextMax) }
            : {}),
          ...(input.area !== undefined
            ? { area: optionalText(input.area, 'area', ISSUE_LIMITS.locationTextMax) }
            : {}),
          ...(input.addressDescription !== undefined
            ? {
                addressDescription: optionalText(
                  input.addressDescription,
                  'addressDescription',
                  ISSUE_LIMITS.addressMax,
                ),
              }
            : {}),
          ...(input.latitude !== undefined
            ? { latitude: optionalCoordinate(input.latitude, 'latitude', 90) }
            : {}),
          ...(input.longitude !== undefined
            ? { longitude: optionalCoordinate(input.longitude, 'longitude', 180) }
            : {}),
        },
        select: ISSUE_SELECT,
      });

      await tx.issueHistory.create({
        data: {
          organizationId,
          issueId: existing.id,
          action: categoryChanged ? 'CATEGORY_CHANGED' : 'LOCATION_UPDATED',
          detail: categoryChanged ? categoryLabel : null,
          performedByUserId: auth.userId,
        },
      });

      return row;
    });

    await auditService.record({
      action: categoryChanged ? 'ISSUE_CATEGORY_CHANGED' : 'ISSUE_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Issue',
      entityId: existing.id,
      metadata: { reference: existing.referenceNumber },
      ...meta,
    });

    return mapIssue(updated, auth);
  },

  /**
   * Records a human moderation decision.
   *
   * Administrative only. Nothing here is automated, and the vocabulary is about
   * the SUBMISSION - whether it is a real report or abuse - never about the
   * person who sent it.
   */
  async moderate(auth: AuthContext, id: string, next: ModerationStatus, meta: RequestMeta) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_MODERATE');

    const existing = await prisma.issue.findFirst({
      where: { id, organizationId },
      select: { id: true, referenceNumber: true, moderationStatus: true },
    });
    if (!existing) throw AppError.notFound('This submission is not available.');

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.issue.update({
        where: { id: existing.id },
        data: { moderationStatus: next },
        select: ISSUE_SELECT,
      });

      await tx.issueHistory.create({
        data: {
          organizationId,
          issueId: existing.id,
          action: 'MODERATED',
          detail: next.replace(/_/g, ' ').toLowerCase(),
          performedByUserId: auth.userId,
        },
      });

      return row;
    });

    await auditService.record({
      action: 'ISSUE_MODERATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Issue',
      entityId: existing.id,
      metadata: { reference: existing.referenceNumber, from: existing.moderationStatus, to: next },
      ...meta,
    });

    return mapIssue(updated, auth);
  },

  // -------------------------------------------------------------------------
  // Timeline, notes, attachments, categories
  // -------------------------------------------------------------------------

  async history(auth: AuthContext, issueId: string) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_READ');

    // Scoped through the parent, so a history id cannot be used to reach across
    // tenants even though the query filters on the issue.
    const owned = await prisma.issue.findFirst({
      where: { id: issueId, organizationId },
      select: { id: true },
    });
    if (!owned) throw AppError.notFound('This submission is not available.');

    return prisma.issueHistory.findMany({
      where: { issueId, organizationId },
      select: {
        id: true,
        action: true,
        previousStatus: true,
        newStatus: true,
        previousPriority: true,
        newPriority: true,
        detail: true,
        createdAt: true,
        performedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async notes(auth: AuthContext, issueId: string) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_NOTE_READ');

    const owned = await prisma.issue.findFirst({
      where: { id: issueId, organizationId },
      select: { id: true },
    });
    if (!owned) throw AppError.notFound('This submission is not available.');

    return prisma.issueInternalNote.findMany({
      where: { issueId, organizationId },
      select: {
        id: true,
        note: true,
        createdAt: true,
        author: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async addNote(auth: AuthContext, issueId: string, noteText: string, meta: RequestMeta) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_NOTE_CREATE');

    const owned = await prisma.issue.findFirst({
      where: { id: issueId, organizationId },
      select: { id: true, referenceNumber: true },
    });
    if (!owned) throw AppError.notFound('This submission is not available.');

    const trimmed = noteText.trim();
    if (trimmed.length === 0) {
      throw AppError.validation('Please write a note.', { details: { field: 'note' } });
    }
    if (trimmed.length > ISSUE_LIMITS.noteMax) {
      throw AppError.validation(`Please keep the note under ${ISSUE_LIMITS.noteMax} characters.`, {
        details: { field: 'note', limit: ISSUE_LIMITS.noteMax },
      });
    }

    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.issueInternalNote.create({
        data: { organizationId, issueId, note: trimmed, authorUserId: auth.userId },
        select: {
          id: true,
          note: true,
          createdAt: true,
          author: { select: { id: true, fullName: true } },
        },
      });

      await tx.issueHistory.create({
        data: {
          organizationId,
          issueId,
          action: 'NOTE_ADDED',
          // The note BODY is deliberately not copied into the timeline entry:
          // staff write candidly, and the timeline is shown more widely than
          // the notes themselves.
          performedByUserId: auth.userId,
        },
      });

      return created;
    });

    await auditService.record({
      action: 'ISSUE_NOTE_ADDED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Issue',
      entityId: issueId,
      metadata: { reference: owned.referenceNumber },
      ...meta,
    });

    return note;
  },

  /** Attachment metadata. The bytes are served by the authenticated route. */
  async attachments(auth: AuthContext, issueId: string) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_ATTACHMENT_READ');

    const owned = await prisma.issue.findFirst({
      where: { id: issueId, organizationId },
      select: { id: true },
    });
    if (!owned) throw AppError.notFound('This submission is not available.');

    return prisma.issueAttachment.findMany({
      where: { issueId, organizationId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async categories(auth: AuthContext, includeInactive: boolean) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_READ');

    return prisma.issueCategory.findMany({
      where: { organizationId, ...(includeInactive ? {} : { isActive: true }) },
      select: {
        id: true,
        key: true,
        label: true,
        labelKn: true,
        isActive: true,
        displayOrder: true,
        _count: { select: { issues: true } },
      },
      orderBy: [{ displayOrder: 'asc' }, { label: 'asc' }],
    });
  },

  /**
   * Turns a category on or off.
   *
   * Deactivating hides it from the PUBLIC form but leaves it on historical
   * submissions and in admin filters, so a report filed last month still shows
   * a category rather than a blank.
   */
  async setCategoryActive(auth: AuthContext, id: string, isActive: boolean, meta: RequestMeta) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_CATEGORY_MANAGE');

    const existing = await prisma.issueCategory.findFirst({
      where: { id, organizationId },
      select: { id: true, key: true },
    });
    if (!existing) throw AppError.notFound('That category is not available.');

    const updated = await prisma.issueCategory.update({
      where: { id: existing.id },
      data: { isActive },
      select: {
        id: true,
        key: true,
        label: true,
        labelKn: true,
        isActive: true,
        displayOrder: true,
        _count: { select: { issues: true } },
      },
    });

    await auditService.record({
      action: 'ISSUE_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'IssueCategory',
      entityId: existing.id,
      metadata: { key: existing.key, isActive },
      ...meta,
    });

    return updated;
  },
};

export { humanStatus };
