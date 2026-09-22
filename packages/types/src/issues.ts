/**
 * Phase 5 citizen feedback and issue reporting: vocabulary and permissions.
 *
 * SCOPE NOTE, and it is the most important thing in this file. Everything here
 * describes a REPORTED PROBLEM and the campaign's handling of it. Nothing
 * describes the person who reported it.
 *
 * There is deliberately no enum member, field or permission that could hold a
 * political opinion, an affiliation, a supporter or opponent score, a voting
 * intention, or any inference drawn from what somebody chose to report. A
 * citizen writing about a broken drain has told us about a drain. That absence
 * is a product requirement, and anything added here must preserve it.
 */

// ---------------------------------------------------------------------------
// Submission type
// ---------------------------------------------------------------------------

/**
 * What the citizen came to say.
 *
 * Four kinds rather than one, because they need different handling: a complaint
 * is triaged, a suggestion is considered, and treating them identically would
 * either over-escalate every idea or bury every grievance.
 *
 * The reference prefix differs per type so a citizen quoting "SUG-2026-…" over
 * the phone has already told the staff member what kind of thing it is.
 */
export const SUBMISSION_TYPES = ['FEEDBACK', 'ISSUE', 'SUGGESTION', 'COMPLAINT'] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

export const SUBMISSION_TYPE_PREFIX: Record<SubmissionType, string> = {
  FEEDBACK: 'FB',
  ISSUE: 'ISS',
  SUGGESTION: 'SUG',
  COMPLAINT: 'CMP',
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Where the submission has got to.
 *
 * The happy path is SUBMITTED → UNDER_REVIEW → ACKNOWLEDGED → IN_PROGRESS →
 * RESOLVED → CLOSED, but not every submission travels all of it: a suggestion
 * may go straight from UNDER_REVIEW to CLOSED, and a duplicate may be REJECTED.
 * The transition map below encodes what is *reachable*, not a mandatory queue.
 */
export const ISSUE_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/**
 * Permitted transitions.
 *
 * Enumerated rather than "set status to anything", so an accidental jump from
 * SUBMITTED straight to CLOSED - which would skip the acknowledgement a citizen
 * is waiting for - is a rejected request rather than a silent one. REJECTED is
 * reachable from every open state because spam and out-of-scope reports can be
 * recognised at any point.
 *
 * CLOSED and REJECTED are terminal, with one exception: CLOSED can reopen to
 * IN_PROGRESS, because "we thought this was fixed and it was not" is a real and
 * common situation, and forcing the citizen to re-report it would lose the
 * history.
 */
export const ISSUE_STATUS_TRANSITIONS: Record<IssueStatus, readonly IssueStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'ACKNOWLEDGED', 'REJECTED'],
  UNDER_REVIEW: ['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED', 'REJECTED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'],
  REJECTED: [],
};

export function canTransition(from: IssueStatus, to: IssueStatus): boolean {
  return ISSUE_STATUS_TRANSITIONS[from].includes(to);
}

/** Statuses that mean the campaign has finished with the submission. */
export const TERMINAL_ISSUE_STATUSES: readonly IssueStatus[] = ['CLOSED', 'REJECTED'];

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

/**
 * Administrative triage only.
 *
 * Set by a person who has read the submission. Phase 5 deliberately does NOT
 * infer priority - not from keywords, not from a model, not from who reported
 * it. An automatically-escalated complaint is an unaccountable decision, and
 * the point of this field is that somebody owns it.
 */
export const ISSUE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const DEFAULT_ISSUE_PRIORITY: IssuePriority = 'MEDIUM';

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

/**
 * Whether a submission has been looked at by a human.
 *
 * Separate from `status` on purpose. Status is about the PROBLEM ("is the drain
 * fixed?"); moderation is about the SUBMISSION ("is this a real report, or
 * abuse?"). Conflating them would mean rejecting spam and closing a fixed
 * pothole were the same act.
 *
 * Everything arrives PENDING_REVIEW. Nothing is auto-approved and nothing is
 * auto-classified as spam - there is no automated moderation in Phase 5.
 */
