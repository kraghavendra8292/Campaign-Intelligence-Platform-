import {
  MAX_EVIDENCE_PER_SUBJECT,
  isDecidedVerification,
  isEvidenceType,
  type AuthContext,
  type EvidenceType,
  type VerificationStatusValue,
  type WorkSubjectType,
} from '@rk/types';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../audit/audit.service';
import type { RequestMetadata } from '../auth/auth.service';
import { mediaService } from '../content/media/media.service';
import { optionalText, requireText } from '../content/shared/contentGuards';
import {
  loadSubject,
  requireWork,
  subjectNoun,
  updateSubjectVerification,
  type WorkSubject,
} from './shared/workSubject';

/**
 * Evidence attached to a claim.
 *
 * TWO RULES CARRY THIS FILE.
 *
 * 1. EVIDENCE IS PRIVATE UNTIL SOMEBODY PUBLISHES IT. `isPublic` defaults to
 *    false and every code path that sets it does so from an explicit input. A
 *    document attached in a hurry - which is most of them - is not a
 *    publication, and an evidence store that leaked by default would be worse
 *    than having none, because staff would stop attaching the difficult
 *    documents.
 *
 * 2. CHANGING EVIDENCE UNDER A DECIDED CLAIM REOPENS IT. Without this the
 *    attack needs no special access at all: submit a claim with sound evidence,
 *    get it verified, then swap the evidence. The badge would still read
 *    VERIFIED while attesting to a document no reviewer ever saw. So any
 *    material change to a VERIFIED or REJECTED claim's evidence moves it back
 *    to IN_REVIEW and records why.
 *
 * "Material" is defined narrowly and deliberately: the substance of the
 * evidence, not its presentation. Re-ordering items or fixing a typo in a
 * caption does not invalidate a review; changing which document is attached,
 * what it is claimed to be, or who is said to have issued it does.
 */

export interface EvidenceInputV2 {
  readonly title: string;
  readonly description?: string | null;
  readonly evidenceType?: string | null;
  readonly sourceNote?: string | null;
  readonly internalNote?: string | null;
  readonly documentId?: string | null;
  readonly referenceNumber?: string | null;
  readonly issuingAuthority?: string | null;
  readonly issuedOn?: string | null;
  readonly capturedOn?: string | null;
  readonly capturedLocation?: string | null;
  readonly isPublic?: boolean | null;
  readonly sortOrder?: number | null;
}

/**
 * Staff-facing selection. Includes `internalNote`, so every caller must have
 * already checked EVIDENCE_READ.
 */
export const EVIDENCE_ADMIN_SELECT = {
  id: true,
  achievementId: true,
  projectId: true,
  title: true,
  description: true,
  evidenceType: true,
  sourceNote: true,
  internalNote: true,
  referenceNumber: true,
  issuingAuthority: true,
  issuedOn: true,
  capturedOn: true,
  capturedLocation: true,
  isPublic: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  document: { select: { id: true, originalName: true, mimeType: true, kind: true } },
  uploadedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.WorkEvidenceSelect;

/**
 * The fields whose change invalidates a completed review.
 *
 * `internalNote` is absent on purpose: it is a reviewer's own working note and
 * is never what was reviewed. `sortOrder` and `description` are absent for the
 * same reason - presentation, not substance. Getting this list wrong in the
 * permissive direction is the serious error, so it errs the other way.
 */
const MATERIAL_FIELDS = [
  'title',
  'evidenceType',
  'documentId',
  'referenceNumber',
  'issuingAuthority',
  'issuedOn',
  'sourceNote',
] as const;

function parseDateOnly(value: string | null | undefined, field: string): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw AppError.validation('That date could not be read.', { details: { field } });
  }
  return parsed;
}

function parseEvidenceType(value: string | null | undefined): EvidenceType {
  if (!value) return 'OTHER';
  if (!isEvidenceType(value)) {
    throw AppError.validation('That is not a supported kind of evidence.', {
      details: { field: 'evidenceType' },
    });
  }
  return value;
}

