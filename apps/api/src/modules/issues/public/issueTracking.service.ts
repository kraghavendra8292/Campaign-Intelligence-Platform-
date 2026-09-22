import { isIssueReference, type IssueStatus, type SubmissionType } from '@rk/types';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { getEnv } from '../../../config/env';
import { getAttemptLimiter } from '../../auth/rateLimiter';

/**
 * Public status lookup by reference number.
 *
 * THE NARROWEST READ SURFACE IN THE PLATFORM. A citizen who kept their
 * reference can see that their report is progressing; nobody can learn anything
 * else, and nothing here can be walked.
 *
 * WHAT IS RETURNED, and this list is exhaustive by construction: the reference,
 * the submission type, the category, the status, and two timestamps.
 *
 * WHAT IS NOT, however the query is shaped, because these columns are never
 * selected:
 *   - the title and description. The citizen WROTE them and sometimes fills
 *     them with personal circumstances. Somebody who found a reference on a
 *     dropped note must not read them.
 *   - contact details, internal notes, staff assignments, attachments,
 *     moderation state, priority, and the internal id.
 *
 * Priority is withheld specifically: it is an internal triage judgement, and
 * telling a citizen their report is "LOW" would be both discouraging and none
 * of the platform's business to volunteer.
 */

export interface PublicIssueStatus {
  readonly referenceNumber: string;
  readonly type: SubmissionType;
  readonly categoryLabel: string | null;
  readonly status: IssueStatus;
  readonly submittedAt: Date;
  readonly updatedAt: Date;
}

export interface TrackingContext {
  readonly ipAddress: string | null;
}

export const issueTrackingService = {
  /**
   * Looks up one reference.
   *
   * Rate limited hard, and much more tightly than submission. A reference is an
   * 8-character random token from a 32-character alphabet - about 1.1 × 10¹²
   * possibilities - so brute force is already impractical, but the limiter
   * means it is not even worth starting, and it also stops somebody harvesting
   * references found elsewhere.
   */
  async lookup(rawReference: string, context: TrackingContext): Promise<PublicIssueStatus | null> {
    const env = getEnv();

    const limiter = getAttemptLimiter();
    const attempt = await limiter.consume(
      `issue-track:${context.ipAddress ?? 'unknown'}`,
      env.ISSUE_TRACK_MAX_PER_WINDOW,
      env.ISSUE_TRACK_WINDOW_MS,
    );

    if (!attempt.allowed) {
      throw AppError.rateLimited('Too many lookups. Please try again in a little while.');
    }

    const reference = rawReference.trim().toUpperCase();

    // Shape-checked before the database is touched, so a flood of malformed
    // lookups costs a regex each rather than a query each.
    if (!isIssueReference(reference)) return null;

    const issue = await prisma.issue.findUnique({
      where: { referenceNumber: reference },
      // The whole privacy guarantee of this endpoint is this select list.
      select: {
        referenceNumber: true,
        type: true,
        status: true,
        moderationStatus: true,
        submittedAt: true,
        updatedAt: true,
        category: { select: { label: true } },
        organization: { select: { status: true } },
      },
    });

    // A null result for "no such reference", "suspended tenant" and "rejected as
    // spam" alike. Distinguishing them would confirm to somebody guessing that
    // a reference exists, which is the one thing this endpoint must not do.
    if (!issue) return null;
    if (issue.organization.status !== 'ACTIVE') return null;
    if (issue.moderationStatus === 'SPAM') return null;

    return {
      referenceNumber: issue.referenceNumber,
      type: issue.type,
      categoryLabel: issue.category?.label ?? null,
      status: issue.status,
      submittedAt: issue.submittedAt,
      updatedAt: issue.updatedAt,
    };
  },
};
