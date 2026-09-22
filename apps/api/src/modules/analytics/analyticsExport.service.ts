import type { AuthContext } from '@rk/types';
import { ANALYTICS_LIMITS } from '@rk/types';
import { AppError } from '../../errors/AppError';
import { auditService } from '../audit/audit.service';
import type { RequestMeta } from '../issues/cms/issue.service';
import { authorizationService } from '../auth/authorization.service';
import { analyticsService } from './analytics.service';
import { geoAnalyticsService } from './geoAnalytics.service';
import { resolutionAnalyticsService } from './resolutionAnalytics.service';
import { type AnalyticsFilter } from './shared/analyticsFilters';

/**
 * Analytics export.
 *
 * THE EXPORT IS AGGREGATE ONLY. Every dataset below is a table of counts and
 * durations - by category, by status, by priority, by area, by timing bucket.
 * There is NO dataset that exports issue rows, and that is the central design
 * decision of this file rather than an omission.
 *
 * The reasoning: an export is the one operation whose output leaves every
 * access control this platform has. Inside the console, a citizen's phone
 * number is behind `ISSUE_CONTACT_READ` and reading it writes an audit record.
 * In a CSV on somebody's laptop it is behind nothing. So the export offers the
 * coarsest thing that still answers an administrative question, which is the
 * aggregate - and an administrator who genuinely needs a specific submission
 * opens it in the console, where the disclosure is permissioned and logged.
 *
 * What is therefore absent by construction: citizen names, phone numbers, email
 * addresses, descriptions, addresses, coordinates, attachments, internal staff
 * notes, and AI summaries of any individual report.
 *
 * Export requires `ANALYTICS_EXPORT` in addition to the analytics read
 * permission, and both the request and the completion are audited.
 */

export const ANALYTICS_EXPORT_DATASETS = [
  'OVERVIEW',
  'CATEGORIES',
  'STATUSES',
  'PRIORITIES',
  'AREAS',
  'RESOLUTION',
] as const;
export type AnalyticsExportDataset = (typeof ANALYTICS_EXPORT_DATASETS)[number];

