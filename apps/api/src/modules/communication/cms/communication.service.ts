import {
  COMMUNICATION_LIMITS,
  type AuthContext,
  type FollowUpOutcome,
  type Permission,
} from '@rk/types';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { authorizationService } from '../../auth/authorization.service';
import { auditService } from '../../audit/audit.service';
import type { RequestMeta } from '../../issues/cms/issue.service';
import { scheduleDelivery } from '../notificationQueue';
import { notificationQueueStats } from '../notificationQueue';
import { areNotificationsEnabled, getNotificationProvider } from '../provider/index';

/**
 * The admin side of citizen communication: what was sent, what citizens replied,
 * and the decisions staff take about it.
 *
 * TENANT ISOLATION IS THE SAME PATTERN AS EVERY PRIOR PHASE: `organizationId`
 * comes from the verified `AuthContext` and is written into every `where`.
 * Nothing here accepts one from a caller, and every id supplied by a client is
 * checked against the tenant before it is used.
 *
 * THE RECIPIENT IS NEVER RETURNED IN FULL. The delivery rows carry a masked
 * address, and this service returns that masked form. An operations dashboard
 * needs to know a message went to the right sort of place and to spot an
 * obviously wrong domain; it does not need to reproduce a citizen's address for
 * every member of staff who can open it.
 */

function requireCommunication(
  auth: AuthContext | null,
  permission: Permission,
): { auth: AuthContext; organizationId: string } {
  const permitted = authorizationService.requirePermission(auth, permission);
  return authorizationService.requireOrganization(permitted);
}

export interface CommunicationFilter {
  readonly from?: Date | null;
  readonly to?: Date | null;
  readonly statuses?: readonly string[] | null;
  readonly events?: readonly string[] | null;
  readonly channels?: readonly string[] | null;
  readonly issueId?: string | null;
  readonly first?: number | null;
  readonly offset?: number | null;
}

