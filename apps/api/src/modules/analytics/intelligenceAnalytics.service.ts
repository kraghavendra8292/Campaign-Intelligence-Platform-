import type { AuthContext } from '@rk/types';
import { ANALYTICS_LIMITS } from '@rk/types';
import { prisma } from '../../database/prisma';
import { analyticsService } from './analytics.service';
import {
  canSee,
  percentageChange,
  rate,
  type AnalyticsFilter,
  type AnalyticsScope,
} from './shared/analyticsFilters';

/**
 * The Phase 4 and Phase 6 sections of the dashboard.
 *
 * Phase 7 CONSUMES those phases; it does not reimplement them. Themes and
 * topics are read from the tables Phase 6 writes, and QR scan counts from the
 * tables Phase 4 writes. Nothing here calls a model, extracts a topic, or
 * recomputes a scan.
 *
 * THE DIVISION OF LABOUR, which is the same rule Phase 6 established and the
 * reason these figures can be trusted: THE DATABASE PRODUCES EVERY NUMBER, and
 * the AI produced only the words attached to them. A theme card shows a count
 * computed here by `count()` next to a sentence a model wrote, and the two are
 * visually and structurally separate all the way to the screen.
 *
 * GRACEFUL DEGRADATION BY PERMISSION. The QR and AI sections return `null`
 * rather than throwing when the caller lacks `QR_ANALYTICS_READ` or
 * `AI_INSIGHT_READ`. An analytics page that refuses to load entirely because
 * one of its six panels is not permitted would be a worse experience than one
 * that shows five - and the permission boundary is still absolute, because
 * `null` carries no data.
 */

