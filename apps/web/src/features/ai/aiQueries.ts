/**
 * AI console GraphQL documents and row types.
 *
 * Note what is asked for on the insight fragment and why: BOTH `summary` and
 * `generatedSummary`. The first is what to display (the administrator's edit
 * when there is one), the second is what the model originally wrote. The server
 * resolves that choice, so the UI never has to decide - and cannot accidentally
 * show superseded wording - but the original stays available for the
 * "what did the AI actually say?" disclosure on an edited summary.
 *
 * `reviewStatus` is likewise the EFFECTIVE status, so an approval of text that
 * has since been edited arrives as STALE rather than as current approval.
 */

const AI_INSIGHT_FIELDS = /* GraphQL */ `
  fragment AiInsightFields on IssueAiInsight {
    id
    issueId
    processingStatus
    reviewStatus
    summary
    generatedSummary
    isEdited
    isStale
    model
    promptVersion
    generation
    failureReason
    retryCount
    reviewedAt
    reviewedBy {
      id
      fullName
    }
    topics {
      id
      topic
      normalized
      confidence
    }
    categorySuggestion {
      category {
        id
        key
        label
      }
      confidence
      band
      reason
      accepted
      decidedAt
    }
    createdAt
    updatedAt
  }
`;

export const AI_INSIGHT_QUERY = /* GraphQL */ `
  ${AI_INSIGHT_FIELDS}
  query AiIssueInsight($issueId: ID!) {
    aiIssueInsight(issueId: $issueId) {
      ...AiInsightFields
    }
    aiSimilarIssues(issueId: $issueId, limit: 5) {
      score
      basis
      issue {
        id
        referenceNumber
        title
        status
      }
    }
  }
`;

export const PROCESS_ISSUE_AI = /* GraphQL */ `
  ${AI_INSIGHT_FIELDS}
  mutation ProcessIssueWithAi($issueId: ID!) {
    processIssueWithAi(issueId: $issueId) {
      ...AiInsightFields
    }
  }
`;

export const REGENERATE_ISSUE_AI = /* GraphQL */ `
  ${AI_INSIGHT_FIELDS}
  mutation RegenerateIssueAi($issueId: ID!) {
    regenerateIssueAi(issueId: $issueId) {
      ...AiInsightFields
    }
  }
`;

export const REVIEW_AI_SUMMARY = /* GraphQL */ `
  ${AI_INSIGHT_FIELDS}
  mutation ReviewAiSummary($issueId: ID!, $decision: AiReviewDecision!, $editedSummary: String) {
    reviewAiSummary(issueId: $issueId, decision: $decision, editedSummary: $editedSummary) {
      ...AiInsightFields
    }
  }
`;

export const DECIDE_AI_CATEGORY = /* GraphQL */ `
  ${AI_INSIGHT_FIELDS}
  mutation DecideAiCategorySuggestion($issueId: ID!, $accept: Boolean!) {
    decideAiCategorySuggestion(issueId: $issueId, accept: $accept) {
      ...AiInsightFields
    }
  }
`;

export const AI_OVERVIEW_QUERY = /* GraphQL */ `
  query AiOverview {
    aiOverview {
      enabled
      provider
      model
      totalIssues
      notProcessed
      queued
      processing
      processed
      failed
      requiresReview
      successRatePct
      pendingReview
      approvedCount
      rejectedCount
      themeCount
      executiveSummaryCount
      topTopics {
        topic
        count
      }
      recentFailures {
        issueId
        failureKind
        failureReason
        completedAt
      }
      queue {
        pending
        activeWorkers
        processed
        failed
      }
    }
  }
`;

export const AI_REVIEW_QUEUE_QUERY = /* GraphQL */ `
  query AiReviewQueue($filter: AiInsightFilter) {
    aiIssueInsights(filter: $filter) {
      nodes {
        issueId
        referenceNumber
        title
        insight {
          id
          processingStatus
          reviewStatus
          summary
          isStale
          isEdited
          categorySuggestion {
            band
            category {
              key
              label
            }
          }
          topics {
            id
            topic
          }
        }
      }
      totalCount
      hasMore
    }
  }
`;

export const AI_THEMES_QUERY = /* GraphQL */ `
  query AiThemes {
    aiThemes {
      id
      name
      description
      generatedSummary
      issueCount
      periodStart
      periodEnd
      reviewStatus
      generatedAt
    }
  }
`;

export const GENERATE_AI_THEMES = /* GraphQL */ `
  mutation GenerateAiThemes($period: AiPeriodInput!) {
    generateAiThemes(period: $period) {
      id
      name
      issueCount
    }
  }
`;

const EXECUTIVE_SUMMARY_FIELDS = /* GraphQL */ `
  fragment ExecutiveSummaryFields on AiExecutiveSummary {
    id
    periodStart
    periodEnd
    summary
    generatedSummary
    isEdited
    keyThemes
    unsupportedFigures
    reviewStatus
    model
    promptVersion
    generatedAt
    generatedBy {
      id
      fullName
    }
    reviewedBy {
      id
      fullName
    }
    evidence {
      totalIssues
      previousPeriodTotal
      changeFromPreviousPct
      openCount
      resolvedInPeriod
      byCategory {
        label
        count
        sharePct
      }
      byStatus {
        label
        count
      }
      byWard {
        label
        count
      }
    }
  }
`;

