import {
  REJECTION_REASON_MAX_LENGTH,
  REJECTION_REASON_MIN_LENGTH,
  type AuthContext,
  type ReviewDecision,
  type VerificationStatusValue,
  type WorkSubjectType,
} from '@rk/types';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../audit/audit.service';
import type { RequestMetadata } from '../auth/auth.service';
import { clampContentPageSize } from '../content/shared/contentGuards';
import {
  loadSubject,
  requireWork,
  subjectNoun,
  updateSubjectVerification,
  verifyPermissionFor,
  type WorkSubject,
} from './shared/workSubject';

/**
 * The verification workflow.
 *
 * WHAT THIS SERVICE REFUSES TO DO IS THE POINT OF IT.
 *
 *  - It never sets VERIFIED as a side effect of anything. Not when evidence is
 *    uploaded, not when a claim is published, not when an administrator creates
 *    a record, not when AI reads a document. The only way a claim becomes
 *    verified is a person holding the verification grant saying so.
 *  - It never touches `status`. Verifying is not publishing. A verified claim
 *    still has to be published by somebody holding the publish grant, and an
 *    unpublished claim can be verified - the two axes are independent because
 *    "we checked this" and "we are saying this publicly" are different acts.
 *  - It never rewrites history. Every transition appends a `VerificationEvent`,
 *    including the ones that reverse an earlier decision.
 *
 * A rejection must carry a reason. A rejection without one is unactionable:
 * whoever submitted the claim cannot fix it, and the next reviewer cannot tell
 * whether the evidence was wrong, missing, or simply never read.
 */

const QUEUE_SELECT = {
  id: true,
  slug: true,
  title: true,
  category: true,
  area: true,
  status: true,
  verification: true,
  submittedForReviewAt: true,
  assignedReviewerId: true,
  assignedReviewer: { select: { id: true, fullName: true } },
  submittedBy: { select: { id: true, fullName: true } },
  updatedAt: true,
} as const;

export interface VerificationQueueFilter {
  readonly statuses?: readonly string[] | null;
  readonly subjectTypes?: readonly string[] | null;
  readonly assignedToMe?: boolean | null;
  readonly first?: number | null;
}

function requireReason(reason: string | null | undefined): string {
  const text = (reason ?? '').trim();
  if (text.length < REJECTION_REASON_MIN_LENGTH) {
    throw AppError.validation(
      'A rejection needs a reason a colleague can act on - say what is missing or wrong.',
      { details: { field: 'reason' } },
    );
  }
  return text.slice(0, REJECTION_REASON_MAX_LENGTH);
}

