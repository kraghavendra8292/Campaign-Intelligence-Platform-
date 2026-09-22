import type { AuthContext, ContentCategory, ContentStatus, EventStatus } from '@rk/types';
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
import { auditActionFor, parseDate } from './project.service';

/**
 * News and event CMS.
 *
 * Grouped because both are simple dated records that follow the project
 * lifecycle exactly. Events add one domain rule the others do not have: their
 * `eventStatus` is derived from the clock, not stored by hand, so an event does
 * not stay "upcoming" forever because nobody edited it.
 */

const NEWS_SELECT = {
  id: true,
  slug: true,
  locale: true,
  title: true,
  summary: true,
  contentHtml: true,
  category: true,
  tags: true,
  authorName: true,
  featured: true,
  status: true,
  publishedAt: true,
  metaTitle: true,
  metaDescription: true,
  createdAt: true,
  updatedAt: true,
  coverImage: { select: { id: true, altText: true, width: true, height: true } },
} satisfies Prisma.NewsArticleSelect;

const EVENT_SELECT = {
  id: true,
  slug: true,
  locale: true,
  title: true,
  summary: true,
  descriptionHtml: true,
  startsAt: true,
  endsAt: true,
  locationName: true,
  address: true,
  organizer: true,
  eventStatus: true,
  featured: true,
  status: true,
  publishedAt: true,
  metaTitle: true,
  metaDescription: true,
  createdAt: true,
  updatedAt: true,
  coverImage: { select: { id: true, altText: true, width: true, height: true } },
} satisfies Prisma.EventSelect;

export interface NewsInput {
  readonly title: string;
  readonly slug?: string | null;
  readonly locale?: string | null;
  readonly summary?: string | null;
  readonly contentHtml?: string | null;
  readonly category?: ContentCategory | null;
  readonly tags?: readonly string[] | null;
  readonly authorName?: string | null;
  readonly coverImageId?: string | null;
  readonly featured?: boolean | null;
  readonly metaTitle?: string | null;
  readonly metaDescription?: string | null;
}

export interface EventInput {
  readonly title: string;
  readonly slug?: string | null;
  readonly locale?: string | null;
  readonly summary?: string | null;
  readonly descriptionHtml?: string | null;
  readonly startsAt: string;
  readonly endsAt?: string | null;
  readonly locationName?: string | null;
  readonly address?: string | null;
  readonly organizer?: string | null;
  readonly coverImageId?: string | null;
  readonly featured?: boolean | null;
  readonly metaTitle?: string | null;
  readonly metaDescription?: string | null;
}

/** Normalises free-form tags: trimmed, de-duplicated, bounded. */
function normalizeTags(tags: readonly string[] | null | undefined): string[] {
  if (!tags) return [];
  const cleaned = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0 && tag.length <= 40);
  return [...new Set(cleaned)].slice(0, 12);
}

