import {
  COMMUNICATION_LIMITS,
  REOPEN_REQUESTING_RESPONSES,
  isChannelSupported,
  isIssueReference,
  type FollowUpResponse,
  type NotificationChannel,
} from '@rk/types';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { getEnv } from '../../../config/env';
import { auditService } from '../../audit/audit.service';
import { getAttemptLimiter } from '../../auth/rateLimiter';
import { redactEmail } from '../provider/index';
import { verifyTrackingToken } from '../shared/trackingToken';
import { enqueueNotification } from '../notificationQueue';

/**
 * Everything a member of the public can do with their own submission.
 *
 * THE SECOND-NARROWEST SURFACE IN THE PLATFORM, after Phase 5's status lookup,
 * and every method here is reachable by an anonymous caller. Four rules shape
 * all of it:
 *
 * 1. READS ARE PROJECTIONS, NOT ROWS. Nothing returns a database record. Each
 *    method assembles a small object from named columns, so a field added to
 *    `Issue` later cannot appear on the public page by default.
 *
 * 2. THE TIMELINE READS `IssueHistory` BUT NEVER ITS `detail`. Status
 *    transitions are safe to project; the free-text column beside them carries
 *    staff context like "Assigned to Priya" and is never selected. This is why
 *    Phase 8 could reuse the existing table for the timeline while still giving
 *    public UPDATES their own.
 *
 * 3. WRITES REQUIRE THE TOKEN. Reading status and published updates needs only
 *    the reference - a published update is by definition something the
 *    organisation decided this citizen should read. Anything that attaches an
 *    address, or writes words onto somebody's report, requires proof the
 *    submission is theirs.
 *
 * 4. RATE LIMITED BEFORE ANY WORK. Every entry point sheds abuse first, using
 *    the Phase 2 limiter and the Phase 5 keying convention.
 */

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const citizenCommunicationService = {
  /**
   * The public timeline: what happened to this submission, and when.
   *
   * Reference alone. Derived from `IssueHistory` rows whose action is SUBMITTED
   * or STATUS_CHANGED, projecting ONLY the resulting status and the date -
   * never `detail`, never the actor, never an assignment, a moderation
   * decision, a priority change or a note.
   *
   * A citizen sees "Under review, 11 September". They do not see that it was
   * Priya who moved it there, and they never see that a note was added at all.
   */
  async timeline(rawReference: string, ipAddress: string | null) {
    await this.throttleLookup(ipAddress);

    const reference = rawReference.trim().toUpperCase();
    if (!isIssueReference(reference)) return null;

    const issue = await prisma.issue.findUnique({
      where: { referenceNumber: reference },
      select: {
        id: true,
        referenceNumber: true,
        type: true,
        status: true,
        submittedAt: true,
        updatedAt: true,
        resolvedAt: true,
        moderationStatus: true,
        category: { select: { label: true } },
        organization: { select: { name: true, status: true } },
      },
    });

    // One indistinguishable outcome for unknown, suspended and spam, matching
    // the Phase 5 lookup: anything else confirms a reference exists.
    if (!issue) return null;
    if (issue.organization.status !== 'ACTIVE') return null;
    if (issue.moderationStatus === 'SPAM') return null;

    const [history, updates, followUp] = await Promise.all([
      prisma.issueHistory.findMany({
        where: {
          issueId: issue.id,
          action: { in: ['SUBMITTED', 'STATUS_CHANGED'] },
        },
        // THE PRIVACY BOUNDARY OF THE TIMELINE IS THIS SELECT LIST. `detail`,
        // `performedByUserId` and the priority columns are absent, so they
        // cannot reach a citizen however the query is later modified.
        select: { id: true, action: true, newStatus: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: COMMUNICATION_LIMITS.publicTimelineMax,
      }),

      prisma.issuePublicUpdate.findMany({
        // PUBLISHED only. A draft is staff thinking aloud, and an archived
        // update was withdrawn.
        where: { issueId: issue.id, status: 'PUBLISHED' },
        select: { id: true, body: true, publishedAt: true },
        orderBy: { publishedAt: 'desc' },
        take: COMMUNICATION_LIMITS.publicUpdatePageSize,
      }),

      // Whether this citizen has already answered, so the page does not ask
      // twice. The answer itself is returned; the staff review note is not.
      prisma.issueFollowUp.findFirst({
        where: { issueId: issue.id },
        select: { response: true, submittedAt: true },
        orderBy: { submittedAt: 'desc' },
      }),
    ]);

    return {
      referenceNumber: issue.referenceNumber,
      type: issue.type,
      status: issue.status,
      categoryLabel: issue.category?.label ?? null,
      organizationName: issue.organization.name,
      submittedAt: issue.submittedAt,
      updatedAt: issue.updatedAt,
      resolvedAt: issue.resolvedAt,

      timeline: history.map((entry) => ({
        id: entry.id,
        // The SUBMITTED row has no `newStatus`; it IS the submission.
        status: entry.newStatus ?? 'SUBMITTED',
        occurredAt: entry.createdAt,
      })),

      publicUpdates: updates.map((update) => ({
        id: update.id,
        body: update.body,
        publishedAt: update.publishedAt,
      })),

      /** Whether the resolution question should be offered. */
      followUpAvailable:
        (issue.status === 'RESOLVED' || issue.status === 'CLOSED') && followUp === null,
      existingFollowUp: followUp
        ? { response: followUp.response, submittedAt: followUp.submittedAt }
        : null,
    };
  },

  /**
   * The citizen's own notification settings.
   *
   * TOKEN REQUIRED, because this returns the address that was attached to the
   * submission - and even then it is returned REDACTED. The page needs to show
   * "we send to r***@example.com" so the citizen recognises it; it does not
   * need to reproduce an address that somebody reading over their shoulder
   * could then use.
   */
  async subscription(reference: string, token: string, ipAddress: string | null) {
    await this.throttleSubscription(ipAddress);
    const issue = await verifyTrackingToken(reference, token);

    const subscription = await prisma.issueSubscription.findFirst({
      where: { issueId: issue.id, channel: 'EMAIL' },
      select: { channel: true, destination: true, active: true, consentGivenAt: true },
    });

    return {
      referenceNumber: issue.referenceNumber,
      channel: 'EMAIL' as NotificationChannel,
      subscribed: subscription?.active ?? false,
      destinationRedacted: subscription ? redactEmail(subscription.destination) : null,
      consentGivenAt: subscription?.consentGivenAt ?? null,
      /** What the deployment can actually deliver. SMS is declared, not built. */
      supportedChannels: ['EMAIL'] as NotificationChannel[],
    };
  },

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Starts or updates a subscription to one's own submission.
   *
   * CONSENT IS EXPLICIT AND SINGLE-PURPOSE. `consent` must be true, and the
   * instant is recorded, so the basis for holding the address is evidenced
   * rather than inferred from the row existing - the same pattern as Phase 5's
   * `consentAt`. There is no other consent to bundle it with, because there is
   * no marketing anywhere in this product.
   *
   * Upsert rather than insert: re-subscribing updates the one row per channel,
   * so a citizen who submits the form twice gets one subscription rather than
   * two that would each send.
   */
  async follow(
    input: {
      reference: string;
      token: string;
      channel: NotificationChannel;
      destination: string;
      consent: boolean;
    },
    context: { ipAddress: string | null; correlationId: string },
  ) {
    await this.throttleSubscription(context.ipAddress);
    const issue = await verifyTrackingToken(input.reference, input.token);

    if (!input.consent) {
      throw AppError.validation(
        'Please confirm you agree to receive updates about this submission.',
        { details: { field: 'consent' } },
      );
    }

    if (!isChannelSupported(input.channel)) {
      // Honest rather than silently accepting a subscription that would never
      // deliver. SMS is declared in the schema and has no provider.
      throw AppError.validation(
        'Text message updates are not available. Email updates can be enabled instead.',
        { details: { field: 'channel' } },
      );
    }

    const destination = input.destination.trim().toLowerCase();
    if (destination.length === 0 || destination.length > COMMUNICATION_LIMITS.destinationMax) {
      throw AppError.validation('Enter an email address.', { details: { field: 'destination' } });
    }
    // Deliberately permissive: the authoritative test of an address is whether
    // mail reaches it, and a strict pattern rejects valid addresses.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
      throw AppError.validation('Enter a valid email address.', {
        details: { field: 'destination' },
      });
    }

    await prisma.issueSubscription.upsert({
      where: { issueId_channel: { issueId: issue.id, channel: input.channel } },
      create: {
        organizationId: issue.organizationId,
        issueId: issue.id,
        channel: input.channel,
        destination,
        consentGivenAt: new Date(),
        active: true,
      },
      update: {
        destination,
        // Re-consented: a citizen re-enabling updates is giving consent again,
        // and the recorded instant should be the current one.
        consentGivenAt: new Date(),
        active: true,
        unsubscribedAt: null,
      },
    });

    await auditService.record({
      action: 'ISSUE_SUBSCRIPTION_CREATED',
      organizationId: issue.organizationId,
      // NULL actor: the subscriber is a member of the public, not a user. The
      // same convention as ISSUE_SUBMITTED.
      actorUserId: null,
      entityType: 'IssueSubscription',
      entityId: issue.id,
      // The channel and the fact of consent, never the address.
      metadata: { reference: issue.referenceNumber, channel: input.channel, consent: true },
      correlationId: context.correlationId,
    });

    return { subscribed: true, destinationRedacted: redactEmail(destination) };
  },

  /**
   * Stops future messages about one submission.
   *
   * DOES NOT DELETE ANYTHING. The subscription row is deactivated, the issue is
   * untouched, and the history of what was already sent is preserved - a
   * citizen asking to stop being emailed has not asked for their report to be
   * withdrawn, and conflating the two would lose a civic complaint because
   * somebody found the emails annoying.
   */
  async unsubscribe(
    input: { reference: string; token: string },
    context: { ipAddress: string | null; correlationId: string },
  ) {
    await this.throttleSubscription(context.ipAddress);
    const issue = await verifyTrackingToken(input.reference, input.token);

    const result = await prisma.issueSubscription.updateMany({
      where: { issueId: issue.id, active: true },
      data: { active: false, unsubscribedAt: new Date() },
    });

    if (result.count > 0) {
      await auditService.record({
        action: 'ISSUE_SUBSCRIPTION_STOPPED',
        organizationId: issue.organizationId,
        actorUserId: null,
        entityType: 'IssueSubscription',
        entityId: issue.id,
        metadata: { reference: issue.referenceNumber },
        correlationId: context.correlationId,
      });
    }

    return { subscribed: false };
  },

  /**
   * The citizen's answer to "was this fixed?".
   *
   * RECORDS A STATEMENT; CHANGES NOTHING. A `NOT_RESOLVED` answer sets
   * `reopenRequested` so it appears in a staff queue, and that is the entire
   * effect - the issue's status, priority and assignment are untouched. A
   * citizen saying "no" is important information, not an instruction the system
   * executes, and auto-reopening would let anybody holding a token bounce a
   * closed issue back open indefinitely.
   *
   * ONE PER ISSUE. A second submission is refused rather than stacked, which
   * stops a frustrated citizen (or a script) filling the review queue with
   * repeats of the same objection.
   */
  async submitFollowUp(
    input: {
      reference: string;
      token: string;
      response: FollowUpResponse;
      comment?: string | null;
    },
    context: { ipAddress: string | null; correlationId: string },
  ) {
    await this.throttleFollowUp(context.ipAddress);
    const issue = await verifyTrackingToken(input.reference, input.token);

    // Only meaningful once the campaign says it is done. Asking somebody
    // whether a problem is fixed while it is still queued is noise.
    if (issue.status !== 'RESOLVED' && issue.status !== 'CLOSED') {
      throw AppError.validation(
        'This submission is still being handled. You can share feedback once it has been resolved.',
      );
    }

    const existing = await prisma.issueFollowUp.findFirst({
      where: { issueId: issue.id },
      select: { id: true },
    });
    if (existing) {
      throw AppError.conflict('You have already sent feedback about this submission.');
    }

    const comment = input.comment?.trim() ?? '';
    if (comment.length > COMMUNICATION_LIMITS.followUpCommentMax) {
      throw AppError.validation(
        `Please keep your comment to ${COMMUNICATION_LIMITS.followUpCommentMax} characters or fewer.`,
        { details: { field: 'comment' } },
      );
    }

    const reopenRequested = REOPEN_REQUESTING_RESPONSES.includes(input.response);

    const followUp = await prisma.issueFollowUp.create({
      data: {
        organizationId: issue.organizationId,
        issueId: issue.id,
        response: input.response,
        comment: comment.length > 0 ? comment : null,
        reopenRequested,
      },
      select: { id: true },
    });

    await auditService.record({
      action: 'ISSUE_FOLLOW_UP_SUBMITTED',
      organizationId: issue.organizationId,
      actorUserId: null,
      entityType: 'IssueFollowUp',
      entityId: followUp.id,
      // The response and whether it asks for a second look. NOT the comment:
      // it is citizen free text and the audit log is widely readable in a tenant.
      metadata: {
        reference: issue.referenceNumber,
        response: input.response,
        reopenRequested,
      },
      correlationId: context.correlationId,
    });

    if (reopenRequested) {
      await auditService.record({
        action: 'ISSUE_REOPEN_REQUESTED',
        organizationId: issue.organizationId,
        actorUserId: null,
        entityType: 'IssueFollowUp',
        entityId: followUp.id,
        metadata: { reference: issue.referenceNumber },
        correlationId: context.correlationId,
      });
    }

    return {
      recorded: true,
      reopenRequested,
      // Says plainly what will and will not happen next, so the citizen is not
      // left expecting an automatic reversal.
      message: reopenRequested
        ? 'Thank you. Your submission has been flagged for review by the team.'
        : 'Thank you for letting us know.',
    };
  },

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  /**
   * Keyed on IP alone, like Phase 5's public endpoints.
   *
   * There is no account to key on, and keying on the reference would let an
   * attacker rotate references to escape the limit - while also letting them
   * lock a specific citizen out of their own submission by exhausting its
   * budget.
   */
  async throttleLookup(ipAddress: string | null): Promise<void> {
    const env = getEnv();
    await this.consume(
      `comm-track:${ipAddress ?? 'unknown'}`,
      env.ISSUE_TRACK_MAX_PER_WINDOW,
      env.ISSUE_TRACK_WINDOW_MS,
      'Too many lookups. Please try again in a little while.',
    );
  },

  async throttleSubscription(ipAddress: string | null): Promise<void> {
    const env = getEnv();
    await this.consume(
      `comm-sub:${ipAddress ?? 'unknown'}`,
      env.SUBSCRIPTION_MAX_PER_WINDOW,
      env.SUBSCRIPTION_WINDOW_MS,
      'Too many changes. Please try again in a little while.',
    );
  },

  async throttleFollowUp(ipAddress: string | null): Promise<void> {
    const env = getEnv();
    await this.consume(
      `comm-followup:${ipAddress ?? 'unknown'}`,
      env.FOLLOW_UP_MAX_PER_WINDOW,
      env.FOLLOW_UP_WINDOW_MS,
      'Too many submissions. Please try again in a little while.',
    );
  },

  async consume(key: string, max: number, windowMs: number, message: string): Promise<void> {
    const attempt = await getAttemptLimiter().consume(key, max, windowMs);
    if (!attempt.allowed) throw AppError.rateLimited(message);
  },
};

/**
 * Re-exported so the submission path can queue a receipt without importing the
 * queue directly. Keeps Phase 5's one Phase 8 touchpoint to a single symbol.
 */
export { enqueueNotification };
