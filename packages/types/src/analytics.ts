/**
 * Phase 7 decision analytics: vocabulary, buckets and permissions.
 *
 * SCOPE NOTE, extending the ones in `issues.ts` and `ai.ts` rather than
 * relaxing them.
 *
 * Phase 5 established that a citizen writing about a broken drain has told us
 * about a drain. Phase 6 added a model that reads those reports. Phase 7 adds
 * the surface where all of it is AGGREGATED AND RANKED - which is the component
 * most likely to be mistaken for something it is not.
 *
 * A ranked table of wards by issue count is a statement about WHERE PROBLEMS
 * WERE REPORTED. It is not a map of support, a targeting list, or a prediction.
 * The distinction is not rhetorical: this file deliberately contains no
 * vocabulary for scoring a person, a ward's politics, or a likelihood of
 * anything. Every metric below is a count, a duration or a rate over civic
 * issues, and there is nowhere in the type system to put anything else.
 *
 * The one genuinely new capability here is EXPORT, which is why it gets its own
 * permission: everything else reads data the console already displays, but an
 * export leaves the platform.
 */

// ---------------------------------------------------------------------------
// Resolution timing
// ---------------------------------------------------------------------------

/**
 * How long a resolved submission took.
 *
 * Buckets rather than a raw histogram because the operational question is
 * coarse - "are we clearing things inside a week?" - and because a bucket
 * distribution is robust to the handful of six-month outliers that would
 * dominate a mean. The boundaries are the ones an operations meeting actually
 * uses.
 */
export const RESOLUTION_BUCKETS = ['D0_1', 'D1_3', 'D3_7', 'D7_14', 'D14_30', 'D30_PLUS'] as const;
export type ResolutionBucket = (typeof RESOLUTION_BUCKETS)[number];

export const RESOLUTION_BUCKET_LABELS: Record<ResolutionBucket, string> = {
  D0_1: 'Under 1 day',
  D1_3: '1–3 days',
  D3_7: '3–7 days',
  D7_14: '7–14 days',
  D14_30: '14–30 days',
  D30_PLUS: 'Over 30 days',
};

/** Upper bound in days for each bucket. `null` means unbounded. */
export const RESOLUTION_BUCKET_MAX_DAYS: Record<ResolutionBucket, number | null> = {
  D0_1: 1,
  D1_3: 3,
  D3_7: 7,
  D7_14: 14,
  D14_30: 30,
  D30_PLUS: null,
};

export function resolutionBucketFor(days: number): ResolutionBucket {
  if (days < 1) return 'D0_1';
  if (days < 3) return 'D1_3';
  if (days < 7) return 'D3_7';
  if (days < 14) return 'D7_14';
  if (days < 30) return 'D14_30';
  return 'D30_PLUS';
}

// ---------------------------------------------------------------------------
// Backlog aging
// ---------------------------------------------------------------------------

/**
 * How long an OPEN submission has been waiting.
 *
 * Deliberately different boundaries from the resolution buckets above, because
 * they answer a different question. Resolution time is a record of past
 * performance; aging is a queue somebody has to work today, and its early
 * buckets are tighter because the difference between "three days old" and
 * "eight days old" is the difference between normal and slipping.
 */
export const AGING_BUCKETS = ['A0_3', 'A4_7', 'A8_14', 'A15_30', 'A31_60', 'A60_PLUS'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  A0_3: '0–3 days',
  A4_7: '4–7 days',
  A8_14: '8–14 days',
  A15_30: '15–30 days',
  A31_60: '31–60 days',
  A60_PLUS: 'Over 60 days',
};

export function agingBucketFor(days: number): AgingBucket {
  if (days <= 3) return 'A0_3';
  if (days <= 7) return 'A4_7';
  if (days <= 14) return 'A8_14';
  if (days <= 30) return 'A15_30';
  if (days <= 60) return 'A31_60';
  return 'A60_PLUS';
}

// ---------------------------------------------------------------------------
// Geographic levels
// ---------------------------------------------------------------------------

