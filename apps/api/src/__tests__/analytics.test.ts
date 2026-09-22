import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import { DEFAULT_ISSUE_CATEGORIES } from '@rk/types';
import { createApp } from '../app';
import type { GraphQLContext } from '../graphql/context/index';
import { prisma } from '../database/prisma';
import {
  addMembership,
  cleanupFixtures,
  createTenant,
  createUser,
  databaseAvailable,
  type TestTenant,
  type TestUser,
} from './helpers/fixtures';
import { gql, login } from './helpers/graphqlClient';
import { buildScope, percentageChange, rate } from '../modules/analytics/shared/analyticsFilters';
import { mean, median } from '../modules/analytics/analytics.service';
import { agingBucketFor, resolutionBucketFor, resolveTrendGranularity } from '@rk/types';

/**
 * Phase 7: decision analytics.
 *
 * The properties under test are the ones whose failure would mislead somebody
 * making a decision, rather than merely break a page:
 *
 *  - a figure must never be wrong in a way that looks plausible;
 *  - an undefined rate must read as "—", never as 0%;
 *  - a period comparison must compare equal-length windows;
 *  - a filter must reach EVERY metric, not just the one the user is looking at;
 *  - no tenant may see another's counts, areas, themes or exports;
 *  - and an export must not carry a single citizen's personal data.
 *
 * The fixture below builds a KNOWN dataset with hand-computed expectations, so
 * the assertions are against arithmetic a reader can verify rather than against
 * whatever the code happened to produce.
 */

const available = await databaseAvailable();

let app: Express;
let apollo: ApolloServer<GraphQLContext>;

let tenantA: TestTenant;
let tenantB: TestTenant;
let adminA: TestUser;
let adminB: TestUser;
let analystA: TestUser;
let managerA: TestUser;
let viewerA: TestUser;

let tokenAdminA = '';
let tokenAdminB = '';
let tokenAnalystA = '';
let tokenManagerA = '';
let tokenViewerA = '';

const DAY = 86_400_000;
/** Anchor inside the last-30-days window, well clear of both boundaries. */
const NOW = Date.now();

function daysAgo(days: number): Date {
  return new Date(NOW - days * DAY);
}

async function seedCategories(organizationId: string): Promise<void> {
  await prisma.issueCategory.createMany({
    data: DEFAULT_ISSUE_CATEGORIES.map((category, index) => ({
      organizationId,
      key: category.key,
      label: category.label,
      displayOrder: index,
    })),
    skipDuplicates: true,
  });
}

let referenceCounter = 0;

async function createIssue(
  organizationId: string,
  input: {
    categoryKey?: string;
    ward?: string | null;
    status?: string;
    priority?: string;
    source?: string;
    submittedDaysAgo: number;
    resolvedDaysAgo?: number;
    contactPhone?: string;
  },
): Promise<{ id: string; referenceNumber: string }> {
  const category = input.categoryKey
    ? await prisma.issueCategory.findFirst({
        where: { organizationId, key: input.categoryKey },
        select: { id: true },
      })
    : null;

  referenceCounter += 1;
  const suffix = `${Date.now().toString(36)}${referenceCounter}`.toUpperCase().slice(-8);

  return prisma.issue.create({
    data: {
      organizationId,
      referenceNumber: `ISS-2026-${suffix}`,
      type: 'ISSUE',
      title: 'Analytics fixture submission',
      description: 'A fixture submission used by the Phase 7 analytics tests.',
      categoryId: category?.id ?? null,
      ward: input.ward === undefined ? 'Ward 1' : input.ward,
      status: (input.status ?? 'SUBMITTED') as 'SUBMITTED',
      priority: (input.priority ?? 'MEDIUM') as 'MEDIUM',
      source: (input.source ?? 'DIRECT_WEBSITE') as 'DIRECT_WEBSITE',
      moderationStatus: 'APPROVED',
      submittedAt: daysAgo(input.submittedDaysAgo),
      ...(input.resolvedDaysAgo === undefined
        ? {}
        : { resolvedAt: daysAgo(input.resolvedDaysAgo) }),
      ...(input.contactPhone === undefined
        ? { isAnonymous: true }
        : {
            isAnonymous: false,
            contactPhone: input.contactPhone,
            contactName: 'Fixture Citizen',
            consentGiven: true,
          }),
    },
    select: { id: true, referenceNumber: true },
  });
}

/**
 * A dataset with hand-computed expectations.
 *
 * Tenant A, inside the last 30 days:
 *   ROADS    : 4 submitted, 2 resolved
 *   WATER    : 2 submitted, 1 resolved
 *   DRAINAGE : 1 submitted, 0 resolved  (Ward 2, URGENT, open)
 *   ------------------------------------------------------------------
 *   total 7, resolved 3  -> resolution rate 42.9%
 *
 * Previous 30 days: 2 ROADS submissions -> change from 2 to 7 = +250%
 */