export const evidenceService = {
  /**
   * Evidence for one subject, for staff.
   *
   * Requires EVIDENCE_READ because the rows carry `internalNote`. A caller who
   * only holds CONTENT_READ_UNPUBLISHED sees drafts, which is a different
   * disclosure from seeing how a claim was checked and who vouched for it.
   */
  async listForSubject(auth: AuthContext | null, type: WorkSubjectType, subjectId: string) {
    const { organizationId } = requireWork(auth, 'EVIDENCE_READ');
    const subject = await loadSubject(organizationId, type, subjectId);

    return prisma.workEvidence.findMany({
      where: this.subjectFilter(subject),
      select: EVIDENCE_ADMIN_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  },

  /** The `where` clause that pins evidence to one subject. */
  subjectFilter(subject: WorkSubject): Prisma.WorkEvidenceWhereInput {
    return subject.type === 'ACHIEVEMENT'
      ? { achievementId: subject.id, organizationId: subject.organizationId }
      : { projectId: subject.id, organizationId: subject.organizationId };
  },

  async add(
    auth: AuthContext | null,
    type: WorkSubjectType,
    subjectId: string,
    input: EvidenceInputV2,
    meta: RequestMetadata,
  ) {
    const { auth: actor, organizationId } = requireWork(auth, 'EVIDENCE_MANAGE');
    const subject = await loadSubject(organizationId, type, subjectId);

    const existing = await prisma.workEvidence.count({ where: this.subjectFilter(subject) });
    if (existing >= MAX_EVIDENCE_PER_SUBJECT) {
      throw AppError.validation(
        `A ${subjectNoun(type)} can carry at most ${MAX_EVIDENCE_PER_SUBJECT} pieces of evidence.`,
      );
    }

    const data = await this.prepare(organizationId, input);

    const created = await prisma.workEvidence.create({
      data: {
        ...data,
        organizationId,
        ...(type === 'ACHIEVEMENT' ? { achievementId: subject.id } : { projectId: subject.id }),
        sortOrder: input.sortOrder ?? existing,
        uploadedByUserId: actor.userId,
      },
      select: EVIDENCE_ADMIN_SELECT,
    });

    await this.afterChange(actor, subject, 'added', meta);

    await auditService.record({
      action: 'WORK_EVIDENCE_ADDED',
      organizationId,
      actorUserId: actor.userId,
      entityType: 'WorkEvidence',
      entityId: created.id,
      // The evidence TYPE and whether it was published are recorded; the title,
      // the note and the source are not. Audit metadata is readable by everyone
      // holding AUDIT_READ, a wider grant than EVIDENCE_READ, so copying the
      // content here would route around the permission containing it.
      metadata: {
        subjectType: type,
        subjectId: subject.id,
        evidenceType: created.evidenceType,
        isPublic: created.isPublic,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return created;
  },

  async update(
    auth: AuthContext | null,
    evidenceId: string,
    input: EvidenceInputV2,
    meta: RequestMetadata,
  ) {
    const { auth: actor, organizationId } = requireWork(auth, 'EVIDENCE_MANAGE');

    const current = await prisma.workEvidence.findFirst({
      where: { id: evidenceId, organizationId },
      select: {
        id: true,
        achievementId: true,
        projectId: true,
        title: true,
        evidenceType: true,
        documentId: true,
        referenceNumber: true,
        issuingAuthority: true,
        issuedOn: true,
        sourceNote: true,
        isPublic: true,
      },
    });
    if (!current) throw AppError.notFound('That evidence is not available.');

    const subject = await this.subjectOf(organizationId, current);
    const data = await this.prepare(organizationId, input);

    const updated = await prisma.workEvidence.update({
      where: { id: current.id },
      data: {
        ...data,
        ...(typeof input.sortOrder === 'number' ? { sortOrder: input.sortOrder } : {}),
      },
      select: EVIDENCE_ADMIN_SELECT,
    });

    // Compared against `data` - what was WRITTEN - rather than against the
    // returned row. The admin selection exposes the joined `document`, not the
    // raw `documentId`, so reading the field back off the result yielded
    // `undefined` against a stored `null` and marked every edit material. That
    // silently re-opened a verification on a typo fix, which is the failure
    // this comparison exists to avoid.
    const material = MATERIAL_FIELDS.some((field) => {
      const before = current[field as keyof typeof current] ?? null;
      const after = (data as Record<string, unknown>)[field] ?? null;
      if (before instanceof Date || after instanceof Date) {
        return (before as Date | null)?.getTime() !== (after as Date | null)?.getTime();
      }
      return before !== after;
    });

    if (material) await this.afterChange(actor, subject, 'changed', meta);

    await auditService.record({
      action: 'WORK_EVIDENCE_UPDATED',
      organizationId,
      actorUserId: actor.userId,
      entityType: 'WorkEvidence',
      entityId: updated.id,
      metadata: {
        subjectType: subject.type,
        subjectId: subject.id,
        evidenceType: updated.evidenceType,
        material,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return updated;
  },

  /**
   * Publishes or withdraws one piece of evidence.
   *
   * SEPARATE FROM `update`, and separately audited, because it is the only
   * evidence edit that is a DISCLOSURE. Publishing a document cannot be undone
   * for anybody who has already read it, so "who made this public, and when"
   * has to be answerable without diffing a stream of update records.
   *
   * Changing visibility is deliberately NOT material to verification: the
   * reviewer saw the same document either way. What changes is who else can.
   */
  async setVisibility(
    auth: AuthContext | null,
    evidenceId: string,
    isPublic: boolean,
    meta: RequestMetadata,
  ) {
    const { auth: actor, organizationId } = requireWork(auth, 'EVIDENCE_MANAGE');

    const current = await prisma.workEvidence.findFirst({
      where: { id: evidenceId, organizationId },
      select: { id: true, isPublic: true, achievementId: true, projectId: true },
    });
    if (!current) throw AppError.notFound('That evidence is not available.');
    if (current.isPublic === isPublic) {
      return prisma.workEvidence.findFirstOrThrow({
        where: { id: current.id },
        select: EVIDENCE_ADMIN_SELECT,
      });
    }

    const subject = await this.subjectOf(organizationId, current);

    const updated = await prisma.workEvidence.update({
      where: { id: current.id },
      data: { isPublic },
      select: EVIDENCE_ADMIN_SELECT,
    });

    await auditService.record({
      action: 'WORK_EVIDENCE_VISIBILITY_CHANGED',
      organizationId,
      actorUserId: actor.userId,
      entityType: 'WorkEvidence',
      entityId: updated.id,
      metadata: { subjectType: subject.type, subjectId: subject.id, isPublic },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return updated;
  },

  async remove(auth: AuthContext | null, evidenceId: string, meta: RequestMetadata) {
    const { auth: actor, organizationId } = requireWork(auth, 'EVIDENCE_MANAGE');

    const current = await prisma.workEvidence.findFirst({
      where: { id: evidenceId, organizationId },
      select: { id: true, achievementId: true, projectId: true, evidenceType: true },
    });
    if (!current) throw AppError.notFound('That evidence is not available.');

    const subject = await this.subjectOf(organizationId, current);

    await prisma.workEvidence.delete({ where: { id: current.id } });

    // Removal is always material: a review was conducted with this item in
    // front of the reviewer, and it no longer is.
    await this.afterChange(actor, subject, 'removed', meta);

    await auditService.record({
      action: 'WORK_EVIDENCE_REMOVED',
      organizationId,
      actorUserId: actor.userId,
      entityType: 'WorkEvidence',
      entityId: current.id,
      metadata: {
        subjectType: subject.type,
        subjectId: subject.id,
        evidenceType: current.evidenceType,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return { success: true };
  },

  /**
   * Reopens a decided claim after its evidence moved.
   *
   * Records the reason in the verification history rather than only flipping
   * the status, so the trail reads "verified, then evidence changed, then back
   * to review" instead of an unexplained regression. The previous decision is
   * cleared because it no longer refers to the material on file - leaving
   * `verifiedBy` populated on a claim that is back in review would attribute an
   * assessment to somebody who never made it about this evidence.
   */
  async afterChange(
    actor: AuthContext,
    subject: WorkSubject,
    how: 'added' | 'changed' | 'removed',
    meta: RequestMetadata,
  ): Promise<void> {
    if (!isDecidedVerification(subject.verification as VerificationStatusValue)) return;

    await prisma.$transaction(async (tx) => {
      await updateSubjectVerification(
        subject.type,
        subject.id,
        {
          verification: 'IN_REVIEW',
          verifiedAt: null,
          verifiedByUserId: null,
          rejectionReason: null,
        },
        tx,
      );

      await tx.verificationEvent.create({
        data: {
          organizationId: subject.organizationId,
          subjectType: subject.type,
          subjectId: subject.id,
          action: 'EVIDENCE_CHANGED',
          fromStatus: subject.verification as VerificationStatusValue,
          toStatus: 'IN_REVIEW',
          reason: `Evidence was ${how} after a decision was recorded, so the decision no longer covers what is on file.`,
          actorUserId: actor.userId,
        },
      });
    });

    void meta;
  },

  /** Loads the subject a piece of evidence belongs to. */
  async subjectOf(
    organizationId: string,
    row: { achievementId: string | null; projectId: string | null },
  ): Promise<WorkSubject> {
    if (row.achievementId) return loadSubject(organizationId, 'ACHIEVEMENT', row.achievementId);
    if (row.projectId) return loadSubject(organizationId, 'PROJECT', row.projectId);
    // Unreachable while the CHECK constraint holds. Thrown rather than assumed
    // away so a future migration that drops the constraint fails loudly here.
    throw AppError.internal('Evidence is not attached to a record.');
  },

  /** Validates and normalises one piece of evidence. */
  async prepare(organizationId: string, input: EvidenceInputV2) {
    return {
      title: requireText(input.title, 'title', 250),
      description: optionalText(input.description, 'description', 1000),
      evidenceType: parseEvidenceType(input.evidenceType),
      sourceNote: optionalText(input.sourceNote, 'sourceNote', 500),
      internalNote: optionalText(input.internalNote, 'internalNote', 2000),
      referenceNumber: optionalText(input.referenceNumber, 'referenceNumber', 120),
      issuingAuthority: optionalText(input.issuingAuthority, 'issuingAuthority', 250),
      issuedOn: parseDateOnly(input.issuedOn, 'issuedOn'),
      capturedOn: parseDateOnly(input.capturedOn, 'capturedOn'),
      capturedLocation: optionalText(input.capturedLocation, 'capturedLocation', 250),
      // The document must already belong to this tenant. Without this check a
      // client could attach another organisation's file by id and - because the
      // media route serves by id - publish it.
      documentId: await mediaService.assertBelongsToTenant(
        organizationId,
        input.documentId,
        'documentId',
      ),
      isPublic: input.isPublic ?? false,
    };
  },
};
