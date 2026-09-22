/**
 * Phase 8 citizen communication: vocabulary, limits and permissions.
 *
 * SCOPE NOTE, extending the ones in `issues.ts`, `ai.ts` and `analytics.ts`.
 *
 * This is the first phase in which the platform SPEAKS TO A CITIZEN rather than
 * only listening to them, which makes it the phase where the product could most
 * easily become something else. A channel that can send a person a message
 * about their pothole is, mechanically, a channel that could send them a
 * campaign slogan.
 *
 * So the boundary is structural, not editorial:
 *
 *  - Every notification is ABOUT ONE ISSUE. There is no recipient list, no
 *    segment, no broadcast, and no model in this phase that could hold one.
 *    `IssueNotification` requires an `issueId`; there is nowhere to put a
 *    message that is not a reply to something a citizen reported.
 *  - Every template is a FIXED, VERSIONED CONSTANT in this codebase. There is
 *    no admin-authored template, no template table, and no path from a text
 *    field to the body of an outbound message.
 *  - Consent is PER ISSUE and single-purpose. There is no marketing flag to
 *    bundle it with, because there is no marketing.
 *
 * Nothing here can hold a political opinion, a score, an affiliation or an
 * inference about a person, and nothing can address a citizen about anything
 * other than the problem they chose to report.
 */

// ---------------------------------------------------------------------------
// Public updates
// ---------------------------------------------------------------------------

/**
 * Lifecycle of a staff-authored message to the citizen.
 *
 * DRAFT is the default and the reason the whole table is safe: a row exists
 * before anybody has decided to publish it, so writing and publishing are two
 * separate acts requiring two separate permissions.
 *
 * ARCHIVED withdraws an update from the public page but does not delete it -
 * the citizen may already have read it, and the record of what they were told
 * is exactly what an argument six months later turns on.
 */
export const PUBLIC_UPDATE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type PublicUpdateStatus = (typeof PUBLIC_UPDATE_STATUSES)[number];

/**
 * Statuses a citizen is shown on the public timeline.
 *
 * The Phase 5 vocabulary, unchanged, but note what the timeline PROJECTS: only
 * the status and the date. `IssueHistory.detail` carries staff-oriented context
 * ("Assigned to Priya") and is never read by the public path.
 */
