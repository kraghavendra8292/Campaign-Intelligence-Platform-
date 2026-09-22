import { createHash } from 'node:crypto';
import {
  NOTIFICATION_MAX_ATTEMPTS,
  isChannelSupported,
  type NotificationEvent,
  type NotificationFailureKind,
} from '@rk/types';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import { getEnv } from '../../config/env';
import { getLogger } from '../../logging/logger';
import { auditService } from '../audit/audit.service';
import {
  NotificationProviderError,
  areNotificationsEnabled,
  getNotificationProvider,
  redactEmail,
} from './provider/index';
import { TemplateRenderError, renderNotification } from './templates/index';

/**
 * Creating and delivering one message about one issue.
 *
 * ---------------------------------------------------------------------------
 * IDEMPOTENCY IS THE CENTRAL PROBLEM OF THIS FILE
 * ---------------------------------------------------------------------------
 *
 * A citizen receiving the same email three times is the most visible possible
 * failure of a system like this, and there are four routine ways to produce it:
 * a client retrying a mutation, a queue worker retrying after a crash, a server
 * restart re-queueing stranded work, and a staff member pressing "publish"
 * twice.
 *
 * An in-memory guard survives none of those. So the guarantee is a UNIQUE
 * DATABASE CONSTRAINT on a key derived from the FACTS of the event - the issue,
 * the event type, the channel, and the thing that changed (the new status, or
 * the id of the update being published). A genuine repeat computes the same key
 * and collides; the collision is caught and reported as a skip rather than an
 * error, because "we already sent this" is a success, not a failure.
 *
 * Deliberately NOT in the key: a timestamp or a random value, either of which
 * would make every call unique and the constraint decorative.
 *
 * ---------------------------------------------------------------------------
 * SEND-TIME CONSENT
 * ---------------------------------------------------------------------------
 *
 * Consent is checked when the message is about to go out, not when it was
 * queued. A citizen who unsubscribes between the two must not receive the
 * message that was already in flight - and with a queue, that gap is real.
 */

export interface NotificationRequest {
  readonly issueId: string;
  readonly event: NotificationEvent;
  /**
   * What makes this event distinct - the new status, or the update's id.
   * Combined with the issue and event to form the idempotency key.
   */
  readonly subject: string;
  readonly publicUpdateId?: string | null;
  readonly actorUserId?: string | null;
  readonly correlationId?: string | null;
}

export type QueueOutcome =
  | { readonly queued: true; readonly notificationId: string }
  | { readonly queued: false; readonly reason: string };

