import type { AuthContext, ContentCategory, ContentStatus, Locale, ProjectStatus } from '@rk/types';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { auditService } from '../../audit/audit.service';
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

/**
 * Project CMS.
 *
 * The reference implementation for every publishable content type. Three rules
 * hold throughout and are repeated in the sibling services:
 *
 *  1. permission first, then a TENANT-SCOPED load of the target;
 *  2. rich text passes through the sanitiser on the way in, never on the way out;
 *  3. publishing is a separate transition needing its own permission.
 */

const PROJECT_SELECT = {
  id: true,
  slug: true,
  locale: true,
  title: true,
  shortDescription: true,
  descriptionHtml: true,
  category: true,
  area: true,
  locationName: true,
  latitude: true,
  longitude: true,
  startDate: true,
  completionDate: true,
  projectStatus: true,
  costAmount: true,
  costCurrency: true,
  beneficiaryCount: true,
  featured: true,
  displayOrder: true,
  status: true,
  publishedAt: true,
  metaTitle: true,
  metaDescription: true,
  createdAt: true,
  updatedAt: true,
  coverImage: { select: { id: true, altText: true, width: true, height: true } },
  media: {
    select: {
      id: true,
      role: true,
      caption: true,
      sortOrder: true,
      media: { select: { id: true, altText: true, width: true, height: true } },
    },
    orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
  },
  updates: {
    select: { id: true, title: true, bodyHtml: true, occurredOn: true, sortOrder: true },
    orderBy: { occurredOn: 'desc' },
  },
} satisfies Prisma.ProjectSelect;

export interface ProjectInput {
  readonly title: string;
  readonly slug?: string | null;
  readonly locale?: string | null;
  readonly shortDescription?: string | null;
  readonly descriptionHtml?: string | null;
  readonly category?: ContentCategory | null;
  readonly area?: string | null;
  readonly locationName?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly startDate?: string | null;
  readonly completionDate?: string | null;
  readonly projectStatus?: ProjectStatus | null;
  readonly costAmount?: number | null;
  readonly costCurrency?: string | null;
  readonly beneficiaryCount?: number | null;
  readonly coverImageId?: string | null;
  readonly featured?: boolean | null;
  readonly displayOrder?: number | null;
  readonly metaTitle?: string | null;
  readonly metaDescription?: string | null;
}

/** Parses a calendar date, rejecting nonsense rather than storing `Invalid Date`. */
export function parseDate(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw AppError.validation('Enter a valid date.', { details: { field } });
  }
  return parsed;
}

/** Rejects a coordinate outside its real-world range. */
function parseCoordinate(
  value: number | null | undefined,
  field: string,
  limit: number,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    throw AppError.validation(`Enter a valid ${field}.`, { details: { field } });
  }
  return value;
}

/** Rejects a negative count; absent stays absent rather than becoming zero. */
function parseCount(value: number | null | undefined, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw AppError.validation('Enter a whole number of zero or more.', { details: { field } });
  }
  return value;
}

