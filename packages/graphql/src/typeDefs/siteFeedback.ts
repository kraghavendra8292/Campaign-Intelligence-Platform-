/**
 * Homepage opinion pulse — public submit + admin list/summary.
 *
 * Separate from Phase 5 Issues: short reactions, no triage workflow.
 */
export const siteFeedbackTypeDefs = /* GraphQL */ `
  enum SiteFeedbackReaction {
    GREAT
    OK
    WORST
  }

  "Receipt after a successful homepage opinion submission."
  type SiteFeedbackReceipt {
    id: ID!
    reaction: SiteFeedbackReaction!
    submittedAt: DateTime!
  }

  input SubmitSiteFeedbackInput {
    organizationSlug: String
    reaction: SiteFeedbackReaction!
    "Optional commentary, max 500 characters."
    comment: String
  }

  "One row in the admin opinion list. No contact fields exist on this model."
  type AdminSiteFeedback {
    id: ID!
    reaction: SiteFeedbackReaction!
    comment: String
    submittedAt: DateTime!
    submittedBy: IssueStaffUser
  }

  type AdminSiteFeedbackConnection {
    nodes: [AdminSiteFeedback!]!
    pageInfo: PublicPageInfo!
  }

  type SiteFeedbackReactionCount {
    reaction: SiteFeedbackReaction!
    count: Int!
  }

  "Aggregate counters for the opinion pulse dashboard."
  type SiteFeedbackSummary {
    total: Int!
    byReaction: [SiteFeedbackReactionCount!]!
    greatPercent: Float!
    okPercent: Float!
    worstPercent: Float!
    greatCount: Int!
    okCount: Int!
    worstCount: Int!
  }

  """
  One campaign organisation's opinion pulse.

  Homepage opinions are tenanted by organisation (the public campaign site).
  Each row is one organisation the caller can see.
  """
  type SiteFeedbackCampaignPulse {
    organizationId: ID!
    organizationName: String!
    organizationSlug: String!
    isActive: Boolean!
    total: Int!
    greatCount: Int!
    okCount: Int!
    worstCount: Int!
    greatPercent: Float!
    okPercent: Float!
    worstPercent: Float!
  }

  """
  Dashboard overview: active campaign pulse, overall across visible campaigns,
  and a per-campaign breakdown.
  """
  type SiteFeedbackDashboardOverview {
    current: SiteFeedbackSummary!
    overall: SiteFeedbackSummary!
    campaigns: [SiteFeedbackCampaignPulse!]!
  }

  extend type Query {
    siteFeedbackList(
      first: Int
      after: String
      reaction: SiteFeedbackReaction
    ): AdminSiteFeedbackConnection!
    siteFeedbackSummary: SiteFeedbackSummary!
    siteFeedbackDashboardOverview: SiteFeedbackDashboardOverview!
  }

  extend type Mutation {
    submitSiteFeedback(input: SubmitSiteFeedbackInput!): SiteFeedbackReceipt!
  }
`;
