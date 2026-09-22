import {
  MAX_ANALYTICS_RANGE_DAYS,
  hourBucket,
  type AnalyticsRange,
  type AuthContext,
  type ScanDeviceCategory,
  type ScanHourBucket,
} from '@rk/types';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { requireQrAnalytics } from '../shared/qrGuards';

/**
 * Aggregate QR analytics.
 *
 * THREE RULES, all of which the tests enforce:
 *
 * 1. AGGREGATION HAPPENS IN THE DATABASE. Every figure below comes from a
 *    `count` or a `groupBy`. Individual scan rows are never returned to a
 *    resolver, let alone to a browser - which makes it structurally impossible
 *    for the client to reconstruct anything per-person even if it wanted to.
 *
 * 2. EVERY QUERY IS TENANT-SCOPED AND TIME-BOUNDED. The organisation comes from
 *    the authenticated context and the window is clamped, so no single request
 *    can scan the whole table.
 *
 * 3. THE OUTPUT DESCRIBES CHANNELS, NOT PEOPLE. Scans, sources, wards, device
 *    classes and hours. There is no per-visitor output anywhere in this file,
 *    and the `visitHash` column is only ever fed to `countDistinct` - never
 *    selected, never returned, never exported.
 *
 * The wording is "scans", never "people". A scan is an event; attributing one
 * to a person would be a claim the data cannot support.
 */

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

export interface ResolvedRange {
  readonly from: Date;
  readonly to: Date;
  readonly days: number;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * Turns a named range (or a custom pair) into a concrete window.
 *
 * Presets are resolved on the SERVER. Letting the client compute "last 7 days"
 * would put the boundary in whatever timezone the browser happens to be in, so
 * two people looking at the same dashboard would see different totals.
 *
 * A custom range is clamped to `MAX_ANALYTICS_RANGE_DAYS` and rejected rather
 * than silently truncated: quietly narrowing somebody's range and then showing
 * them a number is worse than telling them the range is too wide.
 */
export function resolveRange(
  range: AnalyticsRange | null | undefined,
  fromInput?: string | null,
  toInput?: string | null,
  now: Date = new Date(),
): ResolvedRange {
  const today = startOfUtcDay(now);
  const endOfToday = addDays(today, 1);

  const build = (from: Date, to: Date): ResolvedRange => ({
    from,
    to,
    days: Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000)),
  });

  switch (range ?? 'LAST_30_DAYS') {
    case 'TODAY':
      return build(today, endOfToday);
    case 'YESTERDAY':
      return build(addDays(today, -1), today);
    case 'LAST_7_DAYS':
      return build(addDays(today, -6), endOfToday);
    case 'LAST_30_DAYS':
      return build(addDays(today, -29), endOfToday);
    case 'LAST_90_DAYS':
      return build(addDays(today, -89), endOfToday);
    case 'THIS_MONTH':
      return build(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), endOfToday);
    case 'PREVIOUS_MONTH': {
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return build(first, next);
    }
    case 'CUSTOM': {
      if (!fromInput || !toInput) {
        throw AppError.validation('A custom range needs both a start and an end date.', {
          details: { field: 'from' },
        });
      }

      const from = new Date(fromInput);
      const to = new Date(toInput);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw AppError.validation('Enter valid dates.', { details: { field: 'from' } });
      }
      if (to.getTime() < from.getTime()) {
        throw AppError.validation('The end date cannot be before the start date.', {
          details: { field: 'to' },
        });
      }

      const start = startOfUtcDay(from);
      // The end date is inclusive from the reader's point of view: picking the
      // 5th twice should mean "the whole of the 5th", not an empty window.
      const end = addDays(startOfUtcDay(to), 1);
      const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);

      if (days > MAX_ANALYTICS_RANGE_DAYS) {
        throw AppError.validation(`Choose a range of ${MAX_ANALYTICS_RANGE_DAYS} days or fewer.`, {
          details: { field: 'to', limit: MAX_ANALYTICS_RANGE_DAYS },
        });
      }

      return build(start, end);
    }
  }
}

// ---------------------------------------------------------------------------
// Query scope
// ---------------------------------------------------------------------------

export interface AnalyticsArgs {
  readonly range?: AnalyticsRange | null;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly campaignId?: string | null;
  readonly qrCodeId?: string | null;
  /** Excludes link-preview crawlers and scripts from every figure. */
  readonly excludeAutomated?: boolean | null;
}

