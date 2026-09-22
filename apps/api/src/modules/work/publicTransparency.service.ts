import {
  DEFAULT_LOCALE,
  MIN_PUBLISHED_FOR_COVERAGE,
  PUBLIC_WORK_PAGE_SIZE,
  publicWorkStatusFor,
  type ContentCategory,
  type Locale,
  type PublicWorkStatus,
} from '@rk/types';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../errors/AppError';
import { clampContentPageSize } from '../content/shared/contentGuards';
import type { PublicTenant } from '../content/public/publicTenant.service';

/**
 * The public transparency read model.
 *
 * THE PUBLISHING BOUNDARY IS THE SAME ONE PHASE 3 DREW, and this file is built
 * on it deliberately rather than reimplementing it: `publicScope()` below pins
 * the tenant, the locale and `status: PUBLISHED`, and no query in this file is
 * written without it. A second, subtly different boundary is how a draft
 * eventually reaches the public site.
 *
 * Phase 9 adds one more rule on top of it, and it is the rule the whole phase
 * exists for: **a claim's verification status is reported, never asserted.**
 * The public payload carries `verification` exactly as staff recorded it. There
 * is no code path here that upgrades a status, infers one from evidence, or
 * treats "published" as "checked". A PUBLISHED, UNVERIFIED claim renders as a
 * claim with no badge - which is the honest rendering of a thing nobody has
 * checked.
 *
 * EVIDENCE IS FILTERED TWICE ON THE WAY OUT: `isPublic: true` in the `where`,
 * and an explicit column allow-list in the `select` that omits `internalNote`.
 * Either alone would be sufficient today; both together mean a mistake in one
 * is not a disclosure.
 */

function publicScope(tenant: PublicTenant, locale: Locale) {
  return {
    organizationId: tenant.organizationId,
    locale,
    status: 'PUBLISHED',
  } as const;
}

const MEDIA_SELECT = {
  id: true,
  altText: true,
  caption: true,
  width: true,
  height: true,
  mimeType: true,
} satisfies Prisma.MediaAssetSelect;

/**
 * What a member of the public sees of one piece of evidence.
 *
 * `internalNote` is absent. So is `uploadedBy` - which staff member filed a
 * document is internal staffing information and says nothing about whether the
 * claim is true. `sourceNote`, `referenceNumber` and `issuingAuthority` ARE
 * present: they are the provenance a reader needs to check the claim
 * independently, which is the entire point of publishing evidence.
 */
const PUBLIC_EVIDENCE_SELECT = {
  id: true,
  title: true,
  description: true,
  evidenceType: true,
  sourceNote: true,
  referenceNumber: true,
  issuingAuthority: true,
  issuedOn: true,
  capturedOn: true,
  capturedLocation: true,
  sortOrder: true,
  document: { select: { id: true, originalName: true, mimeType: true, kind: true } },
} satisfies Prisma.WorkEvidenceSelect;

const PUBLIC_EVIDENCE_WHERE = { isPublic: true } as const;

const WORK_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  shortDescription: true,
  category: true,
  area: true,
  locationName: true,
  projectStatus: true,
  verification: true,
  verifiedAt: true,
  startDate: true,
  completionDate: true,
  department: true,
  agency: true,
  featured: true,
  publishedAt: true,
  coverImage: { select: MEDIA_SELECT },
} satisfies Prisma.ProjectSelect;

export interface PublicWorkFilter {
  readonly first?: number | null;
  readonly after?: string | null;
  readonly category?: ContentCategory | null;
  readonly area?: string | null;
  readonly workStatus?: PublicWorkStatus | null;
  readonly year?: number | null;
  readonly verifiedOnly?: boolean | null;
  readonly search?: string | null;
}

/** Maps the public status filter back onto stored project statuses. */
function projectStatusFilter(
  status: PublicWorkStatus | null | undefined,
): Pick<Prisma.ProjectWhereInput, 'projectStatus'> {
  switch (status) {
    case 'PROPOSED':
      return { projectStatus: { in: ['PLANNED'] } };
    case 'ONGOING':
      return { projectStatus: { in: ['IN_PROGRESS', 'ON_HOLD'] } };
    case 'COMPLETED':
      return { projectStatus: { in: ['COMPLETED'] } };
    default:
      // CANCELLED is excluded from every public listing. A cancelled work is
      // not a transparency claim, and listing it beside completed work invites
      // it to be read as one.
      return { projectStatus: { in: ['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'] } };
  }
}

/**
 * Backend search across the indexed public columns.
 *
 * `descriptionHtml` is deliberately not searched: it holds sanitised markup, so
 * a search for "strong" would match every emphasised word in the corpus. The
 * same restriction Phase 5 placed on issue descriptions, for the same reason.
 */