/**
 * The geographic levels the platform actually stores.
 *
 * EXACTLY THREE, because exactly three columns exist on `Issue`: `ward`,
 * `locality` and `area`. There is deliberately no "constituency" or "zone"
 * member - inventing a level the database cannot populate would produce a
 * filter that silently matches nothing, which is worse than not offering it.
 *
 * Coordinates are excluded on purpose. `Issue` does store latitude and
 * longitude when a citizen chose to share them, and Phase 7 never aggregates
 * on them: a point map of submissions is a map of where people were standing,
 * and the administrative question is answered by the ward.
 */
export const GEO_LEVELS = ['WARD', 'LOCALITY', 'AREA'] as const;
export type GeoLevel = (typeof GEO_LEVELS)[number];

export const GEO_LEVEL_LABELS: Record<GeoLevel, string> = {
  WARD: 'Ward',
  LOCALITY: 'Locality',
  AREA: 'Area',
};

// ---------------------------------------------------------------------------
// Trend granularity
// ---------------------------------------------------------------------------

/**
 * Bucket width for the trend series.
 *
 * AUTO is the default and is what the console sends: the right granularity is
 * a function of the range length, and making a user choose it is making them do
 * arithmetic. Ninety daily points on a phone-width chart is a smear; thirteen
 * weekly points is a trend.
 */
export const TREND_GRANULARITIES = ['AUTO', 'DAY', 'WEEK', 'MONTH'] as const;
export type TrendGranularity = (typeof TREND_GRANULARITIES)[number];

/** Thresholds at which AUTO widens the bucket. */
export const TREND_AUTO_WEEK_THRESHOLD_DAYS = 63;
export const TREND_AUTO_MONTH_THRESHOLD_DAYS = 180;

export function resolveTrendGranularity(
  requested: TrendGranularity | null | undefined,
  days: number,
): Exclude<TrendGranularity, 'AUTO'> {
  if (requested && requested !== 'AUTO') return requested;
  if (days > TREND_AUTO_MONTH_THRESHOLD_DAYS) return 'MONTH';
  if (days > TREND_AUTO_WEEK_THRESHOLD_DAYS) return 'WEEK';
  return 'DAY';
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const ANALYTICS_LIMITS = {
  /** Rows in a ranked area table. Beyond this it stops being a ranking. */
  topAreas: 25,
  /** Rows in the high-priority backlog table. */
  backlogRows: 50,
  /** Topics on the dashboard. */
  topTopics: 20,
  /** Ceiling on exported rows, so one click cannot stream a whole tenant. */
  exportMaxRows: 5000,
  /** Minimum submissions before an area's resolution RATE is reported. */
  minSamplesForRate: 3,
} as const;

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Phase 7 permissions. Exactly one.
 *
 * READING the dashboard deliberately reuses `ISSUE_ANALYTICS_READ` from Phase 5
 * rather than inventing `ANALYTICS_READ`. It is the same disclosure - aggregate
 * counts of submissions - and a second permission covering the same data would
 * mean two grants to keep in step, with the eventual result that somebody holds
 * one and not the other for no articulable reason. The QR and AI sections of
 * the dashboard additionally require their own existing permissions, and are
 * omitted rather than refused when the caller lacks them.
 *
 * EXPORT is genuinely new and genuinely different: every other capability here
 * renders data inside a console the organisation controls, whereas an export
 * produces a file that leaves it - onto a laptop, into an email, out of every
 * access control this platform has. That is a separate decision, so it is a
 * separate grant, and it is audited.
 */
export const ANALYTICS_PERMISSIONS = ['ANALYTICS_EXPORT'] as const;
export type AnalyticsPermission = (typeof ANALYTICS_PERMISSIONS)[number];

export function describeAnalyticsPermission(permission: AnalyticsPermission): string {
  const descriptions: Record<AnalyticsPermission, string> = {
    ANALYTICS_EXPORT:
      'Download aggregate analytics as a file. The data leaves the platform, so this is separate from viewing it.',
  };
  return descriptions[permission];
}
