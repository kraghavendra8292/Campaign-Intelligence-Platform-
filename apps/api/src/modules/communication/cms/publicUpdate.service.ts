import { COMMUNICATION_LIMITS, type AuthContext, type Permission } from '@rk/types';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { authorizationService } from '../../auth/authorization.service';
import { auditService } from '../../audit/audit.service';
import type { RequestMeta } from '../../issues/cms/issue.service';
import { enqueueNotification } from '../notificationQueue';

/**
 * Staff-authored messages to citizens.
 *
 * THE SEPARATION THIS FILE EXISTS TO ENFORCE. An internal note (Phase 5's
 * `IssueInternalNote`) and a public update live in different tables, are
 * written through different services, require different permissions, and are
 * rendered in different sections of the issue page. There is no field, flag or
 * code path that converts one into the other.
 *
 * That is stronger than a `visibility` column on a shared table, which is the
 * design this deliberately avoided: a flag means every write path must get the
 * default right forever, and one that forgets publishes a staff member's candid
 * note to a member of the public. Here, a note cannot become public because
 * there is no operation that moves it.
 *
 * DRAFTING IS UNGATED; PUBLISHING IS NOT. Writing a draft nobody can see is not
 * a disclosure, and gating it would stop an issue handler preparing text for a
 * colleague to approve. Publishing is the organisation speaking to a citizen,
 * and it cannot be unsaid once read - so it needs `COMMUNICATION_PUBLISH`.
 */

function requireCommunication(
  auth: AuthContext | null,
  permission: Permission,
): { auth: AuthContext; organizationId: string } {
  const permitted = authorizationService.requirePermission(auth, permission);
  return authorizationService.requireOrganization(permitted);
}

/**
 * Validates the body a citizen will read.
 *
 * PLAIN TEXT ONLY, and the check is a rejection rather than a sanitisation.
 * Stripping tags silently would leave a staff member wondering why their
 * formatting vanished and would invite somebody to find a form the stripper
 * misses; refusing is unambiguous and there is nothing to bypass. The public
 * page renders this through JSX interpolation, so even if markup survived it
 * would display as text rather than execute - the check is the second line.
 */
function validateBody(raw: string): string {
  const body = raw.trim();

  if (body.length < COMMUNICATION_LIMITS.publicUpdateMin) {
    throw AppError.validation('Write a little more so the update is useful to the citizen.', {
      details: { field: 'body', min: COMMUNICATION_LIMITS.publicUpdateMin },
    });
  }
  if (body.length > COMMUNICATION_LIMITS.publicUpdateMax) {
    throw AppError.validation(
      `Please keep the update to ${COMMUNICATION_LIMITS.publicUpdateMax} characters or fewer.`,
      { details: { field: 'body', max: COMMUNICATION_LIMITS.publicUpdateMax } },
    );
  }
  if (/<[a-z/][^>]*>/i.test(body)) {
    throw AppError.validation('Updates are sent as plain text. Please remove any HTML tags.', {
      details: { field: 'body' },
    });
  }

  return body;
}