export const projectCmsService = {
  /**
   * CMS listing across every status.
   *
   * Requires CONTENT_READ_UNPUBLISHED, which is what separates the editor's
   * view from the public one.
   */
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

    const where: Prisma.ProjectWhereInput = {
      organizationId,
      ...(args.locale ? { locale: resolveLocale(args.locale) } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.category ? { category: args.category } : {}),
      ...(args.search
        ? {
            OR: [
              { title: { contains: args.search, mode: 'insensitive' } },
              { slug: { contains: args.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.project.findMany({
        where,
        select: PROJECT_SELECT,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: first + 1,
        ...(args.after ? { cursor: { id: args.after }, skip: 1 } : {}),
      }),
      prisma.project.count({ where }),
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

  /** One project, including drafts. Tenant-scoped, so a foreign id is NOT_FOUND. */
  async getById(auth: AuthContext, projectId: string) {
    const { organizationId } = requireCmsRead(auth);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: PROJECT_SELECT,
    });

    if (!project) throw AppError.notFound('Project not found.');
    return project;
  },

  async create(auth: AuthContext, input: ProjectInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'PROJECT', 'CREATE');
    const data = await projectCmsService.buildData(organizationId, input);

    try {
      const project = await prisma.project.create({
        // New content always starts as a draft. There is no "create published"
        // path, so publishing is always a deliberate, separately-permitted act.
        data: { ...data, organizationId, status: 'DRAFT', createdByUserId: auth.userId },
        select: PROJECT_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_CREATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'Project',
        entityId: project.id,
        metadata: { slug: project.slug, locale: project.locale },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return project;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  async update(auth: AuthContext, projectId: string, input: ProjectInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'PROJECT', 'UPDATE');

    const existing = await prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound('Project not found.');

    const data = await projectCmsService.buildData(organizationId, input);

    try {
      const project = await prisma.project.update({
        where: { id: existing.id },
        // `status` is absent on purpose: editing never changes visibility.
        data,
        select: PROJECT_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_UPDATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'Project',
        entityId: project.id,
        metadata: { slug: project.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return project;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  /** Publishing, unpublishing, review and archiving. */
  async transition(
    auth: AuthContext,
    projectId: string,
    action: PublishAction,
    meta: RequestMetadata,
  ) {
    const { organizationId } = transitionRequiresPublishPermission(action)
      ? requireContentAccess(auth, 'PROJECT', 'PUBLISH')
      : requireContentAccess(auth, 'PROJECT', 'UPDATE');

    const existing = await prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, slug: true, publishedAt: true, title: true },
    });
    if (!existing) throw AppError.notFound('Project not found.');

    const next = resolvePublishTransition(action, existing.publishedAt);

    const project = await prisma.project.update({
      where: { id: existing.id },
      data: { status: next.status, publishedAt: next.publishedAt },
      select: PROJECT_SELECT,
    });

    await auditService.record({
      action: auditActionFor(action),
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Project',
      entityId: project.id,
      metadata: { slug: project.slug, status: next.status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return project;
  },

  async delete(auth: AuthContext, projectId: string, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'PROJECT', 'DELETE');

    const existing = await prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, slug: true, status: true },
    });
    if (!existing) throw AppError.notFound('Project not found.');

    // Taking a live page down is a publishing decision, not a filing one.
    if (existing.status === 'PUBLISHED') {
      throw AppError.conflict('Unpublish this project before deleting it.');
    }

    await prisma.project.delete({ where: { id: existing.id } });

    await auditService.record({
      action: 'CONTENT_DELETED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Project',
      entityId: existing.id,
      metadata: { slug: existing.slug },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return { success: true };
  },

  /** Replaces a project's gallery/before/after attachments. */
  async setMedia(
    auth: AuthContext,
    projectId: string,
    items: Array<{
      mediaId: string;
      role: 'GALLERY' | 'BEFORE' | 'AFTER';
      caption?: string | null;
    }>,
    meta: RequestMetadata,
  ) {
    const { organizationId } = requireContentAccess(auth, 'PROJECT', 'UPDATE');

    const existing = await prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound('Project not found.');

    // Every referenced asset must belong to this tenant, checked before any
    // write so a foreign id cannot be attached even transiently.
    for (const item of items.slice(0, 50)) {
      await mediaService.assertBelongsToTenant(organizationId, item.mediaId, 'mediaId');
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectMedia.deleteMany({ where: { projectId: existing.id } });

      if (items.length > 0) {
        await tx.projectMedia.createMany({
          data: items.slice(0, 50).map((item, index) => ({
            projectId: existing.id,
            mediaId: item.mediaId,
            role: item.role,
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
      entityType: 'Project',
      entityId: existing.id,
      metadata: { mediaCount: items.length },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return projectCmsService.getById(auth, existing.id);
  },

  /**
   * Normalises and validates project input.
   *
   * Shared by create and update so the two cannot diverge - a validation rule
   * that applies on create but not on update is a rule that does not apply.
   */
  async buildData(organizationId: string, input: ProjectInput) {
    const title = requireText(input.title, 'title', 250);
    const locale: Locale = resolveLocale(input.locale);
    const descriptionHtml = sanitizeRichText(input.descriptionHtml);

    const startDate = parseDate(input.startDate, 'startDate');
    const completionDate = parseDate(input.completionDate, 'completionDate');

    if (startDate && completionDate && completionDate < startDate) {
      throw AppError.validation('Completion date cannot be before the start date.', {
        details: { field: 'completionDate' },
      });
    }

    return {
      slug: normalizeSlug(input.slug, title),
      locale,
      title,
      shortDescription: optionalText(input.shortDescription, 'shortDescription', 600),
      descriptionHtml,
      category: input.category ?? 'OTHER',
      area: optionalText(input.area, 'area', 160),
      locationName: optionalText(input.locationName, 'locationName', 250),
      latitude: parseCoordinate(input.latitude, 'latitude', 90),
      longitude: parseCoordinate(input.longitude, 'longitude', 180),
      startDate,
      completionDate,
      projectStatus: input.projectStatus ?? 'PLANNED',
      costAmount: input.costAmount ?? null,
      costCurrency: optionalText(input.costCurrency, 'costCurrency', 3),
      beneficiaryCount: parseCount(input.beneficiaryCount, 'beneficiaryCount'),
      coverImageId: await mediaService.assertBelongsToTenant(
        organizationId,
        input.coverImageId,
        'coverImageId',
      ),
      featured: input.featured ?? false,
      displayOrder: input.displayOrder ?? 0,
      metaTitle: optionalText(input.metaTitle, 'metaTitle', 200),
      // Falls back to a plain-text excerpt so a page is never published with an
      // empty description in search results.
      metaDescription:
        optionalText(input.metaDescription, 'metaDescription', 400) ??
        toPlainText(descriptionHtml ?? input.shortDescription, 300),
    };
  },
};

/** Maps a transition onto the audit vocabulary. */
export function auditActionFor(action: PublishAction) {
  switch (action) {
    case 'PUBLISH':
      return 'CONTENT_PUBLISHED' as const;
    case 'UNPUBLISH':
      return 'CONTENT_UNPUBLISHED' as const;
    case 'SUBMIT_FOR_REVIEW':
      return 'CONTENT_SUBMITTED_FOR_REVIEW' as const;
    case 'ARCHIVE':
      return 'CONTENT_ARCHIVED' as const;
  }
}