export const PUBLIC_TIMELINE_ACTIONS = ['SUBMITTED', 'STATUS_CHANGED'] as const;
export type PublicTimelineAction = (typeof PUBLIC_TIMELINE_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Follow-up
// ---------------------------------------------------------------------------

/**
 * What the citizen said when asked whether their problem was fixed.
 *
 * Three answers rather than a yes/no, because "partially" is the common and
 * most actionable case - the drain was cleared but the road was left broken -
 * and forcing it into "no" would turn a useful signal into a reopen request
 * that overstates the disagreement.
 */
export const FOLLOW_UP_RESPONSES = ['RESOLVED', 'PARTIALLY_RESOLVED', 'NOT_RESOLVED'] as const;
export type FollowUpResponse = (typeof FOLLOW_UP_RESPONSES)[number];

/**
 * Where a follow-up has got to administratively.
 *
 * SUBMITTED → REVIEWED, and nothing else. Crucially there is no state in which
 * a citizen's answer has CHANGED the issue: a follow-up records what somebody
 * said, and any consequence is a separate act by a staff member through the
 * ordinary Phase 5 status path.
 */
export const FOLLOW_UP_STATUSES = ['SUBMITTED', 'REVIEWED'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

/** What a reviewer decided about a reopen request. */
export const FOLLOW_UP_OUTCOMES = ['REOPENED', 'KEPT_CLOSED', 'ACKNOWLEDGED'] as const;
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

/**
 * Responses that raise a reopen request for a human to look at.
 *
 * `NOT_RESOLVED` only. "Partially" is recorded and surfaced, but it is not a
 * disagreement with the closure - treating it as one would put every partially
 * satisfied citizen into a queue that should hold the genuinely unresolved.
 */
export const REOPEN_REQUESTING_RESPONSES: readonly FollowUpResponse[] = ['NOT_RESOLVED'];

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Channels the platform can deliver through.
 *
 * SMS is declared but NOT implemented, and that is deliberate rather than an
 * oversight: no SMS provider is configured anywhere in this project, and
 * shipping a channel that silently drops messages would be worse than not
 * offering it. The enum member exists so the delivery table and the provider
 * registry have a place to put it, and `isChannelSupported` is the single
 * function that decides what the UI may offer.
 */
export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Channels with a working provider. SMS is intentionally absent. */
export const SUPPORTED_NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['EMAIL'];

export function isChannelSupported(channel: NotificationChannel): boolean {
  return SUPPORTED_NOTIFICATION_CHANNELS.includes(channel);
}

/**
 * The events that can produce a message. The complete list.
 *
 * Every one is a fact about the citizen's own issue. There is deliberately no
 * event that is not caused by something happening to a submission - no
 * announcement, no digest, no campaign event - so there is no code path that
 * could send a person a message they did not ask for by reporting a problem.
 */
export const NOTIFICATION_EVENTS = [
  'ISSUE_RECEIVED',
  'ISSUE_STATUS_CHANGED',
  'PUBLIC_UPDATE_PUBLISHED',
  'ISSUE_RESOLVED',
  'ISSUE_REOPENED',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/**
 * Delivery state.
 *
 * SKIPPED is distinct from FAILED and the difference matters operationally: a
 * skipped notification is one the system correctly chose not to send (consent
 * withdrawn, channel unsupported, no destination), and counting those as
 * failures would make a healthy deployment look broken and bury the real
 * failures in the dashboard.
 */
export const NOTIFICATION_STATUSES = [
  'QUEUED',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'SKIPPED',
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Terminal states. A notification in one of these is never retried. */
export const TERMINAL_NOTIFICATION_STATUSES: readonly NotificationStatus[] = [
  'SENT',
  'DELIVERED',
  'SKIPPED',
];

/** Why a send did not succeed. Categories, never a provider's raw error. */
export const NOTIFICATION_FAILURE_KINDS = [
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_REJECTED',
  'TIMEOUT',
  'INVALID_DESTINATION',
  'NOT_CONFIGURED',
  'RATE_LIMITED',
  'UNKNOWN',
] as const;
export type NotificationFailureKind = (typeof NOTIFICATION_FAILURE_KINDS)[number];

/**
 * Attempts before a notification is abandoned.
 *
 * Low on purpose. A message about a pothole that is three days late is not
 * worth the queue pressure of a long retry schedule, and an unbounded retry
 * against a misconfigured provider is how a mailbox gets flooded once the
 * configuration is fixed.
 */
export const NOTIFICATION_MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Template identifiers, versioned like Phase 6's prompts and for the same
 * reason: a row records which template produced it, so "why did this message
 * read like that?" has an answer later. Bump rather than edit in place.
 */
export const NOTIFICATION_TEMPLATE_VERSIONS = {
  ISSUE_RECEIVED: 'ISSUE_RECEIVED_V1',
  ISSUE_STATUS_CHANGED: 'ISSUE_STATUS_CHANGED_V1',
  PUBLIC_UPDATE_PUBLISHED: 'PUBLIC_UPDATE_PUBLISHED_V1',
  ISSUE_RESOLVED: 'ISSUE_RESOLVED_V1',
  ISSUE_REOPENED: 'ISSUE_REOPENED_V1',
} as const satisfies Record<NotificationEvent, string>;

/**
 * The ONLY variables a template may interpolate.
 *
 * An allow-list rather than "whatever the caller passes", because the failure
 * this prevents is specific and severe: a template that could reference
 * `{{contactPhone}}` or `{{internalNote}}` would put that value into an
 * outbound message the moment somebody added the variable to a template string.
 * The renderer rejects any placeholder not on this list, so the leak cannot be
 * introduced by editing a template alone.
 *
 * Note what is absent and must stay absent: the citizen's name, email, phone,
 * the issue title, the description, staff names, internal notes, AI summaries.
 * The TITLE in particular is excluded - a citizen wrote it and sometimes fills
 * it with personal circumstance, and an email subject line is the least private
 * place on the internet.
 */
export const NOTIFICATION_TEMPLATE_VARIABLES = [
  'issueReference',
  'status',
  'statusLabel',
  'categoryLabel',
  'submittedDate',
  'updatedDate',
  'publicUpdate',
  'organizationName',
  'trackingUrl',
  'unsubscribeUrl',
] as const;
export type NotificationTemplateVariable = (typeof NOTIFICATION_TEMPLATE_VARIABLES)[number];

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const COMMUNICATION_LIMITS = {
  /** A public update. Long enough to explain, short enough to stay a note. */
  publicUpdateMin: 10,
  publicUpdateMax: 2000,
  /** A citizen's follow-up comment. */
  followUpCommentMax: 2000,
  /** Email destination, matching the Phase 5 contact column. */
  destinationMax: 254,
  /** Rows per page in the admin communication list. */
  communicationPageSize: 25,
  /** Public updates returned to a citizen in one request. */
  publicUpdatePageSize: 20,
  /** Timeline entries returned to a citizen. */
  publicTimelineMax: 50,
} as const;

/**
 * Bytes of entropy in a tracking token.
 *
 * 32 bytes, rendered as 64 hex characters. Far beyond what is needed to defeat
 * guessing, and chosen to match the Phase 2 reset-token shape so both hash into
 * the same 64-character column and neither looks unusual beside the other.
 */
export const TRACKING_TOKEN_BYTES = 32;

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Phase 8 permissions.
 *
 * Four, and the split follows the same principle as Phase 6's AI grants:
 * separate the acts whose consequences differ.
 *
 *  - `COMMUNICATION_READ`    - see what was sent and what was published. The
 *    baseline for anybody working the issue queue.
 *  - `COMMUNICATION_PUBLISH` - make a message VISIBLE TO A CITIZEN. Held apart
 *    from writing a draft, because publishing is the organisation speaking, and
 *    an update cannot be unsaid once somebody has read it.
 *  - `COMMUNICATION_SEND`    - cause an outbound message, and retry a failed
 *    one. Separate because it reaches somebody's inbox rather than a page they
 *    chose to visit.
 *  - `FOLLOW_UP_REVIEW`      - decide what to do about a citizen saying their
 *    problem is not fixed. The act that closes the loop.
 *
 * Drafting deliberately has NO permission of its own: writing a draft nobody
 * can see is not a disclosure, and gating it would mean an issue handler could
 * not prepare the text for a colleague to publish.
 */
export const COMMUNICATION_PERMISSIONS = [
  'COMMUNICATION_READ',
  'COMMUNICATION_PUBLISH',
  'COMMUNICATION_SEND',
  'FOLLOW_UP_REVIEW',
] as const;

export type CommunicationPermission = (typeof COMMUNICATION_PERMISSIONS)[number];

export function describeCommunicationPermission(permission: CommunicationPermission): string {
  const descriptions: Record<CommunicationPermission, string> = {
    COMMUNICATION_READ: 'View public updates, notifications and citizen follow-up on submissions.',
    COMMUNICATION_PUBLISH:
      'Publish an update so the citizen can read it. Separate from writing a draft.',
    COMMUNICATION_SEND: 'Send and retry notifications to citizens who consented to them.',
    FOLLOW_UP_REVIEW: 'Review citizen follow-up and decide whether to reopen a submission.',
  };
  return descriptions[permission];
}

// ---------------------------------------------------------------------------
// Public status vocabulary
// ---------------------------------------------------------------------------

/**
 * Status wording shown to a member of the public.
 *
 * Carried over from the Phase 5 tracking page rather than re-invented, so a
 * citizen reading the timeline and a citizen reading the status card see the
 * same words. "REJECTED" in particular reads far harsher than the
 * administrative decision it represents.
 */
export const PUBLIC_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Received',
  UNDER_REVIEW: 'Under review',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'Being worked on',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Closed without action',
};
