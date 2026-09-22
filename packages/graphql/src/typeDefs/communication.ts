/**
 * Phase 8 - citizen communication.
 *
 * THE SCHEMA IS THE PRIVACY BOUNDARY, and this fragment contains both public
 * and admin operations - the only one in the platform that does - so read the
 * split carefully.
 *
 * `PublicIssueTimeline` and `AdminIssueCommunication` are separate types on
 * purpose. They are not a base type and an extension, and the admin type is
 * never reachable from an unauthenticated field. A citizen gets a status, a
 * list of dates, and the updates somebody decided they should read; a staff
 * member with the right permissions gets the delivery record. Sharing one type
 * between them - even with nullable fields - would mean one forgotten
 * authorisation check exposed an internal note, and there would be no
 * structural reason it did not.
 *
 * NOTHING IN THE PUBLIC HALF CAN CARRY CITIZEN CONTACT DATA. There is no email
 * field, no phone field, and no field on `PublicIssueTimeline` that could hold
 * one. The only address-shaped value anywhere is `destinationRedacted`, which
 * is masked before it leaves the service and is reachable only with the
 * tracking token - by the person whose address it is.
 *
 * ALL CITIZEN- AND STAFF-AUTHORED TEXT IS PLAIN TEXT. There is no HTML anywhere
 * in this fragment; clients render it escaped.
 */
