/**
 * Phase 5 - citizen feedback and issue reporting.
 *
 * THE SCHEMA IS THE PRIVACY BOUNDARY, so read the split below carefully.
 *
 * `PublicIssueStatus` and `AdminIssue` are separate types on purpose. They are
 * not a base type and an extension, and `AdminIssue` is never reachable from an
 * unauthenticated field. A citizen tracking their report gets six scalars; a
 * staff member with the right permissions gets the record. Sharing one type
 * between them - even with nullable fields - would mean one forgotten
 * authorisation check exposed somebody's phone number, and there would be no
 * structural reason it did not.
 *
 * Nothing here describes a person's politics. There is no score, no affinity,
 * no classification of the submitter, and no field that could hold one.
 */
export const issueTypeDefs = /* GraphQL */ `
  enum SubmissionType {
    FEEDBACK
    ISSUE
    SUGGESTION
    COMPLAINT
  }

  enum IssueStatus {
    SUBMITTED
    UNDER_REVIEW
    ACKNOWLEDGED
    IN_PROGRESS
    RESOLVED
    CLOSED
    REJECTED
  }

  enum IssuePriority {
    LOW
    MEDIUM
    HIGH
    URGENT
  }

  enum ModerationStatus {
    PENDING_REVIEW
    APPROVED
    REJECTED
    SPAM
  }

  enum IssueSource {
    DIRECT_WEBSITE
    QR
    CAMPAIGN_PAGE
    OTHER
  }

  enum IssueHistoryAction {
    SUBMITTED
    STATUS_CHANGED
    PRIORITY_CHANGED
    ASSIGNED
    UNASSIGNED
    CATEGORY_CHANGED
    LOCATION_UPDATED
    MODERATED
    NOTE_ADDED
  }

  # ---------------------------------------------------------------------------
  # Public surface
  #
  # Everything below this line is reachable WITHOUT authentication. Adding a
  # field here is adding it to the open internet.
  # ---------------------------------------------------------------------------

  "A category a citizen may choose on the public form."
  type PublicIssueCategory {
    key: String!
    label: String!
  }

  """
  What a citizen sees when they look up their reference.

  Six fields, and the list is exhaustive by construction. The title and
  description are deliberately absent: the citizen wrote them and sometimes
  fills them with personal circumstances, so somebody who found a reference on a
  dropped note must not be able to read them back. Priority is absent because it
  is an internal triage judgement.
  """
  type PublicIssueStatus {
    referenceNumber: String!
    type: SubmissionType!
    categoryLabel: String
    status: IssueStatus!
    submittedAt: DateTime!
    updatedAt: DateTime!
  }

  "What the citizen is given after a successful submission."
  type IssueSubmissionReceipt {
    "Save this - it is the only way to check the submission later."
    referenceNumber: String!
    type: SubmissionType!
    submittedAt: DateTime!
    "Whether contact details were stored, so the page can say the team may reply."
    contactProvided: Boolean!
    """
    Phase 8 tracking code, returned EXACTLY ONCE and never again.

    Only its digest is stored, so it is not recoverable afterwards by anybody,
    including us. Losing it costs the citizen nothing except the optional
    extras: status and published updates stay readable with the reference
    alone, while following the submission and sending follow-up need this.
    """
    trackingToken: String!
  }

  "One file already uploaded, identified by the token returned at upload time."
  input IssueAttachmentClaim {
    id: ID!
    claimToken: String!
  }

  input SubmitIssueInput {
    "Which candidate site is being used. Resolved to a tenant server-side."
    organizationSlug: String
    type: SubmissionType!
    title: String!
    description: String!
    categoryKey: String

    ward: String
    locality: String
    area: String
    addressDescription: String
    latitude: Float
    longitude: Float

    "Leave true to submit without giving any contact details."
    isAnonymous: Boolean
    contactName: String
    contactPhone: String
    contactEmail: String
    "Required only when contact details are supplied."
    consentGiven: Boolean

    "Public QR identifier the citizen arrived through, for channel attribution."
    qrCode: String
    attachments: [IssueAttachmentClaim!]
  }

  # ---------------------------------------------------------------------------
  # Admin surface
  #
  # Every field below requires authentication, an active tenant and an issue
  # permission. None of it is reachable from a public field.
  # ---------------------------------------------------------------------------

  type IssueCategory {
    id: ID!
    key: String!
    label: String!
    labelKn: String
    isActive: Boolean!
    displayOrder: Int!
    "How many submissions currently use it, so deactivation is an informed choice."
    issueCount: Int!
  }

  type IssueStaffUser {
    id: ID!
    fullName: String!
    email: String
  }

  type IssueCampaignRef {
    id: ID!
    name: String!
  }

  type IssueQrCodeRef {
    id: ID!
    code: String!
    name: String!
  }

  """
  A submission, as staff see it.

  The contact fields are null unless the caller holds ISSUE_CONTACT_READ. They
  are nulled rather than omitted so the response shape is stable, and
  contactVisible tells the client whether it is looking at a redaction or at
  a genuinely anonymous submission - two different things that would otherwise
  be indistinguishable.
  """
  type AdminIssue {
    id: ID!
    referenceNumber: String!
    type: SubmissionType!
    title: String!
    description: String!
    status: IssueStatus!
    priority: IssuePriority!
    moderationStatus: ModerationStatus!
    source: IssueSource!

    ward: String
    locality: String
    area: String
    addressDescription: String
    latitude: Float
    longitude: Float

    "True when the citizen gave no contact details at all."
    isAnonymous: Boolean!
    "True when a reply is possible - readable without ISSUE_CONTACT_READ."
    contactProvided: Boolean!
    "Whether this caller may see the contact fields below."
    contactVisible: Boolean!
    contactName: String
    contactPhone: String
    contactEmail: String
    consentGiven: Boolean!
    consentAt: DateTime

    submittedAt: DateTime!
    resolvedAt: DateTime
    closedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!

    category: IssueCategory
    campaign: IssueCampaignRef
    qrCode: IssueQrCodeRef
    assignedTo: IssueStaffUser

    attachmentCount: Int!
    noteCount: Int!
  }

  type AdminIssueConnection {
    nodes: [AdminIssue!]!
    totalCount: Int!
    hasMore: Boolean!
  }

  "Contact details, returned only by the mutation that audits the disclosure."
  type IssueContactDetails {
    contactName: String
    contactPhone: String
    contactEmail: String
  }

  type IssueHistoryEntry {
    id: ID!
    action: IssueHistoryAction!
    previousStatus: IssueStatus
    newStatus: IssueStatus
    previousPriority: IssuePriority
    newPriority: IssuePriority
    detail: String
    performedBy: IssueStaffUser
    createdAt: DateTime!
  }

  type IssueInternalNote {
    id: ID!
    note: String!
    author: IssueStaffUser
    createdAt: DateTime!
  }

  """
  Attachment metadata. The BYTES are never served through GraphQL - they come
  from GET /issue-attachments/:id, which re-checks ISSUE_ATTACHMENT_READ and
  the tenant.
  """
  type IssueAttachment {
    id: ID!
    originalName: String!
    mimeType: String!
    sizeBytes: Int!
    createdAt: DateTime!
  }

  type IssueCount {
    key: String!
    label: String!
    count: Int!
  }

  type IssueTrendPoint {
    date: DateTime!
    count: Int!
  }

  """
  Aggregate operational analytics.

  Counts of submissions and of work outstanding. Every breakdown is a statement
  about the campaign's workload or about a place - never about the people who
  submitted. There is no sentiment, no tone, no inference and no model.
  """
  type IssueAnalytics {
    range: AnalyticsWindow!

    totalInRange: Int!
    totalAllTime: Int!
    submittedToday: Int!
    "Everything not yet closed or rejected, counted across all time."
    openCount: Int!
    highPriorityOpen: Int!
    unassignedOpen: Int!
    awaitingModeration: Int!

    byStatus: [IssueCount!]!
    byPriority: [IssueCount!]!
    byType: [IssueCount!]!
    bySource: [IssueCount!]!
    byCategory: [IssueCount!]!
    byWard: [IssueCount!]!
    trend: [IssueTrendPoint!]!
  }

  input IssueFilter {
    first: Int
    offset: Int
    status: IssueStatus
    priority: IssuePriority
    type: SubmissionType
    categoryId: ID
    source: IssueSource
    moderationStatus: ModerationStatus
    ward: String
    locality: String
    assignedToUserId: ID
    unassignedOnly: Boolean
    from: DateTime
    to: DateTime
    "Matches the reference number or the title. Never the description."
    search: String
  }

  input IssueAnalyticsFilter {
    range: AnalyticsRange
    from: DateTime
    to: DateTime
  }

  input UpdateIssueInput {
    categoryId: ID
    ward: String
    locality: String
    area: String
    addressDescription: String
    latitude: Float
    longitude: Float
  }

  extend type Query {
    # --- Public -------------------------------------------------------------
    "Categories offered on the public form. Active ones only."
    publicIssueCategories(input: PublicSiteInput): [PublicIssueCategory!]!
    "Status of one submission by its reference. Returns null for anything unknown."
    publicIssueStatus(referenceNumber: String!): PublicIssueStatus

    # --- Admin --------------------------------------------------------------
    issues(filter: IssueFilter): AdminIssueConnection!
    issue(id: ID!): AdminIssue!
    issueHistory(issueId: ID!): [IssueHistoryEntry!]!
    issueNotes(issueId: ID!): [IssueInternalNote!]!
    issueAttachments(issueId: ID!): [IssueAttachment!]!
    issueCategories(includeInactive: Boolean = false): [IssueCategory!]!
    issueAnalytics(filter: IssueAnalyticsFilter): IssueAnalytics!
    "Organisation members a submission may be assigned to."
    issueAssignees: [IssueStaffUser!]!
  }

  extend type Mutation {
    # --- Public -------------------------------------------------------------
    "Submit feedback, an issue, a suggestion or a complaint. No account needed."
    submitIssue(input: SubmitIssueInput!): IssueSubmissionReceipt!

    # --- Admin --------------------------------------------------------------
    updateIssue(id: ID!, input: UpdateIssueInput!): AdminIssue!
    updateIssueStatus(id: ID!, status: IssueStatus!): AdminIssue!
    updateIssuePriority(id: ID!, priority: IssuePriority!): AdminIssue!
    assignIssue(id: ID!, userId: ID!): AdminIssue!
    unassignIssue(id: ID!): AdminIssue!
    moderateIssue(id: ID!, moderationStatus: ModerationStatus!): AdminIssue!
    addIssueInternalNote(issueId: ID!, note: String!): IssueInternalNote!
    setIssueCategoryActive(id: ID!, isActive: Boolean!): IssueCategory!

    """
    Reveals the citizen's contact details.

    A MUTATION rather than a field on AdminIssue, because it has a side effect:
    it writes an audit record of the disclosure. Modelling a read that must be
    logged as a query would make the logging invisible to anyone reading the
    schema, and easy to route around.
    """
    revealIssueContact(id: ID!): IssueContactDetails!
  }
`;