export const notificationService = {
  /**
   * Records the intent to send, exactly once.
   *
   * Returns rather than throws on every non-send path. This is called from
   * status changes and publications, and a communication problem must never
   * fail the administrative action that caused it - a staff member moving an
   * issue to RESOLVED should not see an error because a mail provider is down.
   */
  async queue(request: NotificationRequest): Promise<QueueOutcome> {
    const logger = getLogger();

    try {
      const issue = await prisma.issue.findUnique({
        where: { id: request.issueId },
        select: {
          id: true,
          organizationId: true,
          referenceNumber: true,
          subscriptions: {
            where: { active: true },
            select: { channel: true, destination: true },
          },
        },
      });

      if (!issue) return { queued: false, reason: 'Submission not found.' };

      // No consent, no message. The commonest outcome by far, and not an error:
      // most citizens never subscribe, and the system should be silent for them.
      const subscription = issue.subscriptions.find((entry) => isChannelSupported(entry.channel));
      if (!subscription) {
        return { queued: false, reason: 'No active subscription for this submission.' };
      }

      // A per-issue daily ceiling. Without it, a staff member editing a status
      // ten times in an afternoon emails a citizen ten times about one pothole,
      // and the platform has become the thing it was meant not to be.
      const env = getEnv();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await prisma.issueNotification.count({
        where: {
          issueId: issue.id,
          createdAt: { gte: since },
          status: { in: ['QUEUED', 'PROCESSING', 'SENT', 'DELIVERED'] },
        },
      });

      if (recent >= env.NOTIFICATION_MAX_PER_ISSUE_PER_DAY) {
        logger.warn(
          { issueId: issue.id, event: request.event },
          'Notification suppressed: per-issue daily ceiling reached',
        );
        return { queued: false, reason: 'Daily message limit for this submission reached.' };
      }

      const notification = await prisma.issueNotification.create({
        data: {
          organizationId: issue.organizationId,
          issueId: issue.id,
          event: request.event,
          channel: subscription.channel,
          recipientRedacted: redactEmail(subscription.destination),
          templateVersion: 'PENDING',
          idempotencyKey: buildIdempotencyKey(request),
          status: 'QUEUED',
          ...(request.publicUpdateId ? { publicUpdateId: request.publicUpdateId } : {}),
        },
        select: { id: true },
      });

      await auditService.record({
        action: 'NOTIFICATION_QUEUED',
        organizationId: issue.organizationId,
        actorUserId: request.actorUserId ?? null,
        entityType: 'IssueNotification',
        entityId: notification.id,
        // The event and the channel. Never the recipient, redacted or not -
        // the delivery row already holds the masked form for the dashboard.
        metadata: { reference: issue.referenceNumber, event: request.event },
        correlationId: request.correlationId ?? null,
      });

      return { queued: true, notificationId: notification.id };
    } catch (error) {
      // P2002 is the unique-constraint collision, and it is the SUCCESS case of
      // the idempotency design: somebody already queued this exact message.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { queued: false, reason: 'This notification has already been queued.' };
      }

      // Anything else is contained. A failure here must not propagate into the
      // status change or publication that triggered it.
      logger.error(
        { err: error, issueId: request.issueId, event: request.event },
        'Failed to queue notification',
      );
      return { queued: false, reason: 'The notification could not be queued.' };
    }
  },

  /**
   * Renders and delivers one queued notification.
   *
   * EXPORTED AND DELIBERATELY UNAUTHENTICATED, like Phase 6's `processIssue`:
   * the queue worker calls this with no `AuthContext`, because no user is
   * present when a message goes out at 3am. Authorization happened when the
   * work was queued; the tenant is read from the notification row itself and
   * never passed in.
   *
   * NEVER THROWS. Every failure is recorded on the row.
   */
  async deliver(notificationId: string): Promise<boolean> {
    const logger = getLogger();

    const notification = await prisma.issueNotification.findUnique({
      where: { id: notificationId },
      select: {
        id: true,
        organizationId: true,
        issueId: true,
        event: true,
        channel: true,
        status: true,
        attempts: true,
        publicUpdateId: true,
      },
    });

    if (!notification) return false;
    // Terminal already: a retry of something that succeeded must not re-send.
    if (['SENT', 'DELIVERED', 'SKIPPED'].includes(notification.status)) return true;

    if (notification.attempts >= NOTIFICATION_MAX_ATTEMPTS) {
      await this.fail(
        notification.id,
        'UNKNOWN',
        `Given up after ${NOTIFICATION_MAX_ATTEMPTS} attempts.`,
      );
      return false;
    }

    if (!areNotificationsEnabled()) {
      // SKIPPED, not FAILED. The system correctly chose not to send; counting
      // a configuration state as a failure would make a healthy deployment
      // look broken and bury the real failures.
      await this.skip(notification.id, 'Notifications are not enabled for this deployment.');
      return false;
    }

    // CONSENT IS CHECKED HERE, not at queue time. A citizen who unsubscribed
    // while this sat in the queue must not receive it.
    const [issue, subscription] = await Promise.all([
      prisma.issue.findUnique({
        where: { id: notification.issueId },
        select: {
          referenceNumber: true,
          status: true,
          submittedAt: true,
          updatedAt: true,
          category: { select: { label: true } },
          organization: { select: { name: true } },
        },
      }),
      prisma.issueSubscription.findFirst({
        where: { issueId: notification.issueId, channel: notification.channel, active: true },
        select: { destination: true },
      }),
    ]);

    if (!issue) {
      await this.skip(notification.id, 'The submission no longer exists.');
      return false;
    }
    if (!subscription) {
      await this.skip(notification.id, 'The citizen has stopped updates for this submission.');
      return false;
    }

    const publicUpdate = notification.publicUpdateId
      ? await prisma.issuePublicUpdate.findUnique({
          where: { id: notification.publicUpdateId },
          select: { body: true, status: true },
        })
      : null;

    // An update archived between publication and send must not go out.
    if (notification.publicUpdateId && publicUpdate?.status !== 'PUBLISHED') {
      await this.skip(notification.id, 'The update is no longer published.');
      return false;
    }

    await prisma.issueNotification.update({
      where: { id: notification.id },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });

    const env = getEnv();
    const base = env.NOTIFICATION_LINK_BASE_URL.replace(/\/+$/, '');

    try {
      const rendered = renderNotification(notification.event, {
        issueReference: issue.referenceNumber,
        status: issue.status,
        categoryLabel: issue.category?.label ?? null,
        submittedAt: issue.submittedAt,
        updatedAt: issue.updatedAt,
        organizationName: issue.organization.name,
        trackingUrl: `${base}/track-issue?reference=${encodeURIComponent(issue.referenceNumber)}`,
        // Carries no token: the unsubscribe page asks for the tracking code, so
        // a forwarded email cannot be used to switch off somebody else's
        // updates, and the link in an inbox is not itself a credential.
        unsubscribeUrl: `${base}/track-issue?reference=${encodeURIComponent(issue.referenceNumber)}&action=unsubscribe`,
        publicUpdate: publicUpdate?.body ?? null,
      });

      const provider = getNotificationProvider();
      const result = await provider.send(
        {
          destination: subscription.destination,
          subject: rendered.subject,
          body: rendered.body,
        },
        env.NOTIFICATION_TIMEOUT_MS,
      );

      await prisma.issueNotification.update({
        where: { id: notification.id },
        data: {
          status: result.confirmedDelivery ? 'DELIVERED' : 'SENT',
          templateVersion: rendered.version,
          sentAt: new Date(),
          ...(result.confirmedDelivery ? { deliveredAt: new Date() } : {}),
          failureKind: null,
          failureReason: null,
        },
      });

      await auditService.record({
        action: 'NOTIFICATION_SENT',
        organizationId: notification.organizationId,
        actorUserId: null,
        entityType: 'IssueNotification',
        entityId: notification.id,
        metadata: { event: notification.event, channel: notification.channel },
      });

      return true;
    } catch (error) {
      // A template that could not render is a bug in this codebase, not a
      // provider problem, and is classified so it does not hide among outages.
      if (error instanceof TemplateRenderError) {
        logger.error({ err: error, notificationId: notification.id }, 'Template render failed');
        await this.fail(notification.id, 'UNKNOWN', 'The message could not be prepared.');
        return false;
      }

      const providerError =
        error instanceof NotificationProviderError
          ? error
          : new NotificationProviderError('UNKNOWN', String((error as Error)?.message ?? error));

      // The provider's own message goes to the server log and nowhere else: it
      // routinely echoes the recipient address back.
      logger.warn(
        {
          notificationId: notification.id,
          kind: providerError.kind,
          err: providerError.message,
        },
        'Notification delivery failed',
      );

      await this.fail(notification.id, providerError.kind, safeFailureReason(providerError.kind));
      return false;
    }
  },

  /** Records a failure and the safe sentence an administrator is shown. */
  async fail(notificationId: string, kind: NotificationFailureKind, reason: string): Promise<void> {
    try {
      const updated = await prisma.issueNotification.update({
        where: { id: notificationId },
        data: {
          status: 'FAILED',
          failureKind: kind,
          failureReason: reason.slice(0, 300),
          failedAt: new Date(),
        },
        select: { organizationId: true, event: true },
      });

      await auditService.record({
        action: 'NOTIFICATION_FAILED',
        organizationId: updated.organizationId,
        actorUserId: null,
        entityType: 'IssueNotification',
        entityId: notificationId,
        metadata: { event: updated.event, failureKind: kind },
      });
    } catch (error) {
      getLogger().error({ err: error, notificationId }, 'Could not record notification failure');
    }
  },

  /** Records a deliberate non-send. Distinct from a failure. */
  async skip(notificationId: string, reason: string): Promise<void> {
    try {
      await prisma.issueNotification.update({
        where: { id: notificationId },
        data: { status: 'SKIPPED', failureReason: reason.slice(0, 300) },
      });
    } catch (error) {
      getLogger().error({ err: error, notificationId }, 'Could not record notification skip');
    }
  },
};