export const verificationService = {
  /**
   * Puts a claim in front of a reviewer.
   *
   * Requires only the entity's UPDATE grant: asking for a check is ordinary
   * editorial work, and making it privileged would mean the people who write
   * claims cannot ask anybody to look at them.
   *
   * Refuses when there is nothing to review. Evidence is not required to
   * PUBLISH a claim - a proposed road is a legitimate statement with nothing to
   * evidence yet - but it is required to ask somebody to VERIFY one, because a
   * reviewer with no material in front of them can only rubber-stamp.
   */
  async submitForReview(
    auth: AuthContext | null,
    type: WorkSubjectType,
    subjectId: string,
    meta: RequestMetadata,
  ) {
    const permission = type === 'ACHIEVEMENT' ? 'ACHIEVEMENT_UPDATE' : 'PROJECT_UPDATE';
    const { auth: actor, organizationId } = requireWork(auth, permission);
    const subject = await loadSubject(organizationId, type, subjectId);

    if (subject.verification === 'IN_REVIEW') {
      throw AppError.conflict('This is already waiting for review.');
    }
    if (subject.verification === 'VERIFIED') {
      throw AppError.conflict(
        'This is already verified. Withdraw the verification first if it needs looking at again.',
      );
    }

    const evidenceCount = await prisma.workEvidence.count({
      where:
        type === 'ACHIEVEMENT'
          ? { achievementId: subject.id, organizationId }
          : { projectId: subject.id, organizationId },
    });
    if (evidenceCount === 0) {
      throw AppError.validation(
        `Attach at least one piece of evidence before asking for this ${subjectNoun(type)} to be verified.`,
      );
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await updateSubjectVerification(
        type,
        subject.id,
        {
          verification: 'IN_REVIEW',
          submittedForReviewAt: now,
          submittedByUserId: actor.userId,
          rejectionReason: null,
        },
        tx,
      );
      await tx.verificationEvent.create({
        data: {
          organizationId,
          subjectType: type,
          subjectId: subject.id,
          action: 'SUBMITTED_FOR_REVIEW',
          fromStatus: subject.verification as VerificationStatusValue,
          toStatus: 'IN_REVIEW',
          actorUserId: actor.userId,
        },
      });
    });

    await auditService.record({
      action: 'WORK_SUBMITTED_FOR_VERIFICATION',
      organizationId,
      actorUserId: actor.userId,
      entityType: type === 'ACHIEVEMENT' ? 'Achievement' : 'Project',
      entityId: subject.id,
      metadata: { subjectType: type, slug: subject.slug, evidenceCount },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return loadSubject(organizationId, type, subject.id);
  },

  /**
   * Routes a waiting claim to a named reviewer.
   *
   * Assignment is a hint, not a lock. It says who is expected to look, and the
   * queue can be filtered by it, but it does not stop another authorised
   * reviewer from deciding - a hard lock would strand claims behind whoever is
   * on leave, and the audit trail already records who actually decided.
   *
   * The assignee must hold the verification grant. Assigning to somebody who
   * cannot act produces a queue entry that looks handled and never moves.
   */
  async assignReviewer(
    auth: AuthContext | null,
    type: WorkSubjectType,
    subjectId: string,
    reviewerUserId: string,
    meta: RequestMetadata,
  ) {
    const { auth: actor, organizationId } = requireWork(auth, 'VERIFICATION_REVIEW');
    const subject = await loadSubject(organizationId, type, subjectId);

    const membership = await prisma.organizationMembership.findFirst({
      where: { organizationId, userId: reviewerUserId },
      select: { userId: true },
    });
    // NOT_FOUND rather than a message naming the user: whether a given id is a
    // member of this tenant is not something to confirm to a caller probing.
    if (!membership) throw AppError.notFound('That person is not in this organisation.');

    await prisma.$transaction(async (tx) => {
      await updateSubjectVerification(type, subject.id, { assignedReviewerId: reviewerUserId }, tx);
      await tx.verificationEvent.create({
        data: {
          organizationId,
          subjectType: type,
          subjectId: subject.id,
          action: 'REVIEWER_ASSIGNED',
          actorUserId: actor.userId,
        },
      });
    });

    await auditService.record({
      action: 'WORK_REVIEWER_ASSIGNED',
      organizationId,
      actorUserId: actor.userId,
      entityType: type === 'ACHIEVEMENT' ? 'Achievement' : 'Project',
      entityId: subject.id,
      metadata: { subjectType: type, reviewerUserId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return loadSubject(organizationId, type, subject.id);
  },

  /**
   * Records a decision.
   *
   * The permission checked depends on the subject: ACHIEVEMENT_VERIFY for a
   * claimed accomplishment (Phase 3's grant, unchanged), WORK_VERIFY for a
   * project. A reviewer decides one or the other, never both by accident.
   */
  async decide(
    auth: AuthContext | null,
    type: WorkSubjectType,
    subjectId: string,
    decision: ReviewDecision,
    reason: string | null | undefined,
    meta: RequestMetadata,
  ) {
    const { auth: actor, organizationId } = requireWork(auth, verifyPermissionFor(type));
    const subject = await loadSubject(organizationId, type, subjectId);

    if (subject.verification === 'UNVERIFIED') {
      throw AppError.conflict(
        'This has not been submitted for review yet, so there is nothing to decide.',
      );
    }

    const now = new Date();

    if (decision === 'VERIFY') {
      // Re-counted at decision time rather than trusted from submission: the
      // evidence may have been removed while the claim sat in the queue, and a
      // verification of nothing is the one outcome this phase must not produce.
      const evidenceCount = await prisma.workEvidence.count({
        where:
          type === 'ACHIEVEMENT'
            ? { achievementId: subject.id, organizationId }
            : { projectId: subject.id, organizationId },
      });
      if (evidenceCount === 0) {
        throw AppError.validation(
          'There is no evidence attached, so there is nothing here to verify.',
        );
      }

      await prisma.$transaction(async (tx) => {
        await updateSubjectVerification(
          type,
          subject.id,
          {
            verification: 'VERIFIED',
            verifiedAt: now,
            verifiedByUserId: actor.userId,
            rejectionReason: null,
          },
          tx,
        );
        await tx.verificationEvent.create({
          data: {
            organizationId,
            subjectType: type,
            subjectId: subject.id,
            action: 'VERIFIED',
            fromStatus: subject.verification as VerificationStatusValue,
            toStatus: 'VERIFIED',
            reason: reason?.trim() ? reason.trim().slice(0, REJECTION_REASON_MAX_LENGTH) : null,
            actorUserId: actor.userId,
          },
        });
      });

      await auditService.record({
        action: 'WORK_VERIFIED',
        organizationId,
        actorUserId: actor.userId,
        entityType: type === 'ACHIEVEMENT' ? 'Achievement' : 'Project',
        entityId: subject.id,
        // The reviewer's note is deliberately not copied here. See the Phase 9
        // block in `auth.ts`: AUDIT_READ is wider than EVIDENCE_READ.
        metadata: { subjectType: type, slug: subject.slug, evidenceCount },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return loadSubject(organizationId, type, subject.id);
    }

    const rejection = requireReason(reason);

    await prisma.$transaction(async (tx) => {
      await updateSubjectVerification(
        type,
        subject.id,
        {
          verification: 'REJECTED',
          verifiedAt: null,
          verifiedByUserId: null,
          rejectionReason: rejection,
        },
        tx,
      );
      await tx.verificationEvent.create({
        data: {
          organizationId,
          subjectType: type,
          subjectId: subject.id,
          action: 'REJECTED',
          fromStatus: subject.verification as VerificationStatusValue,
          toStatus: 'REJECTED',
          reason: rejection,
          actorUserId: actor.userId,
        },
      });
    });

    await auditService.record({
      action: 'WORK_VERIFICATION_REJECTED',
      organizationId,
      actorUserId: actor.userId,
      entityType: type === 'ACHIEVEMENT' ? 'Achievement' : 'Project',
      entityId: subject.id,
      metadata: { subjectType: type, slug: subject.slug },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return loadSubject(organizationId, type, subject.id);
  },

  /**
   * Takes back a verification.
   *
   * Exists because the alternative is worse: without it, a claim found to be
   * wrong after verification could only be corrected by deleting it, which
   * destroys the record that it was ever verified. Withdrawal leaves the whole
   * story in the history, which is what somebody asking "why did this change?"
   * needs to see.
   */
  async withdraw(
    auth: AuthContext | null,
    type: WorkSubjectType,
    subjectId: string,
    reason: string | null | undefined,
    meta: RequestMetadata,
  ) {
    const { auth: actor, organizationId } = requireWork(auth, verifyPermissionFor(type));
    const subject = await loadSubject(organizationId, type, subjectId);

    if (subject.verification !== 'VERIFIED') {
      throw AppError.conflict('This is not verified, so there is nothing to withdraw.');
    }

    const note = requireReason(reason);

    await prisma.$transaction(async (tx) => {
      await updateSubjectVerification(
        type,
        subject.id,
        { verification: 'UNVERIFIED', verifiedAt: null, verifiedByUserId: null },
        tx,
      );
      await tx.verificationEvent.create({
        data: {
          organizationId,
          subjectType: type,
          subjectId: subject.id,
          action: 'VERIFICATION_WITHDRAWN',
          fromStatus: 'VERIFIED',
          toStatus: 'UNVERIFIED',
          reason: note,
          actorUserId: actor.userId,
        },
      });
    });

    await auditService.record({
      action: 'WORK_VERIFICATION_WITHDRAWN',
      organizationId,
      actorUserId: actor.userId,
      entityType: type === 'ACHIEVEMENT' ? 'Achievement' : 'Project',
      entityId: subject.id,
      metadata: { subjectType: type, slug: subject.slug },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return loadSubject(organizationId, type, subject.id);
  },

  /**
   * The immutable trail for one claim.
   *
   * Behind EVIDENCE_READ rather than the verification grant: the entries carry
   * rejection reasons, which are internal working notes about why a claim did
   * not hold up. Somebody who may read evidence may read why it was judged
   * insufficient - those are the same disclosure.
   */
  async history(auth: AuthContext | null, type: WorkSubjectType, subjectId: string) {
    const { organizationId } = requireWork(auth, 'EVIDENCE_READ');
    const subject = await loadSubject(organizationId, type, subjectId);

    return prisma.verificationEvent.findMany({
      where: { organizationId, subjectType: type, subjectId: subject.id },
      select: {
        id: true,
        action: true,
        fromStatus: true,
        toStatus: true,
        reason: true,
        createdAt: true,
        actor: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * The reviewer queue.
   *
   * Returns both kinds of subject in one list, because a reviewer's question is
   * "what is waiting for me?", not "what achievements are waiting, and
   * separately what projects?". Two queries rather than a union view: the
   * tables have different columns and a database view would have to be kept in
   * step with both.
   */
  async queue(auth: AuthContext | null, filter: VerificationQueueFilter = {}) {
    const { auth: actor, organizationId } = requireWork(auth, 'VERIFICATION_REVIEW');
    const first = clampContentPageSize(filter.first, 25);

    const statuses = (
      filter.statuses?.length ? filter.statuses : ['IN_REVIEW']
    ) as VerificationStatusValue[];

    const types = (
      filter.subjectTypes?.length ? filter.subjectTypes : ['ACHIEVEMENT', 'PROJECT']
    ) as WorkSubjectType[];

    const base = {
      organizationId,
      verification: { in: statuses },
      ...(filter.assignedToMe ? { assignedReviewerId: actor.userId } : {}),
    };

    const [achievements, projects] = await Promise.all([
      types.includes('ACHIEVEMENT')
        ? prisma.achievement.findMany({
            where: base as Prisma.AchievementWhereInput,
            select: QUEUE_SELECT,
            orderBy: [{ submittedForReviewAt: 'asc' }, { updatedAt: 'asc' }],
            take: first,
          })
        : Promise.resolve([]),
      types.includes('PROJECT')
        ? prisma.project.findMany({
            where: base as Prisma.ProjectWhereInput,
            select: QUEUE_SELECT,
            orderBy: [{ submittedForReviewAt: 'asc' }, { updatedAt: 'asc' }],
            take: first,
          })
        : Promise.resolve([]),
    ]);

    const subjectIds = [...achievements, ...projects].map((row) => row.id);
    const counts = await this.evidenceCounts(organizationId, subjectIds);

    const rows = [
      ...achievements.map((row) => ({ ...row, subjectType: 'ACHIEVEMENT' as const })),
      ...projects.map((row) => ({ ...row, subjectType: 'PROJECT' as const })),
    ].map((row) => ({
      ...row,
      evidenceCount: counts.get(row.id) ?? 0,
      publicEvidenceCount: 0,
    }));

    // Oldest first. A queue sorted any other way lets the awkward case sink.
    rows.sort((a, b) => {
      const left = a.submittedForReviewAt?.getTime() ?? a.updatedAt.getTime();
      const right = b.submittedForReviewAt?.getTime() ?? b.updatedAt.getTime();
      return left - right;
    });

    return rows.slice(0, first);
  },

  /** Evidence counts for a set of subjects, in one query per subject kind. */
  async evidenceCounts(organizationId: string, subjectIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (subjectIds.length === 0) return result;

    const grouped = await prisma.workEvidence.groupBy({
      by: ['achievementId', 'projectId'],
      where: {
        organizationId,
        OR: [{ achievementId: { in: subjectIds } }, { projectId: { in: subjectIds } }],
      },
      _count: { _all: true },
    });

    for (const row of grouped) {
      const key = row.achievementId ?? row.projectId;
      if (key) result.set(key, (result.get(key) ?? 0) + row._count._all);
    }
    return result;
  },

  /** A single subject with everything a reviewer needs, in one call. */
  async reviewDetail(auth: AuthContext | null, type: WorkSubjectType, subjectId: string) {
    const { organizationId } = requireWork(auth, 'VERIFICATION_REVIEW');
    const subject: WorkSubject = await loadSubject(organizationId, type, subjectId);
    return subject;
  },
};
