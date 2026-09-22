import type {
  AuthContext,
  ContentCategory,
  ContentStatus,
  Locale,
  VerificationStatus,
} from '@rk/types';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { auditService } from '../../audit/audit.service';
import { authorizationService } from '../../auth/authorization.service';
import type { RequestMetadata } from '../../auth/auth.service';
import { mediaService } from '../media/media.service';
import { sanitizeRichText, toPlainText } from '../shared/sanitize';
import {
  clampContentPageSize,
  normalizeSlug,
  optionalText,
  requireCmsRead,
  requireContentAccess,
  requireText,
  resolveLocale,
  resolvePublishTransition,
  rethrowSlugConflict,
  transitionRequiresPublishPermission,
  type PublishAction,
} from '../shared/contentGuards';
import { auditActionFor, parseDate } from './project.service';
import { evidenceService } from '../../work/evidence.service';

/**
 * Achievement CMS.
 *
 * Differs from projects in one important way: **verification is not
 * publishing.** Marking an achievement VERIFIED is an assertion that staff
 * checked the evidence, and it requires ACHIEVEMENT_VERIFY - a permission the
 * CONTENT_MANAGER role does not hold. Publishing a *claim* and attesting it is
 * *true* are different acts by different people.
 *
 * Evidence carries an `internalNote` that the public selection never reads, so
 * staff can record how they checked something without that becoming a public
 * statement.
 */