export const MODERATION_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SPAM'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

/**
 * How the citizen arrived.
 *
 * ATTRIBUTION ONLY. This says which outreach channel worked, in exactly the
 * same sense as Phase 4's scan analytics. It is never used to characterise the
 * person who arrived through it, and no aggregate built on it may be presented
 * as anything other than a statement about the channel.
 */
export const ISSUE_SOURCES = ['DIRECT_WEBSITE', 'QR', 'CAMPAIGN_PAGE', 'OTHER'] as const;
export type IssueSource = (typeof ISSUE_SOURCES)[number];

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * Default category vocabulary, seeded per tenant.
 *
 * These are SEED DATA, not an enum: categories live in a table so a campaign
 * can deactivate the ones that do not apply to it, and so a future phase can
 * let administrators add their own. The list here is the starting point every
 * new organisation gets.
 */
export const DEFAULT_ISSUE_CATEGORIES = [
  { key: 'ROADS', label: 'Roads' },
  { key: 'WATER', label: 'Water supply' },
  { key: 'DRAINAGE', label: 'Drainage' },
  { key: 'ELECTRICITY', label: 'Electricity' },
  { key: 'SANITATION', label: 'Sanitation & waste' },
  { key: 'HEALTHCARE', label: 'Healthcare' },
  { key: 'EDUCATION', label: 'Education' },
  { key: 'TRANSPORT', label: 'Transport' },
  { key: 'PUBLIC_SAFETY', label: 'Public safety' },
  { key: 'AGRICULTURE', label: 'Agriculture' },
  { key: 'EMPLOYMENT', label: 'Employment' },
  { key: 'GOVERNMENT_SERVICES', label: 'Government services' },
  { key: 'ENVIRONMENT', label: 'Environment' },
  { key: 'OTHER', label: 'Something else' },
] as const;

// ---------------------------------------------------------------------------
// Issue history
// ---------------------------------------------------------------------------