export interface CountedLabel {
  readonly key: string;
  readonly label: string;
  readonly scans: number;
}

export interface QrAnalyticsResult {
  readonly range: { from: Date; to: Date; days: number };
  readonly totalScans: number;
  readonly automatedScans: number;
  readonly estimatedUniqueScans: number | null;
  readonly scansToday: number;
  readonly scansLast7Days: number;
  readonly scansLast30Days: number;
  readonly averageScansPerDay: number;
  readonly activeQrCodes: number;
  readonly totalQrCodes: number;
  readonly trend: ReadonlyArray<{ date: Date; scans: number }>;
  readonly byQrCode: readonly CountedLabel[];
  readonly bySource: readonly CountedLabel[];
  readonly byArea: readonly CountedLabel[];
  readonly byWard: readonly CountedLabel[];
  readonly byDevice: readonly CountedLabel[];
  readonly byDayOfWeek: readonly CountedLabel[];
  readonly byHourBucket: readonly CountedLabel[];
  readonly topQrCodeId: string | null;
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const HOUR_BUCKET_LABELS: Record<ScanHourBucket, string> = {
  H00_06: '00:00–06:00',
  H06_12: '06:00–12:00',
  H12_18: '12:00–18:00',
  H18_24: '18:00–24:00',
};

const DEVICE_LABELS: Record<ScanDeviceCategory, string> = {
  MOBILE: 'Mobile',
  TABLET: 'Tablet',
  DESKTOP: 'Desktop',
  BOT: 'Automated',
  UNKNOWN: 'Unknown',
};

/** Sorts descending by scans and keeps the head, so a chart stays readable. */
function topN(items: CountedLabel[], limit = 10): CountedLabel[] {
  return [...items].sort((a, b) => b.scans - a.scans).slice(0, limit);
}

export const qrAnalyticsService = {
  /**
   * The one analytics entry point.
   *
   * Scope narrows from tenant, to campaign, to a single code, depending on what
   * the caller asked for. The tenant filter is always present regardless, so a
   * forged campaign id from another organisation simply matches nothing rather
   * than widening the scope.
   */
  async summary(auth: AuthContext, args: AnalyticsArgs): Promise<QrAnalyticsResult> {
    const { organizationId } = requireQrAnalytics(auth);
    const now = new Date();
    const range = resolveRange(args.range, args.from, args.to, now);

    // A campaign or code id is verified to belong to this tenant BEFORE it is
    // used as a filter, so an id from elsewhere fails loudly instead of quietly
    // returning zeros that look like a real (empty) result.
    if (args.campaignId) {
      const owned = await prisma.qrCampaign.findFirst({
        where: { id: args.campaignId, organizationId },
        select: { id: true },
      });
      if (!owned) throw AppError.notFound('This QR campaign is not available.');
    }
    if (args.qrCodeId) {
      const owned = await prisma.qrCode.findFirst({
        where: { id: args.qrCodeId, organizationId },
        select: { id: true },
      });
      if (!owned) throw AppError.notFound('This QR code is not available.');
    }

    const scope: Prisma.QrScanEventWhereInput = {
      organizationId,
      ...(args.campaignId ? { campaignId: args.campaignId } : {}),
      ...(args.qrCodeId ? { qrCodeId: args.qrCodeId } : {}),
      ...(args.excludeAutomated ? { isAutomated: false } : {}),
    };

    const windowed: Prisma.QrScanEventWhereInput = {
      ...scope,
      scannedAt: { gte: range.from, lt: range.to },
    };

    const today = startOfUtcDay(now);

    const [
      totalScans,
      automatedScans,
      uniqueGroups,
      scansToday,
      scansLast7Days,
      scansLast30Days,
      trendRows,
      codeRows,
      deviceRows,
      dayRows,
      hourRows,
      codeInventory,
    ] = await Promise.all([
      prisma.qrScanEvent.count({ where: windowed }),
      prisma.qrScanEvent.count({ where: { ...windowed, isAutomated: true } }),

      // Distinct visit hashes within the window. `groupBy` on the hash counts
      // buckets; the hashes themselves are discarded on the next line and never
      // leave this function.
      prisma.qrScanEvent.groupBy({
        by: ['visitHash'],
        where: { ...windowed, visitHash: { not: null } },
      }),

      prisma.qrScanEvent.count({ where: { ...scope, scannedAt: { gte: today } } }),
      prisma.qrScanEvent.count({ where: { ...scope, scannedAt: { gte: addDays(today, -6) } } }),
      prisma.qrScanEvent.count({ where: { ...scope, scannedAt: { gte: addDays(today, -29) } } }),

      prisma.qrScanEvent.groupBy({
        by: ['scanDate'],
        where: windowed,
        _count: { _all: true },
        orderBy: { scanDate: 'asc' },
      }),

      prisma.qrScanEvent.groupBy({
        by: ['qrCodeId'],
        where: windowed,
        _count: { _all: true },
      }),

      prisma.qrScanEvent.groupBy({
        by: ['deviceCategory'],
        where: windowed,
        _count: { _all: true },
      }),

      prisma.qrScanEvent.groupBy({
        by: ['scanDayOfWeek'],
        where: windowed,
        _count: { _all: true },
      }),

      prisma.qrScanEvent.groupBy({
        by: ['scanHour'],
        where: windowed,
        _count: { _all: true },
      }),

      // Attribution metadata lives on the QR code, not copied onto every scan.
      // Source, area and ward are therefore rolled up by joining these rows to
      // the per-code counts in memory. The trade-off is deliberate: one source
      // of truth for attribution, no write amplification on the latency-
      // critical redirect, and correcting a ward fixes that code's history
      // rather than splitting it across two buckets. The set is bounded by the
      // number of QR codes a tenant owns, not by scan volume.
      prisma.qrCode.findMany({
        where: {
          organizationId,
          ...(args.campaignId ? { campaignId: args.campaignId } : {}),
          ...(args.qrCodeId ? { id: args.qrCodeId } : {}),
        },
        select: {
          id: true,
          name: true,
          code: true,
          source: true,
          area: true,
          ward: true,
          status: true,
        },
      }),
    ]);

    const countsByCode = new Map(codeRows.map((row) => [row.qrCodeId, row._count._all]));

    const byQrCode: CountedLabel[] = codeInventory.map((code) => ({
      key: code.id,
      label: code.name,
      scans: countsByCode.get(code.id) ?? 0,
    }));

    const rollup = (attribute: 'source' | 'area' | 'ward'): CountedLabel[] => {
      const totals = new Map<string, number>();
      for (const code of codeInventory) {
        const value = code[attribute];
        // Codes with no value for this attribute are grouped honestly as
        // "Not recorded" rather than dropped, so the percentages still add up
        // and nobody reads a partial chart as a complete one.
        const key = value && value.trim().length > 0 ? value.trim() : 'Not recorded';
        totals.set(key, (totals.get(key) ?? 0) + (countsByCode.get(code.id) ?? 0));
      }
      return [...totals.entries()]
        .filter(([, scans]) => scans > 0)
        .map(([key, scans]) => ({ key, label: key, scans }));
    };

    const hourTotals = new Map<ScanHourBucket, number>();
    for (const row of hourRows) {
      const bucket = hourBucket(row.scanHour);
      hourTotals.set(bucket, (hourTotals.get(bucket) ?? 0) + row._count._all);
    }

    const ranked = topN(byQrCode, 1);

    return {
      range,
      totalScans,
      automatedScans,
      // Null rather than zero when estimation is switched off or no scan in the
      // window carried a hash. Zero would be a claim ("nobody came"); null is
      // the truth ("this figure is not available"), and the UI says so.
      estimatedUniqueScans: uniqueGroups.length > 0 ? uniqueGroups.length : null,
      scansToday,
      scansLast7Days,
      scansLast30Days,
      averageScansPerDay: range.days > 0 ? Number((totalScans / range.days).toFixed(2)) : 0,
      activeQrCodes: codeInventory.filter((code) => code.status === 'ACTIVE').length,
      totalQrCodes: codeInventory.length,
      trend: trendRows.map((row) => ({ date: row.scanDate, scans: row._count._all })),
      byQrCode: topN(byQrCode),
      bySource: topN(rollup('source')),
      byArea: topN(rollup('area')),
      byWard: topN(rollup('ward')),
      byDevice: deviceRows.map((row) => ({
        key: row.deviceCategory,
        label: DEVICE_LABELS[row.deviceCategory],
        scans: row._count._all,
      })),
      byDayOfWeek: dayRows.map((row) => ({
        key: String(row.scanDayOfWeek),
        label: DAY_LABELS[row.scanDayOfWeek] ?? 'Unknown',
        scans: row._count._all,
      })),
      byHourBucket: [...hourTotals.entries()].map(([key, scans]) => ({
        key,
        label: HOUR_BUCKET_LABELS[key],
        scans,
      })),
      topQrCodeId: ranked[0] && ranked[0].scans > 0 ? ranked[0].key : null,
    };
  },

  /**
   * Scans per campaign, for comparing outreach channels against each other.
   *
   * Aggregate comparison only. There is no ranking of anything but campaigns,
   * no prediction, and no model - the numbers are counts of events that
   * happened, presented next to each other.
   */
  async compareCampaigns(auth: AuthContext, args: AnalyticsArgs) {
    const { organizationId } = requireQrAnalytics(auth);
    const range = resolveRange(args.range, args.from, args.to);

    const [campaigns, rows] = await Promise.all([
      prisma.qrCampaign.findMany({
        where: { organizationId },
        select: { id: true, name: true, campaignType: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.qrScanEvent.groupBy({
        by: ['campaignId'],
        where: {
          organizationId,
          scannedAt: { gte: range.from, lt: range.to },
          ...(args.excludeAutomated ? { isAutomated: false } : {}),
        },
        _count: { _all: true },
      }),
    ]);

    const counts = new Map(rows.map((row) => [row.campaignId, row._count._all]));

    return {
      range,
      campaigns: campaigns
        .map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          campaignType: campaign.campaignType,
          status: campaign.status,
          scans: counts.get(campaign.id) ?? 0,
        }))
        .sort((a, b) => b.scans - a.scans),
    };
  },

  /**
   * Aggregate CSV export: one row per day per QR code.
   *
   * WHAT IS NOT EXPORTABLE, and never will be from this method: visit hashes,
   * IP addresses, User-Agent strings, referrers, or any per-scan row. The unit
   * of export is a daily total for a channel, which is the coarsest thing that
   * still answers a campaign question.
   */
  async exportCsv(auth: AuthContext, args: AnalyticsArgs): Promise<string> {
    const { organizationId } = requireQrAnalytics(auth);
    const range = resolveRange(args.range, args.from, args.to);

    if (args.campaignId) {
      const owned = await prisma.qrCampaign.findFirst({
        where: { id: args.campaignId, organizationId },
        select: { id: true },
      });
      if (!owned) throw AppError.notFound('This QR campaign is not available.');
    }

    const [rows, codes] = await Promise.all([
      prisma.qrScanEvent.groupBy({
        by: ['scanDate', 'qrCodeId'],
        where: {
          organizationId,
          scannedAt: { gte: range.from, lt: range.to },
          ...(args.campaignId ? { campaignId: args.campaignId } : {}),
          ...(args.excludeAutomated ? { isAutomated: false } : {}),
        },
        _count: { _all: true },
        orderBy: [{ scanDate: 'asc' }],
      }),
      prisma.qrCode.findMany({
        where: { organizationId },
        select: {
          id: true,
          code: true,
          name: true,
          source: true,
          area: true,
          ward: true,
          campaign: { select: { name: true } },
        },
      }),
    ]);

    const byId = new Map(codes.map((code) => [code.id, code]));

    // Every field is quoted and internal quotes doubled. A campaign name
    // containing a comma would otherwise shift every later column, and a name
    // beginning with "=" is a spreadsheet formula injection - which is why the
    // escaper below also neutralises leading formula characters.
    const csvCell = (value: string | null | undefined): string => {
      const raw = value ?? '';
      const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const lines = ['Date,Campaign,QR code,QR name,Source,Area,Ward,Scans'];

    for (const row of rows) {
      const code = byId.get(row.qrCodeId);
      lines.push(
        [
          csvCell(row.scanDate.toISOString().slice(0, 10)),
          csvCell(code?.campaign.name ?? ''),
          csvCell(code?.code ?? ''),
          csvCell(code?.name ?? ''),
          csvCell(code?.source ?? ''),
          csvCell(code?.area ?? ''),
          csvCell(code?.ward ?? ''),
          String(row._count._all),
        ].join(','),
      );
    }

    return lines.join('\n');
  },
};
