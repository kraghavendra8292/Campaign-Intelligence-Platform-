/**
 * Issue console GraphQL documents.
 *
 * The contact fields are requested on the list and detail queries, and the API
 * returns them as null unless the caller holds ISSUE_CONTACT_READ. Asking for
 * them unconditionally is safe BECAUSE the server redacts - the client never
 * decides what it may see, and `contactVisible` tells it which case it is in.
 */

const ISSUE_FIELDS = /* GraphQL */ `
  fragment IssueFields on AdminIssue {
    id
    referenceNumber
    type
    title
    status
    priority
    moderationStatus
    source
    ward
    locality
    area
    isAnonymous
    contactProvided
    contactVisible
    contactName
    contactPhone
    contactEmail
    submittedAt
    updatedAt
    attachmentCount
    noteCount
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
`;

export const ISSUES_QUERY = /* GraphQL */ `
  ${ISSUE_FIELDS}
  query Issues($filter: IssueFilter) {
    issues(filter: $filter) {
      nodes {
        ...IssueFields
      }
      totalCount
      hasMore
    }
  }
`;

export const ISSUE_DETAIL_QUERY = /* GraphQL */ `
  ${ISSUE_FIELDS}
  query IssueDetail($id: ID!) {
    issue(id: $id) {
      ...IssueFields
      description
      addressDescription
      latitude
      longitude
      consentGiven
      consentAt
      resolvedAt
      closedAt
      createdAt
      campaign {
        id
        name
      }
      qrCode {
        id
        code
        name
      }
    }
    issueHistory(issueId: $id) {
      id
      action
      previousStatus
      newStatus
      previousPriority
      newPriority
      detail
      createdAt
      performedBy {
        id
        fullName
      }
    }
  }
`;

/**
 * Notes and attachments are SEPARATE queries, not fields on the detail query.
 *
 * Both are behind their own permissions, and a combined query would fail
 * entirely for somebody who may legitimately read the submission but not the
 * staff notes - turning a partial view into an error page.
 */
export const ISSUE_NOTES_QUERY = /* GraphQL */ `
  query IssueNotes($issueId: ID!) {
    issueNotes(issueId: $issueId) {
      id
      note
      createdAt
      author {
        id
        fullName
      }
    }
  }
`;

export const ISSUE_ATTACHMENTS_QUERY = /* GraphQL */ `
  query IssueAttachments($issueId: ID!) {
    issueAttachments(issueId: $issueId) {
      id
      originalName
      mimeType
      sizeBytes
      createdAt
    }
  }
`;

export const ISSUE_CATEGORIES_QUERY = /* GraphQL */ `
  query IssueCategories($includeInactive: Boolean) {
    issueCategories(includeInactive: $includeInactive) {
      id
      key
      label
      isActive
      displayOrder
      issueCount
    }
  }
`;

export const ISSUE_ASSIGNEES_QUERY = /* GraphQL */ `
  query IssueAssignees {
    issueAssignees {
      id
      fullName
      email
    }
  }
`;

export const ISSUE_ANALYTICS_QUERY = /* GraphQL */ `
  query IssueAnalytics($filter: IssueAnalyticsFilter) {
    issueAnalytics(filter: $filter) {
      range {
        from
        to
        days
      }
      totalInRange
      totalAllTime
      submittedToday
      openCount
      highPriorityOpen
      unassignedOpen
      awaitingModeration
      byStatus {
        key
        label
        count
      }
      byPriority {
        key
        label
        count
      }
      byType {
        key
        label
        count
      }
      bySource {
        key
        label
        count
      }
      byCategory {
        key
        label
        count
      }
      byWard {
        key
        label
        count
      }
      trend {
        date
        count
      }
    }
  }
`;

export const UPDATE_ISSUE_STATUS = /* GraphQL */ `
  mutation UpdateIssueStatus($id: ID!, $status: IssueStatus!) {
    updateIssueStatus(id: $id, status: $status) {
      id
      status
    }
  }
`;

export const UPDATE_ISSUE_PRIORITY = /* GraphQL */ `
  mutation UpdateIssuePriority($id: ID!, $priority: IssuePriority!) {
    updateIssuePriority(id: $id, priority: $priority) {
      id
      priority
    }
  }
`;

export const ASSIGN_ISSUE = /* GraphQL */ `
  mutation AssignIssue($id: ID!, $userId: ID!) {
    assignIssue(id: $id, userId: $userId) {
      id
      assignedTo {
        id
        fullName
      }
    }
  }
`;

export const UNASSIGN_ISSUE = /* GraphQL */ `
  mutation UnassignIssue($id: ID!) {
    unassignIssue(id: $id) {
      id
    }
  }
`;

export const MODERATE_ISSUE = /* GraphQL */ `
  mutation ModerateIssue($id: ID!, $moderationStatus: ModerationStatus!) {
    moderateIssue(id: $id, moderationStatus: $moderationStatus) {
      id
      moderationStatus
    }
  }
`;

export const UPDATE_ISSUE = /* GraphQL */ `
  mutation UpdateIssue($id: ID!, $input: UpdateIssueInput!) {
    updateIssue(id: $id, input: $input) {
      id
    }
  }
`;

export const ADD_ISSUE_NOTE = /* GraphQL */ `
  mutation AddIssueNote($issueId: ID!, $note: String!) {
    addIssueInternalNote(issueId: $issueId, note: $note) {
      id
    }
  }
`;

export const REVEAL_ISSUE_CONTACT = /* GraphQL */ `
  mutation RevealIssueContact($id: ID!) {
    revealIssueContact(id: $id) {
      contactName
      contactPhone
      contactEmail
    }
  }
`;

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface IssueRow {
  id: string;
  referenceNumber: string;
  type: string;
  title: string;
  status: string;
  priority: string;
  moderationStatus: string;
  source: string;
  ward: string | null;
  locality: string | null;
  area: string | null;
  isAnonymous: boolean;
  contactProvided: boolean;
  contactVisible: boolean;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  submittedAt: string;
  updatedAt: string;
  attachmentCount: number;
  noteCount: number;
  category: { id: string; key: string; label: string } | null;
  assignedTo: { id: string; fullName: string } | null;
}

export interface IssueDetailRow extends IssueRow {
  description: string;
  addressDescription: string | null;
  latitude: number | null;
  longitude: number | null;
  consentGiven: boolean;
  consentAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  campaign: { id: string; name: string } | null;
  qrCode: { id: string; code: string; name: string } | null;
}

export interface IssueHistoryRow {
  id: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  previousPriority: string | null;
  newPriority: string | null;
  detail: string | null;
  createdAt: string;
  performedBy: { id: string; fullName: string } | null;
}

export interface IssueNoteRow {
  id: string;
  note: string;
  createdAt: string;
  author: { id: string; fullName: string } | null;
}

export interface IssueAttachmentRow {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface IssueCategoryRow {
  id: string;
  key: string;
  label: string;
  isActive: boolean;
  displayOrder: number;
  issueCount: number;
}

export interface IssueCountRow {
  key: string;
  label: string;
  count: number;
}

export interface IssueAnalyticsData {
  range: { from: string; to: string; days: number };
  totalInRange: number;
  totalAllTime: number;
  submittedToday: number;
  openCount: number;
  highPriorityOpen: number;
  unassignedOpen: number;
  awaitingModeration: number;
  byStatus: IssueCountRow[];
  byPriority: IssueCountRow[];
  byType: IssueCountRow[];
  bySource: IssueCountRow[];
  byCategory: IssueCountRow[];
  byWard: IssueCountRow[];
  trend: Array<{ date: string; count: number }>;
}