/** What happened to a submission, for the timeline shown to staff. */
export const ISSUE_HISTORY_ACTIONS = [
  'SUBMITTED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'ASSIGNED',
  'UNASSIGNED',
  'CATEGORY_CHANGED',
  'LOCATION_UPDATED',
  'MODERATED',
  'NOTE_ADDED',
] as const;
export type IssueHistoryAction = (typeof ISSUE_HISTORY_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Field limits
// ---------------------------------------------------------------------------

/**
 * Length ceilings for citizen-supplied text.
 *
 * Generous enough that somebody describing a genuine problem is never cut off
 * mid-sentence, small enough that the endpoint cannot be used to store
 * megabytes of anything. Enforced server-side; the form shows the same numbers
 * so the limit is never a surprise at submit time.
 */
export const ISSUE_LIMITS = {
  titleMax: 160,
  descriptionMin: 10,
  descriptionMax: 5000,
  contactNameMax: 120,
  contactPhoneMax: 32,
  contactEmailMax: 254,
  locationTextMax: 160,
  addressMax: 500,
  noteMax: 4000,
  maxAttachments: 5,
  /** Tighter than the Phase 3 media ceiling: a citizen is on mobile data. */
  maxImageBytes: 5 * 1024 * 1024,
  maxDocumentBytes: 10 * 1024 * 1024,
} as const;

// ---------------------------------------------------------------------------
// Reference numbers
// ---------------------------------------------------------------------------

/**
 * Shape of the reference a citizen is given.
 *
 *   ISS-2026-7F3K9XQ2
 *   └┬┘ └─┬┘ └───┬──┘
 *    │    │      └── 8 random Crockford-style base32 characters
 *    │    └───────── year of submission, so age is obvious at a glance
 *    └────────────── submission type
 *
 * The random half is deliberate. A zero-padded counter would be friendlier to
 * read but would let anyone walk the range and learn how many submissions a
 * campaign has received - and, if tracking ever widened, read them. It also
 * leaks volume to a competitor. The alphabet omits I, L, O and U so a reference
 * read aloud over the phone cannot be mistranscribed as 1 or 0.
 */
export const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const REFERENCE_RANDOM_LENGTH = 8;

const REFERENCE_PATTERN = new RegExp(
  `^(?:${Object.values(SUBMISSION_TYPE_PREFIX).join('|')})-\\d{4}-[${REFERENCE_ALPHABET}]{${REFERENCE_RANDOM_LENGTH}}$`,
);

/**
 * Whether a string could be one of our references.
 *
 * Checked before the database is touched, so a flood of malformed lookups on
 * the public tracking endpoint costs a regex each rather than a query each.
 */
export function isIssueReference(value: string): boolean {
  return REFERENCE_PATTERN.test(value.trim().toUpperCase());
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Issue permissions.
 *
 * Hand-listed rather than generated from a grid, unlike the CMS and QR sets.
 * These do not form a clean entity × action product: reading a submission,
 * reading the citizen's phone number, and reading a colleague's internal note
 * are three different disclosures about three different people, and flattening
 * them into `ISSUE_READ` would be the single most likely way to leak a
 * citizen's contact details to somebody who only needed to see the backlog.
 *
 * Three deliberately separate grants:
 *
 *  - `ISSUE_CONTACT_READ`  - the citizen's name, phone and email. The most
 *    sensitive data this platform holds, volunteered on the understanding that
 *    it would be used to respond to them.
 *  - `ISSUE_NOTE_READ`     - staff notes about a citizen's report, written
 *    candidly because they are internal.
 *  - `ISSUE_ATTACHMENT_READ` - photographs of somebody's street, and sometimes
 *    of their home.
 */
export const ISSUE_PERMISSIONS = [
  'ISSUE_READ',
  'ISSUE_UPDATE',
  'ISSUE_ASSIGN',
  'ISSUE_STATUS_UPDATE',
  'ISSUE_PRIORITY_UPDATE',
  'ISSUE_MODERATE',
  'ISSUE_NOTE_READ',
  'ISSUE_NOTE_CREATE',
  'ISSUE_CONTACT_READ',
  'ISSUE_ATTACHMENT_READ',
  'ISSUE_ANALYTICS_READ',
  'ISSUE_CATEGORY_MANAGE',
] as const;

export type IssuePermission = (typeof ISSUE_PERMISSIONS)[number];

/** Human-readable descriptions for the seeded `permissions` table. */
export function describeIssuePermission(permission: IssuePermission): string {
  const descriptions: Record<IssuePermission, string> = {
    ISSUE_READ: 'View citizen submissions within the active tenant.',
    ISSUE_UPDATE: 'Edit a submission’s category, location and details.',
    ISSUE_ASSIGN: 'Assign or unassign a submission to a colleague.',
    ISSUE_STATUS_UPDATE: 'Move a submission through its status workflow.',
    ISSUE_PRIORITY_UPDATE: 'Set the administrative priority of a submission.',
    ISSUE_MODERATE: 'Approve, reject or mark a submission as spam.',
    ISSUE_NOTE_READ: 'Read internal staff notes on a submission.',
    ISSUE_NOTE_CREATE: 'Add an internal staff note to a submission.',
    ISSUE_CONTACT_READ:
      'View contact details a citizen voluntarily provided. Sensitive personal data.',
    ISSUE_ATTACHMENT_READ: 'View and download files a citizen attached to a submission.',
    ISSUE_ANALYTICS_READ: 'View aggregate submission analytics within the active tenant.',
    ISSUE_CATEGORY_MANAGE: 'Activate or deactivate submission categories.',
  };

  return descriptions[permission];
}