function searchFilter(term: string | null | undefined): Prisma.ProjectWhereInput {
  const trimmed = term?.trim();
  if (!trimmed) return {};
  return {
    OR: [
      { title: { contains: trimmed, mode: 'insensitive' as const } },
      { shortDescription: { contains: trimmed, mode: 'insensitive' as const } },
      { area: { contains: trimmed, mode: 'insensitive' as const } },
      { locationName: { contains: trimmed, mode: 'insensitive' as const } },
    ],
  };
}

function yearFilter(year: number | null | undefined): Prisma.ProjectWhereInput {
  if (!year) return {};
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw AppError.validation('That year could not be read.', { details: { field: 'year' } });
  }
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  // A work belongs to a year by when it completed, falling back to when it
  // started - so an ongoing work appears under the year it began rather than
  // vanishing from every year filter until it finishes.
  return {
    OR: [
      { completionDate: { gte: from, lt: to } },
      { AND: [{ completionDate: null }, { startDate: { gte: from, lt: to } }] },
    ],
  };
}

/**
 * Reads the row count out of a `groupBy` result.
 *
 * Typed loosely on purpose, for the reason Phase 7's `groupCount` gives:
 * Prisma's `groupBy` overloads key `_count` on the literal field list, and
 * threading that generic through six call sites buys type safety over a number
 * this code immediately adds up. The cast is contained here rather than
 * repeated at each use.
 */
function countOf(row: { _count?: unknown }): number {
  const count = row._count as { _all?: number } | undefined;
  return count?._all ?? 0;
}

