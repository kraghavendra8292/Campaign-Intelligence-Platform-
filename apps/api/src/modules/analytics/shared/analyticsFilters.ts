import type {
  AnalyticsRange,
  AuthContext,
  GeoLevel,
  IssuePriority,
  IssueSource,
  IssueStatus,
  Permission,
  SubmissionType,
} from '@rk/types';
import { MAX_ANALYTICS_RANGE_DAYS } from '@rk/types';
import type { Prisma } from '../../../generated/prisma/client';
import { AppError } from '../../../errors/AppError';
import { authorizationService } from '../../auth/authorization.service';
import { resolveRange, type ResolvedRange } from '../../qr/cms/qrAnalytics.service';

/**
 * The one place a dashboard filter becomes a database query.
 *
 * EVERY Phase 7 metric is built from `buildScope()`. That is the whole point of
 * this file: a dashboard where the overview card says 428 and the category
 * table adds up to 391 is worse than no dashboard, and the only reliable way to
 * prevent it is for every figure to derive from one `where` clause rather than
 * from eleven services that each assemble their own.
 *
 * It is also where tenant isolation is enforced. `organizationId` is read from
 * the verified `AuthContext` and written into the scope; there is no code path
 * in this module that accepts one from a caller. A client may send any filter
 * it likes and still only ever describes its own tenant's data.
 *
 * The date-range resolver is imported from the Phase 4 QR analytics service
 * rather than reimplemented - exactly as Phase 5's issue analytics does - so
 * "last 30 days" means the same instant on all three dashboards.
 */

export interface AnalyticsFilter {
  readonly range?: AnalyticsRange | null;
  readonly from?: string | null;
  readonly to?: string | null;

  readonly categoryIds?: readonly string[] | null;
  readonly statuses?: readonly IssueStatus[] | null;
  readonly priorities?: readonly IssuePriority[] | null;
  readonly types?: readonly SubmissionType[] | null;
  readonly sources?: readonly IssueSource[] | null;

  /** Geographic values, matched at `geoLevel`. Free text from Phase 5. */
  readonly areas?: readonly string[] | null;
  readonly geoLevel?: GeoLevel | null;

  /** Phase 6 derived filters. Both match on the normalised topic form. */
  readonly topics?: readonly string[] | null;
  readonly themeId?: string | null;

  readonly assignedToUserId?: string | null;
  /**
   * Whether submissions still awaiting moderation are counted.
   *
   * Defaults to INCLUDING them, which is the honest default for a workload
   * dashboard: an unmoderated report is still a citizen waiting. The Phase 5
   * console makes the same choice.
   */
  readonly includeUnmoderated?: boolean | null;
}

export interface AnalyticsScope {
  readonly organizationId: string;
  readonly range: ResolvedRange;
  /** The equivalent window immediately before `range`, for comparison. */
  readonly previous: ResolvedRange;
  /** Tenant + filters, WITHOUT any date bound. For backlog and all-time counts. */
  readonly where: Prisma.IssueWhereInput;
  /** `where` narrowed to the selected period, on `submittedAt`. */
  readonly windowed: Prisma.IssueWhereInput;
  /** `where` narrowed to the previous equivalent period. */
  readonly previousWindowed: Prisma.IssueWhereInput;
  readonly geoLevel: GeoLevel;
}

/** Column backing each geographic level. The complete mapping. */
export const GEO_COLUMN: Record<GeoLevel, 'ward' | 'locality' | 'area'> = {
  WARD: 'ward',
  LOCALITY: 'locality',
  AREA: 'area',
};

/**
 * Asserts analytics access and returns the active tenant.
 *
 * Phase 5's `ISSUE_ANALYTICS_READ` is reused rather than a new
 * `ANALYTICS_READ`: see the note in `packages/types/src/analytics.ts` on why a
 * second permission over the same disclosure is a liability.
 */
export function requireAnalytics(auth: AuthContext | null): {
  auth: AuthContext;
  organizationId: string;
} {
  const permitted = authorizationService.requirePermission(auth, 'ISSUE_ANALYTICS_READ');
  return authorizationService.requireOrganization(permitted);
}

/** Whether an optional dashboard section may be served to this caller. */
export function canSee(auth: AuthContext | null, permission: Permission): boolean {
  return authorizationService.can(auth, permission);
}

