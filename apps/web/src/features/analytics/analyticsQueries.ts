/**
 * Decision dashboard GraphQL documents and row types.
 *
 * ONE QUERY PER SECTION rather than a single giant document, and the reason is
 * the loading behaviour rather than the code shape: the overview and trend
 * should paint immediately, while the area rollup and resolution distributions
 * are slower. A single document would hold the whole page at the speed of its
 * slowest panel, and every filter change would repay that cost.
 *
 * Every document takes the same `AnalyticsFilterInput`, so a filter change
 * refetches all of them against identical criteria. There is deliberately no
 * client-side recomputation anywhere in this feature: the browser never
 * receives issue rows to count, and every figure on screen was computed by the
 * database.
 *
 * `Float` fields are nullable throughout and that is load-bearing - a rate with
 * an empty denominator arrives as `null`, and the UI prints an em dash rather
 * than "0%".
 */

const PERIOD_FIELDS = /* GraphQL */ `
  fragment PeriodFields on AnalyticsPeriod {
    from
    to
    days
  }
`;

export const ANALYTICS_OVERVIEW_QUERY = /* GraphQL */ `
  ${PERIOD_FIELDS}
  query AnalyticsOverview($filter: AnalyticsFilterInput) {
    analyticsOverview(filter: $filter) {
      period {
        ...PeriodFields
      }
      previousPeriod {
        ...PeriodFields
      }
      generatedAt
      totalInRange
      previousTotal
      changePct
      totalAllTime
      openCount
      resolvedInRange
      previousResolvedInRange
      resolvedChangePct
      closedInRange
      highPriorityOpen
      unassignedOpen
      awaitingModeration
      resolutionRatePct
      averageResolutionDays
      previousAverageResolutionDays
      averageResolutionChangePct
      medianResolutionDays
      resolvedSampleCount
      oldestOpenIssue {
        id
        referenceNumber
        title
        submittedAt
        ageDays
      }
    }
    analyticsInsights(filter: $filter) {
      kind
      headline
      detail
      currentValue
      previousValue
      changePct
      severity
      categoryKey
    }
  }
`;

export const ANALYTICS_TREND_QUERY = /* GraphQL */ `
  query AnalyticsTrend($filter: AnalyticsFilterInput, $granularity: TrendGranularity) {
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

const BUCKET_FIELDS = /* GraphQL */ `
  fragment BucketFields on AnalyticsBucket {
    key
    id
    label
    count
    sharePct
    previousCount
    changePct
    openCount
    resolvedCount
  }
`;

export const ANALYTICS_BREAKDOWN_QUERY = /* GraphQL */ `
  ${BUCKET_FIELDS}
  query AnalyticsBreakdown($filter: AnalyticsFilterInput) {
    analyticsByCategory(filter: $filter) {
      ...BucketFields
    }
    analyticsByStatus(filter: $filter) {
      ...BucketFields
    }
    analyticsByPriority(filter: $filter) {
      ...BucketFields
    }
  }
`;

const AREA_FIELDS = /* GraphQL */ `
  fragment AreaFields on AreaAnalytics {
    key
    label
    level
    count
    sharePct
    previousCount
    changePct
    openCount
    resolvedCount
    highPriorityOpenCount
    resolutionRatePct
    averageResolutionDays
    resolvedSampleCount
  }
`;

export const ANALYTICS_GEO_QUERY = /* GraphQL */ `
  ${AREA_FIELDS}
  query AnalyticsGeo($filter: AnalyticsFilterInput) {
    analyticsAreas(filter: $filter, limit: 25) {
      ...AreaFields
    }
    analyticsAreaAttention(filter: $filter, limit: 10) {
      byUnresolved {
        ...AreaFields
      }
      byHighPriority {
        ...AreaFields
      }
      bySlowResolution {
        ...AreaFields
      }
    }
  }
`;

export const ANALYTICS_AREA_DETAIL_QUERY = /* GraphQL */ `
  query AnalyticsAreaDetail($area: String!, $filter: AnalyticsFilterInput) {
    analyticsAreaDetail(area: $area, filter: $filter) {
      area
      label
      level
      totalInRange
      previousTotal
      changePct
      openCount
      resolvedCount
      resolutionRatePct
      averageResolutionDays
      medianResolutionDays
      topCategories {
        key
        label
        count
        sharePct
      }
      recentIssues {
        id
        referenceNumber
        title
        status
        priority
        submittedAt
        category {
          id
          key
          label
        }
      }
    }
  }
