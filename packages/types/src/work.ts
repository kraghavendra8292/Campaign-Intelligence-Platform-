import type { VerificationStatus as ContentVerificationStatus } from './content';

/**
 * Phase 9 - verified work, evidence and public transparency.
 *
 * THE ONE IDEA THIS FILE EXISTS TO PROTECT: a claim, the evidence for it, the
 * verification of that evidence, and the publication of the result are FOUR
 * different things done by (potentially) four different people at four
 * different times. Collapsing any two of them is how a transparency system
 * starts telling people something it has not actually checked.
 *
 * The platform already had two of the four before this phase:
 *
 *   CLAIM       `Project` (a work) and `Achievement` (an accomplishment)
 *   PUBLICATION `ContentStatus` + the entity's `_PUBLISH` permission
 *
 * Phase 9 completes the other two rather than inventing parallel copies:
 *
 *   EVIDENCE     `WorkEvidence`, attachable to either subject
 *   VERIFICATION `VerificationStatus` on the subject, with an immutable
 *                `VerificationEvent` history behind it
 *
 * There is deliberately no fifth status enum. Publication keeps using
 * `ContentStatus` and verification keeps using `VerificationStatus`; the phase
 * adds exactly one member (`REJECTED`) to the latter.
 */

// ---------------------------------------------------------------------------
// What can be evidenced and verified
// ---------------------------------------------------------------------------

/**
 * The two kinds of record a citizen can be shown and staff can verify.
 *
 * A discriminated subject rather than a third "work" entity. Phase 3 already
 * models a work (`Project`: planned, in progress, completed, with dates,
 * location, cost and before/after media) and a claim of accomplishment
 * (`Achievement`: with evidence and a verification flag). Adding a third table
 * spanning both would have duplicated whichever one it resembled more, and left
 * the public site with two answers to "what work was done here?".
 */
export const WORK_SUBJECT_TYPES = ['PROJECT', 'ACHIEVEMENT'] as const;
export type WorkSubjectType = (typeof WORK_SUBJECT_TYPES)[number];