async function seedAnalyticsDataset(organizationId: string): Promise<void> {
  // Current window.
  await createIssue(organizationId, {
    categoryKey: 'ROADS',
    submittedDaysAgo: 10,
    resolvedDaysAgo: 8,
    status: 'RESOLVED',
  }); // 2 days to resolve
  await createIssue(organizationId, {
    categoryKey: 'ROADS',
    submittedDaysAgo: 12,
    resolvedDaysAgo: 6,
    status: 'RESOLVED',
  }); // 6 days
  await createIssue(organizationId, { categoryKey: 'ROADS', submittedDaysAgo: 5 });
  await createIssue(organizationId, {
    categoryKey: 'ROADS',
    submittedDaysAgo: 3,
    priority: 'HIGH',
  });

  await createIssue(organizationId, {
    categoryKey: 'WATER',
    submittedDaysAgo: 9,
    resolvedDaysAgo: 8,
    status: 'RESOLVED',
    source: 'QR',
  }); // 1 day
  await createIssue(organizationId, { categoryKey: 'WATER', submittedDaysAgo: 4, ward: 'Ward 2' });

  await createIssue(organizationId, {
    categoryKey: 'DRAINAGE',
    submittedDaysAgo: 2,
    ward: 'Ward 2',
    priority: 'URGENT',
  });

  // Previous window (31-60 days ago).
  await createIssue(organizationId, { categoryKey: 'ROADS', submittedDaysAgo: 40 });
  await createIssue(organizationId, { categoryKey: 'ROADS', submittedDaysAgo: 50 });
}

beforeAll(async () => {
  if (!available) return;

  const created = await createApp();
  app = created.app;
  apollo = created.apollo;

  tenantA = await createTenant();
  tenantB = await createTenant();
  await seedCategories(tenantA.organizationId);
  await seedCategories(tenantB.organizationId);

  await seedAnalyticsDataset(tenantA.organizationId);
  // Tenant B gets a deliberately DIFFERENT shape, so a leak would be obvious
  // rather than coincidentally matching.
  await createIssue(tenantB.organizationId, {
    categoryKey: 'SANITATION',
    submittedDaysAgo: 5,
    ward: 'Ward 99',
  });

  adminA = await createUser();
  await addMembership(adminA.id, tenantA.organizationId, 'CAMPAIGN_ADMIN');
  adminB = await createUser();
  await addMembership(adminB.id, tenantB.organizationId, 'CAMPAIGN_ADMIN');
  analystA = await createUser();
  await addMembership(analystA.id, tenantA.organizationId, 'ANALYST');
  managerA = await createUser();
  await addMembership(managerA.id, tenantA.organizationId, 'ISSUE_MANAGER');
  viewerA = await createUser();
  await addMembership(viewerA.id, tenantA.organizationId, 'VIEWER');

  tokenAdminA = (await login(app, adminA.email, adminA.password)).accessToken;
  tokenAdminB = (await login(app, adminB.email, adminB.password)).accessToken;
  tokenAnalystA = (await login(app, analystA.email, analystA.password)).accessToken;
  tokenManagerA = (await login(app, managerA.email, managerA.password)).accessToken;
  tokenViewerA = (await login(app, viewerA.email, viewerA.password)).accessToken;
}, 240_000);

afterAll(async () => {
  if (!available) return;
  await apollo.stop();
  await cleanupFixtures();
  await prisma.$disconnect();
}, 240_000);