export const intelligenceAnalyticsService = {
  /**
   * Recurring themes, with counts recomputed inside the current filter.
   *
   * THE STORED `issueCount` ON A THEME IS NOT USED HERE. That number was
   * computed by Phase 6 for the period the theme was detected over, and the
   * dashboard's filter is almost never that period. Reusing it would show a
   * count that silently ignores the filter the administrator just set, which is
   * the most plausible way this dashboard could tell somebody something false.
   *
   * So membership is intersected with the current scope and counted again.
   */
  async themes(auth: AuthContext, filter?: AnalyticsFilter | null) {
    const scope = analyticsService.scopeFor(auth, filter);
    if (!canSee(auth, 'AI_INSIGHT_READ')) return null;

    const themes = await prisma.issueTheme.findMany({
      where: { organizationId: scope.organizationId },
      select: {
        id: true,
        name: true,
        description: true,
        generatedSummary: true,
        reviewStatus: true,
        periodStart: true,
        periodEnd: true,
        generatedAt: true,
        model: true,
        promptVersion: true,
      },
      orderBy: { generatedAt: 'desc' },
      take: 20,
    });

    if (themes.length === 0) return [];

    const totalInRange = await prisma.issue.count({ where: scope.windowed });

    const rows = await Promise.all(
      themes.map(async (theme) => {
        const membership = { themeMemberships: { some: { themeId: theme.id } } };

        const [count, previousCount] = await Promise.all([
          prisma.issue.count({ where: { ...scope.windowed, ...membership } }),
          prisma.issue.count({ where: { ...scope.previousWindowed, ...membership } }),
        ]);

        return {
          id: theme.id,
          name: theme.name,
          description: theme.description,
          // Model-written prose. Rendered as escaped text and labelled
          // AI-generated at every call site.
          generatedSummary: theme.generatedSummary,
          reviewStatus: theme.reviewStatus,
          model: theme.model,
          promptVersion: theme.promptVersion,
          detectedPeriodStart: theme.periodStart,
          detectedPeriodEnd: theme.periodEnd,
          generatedAt: theme.generatedAt,

          // Backend-computed, inside the CURRENT filter.
          count,
          previousCount,
          changePct: percentageChange(count, previousCount),
          sharePct: rate(count, totalInRange),
        };
      }),
    );

    // Themes matching nothing in the selected window are dropped: a theme with
    // no submissions in the period is not an observation about the period.
    return rows.filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
  },

  /**
   * Top subject-matter topics, counted over DISTINCT ISSUES.
   *
   * Counting topic ROWS would double-count an issue that yielded the same
   * normalised topic twice - which the Phase 6 unique constraint prevents
   * per issue, but counting rows would still conflate "twenty issues mention
   * road damage" with "twenty mentions of road damage". The former is the
   * administrative fact.
   */
  async topics(auth: AuthContext, filter?: AnalyticsFilter | null) {
    const scope = analyticsService.scopeFor(auth, filter);
    if (!canSee(auth, 'AI_INSIGHT_READ')) return null;

    const [current, previous, totalInRange] = await Promise.all([
      groupTopics(scope, 'current'),
      groupTopics(scope, 'previous'),
      prisma.issue.count({ where: scope.windowed }),
    ]);

    return [...current.entries()]
      .map(([topic, entry]) => ({
        topic,
        label: entry.label,
        count: entry.count,
        sharePct: rate(entry.count, totalInRange),
        previousCount: previous.get(topic)?.count ?? 0,
        changePct: percentageChange(entry.count, previous.get(topic)?.count ?? 0),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, ANALYTICS_LIMITS.topTopics);
  },

  /**
   * Channel attribution: QR scans against submissions that came through them.
   *
   * THE CONVERSION RATE IS A STATEMENT ABOUT A POSTER, NOT ABOUT A PERSON.
   * "1,200 scans produced 82 submissions" says the poster worked. It does not
   * say anything about who scanned it, what they think, or how they vote - and
   * a scan in particular means only that a code was scanned. Phase 4 made that
   * point about its own analytics and it holds identically here.
   *
   * Requires QR_ANALYTICS_READ on top of the analytics permission; returns null
   * without it, so the section simply does not render.
   */
  async source(auth: AuthContext, filter?: AnalyticsFilter | null) {
    const scope = analyticsService.scopeFor(auth, filter);
    if (!canSee(auth, 'QR_ANALYTICS_READ')) return null;

    const [bySource, scanTotal, scansByCampaign, issuesByCampaign, campaigns] = await Promise.all([
      prisma.issue.groupBy({
        by: ['source'],
        where: scope.windowed,
        _count: { _all: true },
      }),

      prisma.qrScanEvent.count({
        where: {
          organizationId: scope.organizationId,
          scannedAt: { gte: scope.range.from, lt: scope.range.to },
          // Crawlers and link previews are excluded, matching the Phase 4
          // dashboard. Counting them would inflate the denominator and make
          // every conversion rate look worse than it is.
          isAutomated: false,
        },
      }),

      prisma.qrScanEvent.groupBy({
        by: ['campaignId'],
        where: {
          organizationId: scope.organizationId,
          scannedAt: { gte: scope.range.from, lt: scope.range.to },
          isAutomated: false,
        },
        _count: { _all: true },
      }),

      prisma.issue.groupBy({
        by: ['campaignId'],
        where: { ...scope.windowed, campaignId: { not: null } },
        _count: { _all: true },
      }),

      prisma.qrCampaign.findMany({
        where: { organizationId: scope.organizationId },
        select: { id: true, name: true, status: true },
      }),
    ]);

    const totalIssues = bySource.reduce((sum, row) => sum + row._count._all, 0);
    const issuesByCampaignId = new Map(
      issuesByCampaign.map((row) => [row.campaignId, row._count._all]),
    );
    const scansByCampaignId = new Map(
      scansByCampaign.map((row) => [row.campaignId, row._count._all]),
    );
    const campaignById = new Map(campaigns.map((row) => [row.id, row]));

    const campaignIds = new Set<string>([
      ...scansByCampaign.map((row) => row.campaignId),
      ...issuesByCampaign.map((row) => row.campaignId).filter((id): id is string => id !== null),
    ]);

    return {
      range: scope.range,

      bySource: bySource
        .map((row) => ({
          key: row.source,
          label: SOURCE_LABELS[row.source] ?? row.source,
          count: row._count._all,
          sharePct: rate(row._count._all, totalIssues),
        }))
        .sort((a, b) => b.count - a.count),

      scanCount: scanTotal,
      issuesFromQr: bySource.find((row) => row.source === 'QR')?._count._all ?? 0,
      // Null rather than 0 when there were no scans: a conversion rate with an
      // empty denominator is undefined, and "0%" would read as "the posters
      // failed" when the truth is "nobody scanned one".
      conversionRatePct: rate(
        bySource.find((row) => row.source === 'QR')?._count._all ?? 0,
        scanTotal,
      ),

      byCampaign: [...campaignIds]
        .map((id) => {
          const campaign = campaignById.get(id);
          const scans = scansByCampaignId.get(id) ?? 0;
          const issues = issuesByCampaignId.get(id) ?? 0;
          return {
            id,
            name: campaign?.name ?? 'Unknown campaign',
            status: campaign?.status ?? null,
            scans,
            issues,
            conversionRatePct: rate(issues, scans),
          };
        })
        .sort((a, b) => b.scans - a.scans)
        .slice(0, 20),
    };
  },

  /**
   * Evidence-backed insight cards.
   *
   * THE NUMBERS ARE COMPUTED HERE. Every card carries the two counts and the
   * change that produced it, and the UI renders them beside the sentence. No
   * model is called by this method, and no model is permitted to supply a
   * figure that appears on a card - the wording is a template over
   * backend-computed values.
   *
   * That is a deliberate narrowing of what Phase 6 allows. Phase 6 lets a model
   * write prose from supplied statistics because an executive summary is a
   * paragraph a human reads and reviews. An insight card is a one-line claim
   * with a number in it, shown without review, which is the shape most likely
   * to be screenshotted and repeated - so its wording is generated
   * deterministically from the evidence rather than by a model.
   *
   * Insights are suppressed below a floor, because "up 100%, from 1 to 2" is
   * technically true and administratively worthless.
   */
  async insights(auth: AuthContext, filter?: AnalyticsFilter | null) {
    // No scope is built here: both delegated calls derive their own from the
    // same filter, so constructing a third would only be a second thing to keep
    // in step. Permission and tenant are enforced inside them.
    const [categories, overview] = await Promise.all([
      analyticsService.byCategory(auth, filter),
      analyticsService.overview(auth, filter),
    ]);

    const insights: Array<{
      kind: string;
      headline: string;
      detail: string;
      currentValue: number;
      previousValue: number;
      changePct: number | null;
      severity: 'INFO' | 'ATTENTION';
      categoryKey?: string | null;
    }> = [];

    const MIN_COUNT = 5;

    // Volume movement overall.
    if (overview.previousTotal >= MIN_COUNT && overview.changePct !== null) {
      const direction = overview.changePct >= 0 ? 'increased' : 'decreased';
      insights.push({
        kind: 'VOLUME',
        headline: `Submissions ${direction} by ${Math.abs(overview.changePct)}% compared with the previous period.`,
        detail: `${overview.totalInRange} submissions in this period against ${overview.previousTotal} in the equivalent period before it.`,
        currentValue: overview.totalInRange,
        previousValue: overview.previousTotal,
        changePct: overview.changePct,
        severity: Math.abs(overview.changePct) >= 25 ? 'ATTENTION' : 'INFO',
      });
    }

    // The two categories that moved most, in either direction.
    const movers = categories
      .filter(
        (row) => row.previousCount >= MIN_COUNT && row.count >= MIN_COUNT && row.changePct !== null,
      )
      .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
      .slice(0, 2);

    for (const row of movers) {
      const change = row.changePct ?? 0;
      const direction = change >= 0 ? 'increased' : 'decreased';
      insights.push({
        kind: 'CATEGORY_TREND',
        headline: `${row.label} submissions ${direction} by ${Math.abs(change)}%.`,
        detail: `${row.count} in this period against ${row.previousCount} in the equivalent period before it.`,
        currentValue: row.count,
        previousValue: row.previousCount,
        changePct: change,
        severity: Math.abs(change) >= 30 ? 'ATTENTION' : 'INFO',
        categoryKey: row.key,
      });
    }

    // Backlog pressure. Not a period comparison, so `previousValue` mirrors
    // `currentValue` rather than inventing a prior figure that was not measured.
    if (overview.highPriorityOpen > 0) {
      insights.push({
        kind: 'BACKLOG',
        headline: `${overview.highPriorityOpen} high or urgent submissions are still open.`,
        detail:
          overview.oldestOpenIssue !== null
            ? `The oldest open submission has been waiting ${overview.oldestOpenIssue.ageDays} days.`
            : 'These are open across all periods, not only the selected one.',
        currentValue: overview.highPriorityOpen,
        previousValue: overview.highPriorityOpen,
        changePct: null,
        severity: 'ATTENTION',
      });
    }

    return insights;
  },
};

const SOURCE_LABELS: Record<string, string> = {
  DIRECT_WEBSITE: 'Website',
  QR: 'QR code',
  CAMPAIGN_PAGE: 'Campaign page',
  OTHER: 'Other',
};

/**
 * Distinct-issue counts per normalised topic, inside a scope window.
 *
 * Selects the topic and its issue id, then counts distinct issues per topic in
 * memory. Bounded by the window; the alternative is one `count` query per topic,
 * which is N+1 over the topic vocabulary.
 */
async function groupTopics(
  scope: AnalyticsScope,
  period: 'current' | 'previous',
): Promise<Map<string, { label: string; count: number }>> {
  const where = period === 'current' ? scope.windowed : scope.previousWindowed;

  const rows = await prisma.issueAiTopic.findMany({
    where: { organizationId: scope.organizationId, issue: where },
    select: { normalized: true, topic: true, issueId: true },
  });

  const byTopic = new Map<string, { label: string; issues: Set<string> }>();
  for (const row of rows) {
    const entry = byTopic.get(row.normalized) ?? { label: row.topic, issues: new Set<string>() };
    entry.issues.add(row.issueId);
    byTopic.set(row.normalized, entry);
  }

  return new Map(
    [...byTopic.entries()].map(([topic, entry]) => [
      topic,
      { label: entry.label, count: entry.issues.size },
    ]),
  );
}