`;

export const ANALYTICS_RESOLUTION_QUERY = /* GraphQL */ `
  query AnalyticsResolution($filter: AnalyticsFilterInput) {
    analyticsResolution(filter: $filter) {
      totalInRange
      resolvedInRange
      openCount
      highPriorityOpen
      resolutionRatePct
      averageResolutionDays
      medianResolutionDays
      averageFirstResponseDays
      firstResponseSampleCount
      averageOpenAgeDays
      oldestOpenAgeDays
      timeToResolution {
        key
        label
        count
        sharePct
      }
      backlogAging {
        key
        label
        count
        sharePct
      }
      slowestCategories {
        key
        label
        averageResolutionDays
        medianResolutionDays
        resolvedCount
      }
    }
  }
`;

export const ANALYTICS_BACKLOG_QUERY = /* GraphQL */ `
  query AnalyticsBacklog($filter: AnalyticsFilterInput) {
    analyticsBacklog(filter: $filter, limit: 50) {
      id
      referenceNumber
      title
      priority
      status
      ward
      locality
      area
      submittedAt
      ageDays
      category {
        id
        key
        label
      }
      assignedTo {
        id
        fullName
      }
    }
  }
`;

export const ANALYTICS_INTELLIGENCE_QUERY = /* GraphQL */ `
  query AnalyticsIntelligence($filter: AnalyticsFilterInput) {
    analyticsThemes(filter: $filter) {
      id
      name
      description
      generatedSummary
      reviewStatus
      model
      count
      previousCount
      changePct
      sharePct
    }
    analyticsTopics(filter: $filter) {
      topic
      label
      count
      sharePct
      previousCount
      changePct
    }
    analyticsSource(filter: $filter) {
      scanCount
      issuesFromQr
      conversionRatePct
      bySource {
        key
        label
        count
        sharePct
      }
      byCampaign {
        id
        name
        status
        scans
        issues
        conversionRatePct
      }
    }
  }
`;

/** Filter option sources. Separate because they change far less often. */
export const ANALYTICS_OPTIONS_QUERY = /* GraphQL */ `
  query AnalyticsOptions($filter: AnalyticsFilterInput) {
    analyticsAreaOptions(filter: $filter)
    issueCategories(includeInactive: true) {
      id
      key
      label
    }
  }
`;

export const ANALYTICS_EXPORT_QUERY = /* GraphQL */ `
  query AnalyticsExport($dataset: AnalyticsExportDataset!, $filter: AnalyticsFilterInput) {
    analyticsExportCsv(dataset: $dataset, filter: $filter)
  }