export function isWorkSubjectType(value: unknown): value is WorkSubjectType {
  return typeof value === 'string' && (WORK_SUBJECT_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Evidence classification
// ---------------------------------------------------------------------------

/**
 * What kind of thing a piece of evidence is.
 *
 * THIS IS A DESCRIPTION OF THE ARTEFACT, NOT AN ASSERTION ABOUT ITS AUTHORITY.
 * Choosing `GOVERNMENT_ORDER` records what a staff member says the document is;
 * it does not make the platform's badge say "government verified", and nothing
 * in this phase treats one type as self-authenticating. A forged work order and
 * a genuine one are the same `WORK_ORDER` to this enum - which is precisely why
 * a human reviewer, not a type, decides whether a claim is verified.
 */
export const EVIDENCE_TYPES = [
  /** A formal document from an authority, not covered by a narrower type. */
  'OFFICIAL_DOCUMENT',
  /** Authorisation to begin work. */
  'WORK_ORDER',
  /** Attestation that work finished. */
  'COMPLETION_CERTIFICATE',
  /** A numbered order issued by a government body. */
  'GOVERNMENT_ORDER',
  /** Correspondence from an official body. */
  'OFFICIAL_LETTER',
  /** A photograph taken before work began. */
  'BEFORE_PHOTO',
  /** A photograph taken while work was under way. */
  'DURING_PHOTO',
  /** A photograph taken after work finished. */
  'AFTER_PHOTO',
  /** A photograph of the work that is not a before/during/after pair member. */
  'PROJECT_PHOTO',
  /** Press or published coverage. */
  'PRESS_DOCUMENTATION',
  /** A record already in the public domain. */
  'PUBLIC_RECORD',
  /** Anything else. Deliberately last, and deliberately unglamorous. */
  'OTHER',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export function isEvidenceType(value: unknown): value is EvidenceType {
  return typeof value === 'string' && (EVIDENCE_TYPES as readonly string[]).includes(value);
}

/**
 * The types that place a photograph in a before / during / after sequence.
 *
 * Used by the public gallery to group images. A photograph is only ever shown
 * as "before" because somebody explicitly classified it that way - the gallery
 * never infers a pairing from upload order or filename, because two photographs
 * side by side under those labels is an assertion about cause and effect.
 */
export const SEQUENCE_EVIDENCE_TYPES: readonly EvidenceType[] = [
  'BEFORE_PHOTO',
  'DURING_PHOTO',
  'AFTER_PHOTO',
];

export function isSequenceEvidenceType(type: EvidenceType): boolean {
  return SEQUENCE_EVIDENCE_TYPES.includes(type);
}

/** Evidence types that are photographs rather than documents. */
export const IMAGE_EVIDENCE_TYPES: readonly EvidenceType[] = [
  'BEFORE_PHOTO',
  'DURING_PHOTO',
  'AFTER_PHOTO',
  'PROJECT_PHOTO',
];

export function isImageEvidenceType(type: EvidenceType): boolean {
  return IMAGE_EVIDENCE_TYPES.includes(type);
}

/** Human-readable labels, used by the admin console and the public page. */
export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  OFFICIAL_DOCUMENT: 'Official document',
  WORK_ORDER: 'Work order',
  COMPLETION_CERTIFICATE: 'Completion certificate',
  GOVERNMENT_ORDER: 'Government order',
  OFFICIAL_LETTER: 'Official letter',
  BEFORE_PHOTO: 'Before',
  DURING_PHOTO: 'During',
  AFTER_PHOTO: 'After',
  PROJECT_PHOTO: 'Photograph',
  PRESS_DOCUMENTATION: 'Press coverage',
  PUBLIC_RECORD: 'Public record',
  OTHER: 'Supporting record',
};

// ---------------------------------------------------------------------------
// Verification vocabulary
// ---------------------------------------------------------------------------

/**
 * The verification vocabulary lives in `content.ts`, where Phase 3 put it.
 *
 * Re-exported under a clearer name rather than redefined: a second list would
 * be a second thing to keep in step, and the first time they disagreed one half
 * of the codebase would accept a status the other rejects.
 */
export type VerificationStatusValue = ContentVerificationStatus;

/**
 * What happened to a claim's verification, as recorded in the history.
 *
 * Separate from the status because a status is a state and these are events:
 * "submitted, rejected, evidence updated, submitted again, verified" is a story
 * the status alone cannot tell, and it is exactly the story somebody needs when
 * they ask why a claim carries a badge.
 */
export const VERIFICATION_EVENT_ACTIONS = [
  'SUBMITTED_FOR_REVIEW',
  'REVIEWER_ASSIGNED',
  'REVIEW_STARTED',
  'VERIFIED',
  'REJECTED',
  'VERIFICATION_WITHDRAWN',
  /** Evidence changed underneath a decision. See `EVIDENCE_CHANGE_REOPENS`. */
  'EVIDENCE_CHANGED',
] as const;
export type VerificationEventAction = (typeof VERIFICATION_EVENT_ACTIONS)[number];

/**
 * Decisions a reviewer can record.
 *
 * Deliberately only two. "Needs more evidence" is a rejection with a reason -
 * giving it its own outcome would create a third state that is neither verified
 * nor rejected, which is where claims go to sit forever.
 */
export const REVIEW_DECISIONS = ['VERIFY', 'REJECT'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/**
 * A rejection must say why, and the reason is internal.
 *
 * Required because a rejection without a reason is unactionable: the person who
 * submitted the claim cannot fix it, and the next reviewer cannot tell whether
 * the evidence was wrong, missing or simply unread.
 */
export const REJECTION_REASON_MIN_LENGTH = 10;
export const REJECTION_REASON_MAX_LENGTH = 2000;

/**
 * Whether changing evidence under a decided claim reopens its verification.
 *
 * TRUE, and this is the rule that keeps a verified badge honest. Without it the
 * attack is trivial and needs no special access: submit a claim with sound
 * evidence, get it verified, then swap the evidence for something else. The
 * badge would still say VERIFIED and would now be attesting to a document no
 * reviewer ever saw.
 */
export const EVIDENCE_CHANGE_REOPENS = true;

/** Verification states where an evidence change invalidates the decision. */
export const DECIDED_VERIFICATION_STATUSES: readonly VerificationStatusValue[] = [
  'VERIFIED',
  'REJECTED',
];

export function isDecidedVerification(status: VerificationStatusValue): boolean {
  return DECIDED_VERIFICATION_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Public work status
// ---------------------------------------------------------------------------

/**
 * How a work is described to the public.
 *
 * Derived from Phase 3's `ProjectStatus`, never stored separately - a second
 * copy is a second thing to keep in step, and the first time they disagree the
 * public site is the one that is wrong. `CANCELLED` deliberately has no public
 * label of its own and is not listed publicly at all: a cancelled work is not a
 * transparency claim, and showing it beside completed work invites it to be
 * read as one.
 */
export const PUBLIC_WORK_STATUSES = ['PROPOSED', 'ONGOING', 'COMPLETED'] as const;
export type PublicWorkStatus = (typeof PUBLIC_WORK_STATUSES)[number];

/** Maps the stored `ProjectStatus` onto what a citizen is shown. */
export function publicWorkStatusFor(projectStatus: string): PublicWorkStatus | null {
  switch (projectStatus) {
    case 'PLANNED':
      return 'PROPOSED';
    case 'IN_PROGRESS':
    case 'ON_HOLD':
      // ON_HOLD is shown as ongoing rather than given its own badge: the work
      // is still committed and not yet done, which is what "ongoing" means to
      // a reader. A separate "paused" badge would invite speculation about why.
      return 'ONGOING';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return null;
  }
}

export const PUBLIC_WORK_STATUS_LABELS: Record<PublicWorkStatus, string> = {
  PROPOSED: 'Proposed',
  ONGOING: 'Ongoing',
  COMPLETED: 'Completed',
};

// ---------------------------------------------------------------------------
// Publication quality rules
// ---------------------------------------------------------------------------

/**
 * Words a public claim may not contain.
 *
 * Superlatives and absolutes are not merely bad writing here: "100% completed"
 * and "everyone benefited" are quantitative claims that the platform has no
 * data to support, and a transparency system that prints them is asserting
 * something no evidence in it establishes.
 *
 * This is a *blocking* check on publication rather than a suggestion, and the
 * error names the phrase so the author can rewrite it rather than guess.
 */
export const UNSUPPORTED_CLAIM_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\b100\s*%\s*(complete|completed|success|successful)\b/i, label: '100% complete' },
  { pattern: /\bevery(one|body)\s+(benefit|gained|received)/i, label: 'everyone benefited' },
  {
    pattern: /\ball\s+(citizens|residents|people)\s+(benefit|gained|received)/i,
    label: 'all citizens benefited',
  },
  { pattern: /\b(most|greatest)\s+successful\b/i, label: 'most successful' },
  { pattern: /\bhistoric(al)?\s+achievement\b/i, label: 'historic achievement' },
  { pattern: /\bunprecedented\b/i, label: 'unprecedented' },
  { pattern: /\bworld[- ]class\b/i, label: 'world-class' },
  { pattern: /\bbest\s+in\s+(the\s+)?(state|country|district)\b/i, label: 'best in the state' },
];

/** Returns the labels of any unsupported claims found in a block of text. */
export function findUnsupportedClaims(text: string): string[] {
  const found: string[] = [];
  for (const { pattern, label } of UNSUPPORTED_CLAIM_PATTERNS) {
    if (pattern.test(text)) found.push(label);
  }
  return found;
}

/**
 * What must be true before a claim can be published.
 *
 * Note what is NOT here: evidence. A proposed road is a legitimate public
 * statement with nothing to evidence yet, and demanding a document would push
 * staff to attach something irrelevant to satisfy a checkbox. Evidence gates
 * the VERIFIED badge, not publication - which is the claim/verification split
 * this whole file exists to hold.
 */
export interface PublicationReadiness {
  readonly ready: boolean;
  readonly problems: readonly string[];
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Phase 9 permissions.
 *
 * `ACHIEVEMENT_VERIFY` already existed and is deliberately kept as the grant
 * that decides an achievement's verification, so no role's existing authority
 * changes silently. The new grants cover what Phase 3 had no concept of:
 *
 *  - `EVIDENCE_READ` - seeing evidence that is not public, including the
 *    internal note explaining how a claim was checked. Separate from
 *    `CONTENT_READ_UNPUBLISHED` because a draft and a source's identity are
 *    different disclosures.
 *  - `EVIDENCE_MANAGE` - attaching, editing and removing evidence.
 *  - `WORK_VERIFY` - recording a verification decision on a PROJECT, the
 *    subject that had no verification concept before this phase.
 *  - `VERIFICATION_REVIEW` - working the queue: assigning a reviewer, starting
 *    a review. Held more widely than the decision grants, because triaging what
 *    needs looking at is not the same as deciding the answer.
 */
export const WORK_PERMISSIONS = [
  'EVIDENCE_READ',
  'EVIDENCE_MANAGE',
  'WORK_VERIFY',
  'VERIFICATION_REVIEW',
] as const;
export type WorkPermission = (typeof WORK_PERMISSIONS)[number];

export function describeWorkPermission(permission: WorkPermission): string {
  const descriptions: Record<WorkPermission, string> = {
    EVIDENCE_READ: 'View evidence that has not been made public, including internal review notes.',
    EVIDENCE_MANAGE: 'Attach, edit and remove supporting evidence on works and achievements.',
    WORK_VERIFY: 'Record a verification decision on a development project after checking evidence.',
    VERIFICATION_REVIEW: 'Work the verification queue: assign reviewers and start reviews.',
  };
  return descriptions[permission];
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Evidence items per subject. Generous, but not unbounded. */
export const MAX_EVIDENCE_PER_SUBJECT = 40;

/** Public list page size, tuned for a phone on mobile data. */
export const PUBLIC_WORK_PAGE_SIZE = 12;

/**
 * Evidence coverage is only meaningful once there is something to divide by.
 *
 * Below this, the percentage swings wildly on one record and reads as a
 * measurement rather than the noise it is, so the API returns null and the page
 * shows an em dash - the same `null`-is-not-zero rule Phase 7 established.
 */
export const MIN_PUBLISHED_FOR_COVERAGE = 1;
