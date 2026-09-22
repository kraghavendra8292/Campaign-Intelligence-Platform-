/**
 * Phase 9 - verified work, evidence and public transparency.
 *
 * TWO SURFACES, AND THE SPLIT IS THE SECURITY BOUNDARY.
 *
 * The `Public*` types below carry no `internalNote`, no `rejectionReason`, no
 * reviewer identity and no uploader identity. Those fields are not filtered out
 * at runtime - they are ABSENT FROM THE SCHEMA, so a public query cannot ask
 * for them however it is written. That is a stronger guarantee than a resolver
 * that remembers to omit them, because it survives somebody adding a new
 * resolver later.
 */
export const workTypeDefs = /* GraphQL */ `
  enum WorkSubjectType {
    PROJECT
    ACHIEVEMENT
  }

  "What kind of artefact a piece of evidence is. A description, never a claim of authority."
  enum EvidenceType {
    OFFICIAL_DOCUMENT
    WORK_ORDER
    COMPLETION_CERTIFICATE
    GOVERNMENT_ORDER
    OFFICIAL_LETTER
    BEFORE_PHOTO
    DURING_PHOTO
    AFTER_PHOTO
    PROJECT_PHOTO
    PRESS_DOCUMENTATION
    PUBLIC_RECORD
    OTHER
  }

  "How a work is described to the public. Derived from ProjectStatus, never stored twice."
  enum PublicWorkStatus {
    PROPOSED
    ONGOING
    COMPLETED
  }

  enum VerificationEventAction {
    SUBMITTED_FOR_REVIEW
    REVIEWER_ASSIGNED
    REVIEW_STARTED
    VERIFIED
    REJECTED
    VERIFICATION_WITHDRAWN
    EVIDENCE_CHANGED
  }

  enum ReviewDecision {
    VERIFY
    REJECT
  }

  # ---------------------------------------------------------------------------
  # Public
  # ---------------------------------------------------------------------------

  "A published document or photograph supporting a public claim."
  type PublicWorkEvidence {
    id: ID!
    title: String!
    description: String
    evidenceType: EvidenceType!
    "Public provenance, for example a municipal order reference."
    sourceNote: String
    referenceNumber: String
    issuingAuthority: String
    issuedOn: DateTime
    capturedOn: DateTime
    capturedLocation: String
    documentId: ID
    documentName: String
    documentMimeType: String
    "True when the document is an image and can be shown inline."
    isImage: Boolean!
  }

  type PublicWorkCard {
    id: ID!
    slug: String!
    title: String!
    shortDescription: String
    category: ContentCategory!
    area: String
    locationName: String
    workStatus: PublicWorkStatus
    "Reported exactly as staff recorded it. Never inferred from evidence or publication."
    verification: VerificationStatus!
    verifiedAt: DateTime
    startDate: DateTime
    completionDate: DateTime
    department: String
    agency: String
    featured: Boolean!
    publishedAt: DateTime
    coverImage: PublicImage
  }

  type PublicWorkTimelineEntry {
    id: ID!
    title: String!
    bodyHtml: String
    occurredOn: DateTime!
  }

  type PublicWorkDetail {
    id: ID!
    slug: String!
    title: String!
    shortDescription: String
    descriptionHtml: String
    category: ContentCategory!
    area: String
    locationName: String
    workStatus: PublicWorkStatus
    verification: VerificationStatus!
    verifiedAt: DateTime
    startDate: DateTime
    completionDate: DateTime
    department: String
    agency: String
    costAmount: String
    costCurrency: String
    beneficiaryCount: Int
    publishedAt: DateTime
    coverImage: PublicImage
    media: [PublicProjectMedia!]!
    updates: [PublicWorkTimelineEntry!]!
    evidence: [PublicWorkEvidence!]!
    metaTitle: String
    metaDescription: String
  }

  type PublicWorkConnection {
    nodes: [PublicWorkCard!]!
    totalCount: Int!
    hasMore: Boolean!
    endCursor: String
  }

  type TransparencyCategoryCount {
    category: ContentCategory!
    count: Int!
  }

  type TransparencyAreaCount {
    area: String!
    count: Int!
  }

  "Counts computed from database records. Nothing here is generated."
  type TransparencySummary {
    verifiedWorks: Int!
    ongoingWorks: Int!
    proposedWorks: Int!
    completedWorks: Int!
    publishedWorks: Int!
    evidenceBackedWorks: Int!
    "Null when there is nothing published to divide by. Null is not zero."
    evidenceCoveragePct: Int
    verifiedAchievements: Int!
    categories: [TransparencyCategoryCount!]!
    areas: [TransparencyAreaCount!]!
    areasCovered: Int!
    generatedAt: DateTime!
  }

  input PublicWorkFilterInput {
    first: Int
    after: String
    category: ContentCategory
    area: String
    workStatus: PublicWorkStatus
    year: Int
    verifiedOnly: Boolean
    search: String
  }

  # ---------------------------------------------------------------------------
  # Admin
  # ---------------------------------------------------------------------------

  type WorkEvidenceUploader {
    id: ID!
    fullName: String!
  }

  "Staff view. Carries the internal note, so every field here is behind EVIDENCE_READ."
  type AdminWorkEvidence {
    id: ID!
    subjectType: WorkSubjectType!
    subjectId: ID!
    title: String!
    description: String
    evidenceType: EvidenceType!
    sourceNote: String
    "Staff-only. Absent from every public type in this schema."
    internalNote: String
    referenceNumber: String
    issuingAuthority: String
    issuedOn: DateTime
    capturedOn: DateTime
    capturedLocation: String
    isPublic: Boolean!
    sortOrder: Int!
    documentId: ID
    documentName: String
    documentMimeType: String
    uploadedBy: WorkEvidenceUploader
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type VerificationActor {
    id: ID!
    fullName: String!
  }

  "One entry in the immutable verification trail."
  type VerificationHistoryEntry {
    id: ID!
    action: VerificationEventAction!
    fromStatus: VerificationStatus
    toStatus: VerificationStatus
    "Internal. Rejection reasons and withdrawal notes are staff working material."
    reason: String
    actor: VerificationActor
    createdAt: DateTime!
  }

  type VerificationQueueEntry {
    subjectType: WorkSubjectType!
    id: ID!
    slug: String!
    title: String!
    category: ContentCategory!
    area: String
    status: ContentStatus!
    verification: VerificationStatus!
    submittedForReviewAt: DateTime
    assignedReviewer: VerificationActor
    submittedBy: VerificationActor
    evidenceCount: Int!
    updatedAt: DateTime!
  }

  "A claim's verification state, for the admin console."
  type WorkVerificationState {
    subjectType: WorkSubjectType!
    id: ID!
    slug: String!
    title: String!
    status: ContentStatus!
    verification: VerificationStatus!
    verifiedAt: DateTime
    submittedForReviewAt: DateTime
    assignedReviewerId: ID
    submittedByUserId: ID
  }

  input WorkEvidenceInput {
    title: String!
    description: String
    evidenceType: EvidenceType
    sourceNote: String
    "Staff-only. Never returned by any public query."
    internalNote: String
    documentId: ID
    referenceNumber: String
    issuingAuthority: String
    issuedOn: String
    capturedOn: String
    capturedLocation: String
    "Defaults to false. Evidence is private unless deliberately published."
    isPublic: Boolean
    sortOrder: Int
  }

  type WorkMutationResult {
    success: Boolean!
  }

  input VerificationQueueFilterInput {
    statuses: [VerificationStatus!]
    subjectTypes: [WorkSubjectType!]
    assignedToMe: Boolean
    first: Int
  }

  extend type Query {
    "Published works, filtered and paginated in the database."
    publicWorks(input: PublicSiteInput, filter: PublicWorkFilterInput): PublicWorkConnection!
    publicWork(input: PublicSiteInput, slug: String!): PublicWorkDetail!
    "Published evidence for one published achievement."
    publicAchievementEvidence(input: PublicSiteInput, slug: String!): [PublicWorkEvidence!]!
    transparencySummary(input: PublicSiteInput): TransparencySummary!
    transparencyRecentlyVerified(input: PublicSiteInput, limit: Int): [PublicWorkCard!]!
    transparencyAreas(input: PublicSiteInput): [TransparencyAreaCount!]!

    workEvidence(subjectType: WorkSubjectType!, subjectId: ID!): [AdminWorkEvidence!]!
    verificationHistory(subjectType: WorkSubjectType!, subjectId: ID!): [VerificationHistoryEntry!]!
    verificationQueue(filter: VerificationQueueFilterInput): [VerificationQueueEntry!]!
  }

  extend type Mutation {
    addWorkEvidence(
      subjectType: WorkSubjectType!
      subjectId: ID!
      input: WorkEvidenceInput!
    ): AdminWorkEvidence!
    updateWorkEvidence(evidenceId: ID!, input: WorkEvidenceInput!): AdminWorkEvidence!
    setWorkEvidenceVisibility(evidenceId: ID!, isPublic: Boolean!): AdminWorkEvidence!
    removeWorkEvidence(evidenceId: ID!): WorkMutationResult!

    submitWorkForVerification(subjectType: WorkSubjectType!, subjectId: ID!): WorkVerificationState!
    assignWorkReviewer(
      subjectType: WorkSubjectType!
      subjectId: ID!
      reviewerUserId: ID!
    ): WorkVerificationState!
    "Records a decision. VERIFY needs evidence; REJECT needs a reason."
    decideWorkVerification(
      subjectType: WorkSubjectType!
      subjectId: ID!
      decision: ReviewDecision!
      reason: String
    ): WorkVerificationState!
    withdrawWorkVerification(
      subjectType: WorkSubjectType!
      subjectId: ID!
      reason: String!
    ): WorkVerificationState!
  }
`;
