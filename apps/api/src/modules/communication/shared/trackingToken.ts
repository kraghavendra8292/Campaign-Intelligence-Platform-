import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { TRACKING_TOKEN_BYTES, isIssueReference } from '@rk/types';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';

/**
 * The citizen's proof that a submission is theirs.
 *
 * ---------------------------------------------------------------------------
 * WHY A TOKEN EXISTS AT ALL, GIVEN PHASE 5 DID NOT NEED ONE
 * ---------------------------------------------------------------------------
 *
 * Phase 5's tracking is safe with the reference alone because of what it
 * returns: six non-sensitive scalars, chosen so that somebody who found a
 * reference on a dropped note learns only that a report exists and is
 * progressing. That reasoning is sound and Phase 8 does not disturb it - status
 * and published updates remain readable with the reference alone, because a
 * published update is by definition something the organisation decided a
 * citizen should read.
 *
 * What Phase 8 adds is different in kind:
 *
 *  - FOLLOWING an issue attaches an email address to it.
 *  - FOLLOW-UP writes a citizen's words onto somebody else's report.
 *  - PREFERENCES read back the address that was attached.
 *
 * With reference-only auth, anybody holding a reference could subscribe their
 * own address to a stranger's report and receive every subsequent update about
 * it, or file a "not resolved" objection in their name. That is the threat the
 * token answers, and it is why the split is drawn between READING PUBLIC
 * INFORMATION and EVERYTHING THAT WRITES OR TOUCHES CONTACT DATA rather than
 * simply gating the whole surface.
 *
 * ---------------------------------------------------------------------------
 * STORAGE
 * ---------------------------------------------------------------------------
 *
 * Only the SHA-256 digest is stored, following the Phase 2 password-reset and
 * invitation pattern: a leaked database row must not yield a working token. The
 * plaintext is generated once at submission, returned once in the receipt, and
 * is not re-derivable. A citizen who loses it keeps read-only status lookup.
 *
 * SHA-256 without a work factor is correct here and would be wrong for a
 * password: this is 32 bytes of `randomBytes`, so there is no dictionary to
 * attack and no user-chosen weakness to stretch. What matters is that the digest
 * is one-way, which it is.
 */

/** Generates a token and its digest. The plaintext is returned exactly once. */
export function issueTrackingToken(): { token: string; hash: string } {
  const token = randomBytes(TRACKING_TOKEN_BYTES).toString('hex');
  return { token, hash: hashTrackingToken(token) };
}

export function hashTrackingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time comparison of two digests.
 *
 * The lookup below is by indexed hash rather than by scanning, so a timing
 * signal is not really reachable - but this is the shape the Phase 2 token
 * service uses, and a comparison of secrets that is sometimes constant-time and
 * sometimes not is the kind of inconsistency that gets copied into a place
 * where it does matter.
 */
export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface VerifiedIssue {
  readonly id: string;
  readonly organizationId: string;
  readonly referenceNumber: string;
  readonly status: string;
  readonly submittedAt: Date;
  readonly updatedAt: Date;
  readonly resolvedAt: Date | null;
}

/**
 * Resolves a reference plus token to the submission it identifies.
 *
 * BOTH MUST MATCH THE SAME ROW. Looking the issue up by reference and then
 * comparing the token would be equivalent here, but this queries on the
 * reference and verifies the digest afterwards so the failure is a single
 * indistinguishable outcome either way.
 *
 * Every failure - unknown reference, wrong token, no token ever issued,
 * suspended tenant, spam - produces the SAME error. Distinguishing them would
 * confirm to somebody guessing that a reference exists, which is the one thing
 * this surface must not do. It is the same reasoning as Phase 5's tracking
 * lookup returning null for all of its own failure cases.
 */
export async function verifyTrackingToken(
  rawReference: string,
  rawToken: string,
): Promise<VerifiedIssue> {
  const failure = AppError.validation(
    'That reference and tracking code do not match a submission.',
    { details: { field: 'trackingToken' } },
  );

  const reference = rawReference.trim().toUpperCase();
  const token = rawToken.trim();

  // Shape-checked before the database is touched, so malformed input costs a
  // regex rather than a query.
  if (!isIssueReference(reference)) throw failure;
  if (!/^[0-9a-f]{64}$/i.test(token)) throw failure;

  const issue = await prisma.issue.findUnique({
    where: { referenceNumber: reference },
    select: {
      id: true,
      organizationId: true,
      referenceNumber: true,
      status: true,
      submittedAt: true,
      updatedAt: true,
      resolvedAt: true,
      moderationStatus: true,
      trackingTokenHash: true,
      organization: { select: { status: true } },
    },
  });

  if (!issue) throw failure;
  if (issue.organization.status !== 'ACTIVE') throw failure;
  if (issue.moderationStatus === 'SPAM') throw failure;
  if (!issue.trackingTokenHash) throw failure;
  if (!tokensMatch(issue.trackingTokenHash, hashTrackingToken(token))) throw failure;

  return {
    id: issue.id,
    organizationId: issue.organizationId,
    referenceNumber: issue.referenceNumber,
    status: issue.status,
    submittedAt: issue.submittedAt,
    updatedAt: issue.updatedAt,
    resolvedAt: issue.resolvedAt,
  };
}
