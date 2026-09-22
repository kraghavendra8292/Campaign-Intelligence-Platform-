/**
 * Phase 6 - AI issue intelligence.
 *
 * EVERY FIELD HERE IS ADMIN-ONLY. There is no public query, no extension of a
 * public type, and nothing reachable from `PublicIssueStatus`. A citizen
 * tracking their report still gets the six Phase 5 scalars and nothing more.
 *
 * That is a product decision, not an oversight. An AI paraphrase of somebody's
 * complaint, shown back to them as though the campaign had understood it, would
 * be a statement the organisation had not actually made - and a machine
 * summary is exactly the wrong thing to put in front of the person who wrote
 * the original.
 *
 * Note what these types CANNOT express, which is as deliberate as what they
 * can: there is no field for a score about a person, no sentiment, no
 * affiliation, no prediction, and no mutation that merges or auto-closes a
 * submission. Similar issues are returned as suggestions with a score and a
 * reason, and the only action the schema offers on one is to go and look at it.
 *
 * All AI text is PLAIN TEXT. Nothing here is HTML, and the clients render it
 * escaped: model output is untrusted input, and a summary is not a document.
 */
export const aiTypeDefs = /* GraphQL */ `
  enum AiProcessingStatus {
    NOT_PROCESSED
    QUEUED
    PROCESSING
    COMPLETED
    FAILED
    REQUIRES_REVIEW
  }

  enum AiReviewStatus {
    GENERATED
    PENDING_REVIEW
    APPROVED
    REJECTED
    STALE
  }

  enum AiConfidenceBand {
    LOW
    MEDIUM
    HIGH
  }

  enum AiOperation {
    ISSUE_INSIGHT
    THEME_DETECTION
    EXECUTIVE_SUMMARY
  }

  enum AiReviewDecision {
    APPROVE
    REJECT
    EDIT
  }

  "A subject-matter label extracted from a submission. Never about a person."
  type AiTopic {
    id: ID!
    topic: String!
    normalized: String!
    confidence: Float
  }

  "The category the model proposed. A suggestion until a human accepts it."
  type AiCategorySuggestion {
    category: IssueCategory
    """
    Raw provider confidence, 0-1.

    Exposed for administrators who want it, but 'band' is what the UI shows:
    a model's self-reported probability is not a calibrated measurement, and
    rendering "0.87" implies a precision that does not exist.
    """
    confidence: Float
    band: AiConfidenceBand!
    "One sentence on what in the report indicated this category."
    reason: String
    "Null until somebody decides. True accepted, false rejected."
    accepted: Boolean
    decidedAt: DateTime
  }

  type AiReviewer {
    id: ID!
    fullName: String!
  }

  "Everything one AI pass produced about one submission."
  type IssueAiInsight {
    id: ID!
    issueId: ID!

    processingStatus: AiProcessingStatus!
    """
    The review state as it APPLIES NOW.

    Differs from the stored decision when the submission has been edited since
    generation: an approval of older text is reported as STALE rather than
    presented as current. The stored decision itself is preserved.
    """
    reviewStatus: AiReviewStatus!

    """
    The text to display: the administrator's edit if there is one, otherwise
    the model's. Resolved server-side so no client can accidentally show the
    superseded version.
    """
    summary: String
    "The model's original wording, retained even after an edit."
    generatedSummary: String
    isEdited: Boolean!

    "True when the submission changed after this was generated."
    isStale: Boolean!

    categorySuggestion: AiCategorySuggestion
    topics: [AiTopic!]!

    "Provenance, so a later prompt or model change stays traceable."
    model: String
    promptVersion: String
    generation: Int!

    failureReason: String
    retryCount: Int!

    reviewedAt: DateTime
    reviewedBy: AiReviewer
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  "An insight together with the submission it describes, for list views."
  type IssueAiInsightListItem {
    insight: IssueAiInsight!
    issueId: ID!
    referenceNumber: String!
    title: String!
  }

  type IssueAiInsightConnection {
    nodes: [IssueAiInsightListItem!]!
    totalCount: Int!
    hasMore: Boolean!
  }

  """
  A submission that may describe the same problem.

  A SUGGESTION ONLY. There is deliberately no mutation anywhere in this schema
  that merges submissions or closes one as a duplicate - an administrator opens
  both and decides.
  """
  type AiSimilarIssue {
    issue: AdminIssue!
    "Heuristic 0-1 ranking score. Not a probability."
    score: Float!
    "What drove the match, so the suggestion can be judged rather than trusted."
    basis: String!
  }

  "A recurring subject-matter theme across a period. An aggregate object."
  type IssueTheme {
    id: ID!
    name: String!
    description: String
    generatedSummary: String
    """
    Computed by the platform from theme membership, never by the model.
    """
    issueCount: Int!
    periodStart: DateTime!
    periodEnd: DateTime!
    reviewStatus: AiReviewStatus!
    model: String
    promptVersion: String
    generatedAt: DateTime!
    reviewedAt: DateTime
    reviewedBy: AiReviewer
  }

  "One statistic the executive summary was permitted to cite."
  type AiEvidenceEntry {
    label: String!
    count: Int!
    sharePct: Float
  }

  """
  The statistics supplied to the model, stored verbatim.

  Rendered beside the prose so any figure in a sentence can be checked against
  the table underneath it. This is what makes the summary evidence-backed
  rather than merely instructed to be.
  """
  type AiExecutiveSummaryEvidence {
    totalIssues: Int!
    previousPeriodTotal: Int!
    changeFromPreviousPct: Float
    openCount: Int!
    resolvedInPeriod: Int!
    byCategory: [AiEvidenceEntry!]!
    byStatus: [AiEvidenceEntry!]!
    byPriority: [AiEvidenceEntry!]!
    bySource: [AiEvidenceEntry!]!
    byWard: [AiEvidenceEntry!]!
  }

  type AiExecutiveSummary {
    id: ID!
    periodStart: DateTime!
    periodEnd: DateTime!
    "The administrator's edit if present, otherwise the model's text."
    summary: String!
    generatedSummary: String!
    isEdited: Boolean!
    keyThemes: [String!]!
    evidence: AiExecutiveSummaryEvidence!
    """
    Numbers in the prose the evidence does not account for.

    Empty in the normal case. Non-empty means the generation was flagged for
    review with these exact figures to check.
    """
    unsupportedFigures: [String!]!
    reviewStatus: AiReviewStatus!
    model: String
    promptVersion: String
    generatedAt: DateTime!
    generatedBy: AiReviewer
    reviewedAt: DateTime
    reviewedBy: AiReviewer
  }

  type AiTopicCount {
    topic: String!
    count: Int!
  }

  type AiFailureSummary {
    issueId: ID!
    failureKind: String
    failureReason: String
    completedAt: DateTime
  }

  "In-memory queue state for THIS API process, not the cluster."
  type AiQueueStats {
    pending: Int!
    activeWorkers: Int!
    processed: Int!
    failed: Int!
  }

  "Operational metrics for the assistant. Never analytics about citizens."
  type AiOverview {
    enabled: Boolean!
    provider: String!
    model: String!

    totalIssues: Int!
    notProcessed: Int!
    queued: Int!
    processing: Int!
    processed: Int!
    failed: Int!
    requiresReview: Int!
    "Null when nothing has been attempted, rather than a misleading 0."
    successRatePct: Float

    pendingReview: Int!
    approvedCount: Int!
    rejectedCount: Int!

    themeCount: Int!
    executiveSummaryCount: Int!

    topTopics: [AiTopicCount!]!
    recentFailures: [AiFailureSummary!]!
    queue: AiQueueStats!
  }

  type AiUsageByOperation {
    operation: AiOperation!
    requestCount: Int!
    totalTokens: Int
    "Null means not priced, which is different from zero."
    estimatedCostUsd: String
  }

  type AiUsageByFailure {
    kind: String!
    count: Int!
  }

  type AiUsageReport {
    from: DateTime!
    to: DateTime!
    requestCount: Int!
    successCount: Int!
    failureCount: Int!
    successRatePct: Float
    totalTokens: Int
    "Decimal as a string: a currency total must not go through a JS float."
    estimatedCostUsd: String
    averageDurationMs: Int
    byOperation: [AiUsageByOperation!]!
    byFailureKind: [AiUsageByFailure!]!
  }

  input AiInsightFilter {
    processingStatus: AiProcessingStatus
    reviewStatus: AiReviewStatus
    first: Int = 20
    offset: Int = 0
  }

  input AiPeriodInput {
    from: DateTime!
    to: DateTime!
  }

  extend type Query {
    "AI output for one submission. Null when it has never been processed."
    aiIssueInsight(issueId: ID!): IssueAiInsight
    "The review queue."
    aiIssueInsights(filter: AiInsightFilter): IssueAiInsightConnection!
    "Submissions that may describe the same problem. Suggestions only."
    aiSimilarIssues(issueId: ID!, limit: Int = 5): [AiSimilarIssue!]!
    aiThemes(from: DateTime, to: DateTime): [IssueTheme!]!
    "The submissions behind one theme."
    aiThemeIssues(themeId: ID!): [AdminIssue!]!
    aiExecutiveSummaries(first: Int = 10): [AiExecutiveSummary!]!
    aiExecutiveSummary(id: ID!): AiExecutiveSummary!
    "Operational metrics for the AI console."
    aiOverview: AiOverview!
    aiUsage(from: DateTime, to: DateTime): AiUsageReport!
  }

  extend type Mutation {
    """
    Runs AI processing on one submission.

    Idempotent when current output already exists: a completed insight for
    unchanged text is returned rather than regenerated, so pressing the button
    twice does not pay twice for the same sentences.
    """
    processIssueWithAi(issueId: ID!): IssueAiInsight

    """
    Re-runs processing, discarding the current output.

    Separately permissioned and separately rate limited from first-time
    processing: an issue can only be processed from scratch once, but it can be
    regenerated indefinitely.
    """
    regenerateIssueAi(issueId: ID!): IssueAiInsight

    """
    Approve, reject, or edit and approve an AI summary.

    EDIT stores the administrator's text alongside - never over - the model's
    original, so what the model actually said stays answerable.
    """
    reviewAiSummary(
      issueId: ID!
      decision: AiReviewDecision!
      editedSummary: String
    ): IssueAiInsight

    """
    Accept or reject the suggested category.

    Accepting writes through the ordinary submission update path AS THE
    ADMINISTRATOR, so it is audited and appears in the issue history exactly as
    a manual recategorisation does. The AI never becomes the actor.
    """
    decideAiCategorySuggestion(issueId: ID!, accept: Boolean!): IssueAiInsight

    "Detect recurring themes across a period. Replaces the set for that period."
    generateAiThemes(period: AiPeriodInput!): [IssueTheme!]!
    reviewAiTheme(themeId: ID!, approve: Boolean!): IssueTheme!

    "Write a period briefing from platform-computed statistics."
    generateAiExecutiveSummary(period: AiPeriodInput!): AiExecutiveSummary!
    reviewAiExecutiveSummary(
      id: ID!
      decision: AiReviewDecision!
      editedSummary: String
    ): AiExecutiveSummary!
  }
`;
