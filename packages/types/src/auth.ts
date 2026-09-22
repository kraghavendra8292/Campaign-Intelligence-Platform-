import type { Permission } from './permissions';
import type { RoleKey } from './roles';
import type { OrganizationId, UserId } from './tenancy';

/**
 * Account lifecycle.
 *
 * Access is withdrawn by moving through these states, never by deleting the
 * user: audit records reference the actor, and deleting them would destroy the
 * history that makes the audit log worth keeping.
 */
export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Only ACTIVE accounts may authenticate or hold a live session. */
export const AUTHENTICATABLE_STATUSES: readonly UserStatus[] = ['ACTIVE'];

export function canAuthenticate(status: UserStatus): boolean {
  return AUTHENTICATABLE_STATUSES.includes(status);
}

export const ORGANIZATION_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * The authenticated caller, resolved fresh from the database on every request.
 *
 * Roles and permissions are deliberately NOT read from the access token: a
 * token minted before a role was revoked would otherwise keep working until it
 * expired. The token proves identity; the database decides authority.
 */
export interface AuthContext {
  readonly userId: UserId;
  readonly sessionId: string;
  readonly email: string;
  /** True when the user holds a PLATFORM-scoped role such as SUPER_ADMIN. */
  readonly isPlatformAdmin: boolean;
  /** The tenant this request is acting in; null for platform-level calls. */
  readonly organizationId: OrganizationId | null;
  /** Optional campaign scope within the active organisation. */
  readonly campaignId: string | null;
  /** Roles effective in the active scope (platform roles always included). */
  readonly roles: readonly RoleKey[];
  /** Permissions derived from `roles`. The authorization source of truth. */
  readonly permissions: readonly Permission[];
}

/** How the refresh credential is returned to a client. */
export const TOKEN_DELIVERY_MODES = ['COOKIE', 'BODY'] as const;
export type TokenDeliveryMode = (typeof TOKEN_DELIVERY_MODES)[number];

