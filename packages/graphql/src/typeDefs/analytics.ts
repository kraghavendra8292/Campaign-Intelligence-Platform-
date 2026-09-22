/**
 * Phase 7 - decision analytics.
 *
 * EVERY FIELD HERE IS ADMIN-ONLY AND AGGREGATE. There is no public query and no
 * extension of a public type. With one deliberate exception - the high-priority
 * backlog, which is a worklist an administrator has to open - nothing in this
 * schema returns an individual submission, and nothing anywhere returns a
 * citizen's name, phone number, email, address or coordinates.
 *
 * Note what these types CANNOT express, which is as deliberate as what they
 * can. There is no score about a person, no likelihood, no prediction, no
 * sentiment, and no field on an area beyond counts, rates and durations. A ward
 * at the top of `AreaAnalytics` has reported the most problems; the schema
 * offers no way to say anything else about it, and no mutation that would act
 * on the people who live there.
 *
 * `null` versus `0` is load-bearing throughout. A rate with an empty
 * denominator, a change from a period with no submissions, and an average with
 * no samples are all returned as null - because rendering them as "0%" would
 * state something false with the same confidence as a real measurement.
 */
export const analyticsTypeDefs = /* GraphQL */ `
  enum GeoLevel {
    WARD
    LOCALITY
    AREA
  }

  enum TrendGranularity {
    AUTO
    DAY
    WEEK
    MONTH
  }

  enum AnalyticsExportDataset {
    OVERVIEW
    CATEGORIES
    STATUSES
    PRIORITIES
    AREAS
    RESOLUTION
  }

  enum InsightSeverity {
    INFO
    ATTENTION
  }

  """
  Filters applied to every metric on the dashboard.

  There is deliberately NO organizationId field. The tenant is derived from the
  authenticated session, so a client cannot describe another organisation's data
  by asking for it.
  """
  input AnalyticsFilterInput {
    range: AnalyticsRange = LAST_30_DAYS
    from: DateTime
    to: DateTime

    categoryIds: [ID!]
    statuses: [IssueStatus!]
    priorities: [IssuePriority!]
    types: [SubmissionType!]
    sources: [IssueSource!]

    "Values matched at geoLevel. Use the values returned by analyticsAreaOptions."
    areas: [String!]
    geoLevel: GeoLevel = WARD

    "Phase 6 normalised topic keys."
    topics: [String!]
    "Phase 6 theme id. Matches submissions that belong to that theme."
    themeId: ID

    assignedToUserId: ID
    "Defaults to true: an unmoderated report is still a citizen waiting."
    includeUnmoderated: Boolean = true
  }

  "The resolved window a set of metrics was computed over."
  type AnalyticsPeriod {
    from: DateTime!
    to: DateTime!
    days: Int!
  }

  type AnalyticsOldestOpen {
    id: ID!
    referenceNumber: String!
    title: String!
    submittedAt: DateTime!
    ageDays: Int!
  }

  """
  Executive overview.

  Period figures respect the date filter; BACKLOG figures (openCount,
  highPriorityOpen, unassignedOpen) deliberately do not, because a backlog does
  not stop existing because somebody changed the date picker. The UI labels
  which is which.
  """
  type AnalyticsOverview {
    period: AnalyticsPeriod!
    previousPeriod: AnalyticsPeriod!
    "When these figures were computed. Not cached; this is the query time."
    generatedAt: DateTime!

    totalInRange: Int!
    previousTotal: Int!
    "Null when the previous period had no submissions: a change from zero is undefined."
    changePct: Float
    totalAllTime: Int!

    openCount: Int!
    resolvedInRange: Int!
    previousResolvedInRange: Int!
    resolvedChangePct: Float
    closedInRange: Int!

    highPriorityOpen: Int!
    unassignedOpen: Int!
    awaitingModeration: Int!

    "Share of THIS period's submissions since resolved. Null when none arrived."
    resolutionRatePct: Float

    averageResolutionDays: Float
    previousAverageResolutionDays: Float
    averageResolutionChangePct: Float
    "Reported alongside the mean: a wide gap means a few old items skew the average."
    medianResolutionDays: Float
    resolvedSampleCount: Int!

    oldestOpenIssue: AnalyticsOldestOpen
  }

  type AnalyticsTrendPoint {
    date: DateTime!
    count: Int!
  }

  """
  Submissions over time.

  The series is DENSE: buckets with no submissions are present with a count of
  zero, so a gap in reporting reads as a gap rather than as a straight line
  between two distant points.
  """
  type AnalyticsTrend {
    granularity: TrendGranularity!
    period: AnalyticsPeriod!
    points: [AnalyticsTrendPoint!]!
    "Total over the equivalent previous window, as a reference figure."
    previousTotal: Int!
  }

  "A dimension bucket with period comparison."
  type AnalyticsBucket {
    key: String!
    id: ID
    label: String!
    count: Int!
    sharePct: Float
    previousCount: Int!
    changePct: Float
    openCount: Int
    resolvedCount: Int
  }

  "One area at the selected geographic level."
  type AreaAnalytics {
    key: String!
    label: String!
    level: GeoLevel!
    count: Int!
    sharePct: Float
    previousCount: Int!
    changePct: Float
    openCount: Int!
    resolvedCount: Int!
    highPriorityOpenCount: Int!
    "Withheld below a minimum sample: a rate from two submissions is noise."
    resolutionRatePct: Float
    averageResolutionDays: Float
    resolvedSampleCount: Int!
  }

  """
  The rankings that identify where attention is needed.

  Separate from the main area table because volume is mostly a function of
  population and of how much a place reports, whereas these rank by what is
  going wrong.
  """
  type AreaAttention {
    byVolume: [AreaAnalytics!]!
    byUnresolved: [AreaAnalytics!]!
    byHighPriority: [AreaAnalytics!]!
    bySlowResolution: [AreaAnalytics!]!
  }

  type AreaTopCategory {
    key: String!
    label: String!
    count: Int!
    sharePct: Float
  }

  "A submission in an area drill-down. No contact details, description or coordinates."
  type AreaRecentIssue {
    id: ID!
    referenceNumber: String!
    title: String!
    status: IssueStatus!
    priority: IssuePriority!
    submittedAt: DateTime!
    category: IssueCategory
  }

  type AreaDetail {
    area: String!
    label: String!
    level: GeoLevel!
    period: AnalyticsPeriod!

    totalInRange: Int!
    previousTotal: Int!
    changePct: Float
    openCount: Int!
    resolvedCount: Int!
    resolutionRatePct: Float
    averageResolutionDays: Float
    medianResolutionDays: Float

    topCategories: [AreaTopCategory!]!
    recentIssues: [AreaRecentIssue!]!
  }

  type ResolutionBucketStat {
    key: String!
    label: String!
    count: Int!
    sharePct: Float
  }

  type SlowCategory {
    key: String!
    label: String!
    averageResolutionDays: Float!
    medianResolutionDays: Float!
    resolvedCount: Int!
  }

  """
  Resolution performance.

  Two distributions that answer opposite questions: timeToResolution is a record
  of the past and flatters a team that closes easy items quickly, while
  backlogAging is a picture of the present and is where the ignored hard items
  appear. Both are returned because either alone is misleading.
  """
  type ResolutionAnalytics {
    period: AnalyticsPeriod!
    generatedAt: DateTime!

    totalInRange: Int!
    resolvedInRange: Int!
    openCount: Int!
    highPriorityOpen: Int!
    resolutionRatePct: Float

    averageResolutionDays: Float
    medianResolutionDays: Float
    """
    Approximated by the first recorded status change.

    Phase 5 stores no explicit first-response timestamp, so this is the moment a
    staff member first did something visible with the submission. Labelled as an
    approximation wherever it is shown.
    """
    averageFirstResponseDays: Float
    firstResponseSampleCount: Int!

    averageOpenAgeDays: Float
    oldestOpenAgeDays: Int

    timeToResolution: [ResolutionBucketStat!]!
    backlogAging: [ResolutionBucketStat!]!
    slowestCategories: [SlowCategory!]!
  }

  "A submission in the high-priority worklist. Navigational fields only."
  type BacklogIssue {
    id: ID!
    referenceNumber: String!
    title: String!
    priority: IssuePriority!
    status: IssueStatus!
    ward: String
    locality: String
    area: String
    submittedAt: DateTime!
    ageDays: Int!
    category: IssueCategory
    assignedTo: IssueStaffUser
  }

  """
  A Phase 6 theme, with its count RECOMPUTED inside the current filter.

  The stored issueCount on a theme covers the period it was detected over, which
  is almost never the dashboard's filter. Showing it would silently ignore the
  filter the administrator just set.
  """
  type ThemeAnalytics {
    id: ID!
    name: String!
    description: String
    "AI-generated prose. Rendered as escaped text and labelled as such."
    generatedSummary: String
    reviewStatus: AiReviewStatus!
    model: String
    promptVersion: String
    detectedPeriodStart: DateTime!
    detectedPeriodEnd: DateTime!
    generatedAt: DateTime!

    "Backend-computed inside the current filter, never taken from the model."
    count: Int!
    previousCount: Int!
    changePct: Float
    sharePct: Float
  }

  "A Phase 6 topic, counted over DISTINCT submissions rather than topic rows."
  type TopicAnalytics {
    topic: String!
    label: String!
    count: Int!
    sharePct: Float
    previousCount: Int!
    changePct: Float
  }

  type SourceBucket {
    key: String!
    label: String!
    count: Int!
    sharePct: Float
  }

  type CampaignSourceStat {
    id: ID!
    name: String!
    status: String
    scans: Int!
    issues: Int!
    "Null when there were no scans: a rate with an empty denominator is undefined."
    conversionRatePct: Float
  }

  """
  Channel attribution, joining Phase 4 scans to Phase 5 submissions.

  A conversion rate is a statement about a POSTER, not about a person. A scan
  means a code was scanned and nothing else.
  """
  type SourceAnalytics {
    period: AnalyticsPeriod!
    bySource: [SourceBucket!]!
    scanCount: Int!
    issuesFromQr: Int!
    conversionRatePct: Float
    byCampaign: [CampaignSourceStat!]!
  }

  """
  An evidence-backed insight card.

  The wording is generated deterministically from the figures, NOT by a model.
  Phase 6 lets a model write prose from supplied statistics because an executive
  summary is a paragraph a human reviews; an insight card is a one-line claim
  with a number in it shown without review, so its text is a template over
  backend-computed values.
  """
  type AnalyticsInsight {
    kind: String!
    headline: String!
    detail: String!
    currentValue: Int!
    previousValue: Int!
    changePct: Float
    severity: InsightSeverity!
    categoryKey: String
  }

  extend type Query {
    analyticsOverview(filter: AnalyticsFilterInput): AnalyticsOverview!
    analyticsTrend(
      filter: AnalyticsFilterInput
      granularity: TrendGranularity = AUTO
    ): AnalyticsTrend!

    analyticsByCategory(filter: AnalyticsFilterInput): [AnalyticsBucket!]!
    analyticsByStatus(filter: AnalyticsFilterInput): [AnalyticsBucket!]!
    analyticsByPriority(filter: AnalyticsFilterInput): [AnalyticsBucket!]!

    analyticsAreas(filter: AnalyticsFilterInput, limit: Int = 25): [AreaAnalytics!]!
    analyticsAreaAttention(filter: AnalyticsFilterInput, limit: Int = 10): AreaAttention!
    analyticsAreaDetail(area: String!, filter: AnalyticsFilterInput): AreaDetail!
    "Distinct values at the selected level, for the filter control."
    analyticsAreaOptions(filter: AnalyticsFilterInput): [String!]!

    analyticsResolution(filter: AnalyticsFilterInput): ResolutionAnalytics!
    analyticsBacklog(filter: AnalyticsFilterInput, limit: Int = 50): [BacklogIssue!]!

    "Null when the caller lacks AI_INSIGHT_READ; the section is omitted, not refused."
    analyticsThemes(filter: AnalyticsFilterInput): [ThemeAnalytics!]
    analyticsTopics(filter: AnalyticsFilterInput): [TopicAnalytics!]
    "Null when the caller lacks QR_ANALYTICS_READ."
    analyticsSource(filter: AnalyticsFilterInput): SourceAnalytics

    analyticsInsights(filter: AnalyticsFilterInput): [AnalyticsInsight!]!

    """
    Aggregate analytics as CSV.

    Requires ANALYTICS_EXPORT in addition to read access, and is audited on both
    request and completion. Every dataset is a table of counts and durations -
    there is no dataset that exports submission rows, so no citizen contact
    detail, description, address or coordinate can leave through this field.
    """
    analyticsExportCsv(dataset: AnalyticsExportDataset!, filter: AnalyticsFilterInput): String!
  }
`;
