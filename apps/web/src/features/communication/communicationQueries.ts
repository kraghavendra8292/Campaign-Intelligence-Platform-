/**
 * Communication GraphQL documents and row types.
 *
 * SPLIT INTO PUBLIC AND ADMIN HALVES, in that order, and the split is not
 * cosmetic: the public documents are sent by an anonymous visitor on a mobile
 * connection and must stay small, while the admin ones run inside the console
 * behind the Phase 2 guard. Keeping them in one file with a visible boundary
 * makes it obvious which is which when somebody adds a field.
 *
 * NO PUBLIC DOCUMENT REQUESTS A CONTACT FIELD, because the public types do not
 * have one. The single address-shaped value anywhere here is
 * `destinationRedacted`, which the server masks before it is returned.
 */

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export const PUBLIC_TIMELINE_QUERY = /* GraphQL */ `
  query PublicIssueTimeline($reference: String!) {
    publicIssueTimeline(reference: $reference) {
      referenceNumber
      type
      status
      categoryLabel
      organizationName
      submittedAt
      updatedAt
      resolvedAt
      timeline {
        id
        status
        occurredAt
      }
      publicUpdates {
        id
        body
        publishedAt
      }
      followUpAvailable
      existingFollowUp {
        response
        submittedAt
      }
    }
  }
`;

export const PUBLIC_SUBSCRIPTION_QUERY = /* GraphQL */ `
  query PublicIssueSubscription($reference: String!, $trackingToken: String!) {
    publicIssueSubscription(reference: $reference, trackingToken: $trackingToken) {
      referenceNumber
      channel
      subscribed
      destinationRedacted
      consentGivenAt
      supportedChannels
    }
  }
`;

export const FOLLOW_ISSUE_MUTATION = /* GraphQL */ `
  mutation FollowIssue($input: FollowIssueInput!) {
    followIssue(input: $input) {
      subscribed
      destinationRedacted
    }
  }
`;

export const UNSUBSCRIBE_MUTATION = /* GraphQL */ `
  mutation UnsubscribeFromIssue($reference: String!, $trackingToken: String!) {
    unsubscribeFromIssue(reference: $reference, trackingToken: $trackingToken) {
      subscribed
    }
  }
`;

export const SUBMIT_FOLLOW_UP_MUTATION = /* GraphQL */ `
  mutation SubmitIssueFollowUp($input: SubmitFollowUpInput!) {
    submitIssueFollowUp(input: $input) {
      recorded
      reopenRequested
      message
    }
  }
`;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const NOTIFICATION_FIELDS = /* GraphQL */ `
  fragment NotificationFields on AdminNotification {
    id
    issueId
    event
    channel
    recipientRedacted
    status
    failureKind
    failureReason
    attempts
    templateVersion
    queuedAt
    sentAt
    deliveredAt
    failedAt
    createdAt
    issue {
      id
      referenceNumber
    }
  }
`;

export const COMMUNICATION_OVERVIEW_QUERY = /* GraphQL */ `
  ${NOTIFICATION_FIELDS}
  query CommunicationOverview($filter: CommunicationFilterInput) {
    communicationOverview(filter: $filter) {
      from
      to
      generatedAt
      total
      queued
      processing
      sent
      delivered
      failed
      skipped
      successRatePct
      publishedUpdates
      activeSubscriptions
      followUps
      pendingReopenRequests
      notificationsEnabled
      provider
      queue {
        pending
        activeWorkers
        processed
        failed
      }
    }
    communicationNotifications(filter: $filter) {
      nodes {
        ...NotificationFields
      }
      totalCount
      hasMore
    }
  }
`;

export const COMMUNICATION_FOLLOW_UPS_QUERY = /* GraphQL */ `
  query CommunicationFollowUps($pendingOnly: Boolean) {
    communicationFollowUps(pendingOnly: $pendingOnly, first: 50) {
      id
      issueId
      response
      comment
      reopenRequested
      status
      outcome
      reviewNote
      submittedAt
      reviewedAt
      reviewedBy {
        id
        fullName
      }
      issue {
        id
        referenceNumber
      }
    }
  }
`;

const PUBLIC_UPDATE_FIELDS = /* GraphQL */ `
  fragment PublicUpdateFields on AdminPublicUpdate {
    id
    issueId
    body
    status
    publishedAt
    supersedesId
    createdAt
    updatedAt
    createdBy {
      id
      fullName
    }
    publishedBy {
      id
      fullName
    }
  }
`;

export const ISSUE_COMMUNICATION_QUERY = /* GraphQL */ `
  ${NOTIFICATION_FIELDS}
  ${PUBLIC_UPDATE_FIELDS}
  query IssueCommunication($issueId: ID!) {
    issueCommunication(issueId: $issueId) {
      publicUpdateCount
      notifications {
        ...NotificationFields
      }
      subscription {
        channel
        active
        consentGivenAt
      }
      followUps {
        id
        response
        comment
        reopenRequested
        status
        outcome
        reviewNote
        submittedAt
        reviewedAt
        reviewedBy {
          id
          fullName
        }
      }
    }
    issuePublicUpdates(issueId: $issueId) {
      ...PublicUpdateFields
    }
  }
`;