function field<T = Record<string, unknown>>(
  result: { data: Record<string, unknown> | null },
  name: string,
): T {
  const value = result.data?.[name];
  if (value === undefined || value === null) {
    throw new Error(`GraphQL response contained no "${name}" field.`);
  }
  return value as T;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const OVERVIEW = /* GraphQL */ `
  query Overview($filter: AnalyticsFilterInput) {
    analyticsOverview(filter: $filter) {
      period {
        from
        to
        days
      }
      previousPeriod {
        from
        to
        days
      }
      totalInRange
      previousTotal
      changePct
      openCount
      resolvedInRange
      resolutionRatePct
      averageResolutionDays
      medianResolutionDays
      highPriorityOpen
      resolvedSampleCount
      oldestOpenIssue {
        referenceNumber
        ageDays
      }
    }
  }
`;

const BREAKDOWN = /* GraphQL */ `
  query Breakdown($filter: AnalyticsFilterInput) {
    analyticsByCategory(filter: $filter) {
      key
      label
      count
      sharePct
      previousCount
      changePct
      openCount
      resolvedCount
    }
    analyticsByStatus(filter: $filter) {
      key
      count
    }
    analyticsByPriority(filter: $filter) {
      key
      count
      openCount
    }
  }
`;

const TREND = /* GraphQL */ `
  query Trend($filter: AnalyticsFilterInput, $granularity: TrendGranularity) {
    analyticsTrend(filter: $filter, granularity: $granularity) {
      granularity
      previousTotal
      points {
        date
        count
      }
    }
  }
`;

const AREAS = /* GraphQL */ `
  query Areas($filter: AnalyticsFilterInput) {
    analyticsAreas(filter: $filter) {
      key
      label
      count
      openCount
      resolvedCount
      resolutionRatePct
      highPriorityOpenCount
    }
  }
`;

const RESOLUTION = /* GraphQL */ `
  query Resolution($filter: AnalyticsFilterInput) {
    analyticsResolution(filter: $filter) {
      resolvedInRange
      openCount
      averageResolutionDays
      medianResolutionDays
      timeToResolution {
        key
        count
      }
      backlogAging {
        key
        count
      }
    }
  }
`;

const BACKLOG = /* GraphQL */ `
  query Backlog($filter: AnalyticsFilterInput) {
    analyticsBacklog(filter: $filter) {
      referenceNumber
      priority
      ageDays
      ward
    }
  }
`;

const INTELLIGENCE = /* GraphQL */ `
  query Intelligence($filter: AnalyticsFilterInput) {
    analyticsThemes(filter: $filter) {
      id
      name
      count
    }
    analyticsTopics(filter: $filter) {
      topic
      count
    }
    analyticsSource(filter: $filter) {
      scanCount
      issuesFromQr
      conversionRatePct
      bySource {
        key
        count
      }
    }
  }
`;

const INSIGHTS = /* GraphQL */ `
  query Insights($filter: AnalyticsFilterInput) {
    analyticsInsights(filter: $filter) {
      kind
      headline
      currentValue
      previousValue
      changePct
    }
  }
`;

const EXPORT = /* GraphQL */ `
  query Export($dataset: AnalyticsExportDataset!, $filter: AnalyticsFilterInput) {
    analyticsExportCsv(dataset: $dataset, filter: $filter)
  }
`;

// ---------------------------------------------------------------------------
// Pure calculation
// ---------------------------------------------------------------------------

describe('calculations', () => {
  it('returns null rather than a percentage when the previous period was empty', () => {
    // The single most important null in this phase: "up 100%" from nothing is
    // a sentence a dashboard should never produce.
    expect(percentageChange(5, 0)).toBeNull();
    expect(percentageChange(0, 0)).toBeNull();
    expect(percentageChange(7, 2)).toBe(250);
    expect(percentageChange(2, 4)).toBe(-50);
  });

  it('returns null rather than zero for a rate with an empty denominator', () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(3, 7)).toBe(42.9);
    expect(rate(1, 4)).toBe(25);
  });

  it('reports mean and median separately so outliers stay visible', () => {
    const withOutlier = [1, 1, 2, 2, 240];
    expect(mean(withOutlier)).toBe(49.2);
    // The median is what a team recognises; the gap between them is the signal.
    expect(median(withOutlier)).toBe(2);
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
  });

  it('places durations in the right resolution bucket at each boundary', () => {
    expect(resolutionBucketFor(0.5)).toBe('D0_1');
    expect(resolutionBucketFor(1)).toBe('D1_3');
    expect(resolutionBucketFor(2.9)).toBe('D1_3');
    expect(resolutionBucketFor(3)).toBe('D3_7');
    expect(resolutionBucketFor(29.9)).toBe('D14_30');
    expect(resolutionBucketFor(30)).toBe('D30_PLUS');
  });

  it('places open ages in the right aging bucket at each boundary', () => {
    expect(agingBucketFor(0)).toBe('A0_3');
    expect(agingBucketFor(3)).toBe('A0_3');
    expect(agingBucketFor(4)).toBe('A4_7');
    expect(agingBucketFor(60)).toBe('A31_60');
    expect(agingBucketFor(61)).toBe('A60_PLUS');
  });

  it('widens trend buckets as the range grows', () => {
    expect(resolveTrendGranularity('AUTO', 30)).toBe('DAY');
    expect(resolveTrendGranularity('AUTO', 90)).toBe('WEEK');
    expect(resolveTrendGranularity('AUTO', 365)).toBe('MONTH');
    // An explicit choice always wins over the heuristic.
    expect(resolveTrendGranularity('DAY', 365)).toBe('DAY');
  });

  it('compares against an equal-length previous window', () => {
    const scope = buildScope('org-1', { range: 'LAST_30_DAYS' });

    const currentSpan = scope.range.to.getTime() - scope.range.from.getTime();
    const previousSpan = scope.previous.to.getTime() - scope.previous.from.getTime();

    // Equal length matters: comparing 30 days against a calendar month would
    // produce a change figure that is partly a windowing artefact.
    expect(previousSpan).toBe(currentSpan);
    // And it must end exactly where the current window begins - no gap, no overlap.
    expect(scope.previous.to.getTime()).toBe(scope.range.from.getTime());
  });

  it('pins the tenant into every scope clause', () => {
    const scope = buildScope('org-1', { categoryIds: ['c1'] });

    expect(scope.where.organizationId).toBe('org-1');
    expect(scope.windowed.organizationId).toBe('org-1');
    expect(scope.previousWindowed.organizationId).toBe('org-1');
    // Spam is excluded from every figure, always.
    expect(JSON.stringify(scope.where)).not.toContain('SPAM');
  });
});

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