export const publicUpdateService = {
  /**
   * Writes a draft. Visible to staff only until somebody publishes it.
   *
   * Requires `COMMUNICATION_READ` rather than a dedicated draft permission -
   * anybody who can see the communication section can prepare text in it.
   */
  async createDraft(
    auth: AuthContext,
    input: { issueId: string; body: string },
    meta: RequestMeta,
  ) {
    const { organizationId } = requireCommunication(auth, 'COMMUNICATION_READ');
    const body = validateBody(input.body);

    // Tenant-scoped existence check BEFORE the write, so an id from another
    // organisation fails as not-found rather than creating an orphan row.
    const issue = await prisma.issue.findFirst({
      where: { id: input.issueId, organizationId },
      select: { id: true, referenceNumber: true },
    });
    if (!issue) throw AppError.notFound('Submission not found.');

    const update = await prisma.issuePublicUpdate.create({
      data: {
        organizationId,
        issueId: issue.id,
        body,
        status: 'DRAFT',
        createdByUserId: auth.userId,
      },
      select: UPDATE_SELECT,
    });

    await auditService.record({
      action: 'PUBLIC_UPDATE_CREATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'IssuePublicUpdate',
      entityId: update.id,
      // The reference and the fact of a draft. NOT the body: it is unpublished
      // text and the audit log is widely readable within a tenant.
      metadata: { reference: issue.referenceNumber },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return update;
  },

  /**
   * Makes a draft visible to the citizen, and notifies them if they consented.
   *
   * THE CONSEQUENTIAL ACT OF THE PHASE. Separately permissioned, separately
   * audited, and irreversible in the sense that matters: archiving later
   * withdraws the update from the page but cannot unsend what somebody read.
   *
   * `publishedAt` is set once and never rewritten on a later transition, so the
   * date a citizen saw remains the date the record shows.
   */
  async publish(auth: AuthContext, updateId: string, meta: RequestMeta) {
    const { organizationId } = requireCommunication(auth, 'COMMUNICATION_PUBLISH');

    const existing = await prisma.issuePublicUpdate.findFirst({
      where: { id: updateId, organizationId },
      select: {
        id: true,
        status: true,
        publishedAt: true,
        issueId: true,
        issue: { select: { referenceNumber: true, status: true } },
      },
    });
    if (!existing) throw AppError.notFound('Update not found.');

    if (existing.status === 'PUBLISHED') {
      // Not an error worth failing on, but it must not queue a second
      // notification. The idempotency key would catch a duplicate anyway; this
      // stops the pointless work reaching it.
      throw AppError.conflict('This update has already been published.');
    }
    if (existing.status === 'ARCHIVED') {
      throw AppError.conflict('This update was withdrawn and cannot be published.');
    }

    const published = await prisma.issuePublicUpdate.update({
      where: { id: existing.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: existing.publishedAt ?? new Date(),
        publishedByUserId: auth.userId,
      },
      select: UPDATE_SELECT,
    });

    await auditService.record({
      action: 'PUBLIC_UPDATE_PUBLISHED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'IssuePublicUpdate',
      entityId: published.id,
      metadata: { reference: existing.issue.referenceNumber },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    // Fire-and-forget, AFTER the publication is committed. A mail problem must
    // not fail the publish - the update is already on the citizen's page.
    enqueueNotification({
      issueId: existing.issueId,
      event: 'PUBLIC_UPDATE_PUBLISHED',
      // The update's id makes this event unique: publishing a second update on
      // the same issue is a different message and should send.
      subject: published.id,
      publicUpdateId: published.id,
      actorUserId: auth.userId,
      correlationId: meta.correlationId,
    });

    return published;
  },

  /**
   * Publishes a CORRECTION that supersedes an earlier update.
   *
   * Corrections rather than edits, because a published update has already been
   * read and may already have been emailed. Silently rewriting it would leave
   * the record disagreeing with what the citizen was actually told, which is
   * exactly what a later dispute turns on. The original is archived and stays
   * readable in the admin console; the citizen sees the correction.
   */
  async correct(auth: AuthContext, input: { updateId: string; body: string }, meta: RequestMeta) {
    const { organizationId } = requireCommunication(auth, 'COMMUNICATION_PUBLISH');
    const body = validateBody(input.body);

    const original = await prisma.issuePublicUpdate.findFirst({
      where: { id: input.updateId, organizationId },
      select: {
        id: true,
        issueId: true,
        status: true,
        issue: { select: { referenceNumber: true } },
      },
    });
    if (!original) throw AppError.notFound('Update not found.');
    if (original.status !== 'PUBLISHED') {
      throw AppError.validation(
        'Only a published update needs a correction. Edit the draft instead.',
      );
    }

    const correction = await prisma.$transaction(async (tx) => {
      const created = await tx.issuePublicUpdate.create({
        data: {
          organizationId,
          issueId: original.issueId,
          body,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          createdByUserId: auth.userId,
          publishedByUserId: auth.userId,
          supersedesId: original.id,
        },
        select: UPDATE_SELECT,
      });

      // The superseded original leaves the public page but is not deleted.
      await tx.issuePublicUpdate.update({
        where: { id: original.id },
        data: { status: 'ARCHIVED' },
      });

      return created;
    });

    await auditService.record({
      action: 'PUBLIC_UPDATE_PUBLISHED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'IssuePublicUpdate',
      entityId: correction.id,
      metadata: { reference: original.issue.referenceNumber, supersedes: original.id },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    enqueueNotification({
      issueId: original.issueId,
      event: 'PUBLIC_UPDATE_PUBLISHED',
      subject: correction.id,
      publicUpdateId: correction.id,
      actorUserId: auth.userId,
      correlationId: meta.correlationId,
    });

    return correction;
  },

  /** Withdraws an update from the public page without deleting the record. */
  async archive(auth: AuthContext, updateId: string, meta: RequestMeta) {
    const { organizationId } = requireCommunication(auth, 'COMMUNICATION_PUBLISH');

    const existing = await prisma.issuePublicUpdate.findFirst({
      where: { id: updateId, organizationId },
      select: { id: true, issue: { select: { referenceNumber: true } } },
    });
    if (!existing) throw AppError.notFound('Update not found.');

    const archived = await prisma.issuePublicUpdate.update({
      where: { id: existing.id },
      data: { status: 'ARCHIVED' },
      select: UPDATE_SELECT,
    });

    await auditService.record({
      action: 'PUBLIC_UPDATE_ARCHIVED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'IssuePublicUpdate',
      entityId: archived.id,
      metadata: { reference: existing.issue.referenceNumber },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return archived;
  },

  /** Every update on one issue, drafts included. Staff view. */
  async listForIssue(auth: AuthContext, issueId: string) {
    const { organizationId } = requireCommunication(auth, 'COMMUNICATION_READ');

    const issue = await prisma.issue.findFirst({
      where: { id: issueId, organizationId },
      select: { id: true },
    });
    if (!issue) throw AppError.notFound('Submission not found.');

    return prisma.issuePublicUpdate.findMany({
      where: { issueId: issue.id },
      select: UPDATE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  },
};

const UPDATE_SELECT = {
  id: true,
  issueId: true,
  body: true,
  status: true,
  publishedAt: true,
  supersedesId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, fullName: true } },
  publishedBy: { select: { id: true, fullName: true } },
} as const;