export const CREATE_PUBLIC_UPDATE = /* GraphQL */ `
  ${PUBLIC_UPDATE_FIELDS}
  mutation CreatePublicIssueUpdate($issueId: ID!, $body: String!) {
    createPublicIssueUpdate(issueId: $issueId, body: $body) {
      ...PublicUpdateFields
    }
  }
`;

export const PUBLISH_PUBLIC_UPDATE = /* GraphQL */ `
  ${PUBLIC_UPDATE_FIELDS}
  mutation PublishPublicIssueUpdate($updateId: ID!) {
    publishPublicIssueUpdate(updateId: $updateId) {
      ...PublicUpdateFields
    }
  }
`;

export const ARCHIVE_PUBLIC_UPDATE = /* GraphQL */ `
  ${PUBLIC_UPDATE_FIELDS}
  mutation ArchivePublicIssueUpdate($updateId: ID!) {
    archivePublicIssueUpdate(updateId: $updateId) {
      ...PublicUpdateFields
    }
  }
`;

export const RETRY_NOTIFICATION = /* GraphQL */ `
  mutation RetryNotification($notificationId: ID!) {
    retryNotification(notificationId: $notificationId)
  }
`;

export const REVIEW_FOLLOW_UP = /* GraphQL */ `
  mutation ReviewIssueFollowUp($followUpId: ID!, $outcome: FollowUpOutcome!, $note: String) {
    reviewIssueFollowUp(followUpId: $followUpId, outcome: $outcome, note: $note) {
      id
      status
      outcome
      reviewedAt
    }
  }
`;

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type NotificationStatus =
  'QUEUED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED';

export type PublicUpdateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type FollowUpResponse = 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'NOT_RESOLVED';
export type FollowUpOutcome = 'REOPENED' | 'KEPT_CLOSED' | 'ACKNOWLEDGED';

export interface PublicTimelineEntry {
  id: string;
  status: string;
  occurredAt: string;
}

export interface PublicIssueUpdateRow {
  id: string;
  body: string;
  publishedAt: string | null;
}

export interface PublicTimelineData {
  publicIssueTimeline: {
    referenceNumber: string;
    type: string;
    status: string;
    categoryLabel: string | null;
    organizationName: string;
    submittedAt: string;
    updatedAt: string;
    resolvedAt: string | null;
    timeline: PublicTimelineEntry[];
    publicUpdates: PublicIssueUpdateRow[];
    followUpAvailable: boolean;
    existingFollowUp: { response: FollowUpResponse; submittedAt: string } | null;
  } | null;
}

export interface PublicSubscriptionData {
  publicIssueSubscription: {
    referenceNumber: string;
    channel: string;
    subscribed: boolean;
    destinationRedacted: string | null;
    consentGivenAt: string | null;
    supportedChannels: string[];
  };
}

export interface AdminNotificationRow {
  id: string;
  issueId: string;
  event: string;
  channel: string;
  recipientRedacted: string;
  status: NotificationStatus;
  failureKind: string | null;
  failureReason: string | null;
  attempts: number;
  templateVersion: string;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  createdAt: string;
  issue: { id: string; referenceNumber: string } | null;
}

export interface AdminPublicUpdateRow {
  id: string;
  issueId: string;
  body: string;
  status: PublicUpdateStatus;
  publishedAt: string | null;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string } | null;
  publishedBy: { id: string; fullName: string } | null;
}

export interface AdminFollowUpRow {
  id: string;
  issueId?: string;
  response: FollowUpResponse;
  comment: string | null;
  reopenRequested: boolean;
  status: 'SUBMITTED' | 'REVIEWED';
  outcome: FollowUpOutcome | null;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; fullName: string } | null;
  issue?: { id: string; referenceNumber: string } | null;
}

export interface CommunicationOverviewData {
  communicationOverview: {
    from: string;
    to: string;
    generatedAt: string;
    total: number;
    queued: number;
    processing: number;
    sent: number;
    delivered: number;
    failed: number;
    skipped: number;
    successRatePct: number | null;
    publishedUpdates: number;
    activeSubscriptions: number;
    followUps: number;
    pendingReopenRequests: number;
    notificationsEnabled: boolean;
    provider: string;
    queue: { pending: number; activeWorkers: number; processed: number; failed: number };
  };
  communicationNotifications: {
    nodes: AdminNotificationRow[];
    totalCount: number;
    hasMore: boolean;
  };
}

export interface IssueCommunicationData {
  issueCommunication: {
    publicUpdateCount: number;
    notifications: AdminNotificationRow[];
    subscription: { channel: string; active: boolean; consentGivenAt: string } | null;
    followUps: AdminFollowUpRow[];
  };
  issuePublicUpdates: AdminPublicUpdateRow[];
}

export interface CommunicationFollowUpsData {
  communicationFollowUps: AdminFollowUpRow[];
}