export const analyticsExportService = {
  /**
   * Produces a CSV for one aggregate dataset under the caller's filters.
   *
   * Returns the text; delivery is the resolver's concern. This matches the
   * Phase 4 QR export, which is also a GraphQL field returning a string - a
   * second delivery mechanism for the same kind of payload would be a second
   * thing to secure.
   */
  async exportCsv(
    auth: AuthContext,
    dataset: AnalyticsExportDataset,
    filter: AnalyticsFilter | null | undefined,
    meta: RequestMeta,
  ): Promise<string> {
    // Two checks, deliberately separate: reading analytics and taking them out
    // of the platform are different decisions. `scopeFor` applies the first.
    const permitted = authorizationService.requirePermission(auth, 'ANALYTICS_EXPORT');
    const { organizationId } = authorizationService.requireOrganization(permitted);
    const scope = analyticsService.scopeFor(auth, filter);

    // Audited BEFORE the work, so an export that times out or fails still
    // leaves a record that somebody asked for the data. An audit written only
    // on success would be silent about exactly the attempts worth reviewing.
    await auditService.record({
      action: 'ANALYTICS_EXPORT_REQUESTED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Analytics',
      metadata: {
        dataset,
        from: scope.range.from.toISOString(),
        to: scope.range.to.toISOString(),
        geoLevel: scope.geoLevel,
        // Which filter DIMENSIONS were applied, never the values. Recording the
        // values would copy area names and category ids into the audit log for
        // no investigative gain.
        filteredBy: appliedFilterNames(filter),
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    const csv = await this.build(auth, dataset, filter);

    await auditService.record({
      action: 'ANALYTICS_EXPORT_COMPLETED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Analytics',
      metadata: { dataset, rowCount: csv.split('\n').length - 1 },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return csv;
  },

  /** Builds the CSV body. Split out so tests can exercise it without auditing. */
  async build(
    auth: AuthContext,
    dataset: AnalyticsExportDataset,
    filter?: AnalyticsFilter | null,
  ): Promise<string> {
    switch (dataset) {
      case 'OVERVIEW': {
        const overview = await analyticsService.overview(auth, filter);
        const lines = [header(['Metric', 'Value'])];
        const add = (label: string, value: number | string | null): void => {
          lines.push(row([label, value === null ? '' : String(value)]));
        };

        add('Period start', overview.range.from.toISOString().slice(0, 10));
        add('Period end', overview.range.to.toISOString().slice(0, 10));
        add('Submissions in period', overview.totalInRange);
        add('Submissions in previous period', overview.previousTotal);
        add('Change %', overview.changePct);
        add('Open (all time)', overview.openCount);
        add('Resolved in period', overview.resolvedInRange);
        add('Resolution rate %', overview.resolutionRatePct);
        add('Average resolution days', overview.averageResolutionDays);
        add('Median resolution days', overview.medianResolutionDays);
        add('High priority open', overview.highPriorityOpen);
        add('Unassigned open', overview.unassignedOpen);
        add('Awaiting moderation', overview.awaitingModeration);
        return lines.join('\n');
      }

      case 'CATEGORIES': {
        const rows = await analyticsService.byCategory(auth, filter);
        return [
          header(['Category', 'Count', 'Share %', 'Previous', 'Change %', 'Open', 'Resolved']),
          ...rows.map((entry) =>
            row([
              entry.label,
              entry.count,
              entry.sharePct,
              entry.previousCount,
              entry.changePct,
              entry.openCount,
              entry.resolvedCount,
            ]),
          ),
        ].join('\n');
      }

      case 'STATUSES': {
        const rows = await analyticsService.byStatus(auth, filter);
        return [
          header(['Status', 'Count', 'Share %', 'Previous', 'Change %']),
          ...rows.map((entry) =>
            row([entry.label, entry.count, entry.sharePct, entry.previousCount, entry.changePct]),
          ),
        ].join('\n');
      }

      case 'PRIORITIES': {
        const rows = await analyticsService.byPriority(auth, filter);
        return [
          header(['Priority', 'Count', 'Share %', 'Open', 'Resolved', 'Change %']),
          ...rows.map((entry) =>
            row([
              entry.label,
              entry.count,
              entry.sharePct,
              entry.openCount,
              entry.resolvedCount,
              entry.changePct,
            ]),
          ),
        ].join('\n');
      }

      case 'AREAS': {
        const rows = await geoAnalyticsService.areas(auth, filter, ANALYTICS_LIMITS.exportMaxRows);
        return [
          header([
            'Area',
            'Level',
            'Count',
            'Share %',
            'Open',
            'Resolved',
            'Resolution rate %',
            'High priority open',
            'Average resolution days',
          ]),
          ...rows.map((entry) =>
            row([
              entry.label,
              entry.level,
              entry.count,
              entry.sharePct,
              entry.openCount,
              entry.resolvedCount,
              entry.resolutionRatePct,
              entry.highPriorityOpenCount,
              entry.averageResolutionDays,
            ]),
          ),
        ].join('\n');
      }

      case 'RESOLUTION': {
        const summary = await resolutionAnalyticsService.summary(auth, filter);
        const lines = [header(['Section', 'Bucket', 'Count', 'Share %'])];

        for (const bucket of summary.timeToResolution) {
          lines.push(row(['Time to resolution', bucket.label, bucket.count, bucket.sharePct]));
        }
        for (const bucket of summary.backlogAging) {
          lines.push(row(['Backlog aging', bucket.label, bucket.count, bucket.sharePct]));
        }
        for (const entry of summary.slowestCategories) {
          lines.push(
            row([
              'Average days by category',
              entry.label,
              entry.resolvedCount,
              entry.averageResolutionDays,
            ]),
          );
        }
        return lines.join('\n');
      }

      default:
        throw AppError.validation('That export is not available.', {
          details: { field: 'dataset' },
        });
    }
  },
};

/**
 * Escapes one CSV cell.
 *
 * Lifted in behaviour from the Phase 4 QR export deliberately, including the
 * formula-injection guard: a cell beginning with `=`, `+`, `-` or `@` is
 * executed as a formula when the file is opened in Excel or Sheets, and a
 * category or ward name is tenant-controlled text. Prefixing with an apostrophe
 * neutralises it while leaving the value readable.
 */
function cell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function header(labels: readonly string[]): string {
  return labels.map(cell).join(',');
}

function row(values: readonly (string | number | null | undefined)[]): string {
  return values.map(cell).join(',');
}

/** Which filter dimensions were set, for the audit record. Never the values. */
function appliedFilterNames(filter: AnalyticsFilter | null | undefined): string[] {
  if (!filter) return [];
  const applied: string[] = [];
  if (filter.categoryIds?.length) applied.push('categories');
  if (filter.statuses?.length) applied.push('statuses');
  if (filter.priorities?.length) applied.push('priorities');
  if (filter.types?.length) applied.push('types');
  if (filter.sources?.length) applied.push('sources');
  if (filter.areas?.length) applied.push('areas');
  if (filter.topics?.length) applied.push('topics');
  if (filter.themeId) applied.push('theme');
  if (filter.assignedToUserId) applied.push('assignee');
  return applied;
}