/**
 * Turns a client filter into a tenant-scoped set of `where` clauses.
 *
 * The PREVIOUS window is computed as an equal-length span ending where the
 * selected one begins. Equal length is not a detail: comparing a 30-day
 * selection against "last calendar month" would produce a change percentage
 * that is partly an artefact of month length, and every insight card on the
 * dashboard would faithfully repeat the artefact.
 */
export function buildScope(
  organizationId: string,
  filter: AnalyticsFilter | null | undefined,
  now: Date = new Date(),
): AnalyticsScope {
  const input = filter ?? {};
  const range = resolveRange(input.range, input.from, input.to, now);

  const spanMs = range.to.getTime() - range.from.getTime();
  const previous: ResolvedRange = {
    from: new Date(range.from.getTime() - spanMs),
    to: range.from,
    days: range.days,
  };

  const geoLevel: GeoLevel = input.geoLevel ?? 'WARD';
  const geoColumn = GEO_COLUMN[geoLevel];

  const where: Prisma.IssueWhereInput = {
    organizationId,

    ...(nonEmpty(input.categoryIds) ? { categoryId: { in: [...input.categoryIds!] } } : {}),
    ...(nonEmpty(input.statuses) ? { status: { in: [...input.statuses!] } } : {}),
    ...(nonEmpty(input.priorities) ? { priority: { in: [...input.priorities!] } } : {}),
    ...(nonEmpty(input.types) ? { type: { in: [...input.types!] } } : {}),
    ...(nonEmpty(input.sources) ? { source: { in: [...input.sources!] } } : {}),

    // Geographic values are matched exactly against the column for the selected
    // level. Exact rather than `contains`: "Ward 1" must not silently include
    // "Ward 12", which is precisely the kind of quiet miscount that makes an
    // administrator distrust the whole dashboard.
    ...(nonEmpty(input.areas) ? { [geoColumn]: { in: [...input.areas!] } } : {}),

    ...(input.assignedToUserId ? { assignedToUserId: input.assignedToUserId } : {}),

    // Spam is excluded from every figure, always. It is not a citizen report,
    // and counting it would inflate exactly the ward totals an administrator
    // would act on.
    moderationStatus:
      input.includeUnmoderated === false
        ? { in: ['APPROVED'] }
        : { in: ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] },

    // Phase 6 derived filters. Relational rather than denormalised: topics and
    // theme membership live in their own tables, and copying them onto `Issue`
    // to make this query flatter would create a second source of truth that
    // regeneration would have to keep in step.
    ...(nonEmpty(input.topics)
      ? { aiTopics: { some: { normalized: { in: [...input.topics!] } } } }
      : {}),
    ...(input.themeId ? { themeMemberships: { some: { themeId: input.themeId } } } : {}),
  };

  return {
    organizationId,
    range,
    previous,
    where,
    windowed: { ...where, submittedAt: { gte: range.from, lt: range.to } },
    previousWindowed: { ...where, submittedAt: { gte: previous.from, lt: previous.to } },
    geoLevel,
  };
}

function nonEmpty(value: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Rejects a filter that would be expensive or meaningless before it runs.
 *
 * Called once at the resolver boundary. `resolveRange` already caps a CUSTOM
 * span at `MAX_ANALYTICS_RANGE_DAYS`; this adds the list-length bounds, so a
 * client cannot send ten thousand category ids and turn one dashboard load into
 * a query with a ten-thousand-element `IN` clause.
 */
export function assertFilterSane(filter: AnalyticsFilter | null | undefined): void {
  if (!filter) return;

  const lists: Array<[string, readonly unknown[] | null | undefined]> = [
    ['categoryIds', filter.categoryIds],
    ['statuses', filter.statuses],
    ['priorities', filter.priorities],
    ['types', filter.types],
    ['sources', filter.sources],
    ['areas', filter.areas],
    ['topics', filter.topics],
  ];

  for (const [field, list] of lists) {
    if (Array.isArray(list) && list.length > 100) {
      throw AppError.validation(`Too many ${field} filter values. Select 100 or fewer.`, {
        details: { field, limit: 100 },
      });
    }
  }
}

/** Whole days between two instants, never negative. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Percentage change between two periods.
 *
 * Returns NULL when the previous period was zero, rather than 0 or 100. A
 * change "from nothing" has no defined percentage, and any number here would be
 * rendered on an insight card as though it meant something - which is how a
 * dashboard ends up announcing a 100% rise because one report arrived in a
 * fortnight that previously had none.
 */
export function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** A rate as a percentage, or null when the denominator is zero. */
export function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export { MAX_ANALYTICS_RANGE_DAYS };
export type { ResolvedRange };