export const communicationService = {
  /**
   * The communication centre's header figures.
   *
   * Counts by delivery state over a window, plus the pending follow-up queue.
   * SKIPPED is reported separately from FAILED throughout: a skipped message is
   * one the system correctly chose not to send, and folding it into failures
   * would make a healthy deployment look broken.
   */
  async overview(auth: AuthContext, filter?: CommunicationFilter | null) {
    const { organizationId } = requireCommunication(auth, 'COMMUNICATION_READ');

    const to = filter?.to ?? new Date();
    const from = filter?.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const windowed: Prisma.IssueNotificationWhereInput = {
      organizationId,
      createdAt: { gte: from, lt: to },
    };

    const [byStatus, total, publishedUpdates, activeSubscriptions, followUps, reopenRequests] =
      await Promise.all([
        prisma.issueNotification.groupBy({
          by: ['status'],
          where: windowed,
          _count: { _all: true },
        }),
        prisma.issueNotification.count({ where: windowed }),

        prisma.issuePublicUpdate.count({
          where: { organizationId, status: 'PUBLISHED', publishedAt: { gte: from, lt: to } },
        }),
        prisma.issueSubscription.count({ where: { organizationId, active: true } }),
        prisma.issueFollowUp.count({
          where: { organizationId, submittedAt: { gte: from, lt: to } },
        }),
        prisma.issueFollowUp.count({
          where: { organizationId, reopenRequested: true, status: 'SUBMITTED' },
        }),
      ]);

    const counts = new Map(byStatus.map((row) => [row.status, row._count._all]));
    const sent = (counts.get('SENT') ?? 0) + (counts.get('DELIVERED') ?? 0);
    const failed = counts.get('FAILED') ?? 0;
    const attempted = sent + failed;

    return {
      from,
      to,
      generatedAt: new Date(),

      total,
      queued: counts.get('QUEUED') ?? 0,
      processing: counts.get('PROCESSING') ?? 0,
      sent,
      delivered: counts.get('DELIVERED') ?? 0,
      failed,
      skipped: counts.get('SKIPPED') ?? 0,

      // Null rather than 0 when nothing has been attempted: a 0% success rate
      // for a tenant that has never sent anything is a false alarm.
      successRatePct: attempted === 0 ? null : Math.round((sent / attempted) * 1000) / 10,

      publishedUpdates,
      activeSubscriptions,
      followUps,
      pendingReopenRequests: reopenRequests,

      /** Whether outbound messaging can run at all in this deployment. */
      notificationsEnabled: areNotificationsEnabled(),
      provider: getNotificationProvider().name,
      // In-memory, so it describes THIS process only. Labelled as such in the UI.
      queue: notificationQueueStats(),
    };
  },

  /** The paged delivery list behind the communication centre. */
  async notifications(auth: AuthContext, filter?: CommunicationFilter | null) {
    const { organizationId } = requireCommunication(auth, 'COMMUNICATION_READ');

    const take = Math.min(
      Math.max(filter?.first ?? COMMUNICATION_LIMITS.communicationPageSize, 1),
      100,
    );
    const skip = Math.max(filter?.offset ?? 0, 0);

    const where: Prisma.IssueNotificationWhereInput = {
      organizationId,
      ...(filter?.from || filter?.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
      ...(filter?.statuses?.length ? { status: { in: filter.statuses as ['QUEUED'] } } : {}),
      ...(filter?.events?.length ? { event: { in: filter.events as ['ISSUE_RECEIVED'] } } : {}),
      ...(filter?.channels?.length ? { channel: { in: filter.channels as ['EMAIL'] } } : {}),
      ...(filter?.issueId ? { issueId: filter.issueId } : {}),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.issueNotification.findMany({
        where,
        select: NOTIFICATION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        skip,
      }),
      prisma.issueNotification.count({ where }),
    ]);

    const hasMore = rows.length > take;

    return {
      nodes: hasMore ? rows.slice(0, take) : rows,
      totalCount,
      hasMore,
    };
  },

  /** One issue's communication record, for the issue page panel. */
  async forIssue(auth: AuthContext, issueId: string) {
    const { organizationId } = requireCommunication(auth, 'COMMUNICATION_READ');

    const issue = await prisma.issue.findFirst({
      where: { id: issueId, organizationId },
      select: { id: true },
    });
    if (!issue) throw AppError.notFound('Submission not found.');

    const [notifications, publicUpdateCount, subscription, followUps] = await Promise.all([
      prisma.issueNotification.findMany({
        where: { issueId: issue.id },
        select: NOTIFICATION_SELECT,
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      prisma.issuePublicUpdate.count({ where: { issueId: issue.id, status: 'PUBLISHED' } }),
      prisma.issueSubscription.findFirst({
        where: { issueId: issue.id },
        // The masked form is assembled below; the raw destination is never
        // selected into anything this service returns.
        select: { channel: true, active: true, consentGivenAt: true },
      }),
      prisma.issueFollowUp.findMany({
        where: { issueId: issue.id },
        select: FOLLOW_UP_SELECT,
        orderBy: { submittedAt: 'desc' },
      }),
    ]);

    return {
      notifications,
      publicUpdateCount,
      subscription: subscription
        ? {
            channel: subscription.channel,
            active: subscription.active,
            consentGivenAt: subscription.consentGivenAt,
          }
        : null,
      followUps,
    };
  },

  /**
   * Retries a failed delivery.
   *
   * Only FAILED rows, and only below the attempt ceiling. A SENT row is never
   * re-sent - retrying a success is how a citizen receives the same message
   * twice - and `deliver` re-checks the terminal status anyway, so a race
   * between two administrators pressing retry costs a no-op rather than an
   * email.
   */
  async retry(auth: AuthContext, notificationId: string, meta: RequestMeta) {
    const { organizationId } = requireCommunication(auth, 'COMMUNICATION_SEND');

    const notification = await prisma.issueNotification.findFirst({
      where: { id: notificationId, organizationId },
      select: { id: true, status: true, attempts: true, event: true },
    });
    if (!notification) throw AppError.notFound('Notification not found.');

    if (notification.status !== 'FAILED') {
      throw AppError.validation('Only a failed notification can be retried.');
    }
    if (notification.attempts >= 3) {
      throw AppError.validation(
        'This notification has already been attempted the maximum number of times.',
      );
    }

    await prisma.issueNotification.update({
      where: { id: notification.id },
      data: { status: 'QUEUED', failureKind: null, failureReason: null, failedAt: null },
    });

    await auditService.record({
      action: 'NOTIFICATION_RETRIED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'IssueNotification',
      entityId: notification.id,
      metadata: { event: notification.event, attempt: notification.attempts + 1 },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    scheduleDelivery(notification.id);

    return { queued: true };
  },

  // -------------------------------------------------------------------------
  // Follow-up
  // -------------------------------------------------------------------------

  /** The reopen-request queue, and recent citizen replies. */
  async followUps(
    auth: AuthContext,
    args: { pendingOnly?: boolean | null; first?: number | null } = {},
  ) {
    const { organizationId } = requireCommunication(auth, 'COMMUNICATION_READ');

    return prisma.issueFollowUp.findMany({
      where: {
        organizationId,
        ...(args.pendingOnly ? { status: 'SUBMITTED', reopenRequested: true } : {}),
      },
      select: {
        ...FOLLOW_UP_SELECT,
        issue: {
          select: { id: true, referenceNumber: true, status: true, title: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
      take: Math.min(Math.max(args.first ?? 50, 1), 100),
    });
  },

  /**
   * Records what a reviewer decided about a citizen's reply.
   *
   * REVIEWING DOES NOT CHANGE THE ISSUE. An outcome of `REOPENED` records the
   * decision; moving the submission back to IN_PROGRESS is a separate act
   * through the ordinary Phase 5 status path, performed by a named person and
   * producing its own history entry and audit record.
   *
   * Two reasons that separation is worth the extra click. First, status
   * transitions have their own rules in Phase 5 (`canTransition`) and a second
   * writer that bypassed them would eventually produce an illegal state.
   * Second, a reopen is an operational commitment - somebody is going to have
   * to do the work again - and it should be visible in the issue's own timeline
   * as a decision a person took, not as a side effect of a review form.
   */
  async reviewFollowUp(
    auth: AuthContext,
    input: { followUpId: string; outcome: FollowUpOutcome; note?: string | null },
    meta: RequestMeta,
  ) {
    const { organizationId } = requireCommunication(auth, 'FOLLOW_UP_REVIEW');

    const followUp = await prisma.issueFollowUp.findFirst({
      where: { id: input.followUpId, organizationId },
      select: { id: true, status: true, issue: { select: { referenceNumber: true } } },
    });
    if (!followUp) throw AppError.notFound('Follow-up not found.');
    if (followUp.status === 'REVIEWED') {
      throw AppError.conflict('This follow-up has already been reviewed.');
    }

    const note = input.note?.trim() ?? '';
    if (note.length > 1000) {
      throw AppError.validation('Please keep the review note to 1000 characters or fewer.', {
        details: { field: 'note' },
      });
    }

    const reviewed = await prisma.issueFollowUp.update({
      where: { id: followUp.id },
      data: {
        status: 'REVIEWED',
        outcome: input.outcome,
        reviewNote: note.length > 0 ? note : null,
        reviewedAt: new Date(),
        reviewedByUserId: auth.userId,
      },
      select: FOLLOW_UP_SELECT,
    });

    await auditService.record({
      action: 'ISSUE_FOLLOW_UP_REVIEWED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'IssueFollowUp',
      entityId: followUp.id,
      metadata: { reference: followUp.issue.referenceNumber, outcome: input.outcome },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return reviewed;
  },
};

const NOTIFICATION_SELECT = {
  id: true,
  issueId: true,
  event: true,
  channel: true,
  // The MASKED address. The real one lives on the subscription and is never
  // selected by any admin-facing query.
  recipientRedacted: true,
  status: true,
  failureKind: true,
  failureReason: true,
  attempts: true,
  templateVersion: true,
  queuedAt: true,
  sentAt: true,
  deliveredAt: true,
  failedAt: true,
  createdAt: true,
  issue: { select: { id: true, referenceNumber: true } },
} as const;

const FOLLOW_UP_SELECT = {
  id: true,
  issueId: true,
  response: true,
  comment: true,
  reopenRequested: true,
  status: true,
  outcome: true,
  reviewNote: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedBy: { select: { id: true, fullName: true } },
} as const;
