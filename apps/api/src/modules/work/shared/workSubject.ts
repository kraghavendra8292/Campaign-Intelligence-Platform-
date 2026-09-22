import type { AuthContext, WorkSubjectType } from '@rk/types';
import { AppError } from '../../../errors/AppError';
import { prisma } from '../../../database/prisma';
import { authorizationService } from '../../auth/authorization.service';

/**
 * Resolving the thing being evidenced or verified.
 *
 * THE TENANT BOUNDARY FOR THE WHOLE PHASE LIVES HERE. Every service in this
 * module reaches its subject through `loadSubject`, which takes the
 * organisation from the verified `AuthContext` and never from an argument. A
 * resolver cannot accidentally omit the filter, because there is no function in
 * this module that will load a subject without one.
 *
 * Cross-tenant access returns NOT_FOUND rather than FORBIDDEN, following the
 * rule Phase 5 set: FORBIDDEN confirms the id exists somewhere, which is a fact
 * about another tenant's data that an attacker enumerating ids would otherwise
 * be handed for free.
 */

export interface WorkSubject {
  readonly type: WorkSubjectType;
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly verification: string;
  readonly verifiedAt: Date | null;
  readonly submittedForReviewAt: Date | null;
  readonly assignedReviewerId: string | null;
  readonly submittedByUserId: string | null;
}

const SUBJECT_SELECT = {
  id: true,
  organizationId: true,
  slug: true,
  title: true,
  status: true,
  verification: true,
  verifiedAt: true,
  submittedForReviewAt: true,
  assignedReviewerId: true,
  submittedByUserId: true,
} as const;

/**
 * Loads a subject inside the caller's tenant, or throws NOT_FOUND.
 *
 * The two branches are deliberately not collapsed into a dynamic table lookup.
 * `prisma[table]` with a string would defeat the type checker on exactly the
 * queries where a mistake is a cross-tenant read, and the duplication is six
 * lines against that.
 */
export async function loadSubject(
  organizationId: string,
  type: WorkSubjectType,
  id: string,
): Promise<WorkSubject> {
  const row =
    type === 'ACHIEVEMENT'
      ? await prisma.achievement.findFirst({
          where: { id, organizationId },
          select: SUBJECT_SELECT,
        })
      : await prisma.project.findFirst({
          where: { id, organizationId },
          select: SUBJECT_SELECT,
        });

  if (!row) throw AppError.notFound('That record is not available.');

  return { type, ...row };
}

/**
 * Which permission decides verification for this kind of subject.
 *
 * `ACHIEVEMENT_VERIFY` is Phase 3's and is kept exactly as it was, so no role's
 * existing authority changes underneath it. `WORK_VERIFY` is new because
 * projects had no verification concept at all before Phase 9 - reusing the
 * achievement grant would have silently widened what every holder of it could
 * attest to.
 */
export function verifyPermissionFor(type: WorkSubjectType): 'ACHIEVEMENT_VERIFY' | 'WORK_VERIFY' {
  return type === 'ACHIEVEMENT' ? 'ACHIEVEMENT_VERIFY' : 'WORK_VERIFY';
}

/** Which permission decides publication for this kind of subject. */
export function publishPermissionFor(
  type: WorkSubjectType,
): 'ACHIEVEMENT_PUBLISH' | 'PROJECT_PUBLISH' {
  return type === 'ACHIEVEMENT' ? 'ACHIEVEMENT_PUBLISH' : 'PROJECT_PUBLISH';
}

/** Which permission decides editing for this kind of subject. */
export function updatePermissionFor(
  type: WorkSubjectType,
): 'ACHIEVEMENT_UPDATE' | 'PROJECT_UPDATE' {
  return type === 'ACHIEVEMENT' ? 'ACHIEVEMENT_UPDATE' : 'PROJECT_UPDATE';
}

/** Asserts a permission and returns the caller's tenant in one step. */
export function requireWork(
  auth: AuthContext | null,
  permission: Parameters<typeof authorizationService.requirePermission>[1],
): { auth: AuthContext; organizationId: string } {
  const permitted = authorizationService.requirePermission(auth, permission);
  return authorizationService.requireOrganization(permitted);
}

/**
 * Writes the subject's verification columns, whichever table it lives in.
 *
 * Centralised so a new verification field cannot be added to one subject and
 * forgotten on the other - which would show up as a claim that can be verified
 * but never un-verified, or a rejection reason that survives a later approval.
 */
export async function updateSubjectVerification(
  type: WorkSubjectType,
  id: string,
  data: {
    verification?: 'UNVERIFIED' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED';
    verifiedAt?: Date | null;
    verifiedByUserId?: string | null;
    submittedForReviewAt?: Date | null;
    submittedByUserId?: string | null;
    assignedReviewerId?: string | null;
    rejectionReason?: string | null;
  },
  client: Pick<typeof prisma, 'achievement' | 'project'> = prisma,
): Promise<void> {
  if (type === 'ACHIEVEMENT') {
    await client.achievement.update({ where: { id }, data });
  } else {
    await client.project.update({ where: { id }, data });
  }
}

/** Human label used in error messages, so they read naturally for each kind. */
export function subjectNoun(type: WorkSubjectType): string {
  return type === 'ACHIEVEMENT' ? 'achievement' : 'project';
}