const ACHIEVEMENT_SELECT = {
  id: true,
  slug: true,
  locale: true,
  title: true,
  summary: true,
  descriptionHtml: true,
  category: true,
  area: true,
  achievedOn: true,
  verification: true,
  verifiedAt: true,
  featured: true,
  displayOrder: true,
  status: true,
  publishedAt: true,
  metaTitle: true,
  metaDescription: true,
  createdAt: true,
  updatedAt: true,
  coverImage: { select: { id: true, altText: true, width: true, height: true } },
  verifiedBy: { select: { id: true, fullName: true } },
  media: {
    select: {
      id: true,
      caption: true,
      sortOrder: true,
      media: { select: { id: true, altText: true, width: true, height: true } },
    },
    orderBy: { sortOrder: 'asc' },
  },
  evidence: {
    select: {
      id: true,
      title: true,
      description: true,
      sourceNote: true,
      internalNote: true,
      isPublic: true,
      sortOrder: true,
      document: { select: { id: true, originalName: true, mimeType: true } },
    },
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.AchievementSelect;

export interface AchievementInput {
  readonly title: string;
  readonly slug?: string | null;
  readonly locale?: string | null;
  readonly summary?: string | null;
  readonly descriptionHtml?: string | null;
  readonly category?: ContentCategory | null;
  readonly area?: string | null;
  readonly achievedOn?: string | null;
  readonly coverImageId?: string | null;
  readonly featured?: boolean | null;
  readonly displayOrder?: number | null;
  readonly metaTitle?: string | null;
  readonly metaDescription?: string | null;
}

export interface EvidenceInput {
  readonly title: string;
  readonly description?: string | null;
  readonly sourceNote?: string | null;
  readonly internalNote?: string | null;
  readonly documentId?: string | null;
  readonly isPublic?: boolean | null;
}

export const achievementCmsService = {
  async list(
    auth: AuthContext,
    args: {
      first?: number | null;
      after?: string | null;
      status?: ContentStatus | null;
      category?: ContentCategory | null;
      search?: string | null;
      locale?: string | null;
    },
  ) {
    const { organizationId } = requireCmsRead(auth);
    const first = clampContentPageSize(args.first, 20);

    const where: Prisma.AchievementWhereInput = {
      organizationId,
      ...(args.locale ? { locale: resolveLocale(args.locale) } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.category ? { category: args.category } : {}),
      ...(args.search ? { title: { contains: args.search, mode: 'insensitive' } } : {}),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.achievement.findMany({
        where,
        select: ACHIEVEMENT_SELECT,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: first + 1,
        ...(args.after ? { cursor: { id: args.after }, skip: 1 } : {}),
      }),
      prisma.achievement.count({ where }),
    ]);

    const hasNextPage = rows.length > first;
    const nodes = hasNextPage ? rows.slice(0, first) : rows;

    return {
      nodes,
      totalCount,
      hasNextPage,
      endCursor: hasNextPage ? (nodes.at(-1)?.id ?? null) : null,
    };
  },

  async getById(auth: AuthContext, achievementId: string) {
    const { organizationId } = requireCmsRead(auth);

    const achievement = await prisma.achievement.findFirst({
      where: { id: achievementId, organizationId },
      select: ACHIEVEMENT_SELECT,
    });

    if (!achievement) throw AppError.notFound('Achievement not found.');
    return achievement;
  },

  async create(auth: AuthContext, input: AchievementInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'ACHIEVEMENT', 'CREATE');
    const data = await achievementCmsService.buildData(organizationId, input);

    try {
      const achievement = await prisma.achievement.create({
        // Starts unverified as well as unpublished: nothing is asserted true
        // merely because it was typed in.
        data: { ...data, organizationId, status: 'DRAFT', verification: 'UNVERIFIED' },
        select: ACHIEVEMENT_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_CREATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'Achievement',
        entityId: achievement.id,
        metadata: { slug: achievement.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return achievement;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  async update(
    auth: AuthContext,
    achievementId: string,
    input: AchievementInput,
    meta: RequestMetadata,
  ) {
    const { organizationId } = requireContentAccess(auth, 'ACHIEVEMENT', 'UPDATE');

    const existing = await prisma.achievement.findFirst({
      where: { id: achievementId, organizationId },
      select: { id: true, verification: true },
    });
    if (!existing) throw AppError.notFound('Achievement not found.');

    const data = await achievementCmsService.buildData(organizationId, input);

    try {
      const achievement = await prisma.achievement.update({
        where: { id: existing.id },
        data: {
          ...data,
          // Editing the substance of a verified claim invalidates the check.
          // Silently keeping the VERIFIED badge across an edit would let an
          // editor launder unverified text through a verified record.
          ...(existing.verification === 'VERIFIED'
            ? { verification: 'IN_REVIEW', verifiedAt: null, verifiedByUserId: null }
            : {}),
        },
        select: ACHIEVEMENT_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_UPDATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'Achievement',
        entityId: achievement.id,
        metadata: {
          slug: achievement.slug,
          verificationReset: existing.verification === 'VERIFIED',
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return achievement;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  /**
   * Records the outcome of an evidence check.
   *
   * Needs ACHIEVEMENT_VERIFY, and attributes the decision to a named user so
   * the claim is traceable to a person rather than to "the system".
   */
  async setVerification(
    auth: AuthContext,
    achievementId: string,
    verification: VerificationStatus,
    meta: RequestMetadata,
  ) {
    // REJECTED is reachable only through the Phase 9 review path, which
    // requires a reason and writes the decision into the verification history.
    // Allowing it here would produce a rejected claim with no recorded reason -
    // unactionable for whoever submitted it and invisible to the next reviewer,
    // which is the exact failure the REJECTED state was added to fix.
    if (verification === 'REJECTED') {
      throw AppError.validation(
        'Rejecting a claim needs a reason. Use the verification review workflow.',
        { details: { field: 'verification' } },
      );
    }

    const permitted = authorizationService.requirePermission(auth, 'ACHIEVEMENT_VERIFY');
    const { organizationId } = authorizationService.requireOrganization(permitted);

    const existing = await prisma.achievement.findFirst({
      where: { id: achievementId, organizationId },
      select: { id: true, slug: true },
    });
    if (!existing) throw AppError.notFound('Achievement not found.');

    const achievement = await prisma.achievement.update({
      where: { id: existing.id },
      data: {
        verification,
        verifiedAt: verification === 'VERIFIED' ? new Date() : null,
        verifiedByUserId: verification === 'VERIFIED' ? auth.userId : null,
      },
      select: ACHIEVEMENT_SELECT,
    });

    await auditService.record({
      action: 'ACHIEVEMENT_VERIFIED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Achievement',
      entityId: achievement.id,
      metadata: { slug: achievement.slug, verification },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return achievement;
  },

  async transition(
    auth: AuthContext,
    achievementId: string,
    action: PublishAction,
    meta: RequestMetadata,
  ) {
    const { organizationId } = transitionRequiresPublishPermission(action)
      ? requireContentAccess(auth, 'ACHIEVEMENT', 'PUBLISH')
      : requireContentAccess(auth, 'ACHIEVEMENT', 'UPDATE');

    const existing = await prisma.achievement.findFirst({
      where: { id: achievementId, organizationId },
      select: { id: true, slug: true, publishedAt: true },
    });
    if (!existing) throw AppError.notFound('Achievement not found.');

    const next = resolvePublishTransition(action, existing.publishedAt);

    const achievement = await prisma.achievement.update({
      where: { id: existing.id },
      data: { status: next.status, publishedAt: next.publishedAt },
      select: ACHIEVEMENT_SELECT,
    });

    await auditService.record({
      action: auditActionFor(action),
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Achievement',
      entityId: achievement.id,
      metadata: { slug: achievement.slug, status: next.status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return achievement;
  },

  async delete(auth: AuthContext, achievementId: string, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'ACHIEVEMENT', 'DELETE');

    const existing = await prisma.achievement.findFirst({
      where: { id: achievementId, organizationId },
      select: { id: true, slug: true, status: true },
    });
    if (!existing) throw AppError.notFound('Achievement not found.');

    if (existing.status === 'PUBLISHED') {
      throw AppError.conflict('Unpublish this achievement before deleting it.');
    }

    await prisma.achievement.delete({ where: { id: existing.id } });

    await auditService.record({
      action: 'CONTENT_DELETED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Achievement',
      entityId: existing.id,
      metadata: { slug: existing.slug },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return { success: true };
  },

  /**
   * Replaces the evidence attached to an achievement.
   *
   * PHASE 3 SEMANTICS, KEPT: the CMS editor sends the whole list, so this
   * still deletes and recreates. Phase 9 added two things around that rather
   * than changing it, because changing it would have broken the editor:
   *
   *  - rows are stamped with the tenant, which Phase 9 denormalised onto
   *    evidence so it can be filtered without a join;
   *  - a replace on a claim that has already been decided reopens its
   *    verification, exactly as an individual evidence edit does. Without
   *    this, the one write path that bypasses `evidenceService` would also be
   *    the one that lets verified evidence be swapped silently.
   *
   * Finer-grained editing lives in `evidenceService`, which is what the Phase 9
   * console uses and what carries the evidence metadata.
   */
  async setEvidence(
    auth: AuthContext,
    achievementId: string,
    items: readonly EvidenceInput[],
    meta: RequestMetadata,
  ) {
    const { organizationId } = requireContentAccess(auth, 'ACHIEVEMENT', 'UPDATE');

    const existing = await prisma.achievement.findFirst({
      where: { id: achievementId, organizationId },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        verification: true,
        verifiedAt: true,
        submittedForReviewAt: true,
        assignedReviewerId: true,
        submittedByUserId: true,
      },
    });
    if (!existing) throw AppError.notFound('Achievement not found.');

    const prepared: Array<{
      achievementId: string;
      organizationId: string;
      title: string;
      description: string | null;
      sourceNote: string | null;
      internalNote: string | null;
      documentId: string | null;
      isPublic: boolean;
      sortOrder: number;
      uploadedByUserId: string;
    }> = [];

    for (const [index, item] of items.slice(0, 25).entries()) {
      prepared.push({
        achievementId: existing.id,
        organizationId,
        title: requireText(item.title, 'title', 250),
        description: optionalText(item.description, 'description', 1000),
        sourceNote: optionalText(item.sourceNote, 'sourceNote', 500),
        internalNote: optionalText(item.internalNote, 'internalNote', 2000),
        documentId: await mediaService.assertBelongsToTenant(
          organizationId,
          item.documentId,
          'documentId',
        ),
        // Evidence is private unless explicitly published, so a note attached
        // in a hurry does not become public by default.
        isPublic: item.isPublic ?? false,
        sortOrder: index,
        uploadedByUserId: auth.userId,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.workEvidence.deleteMany({ where: { achievementId: existing.id } });
      if (prepared.length > 0) {
        await tx.workEvidence.createMany({ data: prepared });
      }
    });

    // Phase 9: a decided claim whose evidence has just been rewritten no longer
    // stands on what the reviewer saw.
    await evidenceService.afterChange(
      auth,
      { ...existing, type: 'ACHIEVEMENT' as const, organizationId },
      'changed',
      meta,
    );

    await auditService.record({
      action: 'CONTENT_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Achievement',
      entityId: existing.id,
      metadata: { evidenceCount: prepared.length },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return achievementCmsService.getById(auth, existing.id);
  },

  async setMedia(
    auth: AuthContext,
    achievementId: string,
    items: Array<{ mediaId: string; caption?: string | null }>,
    meta: RequestMetadata,
  ) {
    const { organizationId } = requireContentAccess(auth, 'ACHIEVEMENT', 'UPDATE');

    const existing = await prisma.achievement.findFirst({
      where: { id: achievementId, organizationId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound('Achievement not found.');

    for (const item of items.slice(0, 40)) {
      await mediaService.assertBelongsToTenant(organizationId, item.mediaId, 'mediaId');
    }

    await prisma.$transaction(async (tx) => {
      await tx.achievementMedia.deleteMany({ where: { achievementId: existing.id } });
      if (items.length > 0) {
        await tx.achievementMedia.createMany({
          data: items.slice(0, 40).map((item, index) => ({
            achievementId: existing.id,
            mediaId: item.mediaId,
            caption: item.caption?.slice(0, 400) ?? null,
            sortOrder: index,
          })),
          skipDuplicates: true,
        });
      }
    });

    await auditService.record({
      action: 'CONTENT_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Achievement',
      entityId: existing.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return achievementCmsService.getById(auth, existing.id);
  },

  async buildData(organizationId: string, input: AchievementInput) {
    const title = requireText(input.title, 'title', 250);
    const locale: Locale = resolveLocale(input.locale);
    const descriptionHtml = sanitizeRichText(input.descriptionHtml);

    return {
      slug: normalizeSlug(input.slug, title),
      locale,
      title,
      summary: optionalText(input.summary, 'summary', 600),
      descriptionHtml,
      category: input.category ?? 'OTHER',
      area: optionalText(input.area, 'area', 160),
      achievedOn: parseDate(input.achievedOn, 'achievedOn'),
      coverImageId: await mediaService.assertBelongsToTenant(
        organizationId,
        input.coverImageId,
        'coverImageId',
      ),
      featured: input.featured ?? false,
      displayOrder: input.displayOrder ?? 0,
      metaTitle: optionalText(input.metaTitle, 'metaTitle', 200),
      metaDescription:
        optionalText(input.metaDescription, 'metaDescription', 400) ??
        toPlainText(descriptionHtml ?? input.summary, 300),
    };
  },
};
