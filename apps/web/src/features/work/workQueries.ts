import type { ContentCategory, EvidenceType, VerificationStatus } from '@rk/types';

/**
 * Phase 9 GraphQL documents and result shapes.
 *
 * Hand-written to match the SDL, following the Phase 3 convention: the schema
 * is the source of truth and these mirror it, checked by the tests that render
 * each page against a stubbed response.
 *
 * THE PUBLIC DOCUMENTS BELOW ASK FOR NO STAFF FIELD. Not because a resolver
 * would refuse - it would - but because a query that cannot name a field cannot
 * leak it through a screenshot, a cached response or a debugging session.
 */

export type PublicWorkStatus = 'PROPOSED' | 'ONGOING' | 'COMPLETED';

export interface WorkImage {
  id: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface PublicEvidence {
  id: string;
  title: string;
  description: string | null;
  evidenceType: EvidenceType;
  sourceNote: string | null;
  referenceNumber: string | null;
  issuingAuthority: string | null;
  issuedOn: string | null;
  capturedOn: string | null;
  capturedLocation: string | null;
  documentId: string | null;
  documentName: string | null;
  documentMimeType: string | null;
  isImage: boolean;
}

export interface PublicWorkCard {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  category: ContentCategory;
  area: string | null;
  locationName: string | null;
  workStatus: PublicWorkStatus | null;
  verification: VerificationStatus;
  verifiedAt: string | null;
  startDate: string | null;
  completionDate: string | null;
  department: string | null;
  agency: string | null;
  featured: boolean;
  publishedAt: string | null;
  coverImage: WorkImage | null;
}

export interface PublicWorkDetail extends PublicWorkCard {
  descriptionHtml: string | null;
  costAmount: string | null;
  costCurrency: string | null;
  beneficiaryCount: number | null;
  media: Array<{
    id: string;
    role: 'GALLERY' | 'BEFORE' | 'AFTER';
    caption: string | null;
    image: WorkImage;
  }>;
  updates: Array<{ id: string; title: string; bodyHtml: string | null; occurredOn: string }>;
  evidence: PublicEvidence[];
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface TransparencySummary {
  verifiedWorks: number;
  ongoingWorks: number;
  proposedWorks: number;
  completedWorks: number;
  publishedWorks: number;
  evidenceBackedWorks: number;
  evidenceCoveragePct: number | null;
  verifiedAchievements: number;
  categories: Array<{ category: ContentCategory; count: number }>;
  areas: Array<{ area: string; count: number }>;
  areasCovered: number;
  generatedAt: string;
}

const WORK_IMAGE = /* GraphQL */ `
  fragment WorkImageFields on PublicImage {
    id
    altText
    width
    height
  }
`;

const WORK_CARD = /* GraphQL */ `
  fragment WorkCardFields on PublicWorkCard {
    id
    slug
    title
    shortDescription
    category
    area
    locationName
    workStatus
    verification
    verifiedAt
    startDate
    completionDate
    department
    agency
    featured
    publishedAt
    coverImage {
      ...WorkImageFields
    }
  }
`;

/** Detail is a separate GraphQL type — cannot spread WorkCardFields onto it. */
const WORK_DETAIL = /* GraphQL */ `
  fragment WorkDetailFields on PublicWorkDetail {
    id
    slug
    title
    shortDescription
    descriptionHtml
    category
    area
    locationName
    workStatus
    verification
    verifiedAt
    startDate
    completionDate
    department
    agency
    costAmount
    costCurrency
    beneficiaryCount
    publishedAt
    metaTitle
    metaDescription
    coverImage {
      ...WorkImageFields
    }
    media {
      id
      role
      caption
      image {
        ...WorkImageFields
      }
    }
    updates {
      id
      title
      bodyHtml
      occurredOn
    }
    evidence {
      ...PublicEvidenceFields
    }
  }
`;

const PUBLIC_EVIDENCE = /* GraphQL */ `
  fragment PublicEvidenceFields on PublicWorkEvidence {
    id
    title
    description
    evidenceType
    sourceNote
    referenceNumber
    issuingAuthority
    issuedOn
    capturedOn
    capturedLocation
    documentId
    documentName
    documentMimeType
    isImage
  }
`;

export const PUBLIC_WORKS_QUERY = /* GraphQL */ `
  ${WORK_IMAGE}
  ${WORK_CARD}
  query PublicWorks($input: PublicSiteInput, $filter: PublicWorkFilterInput) {
    publicWorks(input: $input, filter: $filter) {
      nodes {
        ...WorkCardFields
      }
      totalCount
      hasMore
      endCursor
    }
  }
`;

export const PUBLIC_WORK_QUERY = /* GraphQL */ `
  ${WORK_IMAGE}
  ${PUBLIC_EVIDENCE}
  ${WORK_DETAIL}
  query PublicWork($input: PublicSiteInput, $slug: String!) {
    publicWork(input: $input, slug: $slug) {
      ...WorkDetailFields
    }
  }
`;

export const PUBLIC_ACHIEVEMENT_EVIDENCE_QUERY = /* GraphQL */ `
  ${PUBLIC_EVIDENCE}
  query PublicAchievementEvidence($input: PublicSiteInput, $slug: String!) {
    publicAchievementEvidence(input: $input, slug: $slug) {
      ...PublicEvidenceFields
    }
  }
`;

export const TRANSPARENCY_QUERY = /* GraphQL */ `
  ${WORK_IMAGE}
  ${WORK_CARD}
  query Transparency($input: PublicSiteInput) {
    transparencySummary(input: $input) {
      verifiedWorks
      ongoingWorks
      proposedWorks
      completedWorks
      publishedWorks
      evidenceBackedWorks
      evidenceCoveragePct
      verifiedAchievements
      categories {
        category
        count
      }
      areas {
        area
        count
      }
      areasCovered
      generatedAt
    }
    transparencyRecentlyVerified(input: $input, limit: 6) {
      ...WorkCardFields
    }
  }
`;

export const TRANSPARENCY_AREAS_QUERY = /* GraphQL */ `
  query TransparencyAreas($input: PublicSiteInput) {
    transparencyAreas(input: $input) {
      area
      count
    }
  }
`;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type WorkSubjectType = 'PROJECT' | 'ACHIEVEMENT';

export interface AdminEvidence extends PublicEvidence {
  subjectType: WorkSubjectType;
  subjectId: string;
  internalNote: string | null;
  isPublic: boolean;
  sortOrder: number;
  uploadedBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationQueueEntry {
  subjectType: WorkSubjectType;
  id: string;
  slug: string;
  title: string;
  category: ContentCategory;
  area: string | null;
  status: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  verification: VerificationStatus;
  submittedForReviewAt: string | null;
  assignedReviewer: { id: string; fullName: string } | null;
  submittedBy: { id: string; fullName: string } | null;
  evidenceCount: number;
  updatedAt: string;
}

export interface VerificationHistoryEntry {
  id: string;
  action:
    | 'SUBMITTED_FOR_REVIEW'
    | 'REVIEWER_ASSIGNED'
    | 'REVIEW_STARTED'
    | 'VERIFIED'
    | 'REJECTED'
    | 'VERIFICATION_WITHDRAWN'
    | 'EVIDENCE_CHANGED';
  fromStatus: VerificationStatus | null;
  toStatus: VerificationStatus | null;
  reason: string | null;
  actor: { id: string; fullName: string } | null;
  createdAt: string;
}

const ADMIN_EVIDENCE = /* GraphQL */ `
  fragment AdminEvidenceFields on AdminWorkEvidence {
    id
    subjectType
    subjectId
    title
    description
    evidenceType
    sourceNote
    internalNote
    referenceNumber
    issuingAuthority
    issuedOn
    capturedOn
    capturedLocation
    isPublic
    sortOrder
    documentId
    documentName
    documentMimeType
    isImage
    uploadedBy {
      id
      fullName
    }
    createdAt
    updatedAt
  }
`;

export const VERIFICATION_QUEUE_QUERY = /* GraphQL */ `
  query VerificationQueue($filter: VerificationQueueFilterInput) {
    verificationQueue(filter: $filter) {
      subjectType
      id
      slug
      title
      category
      area
      status
      verification
      submittedForReviewAt
      assignedReviewer {
        id
        fullName
      }
      submittedBy {
        id
        fullName
      }
      evidenceCount
      updatedAt
    }
  }
`;

export const WORK_EVIDENCE_QUERY = /* GraphQL */ `
  ${ADMIN_EVIDENCE}
  query WorkEvidence($subjectType: WorkSubjectType!, $subjectId: ID!) {
    workEvidence(subjectType: $subjectType, subjectId: $subjectId) {
      ...AdminEvidenceFields
    }
  }
`;

export const VERIFICATION_HISTORY_QUERY = /* GraphQL */ `
  query VerificationHistory($subjectType: WorkSubjectType!, $subjectId: ID!) {
    verificationHistory(subjectType: $subjectType, subjectId: $subjectId) {
      id
      action
      fromStatus
      toStatus
      reason
      actor {
        id
        fullName
      }
      createdAt
    }
  }
`;

export const DECIDE_VERIFICATION = /* GraphQL */ `
  mutation DecideWorkVerification(
    $subjectType: WorkSubjectType!
    $subjectId: ID!
    $decision: ReviewDecision!
    $reason: String
  ) {
    decideWorkVerification(
      subjectType: $subjectType
      subjectId: $subjectId
      decision: $decision
      reason: $reason
    ) {
      id
      verification
      verifiedAt
    }
  }
`;

export const SUBMIT_FOR_VERIFICATION = /* GraphQL */ `
  mutation SubmitWorkForVerification($subjectType: WorkSubjectType!, $subjectId: ID!) {
    submitWorkForVerification(subjectType: $subjectType, subjectId: $subjectId) {
      id
      verification
      submittedForReviewAt
    }
  }
`;

export const WITHDRAW_VERIFICATION = /* GraphQL */ `
  mutation WithdrawWorkVerification(
    $subjectType: WorkSubjectType!
    $subjectId: ID!
    $reason: String!
  ) {
    withdrawWorkVerification(subjectType: $subjectType, subjectId: $subjectId, reason: $reason) {
      id
      verification
    }
  }
`;

export const ADD_EVIDENCE = /* GraphQL */ `
  ${ADMIN_EVIDENCE}
  mutation AddWorkEvidence(
    $subjectType: WorkSubjectType!
    $subjectId: ID!
    $input: WorkEvidenceInput!
  ) {
    addWorkEvidence(subjectType: $subjectType, subjectId: $subjectId, input: $input) {
      ...AdminEvidenceFields
    }
  }
`;

export const SET_EVIDENCE_VISIBILITY = /* GraphQL */ `
  ${ADMIN_EVIDENCE}
  mutation SetWorkEvidenceVisibility($evidenceId: ID!, $isPublic: Boolean!) {
    setWorkEvidenceVisibility(evidenceId: $evidenceId, isPublic: $isPublic) {
      ...AdminEvidenceFields
    }
  }
`;

export const REMOVE_EVIDENCE = /* GraphQL */ `
  mutation RemoveWorkEvidence($evidenceId: ID!) {
    removeWorkEvidence(evidenceId: $evidenceId) {
      success
    }
  }
`;