export const publicTransparencyService = {
  /**
   * The public works listing.
   *
   * Cursor-paginated and filtered in the database. The alternative - shipping
   * every work to the browser and filtering there - would send a citizen on
   * mobile data the organisation's entire project history to look at twelve
   * rows of it, and would put unpublished records one client-side bug away
   * from being visible.
   */
  async works(tenant: PublicTenant, locale: Locale, filter: PublicWorkFilter = {}) {
    const first = clampContentPageSize(filter.first, PUBLIC_WORK_PAGE_SIZE);

    const where: Prisma.ProjectWhereInput = {
      ...publicScope(tenant, locale),
      ...projectStatusFilter(filter.workStatus),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.area ? { area: filter.area } : {}),
      ...(filter.verifiedOnly ? { verification: 'VERIFIED' } : {}),
      // AND rather than spreading both. Each of these returns its own `OR`, so
      // spreading them into one object would silently drop the first: the year
      // filter would vanish the moment a search term was also supplied, and the
      // page would quietly return the wrong rows rather than fail.
      AND: [yearFilter(filter.year), searchFilter(filter.search)],
    };

    const [rows, totalCount] = await Promise.all([
      prisma.project.findMany({
        where,
        select: WORK_CARD_SELECT,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: first + 1,
        ...(filter.after ? { cursor: { id: filter.after }, skip: 1 } : {}),
      }),
      prisma.project.count({ where }),
    ]);

    const hasMore = rows.length > first;
    const nodes = hasMore ? rows.slice(0, first) : rows;

    return {
      nodes: nodes.map((row) => ({
        ...row,
        workStatus: publicWorkStatusFor(row.projectStatus),
      })),
      totalCount,
      hasMore,
      endCursor: nodes.at(-1)?.id ?? null,
    };
  },

  /**
   * One work, with its public evidence.
   *
   * Resolved by slug WITHIN the tenant. Slugs are unique per
   * (organization, slug, locale) and not globally, so looking one up without
   * the tenant filter would let a visitor to one candidate's site read another
   * candidate's record by guessing a URL.
   */
  async workBySlug(tenant: PublicTenant, locale: Locale, slug: string) {
    const work = await prisma.project.findFirst({
      where: { ...publicScope(tenant, locale), slug, ...projectStatusFilter(null) },
      select: {
        ...WORK_CARD_SELECT,
        descriptionHtml: true,
        costAmount: true,
        costCurrency: true,
        beneficiaryCount: true,
        metaTitle: true,
        metaDescription: true,
        media: {
          select: { id: true, role: true, caption: true, media: { select: MEDIA_SELECT } },
          orderBy: { sortOrder: 'asc' },
        },
        updates: {
          select: { id: true, title: true, bodyHtml: true, occurredOn: true },
          orderBy: { occurredOn: 'asc' },
        },
        evidence: {
          where: PUBLIC_EVIDENCE_WHERE,
          select: PUBLIC_EVIDENCE_SELECT,
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!work) throw AppError.notFound('This record is not available.');

    return { ...work, workStatus: publicWorkStatusFor(work.projectStatus) };
  },

  /**
   * Public evidence for one published achievement.
   *
   * Phase 3 already serves the achievement itself; this adds the Phase 9
   * evidence metadata without changing that query, so an existing client keeps
   * working unchanged.
   */
  async achievementEvidence(tenant: PublicTenant, locale: Locale, slug: string) {
    const achievement = await prisma.achievement.findFirst({
      where: { ...publicScope(tenant, locale), slug },
      select: { id: true },
    });
    if (!achievement) throw AppError.notFound('This record is not available.');

    return prisma.workEvidence.findMany({
      where: { achievementId: achievement.id, ...PUBLIC_EVIDENCE_WHERE },
      select: PUBLIC_EVIDENCE_SELECT,
      orderBy: { sortOrder: 'asc' },
    });
  },

  /**
   * The transparency summary.
   *
   * EVERY NUMBER HERE IS A DATABASE COUNT. Not one of them is generated, and
   * there is no code path in this file that could call a model. A transparency
   * page whose headline figures came from a language model would be the exact
   * inversion of what it claims to be.
   *
   * Counted in one `groupBy` per axis rather than a query per bucket: a
   * category list of ten would otherwise be ten round trips to render one card.
   */
  async summary(tenant: PublicTenant, locale: Locale) {
    const scope = publicScope(tenant, locale);
    const listable: Prisma.ProjectWhereInput = { ...scope, ...projectStatusFilter(null) };

    const [
      byStatus,
      byCategory,
      byArea,
      verifiedCount,
      publishedCount,
      evidencedIds,
      achievements,
    ] = await Promise.all([
      prisma.project.groupBy({
        by: ['projectStatus'],
        where: listable,
        _count: { _all: true },
      }),
      prisma.project.groupBy({
        by: ['category'],
        where: listable,
        _count: { _all: true },
      }),
      prisma.project.groupBy({
        by: ['area'],
        where: { ...listable, area: { not: null } },
        _count: { _all: true },
      }),
      prisma.project.count({ where: { ...listable, verification: 'VERIFIED' } }),
      prisma.project.count({ where: listable }),
      prisma.project.findMany({
        where: { ...listable, evidence: { some: PUBLIC_EVIDENCE_WHERE } },
        select: { id: true },
      }),
      prisma.achievement.count({ where: { ...scope, verification: 'VERIFIED' } }),
    ]);

    const statusTotals: Record<PublicWorkStatus, number> = {
      PROPOSED: 0,
      ONGOING: 0,
      COMPLETED: 0,
    };
    for (const row of byStatus) {
      const bucket = publicWorkStatusFor(row.projectStatus);
      if (bucket) statusTotals[bucket] += countOf(row);
    }

    /**
     * Evidence coverage: published works carrying at least one PUBLIC piece of
     * evidence, over published works.
     *
     * Public evidence rather than any evidence, because the figure is shown to
     * a member of the public and has to mean something they can act on: "92% of
     * these works have a document you can open". Counting private evidence
     * would produce a higher number that no reader could verify - a
     * transparency metric that cannot be checked is marketing.
     *
     * Null, not zero, below the threshold. Phase 7's rule: a percentage with an
     * empty denominator is not 0%, it is nothing, and printing "0%" states
     * something false with the confidence of a measurement.
     */
    const coverage =
      publishedCount >= MIN_PUBLISHED_FOR_COVERAGE && publishedCount > 0
        ? Math.round((evidencedIds.length / publishedCount) * 100)
        : null;

    return {
      verifiedWorks: verifiedCount,
      ongoingWorks: statusTotals.ONGOING,
      proposedWorks: statusTotals.PROPOSED,
      completedWorks: statusTotals.COMPLETED,
      publishedWorks: publishedCount,
      evidenceBackedWorks: evidencedIds.length,
      evidenceCoveragePct: coverage,
      verifiedAchievements: achievements,
      categories: byCategory
        .map((row) => ({ category: row.category, count: countOf(row) }))
        .sort((a, b) => b.count - a.count),
      areas: byArea
        .map((row) => ({ area: row.area as string, count: countOf(row) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      areasCovered: byArea.length,
      generatedAt: new Date(),
    };
  },

  /** The most recently verified works, for the transparency page. */
  async recentlyVerified(tenant: PublicTenant, locale: Locale, limit = 6) {
    return prisma.project
      .findMany({
        where: {
          ...publicScope(tenant, locale),
          ...projectStatusFilter(null),
          verification: 'VERIFIED',
        },
        select: WORK_CARD_SELECT,
        orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }],
        take: Math.min(Math.max(limit, 1), 20),
      })
      .then((rows) =>
        rows.map((row) => ({ ...row, workStatus: publicWorkStatusFor(row.projectStatus) })),
      );
  },

  /** The distinct areas that have published work, for the filter control. */
  async areas(tenant: PublicTenant, locale: Locale) {
    const rows = await prisma.project.groupBy({
      by: ['area'],
      where: { ...publicScope(tenant, locale), ...projectStatusFilter(null), area: { not: null } },
      _count: { _all: true },
      orderBy: { area: 'asc' },
    });
    return rows.map((row) => ({ area: row.area as string, count: countOf(row) }));
  },

  /** Default locale helper, matching the Phase 3 public resolvers. */
  locale(value: string | null | undefined): Locale {
    return (value as Locale) || DEFAULT_LOCALE;
  },
};