export const newsCmsService = {
  async list(
    auth: AuthContext,
    args: {
      first?: number | null;
      after?: string | null;
      status?: ContentStatus | null;
      search?: string | null;
      locale?: string | null;
    },
  ) {
    const { organizationId } = requireCmsRead(auth);
    const first = clampContentPageSize(args.first, 20);

    const where: Prisma.NewsArticleWhereInput = {
      organizationId,
      ...(args.locale ? { locale: resolveLocale(args.locale) } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.search ? { title: { contains: args.search, mode: 'insensitive' } } : {}),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.newsArticle.findMany({
        where,
        select: NEWS_SELECT,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: first + 1,
        ...(args.after ? { cursor: { id: args.after }, skip: 1 } : {}),
      }),
      prisma.newsArticle.count({ where }),
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

  async getById(auth: AuthContext, id: string) {
    const { organizationId } = requireCmsRead(auth);
    const article = await prisma.newsArticle.findFirst({
      where: { id, organizationId },
      select: NEWS_SELECT,
    });
    if (!article) throw AppError.notFound('Article not found.');
    return article;
  },

  async create(auth: AuthContext, input: NewsInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'NEWS', 'CREATE');
    const data = await newsCmsService.buildData(organizationId, input);

    try {
      const article = await prisma.newsArticle.create({
        data: { ...data, organizationId, status: 'DRAFT', createdByUserId: auth.userId },
        select: NEWS_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_CREATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'NewsArticle',
        entityId: article.id,
        metadata: { slug: article.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return article;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  async update(auth: AuthContext, id: string, input: NewsInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'NEWS', 'UPDATE');

    const existing = await prisma.newsArticle.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound('Article not found.');

    const data = await newsCmsService.buildData(organizationId, input);

    try {
      const article = await prisma.newsArticle.update({
        where: { id: existing.id },
        data,
        select: NEWS_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_UPDATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'NewsArticle',
        entityId: article.id,
        metadata: { slug: article.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return article;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  async transition(auth: AuthContext, id: string, action: PublishAction, meta: RequestMetadata) {
    const { organizationId } = transitionRequiresPublishPermission(action)
      ? requireContentAccess(auth, 'NEWS', 'PUBLISH')
      : requireContentAccess(auth, 'NEWS', 'UPDATE');

    const existing = await prisma.newsArticle.findFirst({
      where: { id, organizationId },
      select: { id: true, slug: true, publishedAt: true },
    });
    if (!existing) throw AppError.notFound('Article not found.');

    const next = resolvePublishTransition(action, existing.publishedAt);

    const article = await prisma.newsArticle.update({
      where: { id: existing.id },
      data: { status: next.status, publishedAt: next.publishedAt },
      select: NEWS_SELECT,
    });

    await auditService.record({
      action: auditActionFor(action),
      organizationId,
      actorUserId: auth.userId,
      entityType: 'NewsArticle',
      entityId: article.id,
      metadata: { slug: article.slug, status: next.status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return article;
  },

  async delete(auth: AuthContext, id: string, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'NEWS', 'DELETE');

    const existing = await prisma.newsArticle.findFirst({
      where: { id, organizationId },
      select: { id: true, slug: true, status: true },
    });
    if (!existing) throw AppError.notFound('Article not found.');
    if (existing.status === 'PUBLISHED') {
      throw AppError.conflict('Unpublish this article before deleting it.');
    }

    await prisma.newsArticle.delete({ where: { id: existing.id } });

    await auditService.record({
      action: 'CONTENT_DELETED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'NewsArticle',
      entityId: existing.id,
      metadata: { slug: existing.slug },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return { success: true };
  },

  async buildData(organizationId: string, input: NewsInput) {
    const title = requireText(input.title, 'title', 250);
    const contentHtml = sanitizeRichText(input.contentHtml);

    return {
      slug: normalizeSlug(input.slug, title),
      locale: resolveLocale(input.locale),
      title,
      summary: optionalText(input.summary, 'summary', 600),
      contentHtml,
      category: input.category ?? 'OTHER',
      tags: normalizeTags(input.tags),
      authorName: optionalText(input.authorName, 'authorName', 160),
      coverImageId: await mediaService.assertBelongsToTenant(
        organizationId,
        input.coverImageId,
        'coverImageId',
      ),
      featured: input.featured ?? false,
      metaTitle: optionalText(input.metaTitle, 'metaTitle', 200),
      metaDescription:
        optionalText(input.metaDescription, 'metaDescription', 400) ??
        toPlainText(contentHtml ?? input.summary, 300),
    };
  },
};

/**
 * Derives an event's lifecycle from the clock.
 *
 * A cancelled event stays cancelled - that is an editorial decision, not a
 * function of time - but everything else is computed, so listings stay correct
 * without a scheduled job or an editor remembering to update anything.
 */
export function deriveEventStatus(
  startsAt: Date,
  endsAt: Date | null,
  current: EventStatus,
): EventStatus {
  if (current === 'CANCELLED') return 'CANCELLED';

  const now = Date.now();
  const end = endsAt?.getTime() ?? startsAt.getTime();

  if (now < startsAt.getTime()) return 'UPCOMING';
  if (now > end) return 'COMPLETED';
  return 'ONGOING';
}

export const eventCmsService = {
  async list(
    auth: AuthContext,
    args: {
      first?: number | null;
      after?: string | null;
      status?: ContentStatus | null;
      search?: string | null;
      locale?: string | null;
    },
  ) {
    const { organizationId } = requireCmsRead(auth);
    const first = clampContentPageSize(args.first, 20);

    const where: Prisma.EventWhereInput = {
      organizationId,
      ...(args.locale ? { locale: resolveLocale(args.locale) } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.search ? { title: { contains: args.search, mode: 'insensitive' } } : {}),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.event.findMany({
        where,
        select: EVENT_SELECT,
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        take: first + 1,
        ...(args.after ? { cursor: { id: args.after }, skip: 1 } : {}),
      }),
      prisma.event.count({ where }),
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

  async getById(auth: AuthContext, id: string) {
    const { organizationId } = requireCmsRead(auth);
    const event = await prisma.event.findFirst({
      where: { id, organizationId },
      select: EVENT_SELECT,
    });
    if (!event) throw AppError.notFound('Event not found.');
    return event;
  },

  async create(auth: AuthContext, input: EventInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'EVENT', 'CREATE');
    const data = await eventCmsService.buildData(organizationId, input, 'UPCOMING');

    try {
      const event = await prisma.event.create({
        data: { ...data, organizationId, status: 'DRAFT' },
        select: EVENT_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_CREATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'Event',
        entityId: event.id,
        metadata: { slug: event.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return event;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  async update(auth: AuthContext, id: string, input: EventInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'EVENT', 'UPDATE');

    const existing = await prisma.event.findFirst({
      where: { id, organizationId },
      select: { id: true, eventStatus: true },
    });
    if (!existing) throw AppError.notFound('Event not found.');

    const data = await eventCmsService.buildData(organizationId, input, existing.eventStatus);

    try {
      const event = await prisma.event.update({
        where: { id: existing.id },
        data,
        select: EVENT_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_UPDATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'Event',
        entityId: event.id,
        metadata: { slug: event.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return event;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  /** Cancels an event. Kept separate from archiving: a cancelled event is
   * still news, and visitors need to see that it is not happening. */
  async cancel(auth: AuthContext, id: string, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'EVENT', 'UPDATE');

    const existing = await prisma.event.findFirst({
      where: { id, organizationId },
      select: { id: true, slug: true },
    });
    if (!existing) throw AppError.notFound('Event not found.');

    const event = await prisma.event.update({
      where: { id: existing.id },
      data: { eventStatus: 'CANCELLED' },
      select: EVENT_SELECT,
    });

    await auditService.record({
      action: 'CONTENT_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Event',
      entityId: event.id,
      metadata: { slug: event.slug, eventStatus: 'CANCELLED' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return event;
  },

  async transition(auth: AuthContext, id: string, action: PublishAction, meta: RequestMetadata) {
    const { organizationId } = transitionRequiresPublishPermission(action)
      ? requireContentAccess(auth, 'EVENT', 'PUBLISH')
      : requireContentAccess(auth, 'EVENT', 'UPDATE');

    const existing = await prisma.event.findFirst({
      where: { id, organizationId },
      select: { id: true, slug: true, publishedAt: true },
    });
    if (!existing) throw AppError.notFound('Event not found.');

    const next = resolvePublishTransition(action, existing.publishedAt);

    const event = await prisma.event.update({
      where: { id: existing.id },
      data: { status: next.status, publishedAt: next.publishedAt },
      select: EVENT_SELECT,
    });

    await auditService.record({
      action: auditActionFor(action),
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Event',
      entityId: event.id,
      metadata: { slug: event.slug, status: next.status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return event;
  },

  async delete(auth: AuthContext, id: string, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'EVENT', 'DELETE');

    const existing = await prisma.event.findFirst({
      where: { id, organizationId },
      select: { id: true, slug: true, status: true },
    });
    if (!existing) throw AppError.notFound('Event not found.');
    if (existing.status === 'PUBLISHED') {
      throw AppError.conflict('Unpublish this event before deleting it.');
    }

    await prisma.event.delete({ where: { id: existing.id } });

    await auditService.record({
      action: 'CONTENT_DELETED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Event',
      entityId: existing.id,
      metadata: { slug: existing.slug },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return { success: true };
  },

  async buildData(organizationId: string, input: EventInput, currentStatus: EventStatus) {
    const title = requireText(input.title, 'title', 250);

    const startsAt = parseDate(input.startsAt, 'startsAt');
    if (!startsAt) {
      throw AppError.validation('A start date and time is required.', {
        details: { field: 'startsAt' },
      });
    }

    const endsAt = parseDate(input.endsAt, 'endsAt');
    if (endsAt && endsAt < startsAt) {
      throw AppError.validation('The end time cannot be before the start time.', {
        details: { field: 'endsAt' },
      });
    }

    const descriptionHtml = sanitizeRichText(input.descriptionHtml);

    return {
      slug: normalizeSlug(input.slug, title),
      locale: resolveLocale(input.locale),
      title,
      summary: optionalText(input.summary, 'summary', 600),
      descriptionHtml,
      startsAt,
      endsAt,
      locationName: optionalText(input.locationName, 'locationName', 250),
      address: optionalText(input.address, 'address', 500),
      organizer: optionalText(input.organizer, 'organizer', 200),
      coverImageId: await mediaService.assertBelongsToTenant(
        organizationId,
        input.coverImageId,
        'coverImageId',
      ),
      eventStatus: deriveEventStatus(startsAt, endsAt, currentStatus),
      featured: input.featured ?? false,
      metaTitle: optionalText(input.metaTitle, 'metaTitle', 200),
      metaDescription:
        optionalText(input.metaDescription, 'metaDescription', 400) ??
        toPlainText(descriptionHtml ?? input.summary, 300),
    };
  },
};