export const AI_EXECUTIVE_SUMMARIES_QUERY = /* GraphQL */ `
  ${EXECUTIVE_SUMMARY_FIELDS}
  query AiExecutiveSummaries {
    aiExecutiveSummaries(first: 10) {
      ...ExecutiveSummaryFields
    }
  }
`;

export const GENERATE_AI_EXECUTIVE_SUMMARY = /* GraphQL */ `
  ${EXECUTIVE_SUMMARY_FIELDS}
  mutation GenerateAiExecutiveSummary($period: AiPeriodInput!) {
    generateAiExecutiveSummary(period: $period) {
      ...ExecutiveSummaryFields
    }
  }
`;

export const REVIEW_AI_EXECUTIVE_SUMMARY = /* GraphQL */ `
  ${EXECUTIVE_SUMMARY_FIELDS}
  mutation ReviewAiExecutiveSummary(
    $id: ID!
    $decision: AiReviewDecision!
    $editedSummary: String
  ) {
    reviewAiExecutiveSummary(id: $id, decision: $decision, editedSummary: $editedSummary) {
      ...ExecutiveSummaryFields
    }
  }
`;

export const AI_USAGE_QUERY = /* GraphQL */ `
  query AiUsage {
    aiUsage {
      from
      to
      requestCount
      successCount
      failureCount
      successRatePct
      totalTokens
      estimatedCostUsd
      averageDurationMs
      byOperation {
        operation
        requestCount
        totalTokens
        estimatedCostUsd
      }
      byFailureKind {
        kind
        count
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type AiProcessingStatus =
  'NOT_PROCESSED' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REQUIRES_REVIEW';

export type AiReviewStatus = 'GENERATED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'STALE';
export type AiConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AiTopicRow {
  id: string;
  topic: string;
  normalized: string;
  confidence: number | null;
}

export interface AiCategorySuggestionRow {
  category: { id: string; key: string; label: string } | null;
  confidence: number | null;
  band: AiConfidenceBand;
  reason: string | null;
  accepted: boolean | null;
  decidedAt: string | null;
}

export interface AiInsightRow {
  id: string;
  issueId: string;
  processingStatus: AiProcessingStatus;
  reviewStatus: AiReviewStatus;
  summary: string | null;
  generatedSummary: string | null;
  isEdited: boolean;
  isStale: boolean;
  model: string | null;
  promptVersion: string | null;
  generation: number;
  failureReason: string | null;
  retryCount: number;
  reviewedAt: string | null;
  reviewedBy: { id: string; fullName: string } | null;
  topics: AiTopicRow[];
  categorySuggestion: AiCategorySuggestionRow | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiSimilarIssueRow {
  score: number;
  basis: string;
  issue: { id: string; referenceNumber: string; title: string; status: string };
}

export interface AiInsightQueryResult {
  aiIssueInsight: AiInsightRow | null;
  aiSimilarIssues: AiSimilarIssueRow[];
}

export interface AiOverviewRow {
  enabled: boolean;
  provider: string;
  model: string;
  totalIssues: number;
  notProcessed: number;
  queued: number;
  processing: number;
  processed: number;
  failed: number;
  requiresReview: number;
  successRatePct: number | null;
  pendingReview: number;
  approvedCount: number;
  rejectedCount: number;
  themeCount: number;
  executiveSummaryCount: number;
  topTopics: { topic: string; count: number }[];
  recentFailures: {
    issueId: string;
    failureKind: string | null;
    failureReason: string | null;
    completedAt: string | null;
  }[];
  queue: { pending: number; activeWorkers: number; processed: number; failed: number };
}

export interface AiReviewQueueRow {
  issueId: string;
  referenceNumber: string;
  title: string;
  insight: {
    id: string;
    processingStatus: AiProcessingStatus;
    reviewStatus: AiReviewStatus;
    summary: string | null;
    isStale: boolean;
    isEdited: boolean;
    categorySuggestion: {
      band: AiConfidenceBand;
      category: { key: string; label: string } | null;
    } | null;
    topics: { id: string; topic: string }[];
  };
}

export interface AiThemeRow {
  id: string;
  name: string;
  description: string | null;
  generatedSummary: string | null;
  issueCount: number;
  periodStart: string;
  periodEnd: string;
  reviewStatus: AiReviewStatus;
  generatedAt: string;
}

export interface AiEvidenceEntry {
  label: string;
  count: number;
  sharePct: number | null;
}

export interface AiExecutiveSummaryRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  generatedSummary: string;
  isEdited: boolean;
  keyThemes: string[];
  unsupportedFigures: string[];
  reviewStatus: AiReviewStatus;
  model: string | null;
  promptVersion: string | null;
  generatedAt: string;
  generatedBy: { id: string; fullName: string } | null;
  reviewedBy: { id: string; fullName: string } | null;
  evidence: {
    totalIssues: number;
    previousPeriodTotal: number;
    changeFromPreviousPct: number | null;
    openCount: number;
    resolvedInPeriod: number;
    byCategory: AiEvidenceEntry[];
    byStatus: AiEvidenceEntry[];
    byWard: AiEvidenceEntry[];
  };
}

export interface AiUsageRow {
  from: string;
  to: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  successRatePct: number | null;
  totalTokens: number | null;
  estimatedCostUsd: string | null;
  averageDurationMs: number | null;
  byOperation: {
    operation: string;
    requestCount: number;
    totalTokens: number | null;
    estimatedCostUsd: string | null;
  }[];
  byFailureKind: { kind: string; count: number }[];
}