`;

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type GeoLevel = 'WARD' | 'LOCALITY' | 'AREA';
export type TrendGranularity = 'AUTO' | 'DAY' | 'WEEK' | 'MONTH';
export type InsightSeverity = 'INFO' | 'ATTENTION';

export type AnalyticsExportDataset =
  'OVERVIEW' | 'CATEGORIES' | 'STATUSES' | 'PRIORITIES' | 'AREAS' | 'RESOLUTION';

export interface AnalyticsPeriod {
  from: string;
  to: string;
  days: number;
}

export interface AnalyticsOverviewRow {
  period: AnalyticsPeriod;
  previousPeriod: AnalyticsPeriod;
  generatedAt: string;
  totalInRange: number;
  previousTotal: number;
  changePct: number | null;
  totalAllTime: number;
  openCount: number;
  resolvedInRange: number;
  previousResolvedInRange: number;
  resolvedChangePct: number | null;
  closedInRange: number;
  highPriorityOpen: number;
  unassignedOpen: number;
  awaitingModeration: number;
  resolutionRatePct: number | null;
  averageResolutionDays: number | null;
  previousAverageResolutionDays: number | null;
  averageResolutionChangePct: number | null;
  medianResolutionDays: number | null;
  resolvedSampleCount: number;
  oldestOpenIssue: {
    id: string;
    referenceNumber: string;
    title: string;
    submittedAt: string;
    ageDays: number;
  } | null;
}

export interface AnalyticsInsightRow {
  kind: string;
  headline: string;
  detail: string;
  currentValue: number;
  previousValue: number;
  changePct: number | null;
  severity: InsightSeverity;
  categoryKey: string | null;
}

export interface AnalyticsOverviewData {
  analyticsOverview: AnalyticsOverviewRow;
  analyticsInsights: AnalyticsInsightRow[];
}

export interface AnalyticsTrendData {
  analyticsTrend: {
    granularity: TrendGranularity;
    previousTotal: number;
    points: { date: string; count: number }[];
  };
}

export interface AnalyticsBucketRow {
  key: string;
  id: string | null;
  label: string;
  count: number;
  sharePct: number | null;
  previousCount: number;
  changePct: number | null;
  openCount: number | null;
  resolvedCount: number | null;
}

export interface AnalyticsBreakdownData {
  analyticsByCategory: AnalyticsBucketRow[];
  analyticsByStatus: AnalyticsBucketRow[];
  analyticsByPriority: AnalyticsBucketRow[];
}

export interface AreaRow {
  key: string;
  label: string;
  level: GeoLevel;
  count: number;
  sharePct: number | null;
  previousCount: number;
  changePct: number | null;
  openCount: number;
  resolvedCount: number;
  highPriorityOpenCount: number;
  resolutionRatePct: number | null;
  averageResolutionDays: number | null;
  resolvedSampleCount: number;
}

export interface AnalyticsGeoData {
  analyticsAreas: AreaRow[];
  analyticsAreaAttention: {
    byUnresolved: AreaRow[];
    byHighPriority: AreaRow[];
    bySlowResolution: AreaRow[];
  };
}

export interface AreaDetailData {
  analyticsAreaDetail: {
    area: string;
    label: string;
    level: GeoLevel;
    totalInRange: number;
    previousTotal: number;
    changePct: number | null;
    openCount: number;
    resolvedCount: number;
    resolutionRatePct: number | null;
    averageResolutionDays: number | null;
    medianResolutionDays: number | null;
    topCategories: { key: string; label: string; count: number; sharePct: number | null }[];
    recentIssues: {
      id: string;
      referenceNumber: string;
      title: string;
      status: string;
      priority: string;
      submittedAt: string;
      category: { id: string; key: string; label: string } | null;
    }[];
  };
}

export interface ResolutionBucketRow {
  key: string;
  label: string;
  count: number;
  sharePct: number | null;
}

export interface AnalyticsResolutionData {
  analyticsResolution: {
    totalInRange: number;
    resolvedInRange: number;
    openCount: number;
    highPriorityOpen: number;
    resolutionRatePct: number | null;
    averageResolutionDays: number | null;
    medianResolutionDays: number | null;
    averageFirstResponseDays: number | null;
    firstResponseSampleCount: number;
    averageOpenAgeDays: number | null;
    oldestOpenAgeDays: number | null;
    timeToResolution: ResolutionBucketRow[];
    backlogAging: ResolutionBucketRow[];
    slowestCategories: {
      key: string;
      label: string;
      averageResolutionDays: number;
      medianResolutionDays: number;
      resolvedCount: number;
    }[];
  };
}

export interface BacklogRow {
  id: string;
  referenceNumber: string;
  title: string;
  priority: string;
  status: string;
  ward: string | null;
  locality: string | null;
  area: string | null;
  submittedAt: string;
  ageDays: number;
  category: { id: string; key: string; label: string } | null;
  assignedTo: { id: string; fullName: string } | null;
}

export interface AnalyticsBacklogData {
  analyticsBacklog: BacklogRow[];
}

export interface AnalyticsIntelligenceData {
  /** Null when the caller lacks AI_INSIGHT_READ: the section is omitted. */
  analyticsThemes:
    | {
        id: string;
        name: string;
        description: string | null;
        generatedSummary: string | null;
        reviewStatus: string;
        model: string | null;
        count: number;
        previousCount: number;
        changePct: number | null;
        sharePct: number | null;
      }[]
    | null;
  analyticsTopics:
    | {
        topic: string;
        label: string;
        count: number;
        sharePct: number | null;
        previousCount: number;
        changePct: number | null;
      }[]
    | null;
  /** Null when the caller lacks QR_ANALYTICS_READ. */
  analyticsSource: {
    scanCount: number;
    issuesFromQr: number;
    conversionRatePct: number | null;
    bySource: { key: string; label: string; count: number; sharePct: number | null }[];
    byCampaign: {
      id: string;
      name: string;
      status: string | null;
      scans: number;
      issues: number;
      conversionRatePct: number | null;
    }[];
  } | null;
}

export interface AnalyticsOptionsData {
  analyticsAreaOptions: string[];
  issueCategories: { id: string; key: string; label: string }[];
}