describe('overview', () => {
  it('computes the hand-checked figures for the fixture dataset', async () => {
    if (!available) return;

    const result = await gql(app, OVERVIEW, {}, { accessToken: tokenAdminA });
    expect(result.errors).toBeNull();

    const overview = field(result, 'analyticsOverview');

    // 7 submissions in the last 30 days; 2 in the previous 30.
    expect(overview.totalInRange).toBe(7);
    expect(overview.previousTotal).toBe(2);
    expect(overview.changePct).toBe(250);

    // 3 of the 7 have a resolvedAt -> 42.9%
    expect(overview.resolvedInRange).toBe(3);
    expect(overview.resolutionRatePct).toBe(42.9);

    // Durations were 2, 6 and 1 days -> mean 3, median 2.
    expect(overview.resolvedSampleCount).toBe(3);
    expect(overview.averageResolutionDays).toBe(3);
    expect(overview.medianResolutionDays).toBe(2);

    // One HIGH and one URGENT are open.
    expect(overview.highPriorityOpen).toBe(2);
  });

  it('reports the equal-length previous period on the wire', async () => {
    if (!available) return;

    const result = await gql(app, OVERVIEW, {}, { accessToken: tokenAdminA });
    const overview = field(result, 'analyticsOverview') as Record<string, Record<string, number>>;

    expect(overview.previousPeriod?.days).toBe(overview.period?.days);
  });

  it('returns null figures rather than zeros when a filter matches nothing', async () => {
    if (!available) return;

    const result = await gql(
      app,
      OVERVIEW,
      { filter: { areas: ['Ward that does not exist'] } },
      { accessToken: tokenAdminA },
    );

    const overview = field(result, 'analyticsOverview');

    expect(overview.totalInRange).toBe(0);
    // The point of the phase: an empty result reports "no data", not "0%".
    expect(overview.resolutionRatePct).toBeNull();
    expect(overview.averageResolutionDays).toBeNull();
    expect(overview.changePct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Breakdowns and filters
// ---------------------------------------------------------------------------

describe('breakdowns and filters', () => {
  it('aggregates categories with period comparison', async () => {
    if (!available) return;

    const result = await gql(app, BREAKDOWN, {}, { accessToken: tokenAdminA });
    const categories = field<Record<string, unknown>[]>(result, 'analyticsByCategory');

    const roads = categories.find((row) => row.key === 'ROADS');
    expect(roads?.count).toBe(4);
    expect(roads?.previousCount).toBe(2);
    expect(roads?.changePct).toBe(100);
    expect(roads?.resolvedCount).toBe(2);
    // All four count as OPEN, including the two resolved ones. Phase 5 treats
    // only CLOSED and REJECTED as terminal - a RESOLVED submission can reopen,
    // and "open" here means "the campaign has not finished with it". The Phase 5
    // analytics service uses the identical definition, and the two dashboards
    // disagreeing about what "open" means would be worse than the surprise.
    expect(roads?.openCount).toBe(4);

    const water = categories.find((row) => row.key === 'WATER');
    expect(water?.count).toBe(2);
  });

  it('keeps status buckets in lifecycle order rather than ranking them', async () => {
    if (!available) return;

    const result = await gql(app, BREAKDOWN, {}, { accessToken: tokenAdminA });
    const statuses = field<Record<string, unknown>[]>(result, 'analyticsByStatus');

    // The funnel shape is the information; sorting by size would destroy it.
    expect(statuses.map((row) => row.key)).toEqual([
      'SUBMITTED',
      'UNDER_REVIEW',
      'ACKNOWLEDGED',
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED',
      'REJECTED',
    ]);
  });

  it('applies a category filter to every metric, not only the category table', async () => {
    if (!available) return;

    const category = await prisma.issueCategory.findFirstOrThrow({
      where: { organizationId: tenantA.organizationId, key: 'ROADS' },
      select: { id: true },
    });

    const filter = { categoryIds: [category.id] };

    const [overview, areas] = await Promise.all([
      gql(app, OVERVIEW, { filter }, { accessToken: tokenAdminA }),
      gql(app, AREAS, { filter }, { accessToken: tokenAdminA }),
    ]);

    expect(field(overview, 'analyticsOverview').totalInRange).toBe(4);

    const areaRows = field<{ count: number }[]>(areas, 'analyticsAreas');
    const total = areaRows.reduce((sum, row) => sum + row.count, 0);
    // The area table must sum to the overview headline under the same filter.
    expect(total).toBe(4);
  });

  it('applies an area filter to the overview', async () => {
    if (!available) return;

    const result = await gql(
      app,
      OVERVIEW,
      { filter: { areas: ['Ward 2'], geoLevel: 'WARD' } },
      { accessToken: tokenAdminA },
    );

    // Ward 2 holds exactly two fixture submissions.
    expect(field(result, 'analyticsOverview').totalInRange).toBe(2);
  });

  it('combines several filters', async () => {
    if (!available) return;

    const result = await gql(
      app,
      OVERVIEW,
      {
        filter: {
          areas: ['Ward 2'],
          priorities: ['URGENT'],
          statuses: ['SUBMITTED'],
        },
      },
      { accessToken: tokenAdminA },
    );

    // Only the DRAINAGE submission is Ward 2 + URGENT + SUBMITTED.
    expect(field(result, 'analyticsOverview').totalInRange).toBe(1);
  });

  it('treats an exact area match as exact, not a prefix', async () => {
    if (!available) return;

    const result = await gql(
      app,
      OVERVIEW,
      { filter: { areas: ['Ward 1'] } },
      { accessToken: tokenAdminA },
    );

    // "Ward 1" must not swallow "Ward 2" - the quiet miscount that would make
    // an administrator distrust every figure on the page.
    expect(field(result, 'analyticsOverview').totalInRange).toBe(5);
  });

  it('rejects an over-long filter list rather than building a huge IN clause', async () => {
    if (!available) return;

    const result = await gql(
      app,
      OVERVIEW,
      { filter: { areas: Array.from({ length: 150 }, (_, index) => `Ward ${index}`) } },
      { accessToken: tokenAdminA },
    );

    expect(result.errors).not.toBeNull();
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

describe('trend', () => {
  it('emits a dense daily series including empty days', async () => {
    if (!available) return;

    const result = await gql(app, TREND, { granularity: 'DAY' }, { accessToken: tokenAdminA });

    const trend = field<{ points: { count: number }[]; granularity: string }>(
      result,
      'analyticsTrend',
    );

    expect(trend.granularity).toBe('DAY');
    // 30 daily buckets, gaps included - a sparse series drawn as a line would
    // imply a smooth slope across days that had no submissions.
    expect(trend.points.length).toBeGreaterThanOrEqual(30);
    expect(trend.points.some((point) => point.count === 0)).toBe(true);

    const total = trend.points.reduce((sum, point) => sum + point.count, 0);
    expect(total).toBe(7);
  });

  it('widens to weekly buckets over a quarter', async () => {
    if (!available) return;

    const result = await gql(
      app,
      TREND,
      { filter: { range: 'LAST_90_DAYS' }, granularity: 'AUTO' },
      { accessToken: tokenAdminA },
    );

    expect(field(result, 'analyticsTrend').granularity).toBe('WEEK');
  });
});

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

describe('geographic analytics', () => {
  it('ranks areas and sums to the overall total', async () => {
    if (!available) return;

    const result = await gql(app, AREAS, {}, { accessToken: tokenAdminA });
    const rows = field<{ key: string; count: number; highPriorityOpenCount: number }[]>(
      result,
      'analyticsAreas',
    );

    const ward1 = rows.find((row) => row.key === 'Ward 1');
    const ward2 = rows.find((row) => row.key === 'Ward 2');

    expect(ward1?.count).toBe(5);
    expect(ward2?.count).toBe(2);
    expect(ward2?.highPriorityOpenCount).toBe(1);

    const total = rows.reduce((sum, row) => sum + row.count, 0);
    expect(total).toBe(7);
  });

  it('withholds a resolution rate computed from too few submissions', async () => {
    if (!available) return;

    const result = await gql(app, AREAS, {}, { accessToken: tokenAdminA });
    const rows = field<Record<string, unknown>[]>(result, 'analyticsAreas');

    const ward2 = rows.find((row) => row.key === 'Ward 2');
    // Two submissions is below the minimum sample, so the rate is withheld
    // rather than reported as a confident percentage.
    expect(ward2?.resolutionRatePct).toBeNull();
  });

  it('lists the distinct area values that exist, for the filter control', async () => {
    if (!available) return;

    const OPTIONS = /* GraphQL */ `
      query Options($filter: AnalyticsFilterInput) {
        analyticsAreaOptions(filter: $filter)
      }
    `;

    // Covers a dynamic-key `orderBy` that TypeScript cannot check, so the only
    // way to know it produces valid Prisma is to run it.
    const wards = await gql(app, OPTIONS, {}, { accessToken: tokenAdminA });
    expect(wards.errors).toBeNull();

    const values = field<string[]>(wards, 'analyticsAreaOptions');
    expect(values).toContain('Ward 1');
    expect(values).toContain('Ward 2');
    // Tenant-scoped like everything else.
    expect(values).not.toContain('Ward 99');

    // The level switch must change which column is read, not just the label.
    const localities = await gql(
      app,
      OPTIONS,
      { filter: { geoLevel: 'LOCALITY' } },
      { accessToken: tokenAdminA },
    );
    expect(localities.errors).toBeNull();
    // No fixture sets `locality`, so the list is empty rather than echoing wards.
    expect(field<string[]>(localities, 'analyticsAreaOptions')).toHaveLength(0);
  });

  it('returns area detail without any citizen contact data', async () => {
    if (!available) return;

    const DETAIL = /* GraphQL */ `
      query Detail($area: String!) {
        analyticsAreaDetail(area: $area) {
          label
          totalInRange
          openCount
          topCategories {
            key
            count
          }
          recentIssues {
            referenceNumber
            title
          }
        }
      }
    `;

    const result = await gql(app, DETAIL, { area: 'Ward 2' }, { accessToken: tokenAdminA });
    expect(result.errors).toBeNull();

    const detail = field(result, 'analyticsAreaDetail');
    expect(detail.totalInRange).toBe(2);
    // The schema offers no contact field on this type at all, which is the
    // structural guarantee; this asserts the serialised payload agrees.
    expect(JSON.stringify(detail)).not.toContain('contact');
  });
});

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

describe('resolution analytics', () => {
  it('distributes resolution times into the documented buckets', async () => {
    if (!available) return;

    const result = await gql(app, RESOLUTION, {}, { accessToken: tokenAdminA });
    const data = field<Record<string, unknown>>(result, 'analyticsResolution');

    expect(data.resolvedInRange).toBe(3);
    expect(data.averageResolutionDays).toBe(3);

    const buckets = data.timeToResolution as { key: string; count: number }[];
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket.count]));

    // Durations were 1, 2 and 6 days.
    expect(byKey.get('D0_1')).toBe(0);
    expect(byKey.get('D1_3')).toBe(2);
    expect(byKey.get('D3_7')).toBe(1);

    // Every bucket is present even when empty, so the distribution keeps shape.
    expect(buckets).toHaveLength(6);
  });

  it('ages the open backlog', async () => {
    if (!available) return;

    const result = await gql(app, RESOLUTION, {}, { accessToken: tokenAdminA });
    const data = field<Record<string, unknown>>(result, 'analyticsResolution');

    const aging = data.backlogAging as { key: string; count: number }[];
    const total = aging.reduce((sum, bucket) => sum + bucket.count, 0);

    expect(total).toBe(data.openCount);
    expect(aging).toHaveLength(6);
  });

  it('lists the high priority backlog oldest first with no citizen data', async () => {
    if (!available) return;

    const result = await gql(app, BACKLOG, {}, { accessToken: tokenAdminA });
    const rows = field<Record<string, unknown>[]>(result, 'analyticsBacklog');

    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain('contact');

    for (const row of rows) {
      expect(['HIGH', 'URGENT']).toContain(row.priority);
    }
  });
});

// ---------------------------------------------------------------------------
// AI and channel integration
// ---------------------------------------------------------------------------

describe('AI and channel integration', () => {
  it('counts submissions by source and joins QR scans', async () => {
    if (!available) return;

    const result = await gql(app, INTELLIGENCE, {}, { accessToken: tokenAdminA });
    const source = field<Record<string, unknown>>(result, 'analyticsSource');

    const bySource = source.bySource as { key: string; count: number }[];
    expect(bySource.find((row) => row.key === 'QR')?.count).toBe(1);
    expect(source.issuesFromQr).toBe(1);

    // No scans were seeded, so the rate is undefined rather than 0% - which
    // would read as "the posters failed" when nobody scanned one.
    expect(source.scanCount).toBe(0);
    expect(source.conversionRatePct).toBeNull();
  });

  it('recomputes theme counts inside the current filter', async () => {
    if (!available) return;

    // A Phase 6 theme whose stored issueCount is deliberately wrong for the
    // dashboard's window: the dashboard must count membership itself.
    const issues = await prisma.issue.findMany({
      // Explicitly inside the current window. An unordered `take: 3` picked up
      // submissions from the PREVIOUS period, so the recomputed count was
      // correctly lower than the membership count - which is the behaviour
      // under test, and would have been masked by a vague fixture.
      where: {
        organizationId: tenantA.organizationId,
        submittedAt: { gte: daysAgo(20) },
      },
      select: { id: true },
      orderBy: { submittedAt: 'desc' },
      take: 3,
    });

    const theme = await prisma.issueTheme.create({
      data: {
        organizationId: tenantA.organizationId,
        name: 'Fixture theme',
        issueCount: 999,
        periodStart: daysAgo(60),
        periodEnd: new Date(),
        memberships: { createMany: { data: issues.map((issue) => ({ issueId: issue.id })) } },
      },
      select: { id: true },
    });

    const result = await gql(app, INTELLIGENCE, {}, { accessToken: tokenAdminA });
    const themes = field<Record<string, unknown>[]>(result, 'analyticsThemes');
    const row = themes.find((entry) => entry.id === theme.id);

    // 3, not the stored 999.
    expect(row?.count).toBe(3);
  });

  it('omits the AI and QR sections for a caller without those permissions', async () => {
    if (!available) return;

    // ISSUE_MANAGER holds ISSUE_ANALYTICS_READ but not QR_ANALYTICS_READ.
    const result = await gql(app, INTELLIGENCE, {}, { accessToken: tokenManagerA });

    expect(result.errors).toBeNull();
    // Omitted rather than refused: the rest of the dashboard still loads.
    expect(result.data?.analyticsSource).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

describe('evidence-backed insights', () => {
  it('carries the figures that produced each claim', async () => {
    if (!available) return;

    const result = await gql(app, INSIGHTS, {}, { accessToken: tokenAdminA });
    const insights = field<Record<string, unknown>[]>(result, 'analyticsInsights');

    expect(insights.length).toBeGreaterThan(0);

    for (const insight of insights) {
      // Every card must be checkable: a claim without its evidence is just an
      // assertion with a number in it.
      expect(typeof insight.currentValue).toBe('number');
      expect(typeof insight.previousValue).toBe('number');
      expect(String(insight.headline).length).toBeGreaterThan(0);
    }

    // The BACKLOG card fires: two high/urgent submissions are open.
    const backlog = insights.find((insight) => insight.kind === 'BACKLOG');
    expect(backlog?.currentValue).toBe(2);
  });

  it('suppresses a movement claim built on too few submissions', async () => {
    if (!available) return;

    const result = await gql(app, INSIGHTS, {}, { accessToken: tokenAdminA });
    const insights = field<Record<string, unknown>[]>(result, 'analyticsInsights');

    // The previous period held 2 submissions, which is below the floor. The
    // arithmetic would say "+250%" and it would be true and worthless - the
    // exact shape of claim that gets screenshotted and repeated. So no VOLUME
    // card is produced at all.
    expect(insights.some((insight) => insight.kind === 'VOLUME')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RBAC and tenancy
// ---------------------------------------------------------------------------

describe('authorization', () => {
  it('refuses an unauthenticated caller', async () => {
    if (!available) return;
    const result = await gql(app, OVERVIEW);
    expect(result.errors).not.toBeNull();
  });

  it('refuses a viewer, who holds no analytics permission', async () => {
    if (!available) return;

    const result = await gql(app, OVERVIEW, {}, { accessToken: tokenViewerA });
    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('allows an analyst, whose role is aggregate analysis', async () => {
    if (!available) return;

    const result = await gql(app, OVERVIEW, {}, { accessToken: tokenAnalystA });
    expect(result.errors).toBeNull();
    expect(field(result, 'analyticsOverview').totalInRange).toBe(7);
  });

  it('allows an issue manager to read but not to export', async () => {
    if (!available) return;

    const read = await gql(app, OVERVIEW, {}, { accessToken: tokenManagerA });
    expect(read.errors).toBeNull();

    // Reading analytics and taking them out of the platform are separate
    // decisions, so they are separate grants.
    const exported = await gql(
      app,
      EXPORT,
      { dataset: 'OVERVIEW' },
      { accessToken: tokenManagerA },
    );
    expect(exported.errorCode).toBe('FORBIDDEN');
  });
});

describe('tenant isolation', () => {
  it('does not leak counts between tenants', async () => {
    if (!available) return;

    const [a, b] = await Promise.all([
      gql(app, OVERVIEW, {}, { accessToken: tokenAdminA }),
      gql(app, OVERVIEW, {}, { accessToken: tokenAdminB }),
    ]);

    expect(field(a, 'analyticsOverview').totalInRange).toBe(7);
    expect(field(b, 'analyticsOverview').totalInRange).toBe(1);
  });

  it('does not leak areas between tenants', async () => {
    if (!available) return;

    const result = await gql(app, AREAS, {}, { accessToken: tokenAdminB });
    const rows = field<Record<string, unknown>[]>(result, 'analyticsAreas');

    expect(rows.some((row) => row.key === 'Ward 99')).toBe(true);
    expect(rows.some((row) => row.key === 'Ward 1')).toBe(false);
  });

  it('ignores a forged tenant header', async () => {
    if (!available) return;

    // The tenant comes from the verified session, never from the header, so
    // pointing it at another organisation changes nothing.
    const result = await gql(
      app,
      OVERVIEW,
      {},
      { accessToken: tokenAdminB, organizationId: tenantA.organizationId },
    );

    if (result.errors === null) {
      expect(field(result, 'analyticsOverview').totalInRange).toBe(1);
    } else {
      expect(result.errorCode).toBe('FORBIDDEN');
    }
  });

  it('does not leak themes between tenants', async () => {
    if (!available) return;

    const result = await gql(app, INTELLIGENCE, {}, { accessToken: tokenAdminB });
    const themes = field<Record<string, unknown>[]>(result, 'analyticsThemes');

    expect(themes.some((theme) => theme.name === 'Fixture theme')).toBe(false);
  });

  it('does not leak an export between tenants', async () => {
    if (!available) return;

    const result = await gql(app, EXPORT, { dataset: 'AREAS' }, { accessToken: tokenAdminB });
    const csv = field<string>(result, 'analyticsExportCsv');

    expect(csv).toContain('Ward 99');
    expect(csv).not.toContain('Ward 1');
  });
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

describe('export', () => {
  it('produces aggregate CSV respecting the current filters', async () => {
    if (!available) return;

    const category = await prisma.issueCategory.findFirstOrThrow({
      where: { organizationId: tenantA.organizationId, key: 'ROADS' },
      select: { id: true },
    });

    const result = await gql(
      app,
      EXPORT,
      { dataset: 'CATEGORIES', filter: { categoryIds: [category.id] } },
      { accessToken: tokenAdminA },
    );

    const csv = field<string>(result, 'analyticsExportCsv');
    expect(csv.split('\n')[0]).toContain('Category');
    expect(csv).toContain('Roads');
    // The filter reached the export: no other category should appear.
    expect(csv).not.toContain('Water supply');
  });

  it('exports no citizen personal data in any dataset', async () => {
    if (!available) return;

    // A submission with contact details, so there is something to leak.
    await createIssue(tenantA.organizationId, {
      categoryKey: 'ROADS',
      submittedDaysAgo: 6,
      contactPhone: '+91 98765 43210',
    });

    for (const dataset of ['OVERVIEW', 'CATEGORIES', 'AREAS', 'RESOLUTION'] as const) {
      const result = await gql(app, EXPORT, { dataset }, { accessToken: tokenAdminA });
      const csv = field<string>(result, 'analyticsExportCsv');

      expect(csv).not.toContain('98765');
      expect(csv).not.toContain('Fixture Citizen');
      expect(csv.toLowerCase()).not.toContain('description');
      // No submission reference either: every dataset is a table of counts.
      expect(csv).not.toContain('ISS-2026-');
    }
  });

  it('audits both the request and the completion', async () => {
    if (!available) return;

    await gql(app, EXPORT, { dataset: 'OVERVIEW' }, { accessToken: tokenAdminA });

    const [requested, completed] = await Promise.all([
      prisma.auditLog.findFirst({
        where: {
          organizationId: tenantA.organizationId,
          action: 'ANALYTICS_EXPORT_REQUESTED',
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.findFirst({
        where: {
          organizationId: tenantA.organizationId,
          action: 'ANALYTICS_EXPORT_COMPLETED',
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    expect(requested?.actorUserId).toBe(adminA.id);
    expect(completed?.actorUserId).toBe(adminA.id);
  });

  it('escapes a value that would otherwise execute as a spreadsheet formula', async () => {
    if (!available) return;

    // A tenant-controlled area name beginning with "=" is a formula injection
    // when the CSV is opened in Excel or Sheets.
    await createIssue(tenantA.organizationId, {
      categoryKey: 'ROADS',
      submittedDaysAgo: 7,
      ward: '=cmd|calc',
    });

    const result = await gql(app, EXPORT, { dataset: 'AREAS' }, { accessToken: tokenAdminA });
    const csv = field<string>(result, 'analyticsExportCsv');

    expect(csv).toContain(`"'=cmd|calc"`);
    expect(csv).not.toContain('"=cmd|calc"');
  });
});