/** Audit actions recorded by Phase 2. Append to this list, never renumber. */
export const AUDIT_ACTIONS = [
  'AUTH_LOGIN_SUCCEEDED',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'AUTH_TOKEN_REFRESHED',
  'AUTH_REFRESH_REPLAY_DETECTED',
  'AUTH_PASSWORD_CHANGED',
  'AUTH_PASSWORD_RESET_REQUESTED',
  'AUTH_PASSWORD_RESET_COMPLETED',
  'SESSION_REVOKED',
  'USER_CREATED',
  'USER_INVITED',
  'USER_INVITATION_ACCEPTED',
  'USER_UPDATED',
  'USER_ACTIVATED',
  'USER_SUSPENDED',
  'USER_DISABLED',
  'ROLE_ASSIGNED',
  'ROLE_REVOKED',
  'ORGANIZATION_CREATED',
  'ORGANIZATION_UPDATED',
  'CAMPAIGN_CREATED',
  'CAMPAIGN_UPDATED',
  'CAMPAIGN_DELETED',

  // Phase 3 - CMS. Deliberately generic across entity types: the entity is
  // already recorded in `entityType`, so a per-entity action list would only
  // duplicate it and grow with every new content type.
  'CONTENT_CREATED',
  'CONTENT_UPDATED',
  'CONTENT_DELETED',
  'CONTENT_PUBLISHED',
  'CONTENT_UNPUBLISHED',
  'CONTENT_SUBMITTED_FOR_REVIEW',
  'CONTENT_ARCHIVED',
  'ACHIEVEMENT_VERIFIED',

  // Phase 4 - QR campaigns. Explicit per entity rather than generic, because
  // there are exactly two entities and their lifecycles differ in ways worth
  // being able to grep for. The new status travels in `metadata`.
  //
  // Public SCANS are deliberately absent: a scan is not an administrative act,
  // and writing millions of them into the audit trail would drown the security
  // record it exists to protect. Scans live in the analytics tables.
  'QR_CAMPAIGN_CREATED',
  'QR_CAMPAIGN_UPDATED',
  'QR_CAMPAIGN_STATUS_CHANGED',
  'QR_CODE_CREATED',
  'QR_CODE_UPDATED',
  'QR_CODE_STATUS_CHANGED',

  // Phase 5 - citizen submissions.
  //
  // ISSUE_SUBMITTED is recorded with a NULL actor: the submitter is a member of
  // the public, not a user, and there is deliberately nothing to attribute it
  // to. It is audited because a submission arriving is a tenant event worth a
  // durable record, not because anybody is being tracked.
  //
  // ISSUE_CONTACT_VIEWED is the one read that is audited. Every other read on
  // this platform is unlogged, but a staff member opening a citizen's phone
  // number is a disclosure of personal data somebody volunteered for a narrow
  // purpose, and it should leave a trace.
  'ISSUE_SUBMITTED',
  'ISSUE_UPDATED',
  'ISSUE_STATUS_CHANGED',
  'ISSUE_PRIORITY_CHANGED',
  'ISSUE_ASSIGNED',
  'ISSUE_UNASSIGNED',
  'ISSUE_CATEGORY_CHANGED',
  'ISSUE_MODERATED',
  'ISSUE_NOTE_ADDED',
  'ISSUE_CONTACT_VIEWED',

  // Phase 6 - AI issue intelligence.
  //
  // Two distinct things are audited here, and the distinction is the phase's
  // central claim. AI_PROCESSING_REQUESTED records that somebody spent money
  // asking a model a question. AI_OUTPUT_APPROVED records that somebody read
  // the answer and put the organisation's name behind it. The second is the
  // consequential act - it is the moment model output stops being a suggestion
  // - so it is audited separately and can be attributed to a named person.
  //
  // The GENERATION itself is deliberately NOT audited per call: that is
  // operational telemetry and lives in `ai_usage_logs`, where it can be
  // aggregated and expired without diluting the security record.
  'AI_PROCESSING_REQUESTED',
  'AI_OUTPUT_APPROVED',
  'AI_OUTPUT_REJECTED',
  'AI_OUTPUT_EDITED',
  'AI_OUTPUT_REGENERATED',
  'AI_CATEGORY_SUGGESTION_ACCEPTED',
  'AI_CATEGORY_SUGGESTION_REJECTED',
  'AI_THEMES_GENERATED',
  'AI_EXECUTIVE_SUMMARY_GENERATED',

  // Phase 7 - decision analytics.
  //
  // Only the EXPORT is audited, and only it should be. Viewing a dashboard is
  // an ordinary read of aggregate counts, and logging every dashboard load
  // would bury the security record under navigation noise - the same reasoning
  // that keeps QR scans and AI generations out of this list.
  //
  // An export is different in kind: it produces a file that leaves every access
  // control this platform has. Both the request and the completion are
  // recorded, so an export that failed or timed out still leaves a trace that
  // somebody asked for the data.
  'ANALYTICS_EXPORT_REQUESTED',
  'ANALYTICS_EXPORT_COMPLETED',

  // Phase 8 - citizen communication.
  //
  // This phase audits more densely than any before it, and the reason is that
  // it is the first in which the platform SPEAKS TO A MEMBER OF THE PUBLIC.
  // Every other phase's audit answers "who saw what"; these answer "who said
  // what, to whom, in the organisation's name" - which is the question that
  // matters when a citizen later says they were told something.
  //
  // PUBLISHED is audited separately from CREATED because drafting is private
  // and publishing is not: the second is the moment the organisation spoke.
  //
  // Citizen actions (follow-up, unsubscribe) are recorded with a NULL actor,
  // like ISSUE_SUBMITTED - the submitter is a member of the public, not a user,
  // and there is deliberately nothing to attribute it to.
  'PUBLIC_UPDATE_CREATED',
  'PUBLIC_UPDATE_PUBLISHED',
  'PUBLIC_UPDATE_ARCHIVED',
  'NOTIFICATION_QUEUED',
  'NOTIFICATION_SENT',
  'NOTIFICATION_FAILED',
  'NOTIFICATION_RETRIED',
  'ISSUE_SUBSCRIPTION_CREATED',
  'ISSUE_SUBSCRIPTION_STOPPED',
  'ISSUE_FOLLOW_UP_SUBMITTED',
  'ISSUE_FOLLOW_UP_REVIEWED',
  'ISSUE_REOPEN_REQUESTED',

  // Phase 9 - verified work and evidence.
  //
  // The question these answer is the one a journalist asks: on what basis does
  // this claim carry a verified badge, and who decided that? So the trail
  // records the DECISION and the MATERIAL SEPARATELY - a verification is only
  // as good as the evidence that was in front of the reviewer at the time, and
  // evidence that changed afterwards is exactly what an audit needs to surface.
  //
  // EVIDENCE_VISIBILITY_CHANGED is recorded apart from EVIDENCE_UPDATED because
  // it is the only evidence edit that is a DISCLOSURE: publishing a document
  // cannot be undone for anybody who already read it, and "who made this
  // public, and when" must be answerable without diffing update records.
  //
  // Reasons and internal notes are NEVER placed in audit metadata. The audit
  // log is readable by everyone holding AUDIT_READ, which is wider than
  // EVIDENCE_READ, so copying a reviewer's candid assessment into it would
  // route around the permission that exists to contain it.
  'WORK_EVIDENCE_ADDED',
  'WORK_EVIDENCE_UPDATED',
  'WORK_EVIDENCE_REMOVED',
  'WORK_EVIDENCE_VISIBILITY_CHANGED',
  'WORK_SUBMITTED_FOR_VERIFICATION',
  'WORK_REVIEWER_ASSIGNED',
  'WORK_REVIEW_STARTED',
  'WORK_VERIFIED',
  'WORK_VERIFICATION_REJECTED',
  'WORK_VERIFICATION_WITHDRAWN',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
