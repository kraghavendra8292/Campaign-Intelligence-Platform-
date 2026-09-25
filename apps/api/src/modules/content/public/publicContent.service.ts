import {
  DEFAULT_LOCALE,
  type ContentCategory,
  type Locale,
  type ProjectStatus,
} from '@rk/types';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { clampContentPageSize } from '../shared/contentGuards';
import type { PublicTenant } from './publicTenant.service';

/**
 * Read model for the public website.
 *
 * THE PUBLISHING BOUNDARY LIVES HERE. Every query in this file is built from
 * `publicScope()`, which pins both the tenant and `status: PUBLISHED`. There is
 * no code path in this module that can return a draft, an in-review item or an
 * archived one, because no query is written without that base filter.
 *
 * Selections are explicit allow-lists rather than `include`, so a column added
 * later - an internal note, a staff-only flag - is invisible to the public API
 * until somebody deliberately adds it here.
 */

/** The base filter. Everything public is built on top of this. */
function publicScope(tenant: PublicTenant, locale: Locale) {
  return {
    organizationId: tenant.organizationId,
    locale,
    status: 'PUBLISHED',
  } as const;
}

/** Image fields safe to expose. Never the storage key or uploader. */
const MEDIA_SELECT = {
  id: true,
  altText: true,
  caption: true,
  width: true,
  height: true,
  mimeType: true,
} satisfies Prisma.MediaAssetSelect;

const PROJECT_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  shortDescription: true,
  category: true,
  area: true,
  locationName: true,
  projectStatus: true,
  startDate: true,
  completionDate: true,
  featured: true,
  publishedAt: true,
  coverImage: { select: MEDIA_SELECT },
} satisfies Prisma.ProjectSelect;

const ACHIEVEMENT_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  category: true,
  area: true,
  achievedOn: true,
  verification: true,
  featured: true,
  publishedAt: true,
  coverImage: { select: MEDIA_SELECT },
} satisfies Prisma.AchievementSelect;

const NEWS_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  category: true,
  tags: true,
  authorName: true,
  featured: true,
  publishedAt: true,
  coverImage: { select: MEDIA_SELECT },
} satisfies Prisma.NewsArticleSelect;

const EVENT_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  startsAt: true,
  endsAt: true,
  locationName: true,
  eventStatus: true,
  featured: true,
  publishedAt: true,
  coverImage: { select: MEDIA_SELECT },
} satisfies Prisma.EventSelect;

export interface PublicListArgs {
  readonly first?: number | null;
  readonly after?: string | null;
  readonly category?: ContentCategory | null;
  readonly search?: string | null;
  readonly featuredOnly?: boolean | null;
  /** When set, only projects with this lifecycle status are returned. */
  readonly projectStatus?: ProjectStatus | null;
}

interface Page<T> {
  nodes: T[];
  hasNextPage: boolean;
  endCursor: string | null;
  totalCount: number;
}

function paginate<T extends { id: string }>(rows: T[], first: number, totalCount: number): Page<T> {
  const hasNextPage = rows.length > first;
  const nodes = hasNextPage ? rows.slice(0, first) : rows;
  return {
    nodes,
    hasNextPage,
    endCursor: hasNextPage ? (nodes.at(-1)?.id ?? null) : null,
    totalCount,
  };
}

/** Free-text filter applied to the fields a visitor would search on. */
function searchFilter(search: string | null | undefined, fields: readonly string[]) {
  if (!search || search.trim().length === 0) return {};
  const term = search.trim().slice(0, 120);

  return {
    OR: fields.map((field) => ({
      [field]: { contains: term, mode: 'insensitive' as const },
    })),
  };
}