export const communicationTypeDefs = /* GraphQL */ `
  enum PublicUpdateStatus {
    DRAFT
    PUBLISHED
    ARCHIVED
  }

  enum NotificationChannel {
    EMAIL
    SMS
  }

  enum NotificationEvent {
    ISSUE_RECEIVED
    ISSUE_STATUS_CHANGED
    PUBLIC_UPDATE_PUBLISHED
    ISSUE_RESOLVED
    ISSUE_REOPENED
  }

  enum NotificationStatus {
    QUEUED
    PROCESSING
    SENT
    DELIVERED
    FAILED
    SKIPPED
  }

  enum FollowUpResponse {
    RESOLVED
    PARTIALLY_RESOLVED
    NOT_RESOLVED
  }

  enum FollowUpStatus {
    SUBMITTED
    REVIEWED
  }

  enum FollowUpOutcome {
    REOPENED
    KEPT_CLOSED
    ACKNOWLEDGED
  }

  # ==========================================================================
  # PUBLIC - reachable by an anonymous citizen
  # ==========================================================================

  "One dated step on a citizen's timeline. Status and date only."
  type PublicTimelineEntry {
    id: ID!
    status: IssueStatus!
    occurredAt: DateTime!
  }

  """
  A staff-authored message the organisation decided this citizen should read.

  Plain text. Only PUBLISHED updates ever appear here - a draft is staff
  thinking aloud and an archived update was withdrawn.
  """
  type PublicIssueUpdate {
    id: ID!
    body: String!
    publishedAt: DateTime
  }

  "The citizen's own answer, echoed back so the page does not ask twice."
  type PublicFollowUpSummary {
    response: FollowUpResponse!
    submittedAt: DateTime!
  }

  """
  Everything a citizen may see about their own submission.

  Readable with the REFERENCE ALONE, because every field is something the
  organisation chose to disclose: a status, the dates it changed, and updates
  written to be read. There is deliberately no title, description, contact
  detail, priority, assignment, internal note, attachment or AI output - the
  same restraint as the Phase 5 status lookup, which this extends rather than
  replaces.
  """
  type PublicIssueTimeline {
    referenceNumber: String!
    "Already disclosed by the Phase 5 status lookup; no new disclosure here."
    type: SubmissionType!
    status: IssueStatus!
    categoryLabel: String
    organizationName: String!
    submittedAt: DateTime!
    updatedAt: DateTime!
    resolvedAt: DateTime

    timeline: [PublicTimelineEntry!]!
    publicUpdates: [PublicIssueUpdate!]!

    "True when the submission is finished and no answer has been given yet."
    followUpAvailable: Boolean!
    existingFollowUp: PublicFollowUpSummary
  }

  """
  A citizen's notification settings for their own submission.

  Requires the tracking token, because it returns the address attached to the
  submission - and returns it MASKED even then, so the page can show which
  address is in use without reproducing it for somebody reading over a shoulder.
  """
  type PublicSubscription {
    referenceNumber: String!
    channel: NotificationChannel!
    subscribed: Boolean!
    "Masked, e.g. r***@example.com. The full address is never returned."
    destinationRedacted: String
    consentGivenAt: DateTime
    "Channels this deployment can actually deliver. SMS is declared, not built."
    supportedChannels: [NotificationChannel!]!
  }

  type PublicSubscriptionResult {
    subscribed: Boolean!
    destinationRedacted: String
  }

  type PublicFollowUpResult {
    recorded: Boolean!
    """
    Whether this raised a request for staff to look again.

    Note what it does NOT mean: the submission's status is unchanged. A citizen
    saying "not resolved" is information for a person to act on, never an
    instruction the system executes.
    """
    reopenRequested: Boolean!
    message: String!
  }

  input FollowIssueInput {
    reference: String!
    trackingToken: String!
    channel: NotificationChannel! = EMAIL
    destination: String!
    "Must be true. Consent is per submission and single-purpose."
    consent: Boolean!
  }

  input SubmitFollowUpInput {
    reference: String!
    trackingToken: String!
    response: FollowUpResponse!
    comment: String
  }

  # ==========================================================================
  # ADMIN - RBAC enforced in the service layer
  # ==========================================================================

  type CommunicationStaffUser {
    id: ID!
    fullName: String!
  }

  "A public update as staff see it: drafts, archived ones and provenance."
  type AdminPublicUpdate {
    id: ID!
    issueId: ID!
    body: String!
    status: PublicUpdateStatus!
    publishedAt: DateTime
    "Set when this update corrects an earlier one, which is then archived."
    supersedesId: ID
    createdAt: DateTime!
    updatedAt: DateTime!
    createdBy: CommunicationStaffUser
    publishedBy: CommunicationStaffUser
  }

  "One outbound message and what happened to it."
  type AdminNotification {
    id: ID!
    issueId: ID!
    event: NotificationEvent!
    channel: NotificationChannel!
    "Masked. The real address is never returned to any admin query."
    recipientRedacted: String!
    status: NotificationStatus!
    "Category, never a provider's raw error."
    failureKind: String
    "A safe sentence. Never provider internals or credentials."
    failureReason: String
    attempts: Int!
    templateVersion: String!
    queuedAt: DateTime!
    sentAt: DateTime
    deliveredAt: DateTime
    failedAt: DateTime
    createdAt: DateTime!
    issue: AdminIssueRef
  }

  type AdminIssueRef {
    id: ID!
    referenceNumber: String!
  }

  type AdminNotificationConnection {
    nodes: [AdminNotification!]!
    totalCount: Int!
    hasMore: Boolean!
  }

  "What a citizen said when asked whether their problem was fixed."
  type AdminFollowUp {
    id: ID!
    issueId: ID!
    response: FollowUpResponse!
    "Citizen free text. Rendered as escaped plain text."
    comment: String
    reopenRequested: Boolean!
    status: FollowUpStatus!
    outcome: FollowUpOutcome
    "Internal. Never shown to the citizen."
    reviewNote: String
    submittedAt: DateTime!
    reviewedAt: DateTime
    reviewedBy: CommunicationStaffUser
    issue: AdminIssueRef
  }

  "Consent state for one submission. Carries no address, masked or otherwise."
  type AdminSubscriptionSummary {
    channel: NotificationChannel!
    active: Boolean!
    consentGivenAt: DateTime!
  }

  "In-memory queue state for THIS API process, not the cluster."
  type NotificationQueueStats {
    pending: Int!
    activeWorkers: Int!
    processed: Int!
    failed: Int!
  }

  type CommunicationOverview {
    from: DateTime!
    to: DateTime!
    generatedAt: DateTime!

    total: Int!
    queued: Int!
    processing: Int!
    sent: Int!
    delivered: Int!
    failed: Int!
    "Deliberately separate from failed: a skip is a correct decision not to send."
    skipped: Int!
    "Null when nothing has been attempted, rather than a misleading 0."
    successRatePct: Float

    publishedUpdates: Int!
    activeSubscriptions: Int!
    followUps: Int!
    pendingReopenRequests: Int!

    notificationsEnabled: Boolean!
    provider: String!
    queue: NotificationQueueStats!
  }

  "One submission's communication record, for the issue page panel."
  type IssueCommunication {
    notifications: [AdminNotification!]!
    publicUpdateCount: Int!
    subscription: AdminSubscriptionSummary
    followUps: [AdminFollowUp!]!
  }

  input CommunicationFilterInput {
    from: DateTime
    to: DateTime
    statuses: [NotificationStatus!]
    events: [NotificationEvent!]
    channels: [NotificationChannel!]
    issueId: ID
    first: Int = 25
    offset: Int = 0
  }

  extend type Query {
    # --- Public -------------------------------------------------------------
    """
    A citizen's own submission: status, dated timeline and published updates.

    Reference alone. Returns null for an unknown reference, a suspended tenant
    and a submission marked spam alike - distinguishing them would confirm to
    somebody guessing that a reference exists.
    """
    publicIssueTimeline(reference: String!): PublicIssueTimeline

    "Notification settings. Requires the tracking token."
    publicIssueSubscription(reference: String!, trackingToken: String!): PublicSubscription!

    # --- Admin --------------------------------------------------------------
    communicationOverview(filter: CommunicationFilterInput): CommunicationOverview!
    communicationNotifications(filter: CommunicationFilterInput): AdminNotificationConnection!
    issueCommunication(issueId: ID!): IssueCommunication!
    issuePublicUpdates(issueId: ID!): [AdminPublicUpdate!]!
    "The reopen queue when pendingOnly is true; recent citizen replies otherwise."
    communicationFollowUps(pendingOnly: Boolean = false, first: Int = 50): [AdminFollowUp!]!
  }

  extend type Mutation {
    # --- Public -------------------------------------------------------------
    """
    Starts or updates notifications for one's own submission.

    Requires the tracking token: without it, anybody holding a reference could
    attach their address to a stranger's report and receive every later update.
    """
    followIssue(input: FollowIssueInput!): PublicSubscriptionResult!

    """
    Stops future messages about one submission.

    Does not delete the subscription, the issue or the record of what was
    already sent. Asking to stop being emailed is not asking to withdraw a
    civic complaint.
    """
    unsubscribeFromIssue(reference: String!, trackingToken: String!): PublicSubscriptionResult!

    "Records the citizen's answer. Changes no status."
    submitIssueFollowUp(input: SubmitFollowUpInput!): PublicFollowUpResult!

    # --- Admin --------------------------------------------------------------
    "Writes a draft. Not visible to the citizen until published."
    createPublicIssueUpdate(issueId: ID!, body: String!): AdminPublicUpdate!

    "Makes a draft visible to the citizen. Requires COMMUNICATION_PUBLISH."
    publishPublicIssueUpdate(updateId: ID!): AdminPublicUpdate!

    """
    Publishes a correction that supersedes an earlier update.

    A correction rather than an edit: a published update may already have been
    read and emailed, and silently rewriting it would leave the record
    disagreeing with what the citizen was told.
    """
    correctPublicIssueUpdate(updateId: ID!, body: String!): AdminPublicUpdate!

    "Withdraws an update from the public page. The record is kept."
    archivePublicIssueUpdate(updateId: ID!): AdminPublicUpdate!

    "Re-queues a FAILED notification. A sent one is never re-sent."
    retryNotification(notificationId: ID!): Boolean!

    """
    Records what a reviewer decided about a citizen's reply.

    Recording the decision only. Reopening the submission is a separate act
    through the ordinary status path, so it obeys the Phase 5 transition rules
    and appears in the issue's own timeline as something a person did.
    """
    reviewIssueFollowUp(followUpId: ID!, outcome: FollowUpOutcome!, note: String): AdminFollowUp!
  }
`;
