import type { SiteFeedbackReaction } from '@rk/types';

export const SITE_FEEDBACK_OVERVIEW_QUERY = /* GraphQL */ `
  query SiteFeedbackDashboardOverview {
    siteFeedbackDashboardOverview {
      current {
        total
        greatCount
        okCount
        worstCount
        greatPercent
        okPercent
        worstPercent
        byReaction {
          reaction
          count
        }
      }
      overall {
        total
        greatCount
        okCount
        worstCount
        greatPercent
        okPercent
        worstPercent
      }
      campaigns {
        organizationId
        organizationName
        organizationSlug
        isActive
        total
        greatCount
        okCount
        worstCount
        greatPercent
        okPercent
        worstPercent
      }
    }
  }
`;

export const SITE_FEEDBACK_DASHBOARD_QUERY = /* GraphQL */ `
  query SiteFeedbackDashboard($first: Int, $after: String, $reaction: SiteFeedbackReaction) {
    siteFeedbackDashboardOverview {
      current {
        total
        greatCount
        okCount
        worstCount
        greatPercent
        okPercent
        worstPercent
      }
      overall {
        total
        greatCount
        okCount
        worstCount
        greatPercent
        okPercent
        worstPercent
      }
      campaigns {
        organizationId
        organizationName
        organizationSlug
        isActive
        total
        greatCount
        okCount
        worstCount
        greatPercent
        okPercent
        worstPercent
      }
    }
    siteFeedbackList(first: $first, after: $after, reaction: $reaction) {
      nodes {
        id
        reaction
        comment
        submittedAt
        submittedBy {
          id
          fullName
          email
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export type SiteFeedbackSummary = {
  total: number;
  greatCount: number;
  okCount: number;
  worstCount: number;
  greatPercent: number;
  okPercent: number;
  worstPercent: number;
  byReaction?: Array<{ reaction: SiteFeedbackReaction; count: number }>;
};

export type SiteFeedbackCampaignPulse = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  isActive: boolean;
  total: number;
  greatCount: number;
  okCount: number;
  worstCount: number;
  greatPercent: number;
  okPercent: number;
  worstPercent: number;
};

export type SiteFeedbackOverviewData = {
  siteFeedbackDashboardOverview: {
    current: SiteFeedbackSummary;
    overall: SiteFeedbackSummary;
    campaigns: SiteFeedbackCampaignPulse[];
  };
};