/**
 * Derived from the event's facts, never from a clock.
 *
 * Hashed so the column is a fixed width regardless of how long a subject grows,
 * and prefixed with the issue id so a human reading the table can still tell
 * which submission a key belongs to.
 */
export function buildIdempotencyKey(request: NotificationRequest): string {
  const digest = createHash('sha256')
    .update(`${request.issueId}|${request.event}|${request.subject}`)
    .digest('hex')
    .slice(0, 32);

  return `${request.issueId}:${request.event}:${digest}`;
}

/**
 * The sentence an administrator reads.
 *
 * Mapped from the category rather than passed through, for the same reason the
 * audit log redacts: a provider error string can contain the recipient address
 * and occasionally a credential fragment.
 */
function safeFailureReason(kind: NotificationFailureKind): string {
  const reasons: Record<NotificationFailureKind, string> = {
    PROVIDER_UNAVAILABLE: 'The email service could not be reached. This can be retried.',
    PROVIDER_REJECTED: 'The email service rejected the message.',
    TIMEOUT: 'The email service did not respond in time. This can be retried.',
    INVALID_DESTINATION: 'The saved address was not accepted by the email service.',
    NOT_CONFIGURED: 'Email sending is not configured for this deployment.',
    RATE_LIMITED: 'The email service is rate limiting messages. This can be retried.',
    UNKNOWN: 'The message could not be sent.',
  };
  return reasons[kind];
}