export const publicContentService = {
  /** Candidate profile. Returns null when the tenant has not published one. */
  async candidateProfile(tenant: PublicTenant, locale: Locale) {
    return prisma.candidateProfile.findFirst({
      where: publicScope(tenant, locale),
      select: {
        id: true,
        fullName: true,
        displayName: true,
        designation: true,
        shortBio: true,
        fullBioHtml: true,
        experienceHtml: true,
        publicServiceHtml: true,
        focusAreas: true,
        metaTitle: true,
        metaDescription: true,
        profileImage: { select: MEDIA_SELECT },
        coverImage: { select: MEDIA_SELECT },
      },
    });
  },

  async vision(tenant: PublicTenant, locale: Locale) {
    return prisma.vision.findFirst({
      where: publicScope(tenant, locale),
      select: {
        id: true,
        headline: true,
        summary: true,
        statementHtml: true,
        metaTitle: true,
        metaDescription: true,
      },
    });
  },

  async priorities(tenant: PublicTenant, locale: Locale) {
    return prisma.priority.findMany({
      where: publicScope(tenant, locale),
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        iconKey: true,
        category: true,
        displayOrder: true,
        image: { select: MEDIA_SELECT },
      },
      take: 50,
    });
  },

  async projects(tenant: PublicTenant, locale: Locale, args: PublicListArgs) {
    const first = clampContentPageSize(args.first, 12);
    const where: Prisma.ProjectWhereInput = {
      ...publicScope(tenant, locale),
      ...(args.category ? { category: args.category } : {}),
      ...(args.featuredOnly ? { featured: true } : {}),
      ...(args.projectStatus ? { projectStatus: args.projectStatus } : {}),
      ...searchFilter(args.search, ['title', 'shortDescription', 'area', 'locationName']),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.project.findMany({
        where,
        select: PROJECT_CARD_SELECT,
        orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
        take: first + 1,
        ...(args.after ? { cursor: { id: args.after }, skip: 1 } : {}),
      }),
      prisma.project.count({ where }),
    ]);

    return paginate(rows, first, totalCount);
  },

  /**
   * One project by slug.
   *
   * Filtered by tenant, locale AND status, so requesting a draft's slug
   * directly returns nothing - the same answer as a slug that does not exist.
   */
  async projectBySlug(tenant: PublicTenant, locale: Locale, slug: string) {
    const project = await prisma.project.findFirst({
      where: { ...publicScope(tenant, locale), slug },
      select: {
        ...PROJECT_CARD_SELECT,
        descriptionHtml: true,
        latitude: true,
        longitude: true,
        costAmount: true,
        costCurrency: true,
        beneficiaryCount: true,
        metaTitle: true,
        metaDescription: true,
        media: {
          select: {
            id: true,
            role: true,
            caption: true,
            sortOrder: true,
            media: { select: MEDIA_SELECT },
          },
          orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
        },
        updates: {
          select: { id: true, title: true, bodyHtml: true, occurredOn: true },
          orderBy: [{ occurredOn: 'desc' }],
          take: 25,
        },
      },
    });

    if (!project) throw AppError.notFound('This project is not available.');
    return project;
  },

  async achievements(tenant: PublicTenant, locale: Locale, args: PublicListArgs) {
    const first = clampContentPageSize(args.first, 12);
    const where: Prisma.AchievementWhereInput = {
      ...publicScope(tenant, locale),
      ...(args.category ? { category: args.category } : {}),
      ...(args.featuredOnly ? { featured: true } : {}),
      ...searchFilter(args.search, ['title', 'summary', 'area']),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.achievement.findMany({
        where,
        select: ACHIEVEMENT_CARD_SELECT,
        orderBy: [{ featured: 'desc' }, { achievedOn: 'desc' }, { id: 'desc' }],
        take: first + 1,
        ...(args.after ? { cursor: { id: args.after }, skip: 1 } : {}),
      }),
      prisma.achievement.count({ where }),
    ]);

    return paginate(rows, first, totalCount);
  },

  /**
   * One achievement by slug, with its PUBLIC evidence only.
   *
   * `internalNote` is not in the selection and `isPublic: false` items are
   * filtered out: how staff verified a claim is working material, not a public
   * statement, and publishing it by accident could expose a source.
   */
  async achievementBySlug(tenant: PublicTenant, locale: Locale, slug: string) {
    const achievement = await prisma.achievement.findFirst({
      where: { ...publicScope(tenant, locale), slug },
      select: {
        ...ACHIEVEMENT_CARD_SELECT,
        descriptionHtml: true,
        verifiedAt: true,
        metaTitle: true,
        metaDescription: true,
        media: {
          select: { id: true, caption: true, media: { select: MEDIA_SELECT } },
          orderBy: { sortOrder: 'asc' },
        },
        evidence: {
          where: { isPublic: true },
          select: {
            id: true,
            title: true,
            description: true,
            sourceNote: true,
            document: { select: { id: true, originalName: true, mimeType: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!achievement) throw AppError.notFound('This achievement is not available.');
    return achievement;
  },

  async news(tenant: PublicTenant, locale: Locale, args: PublicListArgs) {
    const first = clampContentPageSize(args.first, 12);
    const where: Prisma.NewsArticleWhereInput = {
      ...publicScope(tenant, locale),
      ...(args.category ? { category: args.category } : {}),
      ...(args.featuredOnly ? { featured: true } : {}),
      ...searchFilter(args.search, ['title', 'summary']),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.newsArticle.findMany({
        where,
        select: NEWS_CARD_SELECT,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: first + 1,
        ...(args.after ? { cursor: { id: args.after }, skip: 1 } : {}),
      }),
      prisma.newsArticle.count({ where }),
    ]);

    return paginate(rows, first, totalCount);
  },

  async newsBySlug(tenant: PublicTenant, locale: Locale, slug: string) {
    const article = await prisma.newsArticle.findFirst({
      where: { ...publicScope(tenant, locale), slug },
      select: { ...NEWS_CARD_SELECT, contentHtml: true, metaTitle: true, metaDescription: true },
    });

    if (!article) throw AppError.notFound('This update is not available.');
    return article;
  },

  /**
   * Events, upcoming first.
   *
   * `upcomingOnly` compares against the server clock rather than trusting a
   * stored flag, so an event becomes "past" without anyone editing it.
   */
  async events(
    tenant: PublicTenant,
    locale: Locale,
    args: PublicListArgs & { upcomingOnly?: boolean | null },
  ) {
    const first = clampContentPageSize(args.first, 12);
    const where: Prisma.EventWhereInput = {
      ...publicScope(tenant, locale),
      ...(args.upcomingOnly ? { startsAt: { gte: new Date() } } : {}),
      ...(args.featuredOnly ? { featured: true } : {}),
      ...searchFilter(args.search, ['title', 'summary', 'locationName']),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.event.findMany({
        where,
        select: EVENT_CARD_SELECT,
        orderBy: args.upcomingOnly
          ? [{ startsAt: 'asc' }, { id: 'asc' }]
          : [{ startsAt: 'desc' }, { id: 'desc' }],
        take: first + 1,
        ...(args.after ? { cursor: { id: args.after }, skip: 1 } : {}),
      }),
      prisma.event.count({ where }),
    ]);

    return paginate(rows, first, totalCount);
  },

  async eventBySlug(tenant: PublicTenant, locale: Locale, slug: string) {
    const event = await prisma.event.findFirst({
      where: { ...publicScope(tenant, locale), slug },
      select: {
        ...EVENT_CARD_SELECT,
        descriptionHtml: true,
        address: true,
        organizer: true,
        metaTitle: true,
        metaDescription: true,
      },
    });

    if (!event) throw AppError.notFound('This event is not available.');
    return event;
  },

  async photoAlbums(tenant: PublicTenant, locale: Locale) {
    return prisma.galleryAlbum.findMany({
      where: publicScope(tenant, locale),
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        category: true,
        coverImage: { select: MEDIA_SELECT },
        items: {
          select: { id: true, caption: true, media: { select: MEDIA_SELECT } },
          orderBy: { sortOrder: 'asc' },
          take: 60,
        },
      },
      take: 30,
    });
  },

  async videos(tenant: PublicTenant, locale: Locale) {
    return prisma.videoEntry.findMany({
      where: publicScope(tenant, locale),
      orderBy: [{ featured: 'desc' }, { displayOrder: 'asc' }, { publishedAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        videoUrl: true,
        platform: true,
        category: true,
        featured: true,
        publishedAt: true,
        thumbnail: { select: MEDIA_SELECT },
      },
      take: 60,
    });
  },

  async contactInformation(tenant: PublicTenant, locale: Locale) {
    const [contact, socialLinks] = await Promise.all([
      prisma.contactInformation.findFirst({
        where: publicScope(tenant, locale),
        select: {
          id: true,
          officeName: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          phone: true,
          alternatePhone: true,
          email: true,
          officeHours: true,
          mapEmbedUrl: true,
          latitude: true,
          longitude: true,
        },
      }),
      prisma.socialLink.findMany({
        where: { organizationId: tenant.organizationId, isActive: true },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, platform: true, label: true, url: true },
      }),
    ]);

    return { contact, socialLinks };
  },

  /**
   * Cross-content search.
   *
   * Four scoped queries rather than one union: each carries its own tenant,
   * locale and published filter, so there is no shared query to get wrong, and
   * the result keeps the type of each match.
   */
  async search(tenant: PublicTenant, locale: Locale, rawTerm: string, limitPerType = 5) {
    const term = rawTerm.trim();

    if (term.length < 2) {
      throw AppError.validation('Enter at least two characters to search.', {
        details: { field: 'term' },
      });
    }

    const take = Math.min(limitPerType, 20);

    const [projects, achievements, news, events] = await Promise.all([
      prisma.project.findMany({
        where: {
          ...publicScope(tenant, locale),
          ...searchFilter(term, ['title', 'shortDescription', 'area', 'locationName']),
        },
        select: PROJECT_CARD_SELECT,
        orderBy: { publishedAt: 'desc' },
        take,
      }),
      prisma.achievement.findMany({
        where: {
          ...publicScope(tenant, locale),
          ...searchFilter(term, ['title', 'summary', 'area']),
        },
        select: ACHIEVEMENT_CARD_SELECT,
        orderBy: { achievedOn: 'desc' },
        take,
      }),
      prisma.newsArticle.findMany({
        where: { ...publicScope(tenant, locale), ...searchFilter(term, ['title', 'summary']) },
        select: NEWS_CARD_SELECT,
        orderBy: { publishedAt: 'desc' },
        take,
      }),
      prisma.event.findMany({
        where: {
          ...publicScope(tenant, locale),
          ...searchFilter(term, ['title', 'summary', 'locationName']),
        },
        select: EVENT_CARD_SELECT,
        orderBy: { startsAt: 'desc' },
        take,
      }),
    ]);

    return {
      term,
      projects,
      achievements,
      news,
      events,
      totalCount: projects.length + achievements.length + news.length + events.length,
    };
  },

  /**
   * Everything the homepage needs, in one round trip.
   *
   * Assembled server-side because the homepage otherwise fires seven queries
   * from the browser before it can paint.
   */
  async homepage(tenant: PublicTenant, locale: Locale) {
    const [profile, vision, priorities, projects, achievements, news, events] = await Promise.all([
      publicContentService.candidateProfile(tenant, locale),
      publicContentService.vision(tenant, locale),
      publicContentService.priorities(tenant, locale),
      // Homepage works strip: completed projects only (grouped by category in UI).
      publicContentService.projects(tenant, locale, {
        first: 50,
        featuredOnly: null,
        projectStatus: 'COMPLETED',
      }),
      publicContentService.achievements(tenant, locale, { first: 3 }),
      publicContentService.news(tenant, locale, { first: 3 }),
      publicContentService.events(tenant, locale, { first: 3, upcomingOnly: true }),
    ]);

    return {
      organization: { id: tenant.organizationId, slug: tenant.slug, name: tenant.name },
      profile,
      vision,
      priorities,
      featuredProjects: projects.nodes,
      featuredAchievements: achievements.nodes,
      latestNews: news.nodes,
      upcomingEvents: events.nodes,
    };
  },
};

export { DEFAULT_LOCALE };
