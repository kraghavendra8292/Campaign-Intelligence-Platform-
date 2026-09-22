import { ROLE_KEYS, type RoleKey } from './roles';
import {
  CONTENT_PERMISSIONS,
  CONTENT_SPECIAL_PERMISSIONS,
  describeContentPermission,
  type AnyContentPermission,
} from './content';
import {
  QR_GRID_PERMISSIONS,
  QR_SPECIAL_PERMISSIONS,
  describeQrPermission,
  type AnyQrPermission,
} from './qr';
import { ISSUE_PERMISSIONS, describeIssuePermission, type IssuePermission } from './issues';
import { AI_PERMISSIONS, describeAiPermission, type AiPermission } from './ai';
import {
  ANALYTICS_PERMISSIONS,
  describeAnalyticsPermission,
  type AnalyticsPermission,
} from './analytics';
import {
  COMMUNICATION_PERMISSIONS,
  describeCommunicationPermission,
  type CommunicationPermission,
} from './communication';
import { WORK_PERMISSIONS, describeWorkPermission, type WorkPermission } from './work';

/**
 * The complete set of Phase 2 permissions.
 *
 * Permissions - not roles - are what authorization is evaluated on. A resolver
 * asks "does this actor hold USER_UPDATE in this tenant?", never "is this actor
 * a CAMPAIGN_ADMIN?". That keeps the role matrix editable without hunting down
 * scattered role checks.
 *
 * Scope: foundational identity, access control and audit only. Permissions for
 * business features are added by the phase that introduces them - content in
 * Phase 3, QR campaigns in Phase 4 - and never pre-emptively.
 */
export const ACCESS_PERMISSIONS = [
  // Identity - users
  'USER_READ',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',

  // Access control - roles
  'ROLE_READ',
  'ROLE_ASSIGN',
  'ROLE_REVOKE',

  // Tenancy - organisations
  'ORGANIZATION_READ',
  'ORGANIZATION_UPDATE',
  'ORGANIZATION_CREATE',

  // Tenancy - campaigns
  'CAMPAIGN_READ',
  'CAMPAIGN_CREATE',
  'CAMPAIGN_UPDATE',
  'CAMPAIGN_DELETE',

  // Audit
  'AUDIT_READ',

  // Own account
  'PROFILE_READ',
  'PROFILE_UPDATE',

  // Session management
  'SESSION_READ_OWN',
  'SESSION_REVOKE_OWN',
  'SESSION_REVOKE_ANY',
] as const;

/**
 * Every permission in the platform.
 *
 * The CMS and QR halves are generated (see `content.ts` and `qr.ts`) so adding
 * an entity cannot leave it without permissions. The identity and issue halves
 * are explicit hand-maintained lists, because each of those is bespoke - see
 * the note in `issues.ts` on why reading a submission, reading the citizen's
 * phone number and reading a staff note are three separate grants rather than
 * one row in a grid.
 */
export const PERMISSIONS = [
  ...ACCESS_PERMISSIONS,
  ...CONTENT_PERMISSIONS,
  ...CONTENT_SPECIAL_PERMISSIONS,
  ...QR_GRID_PERMISSIONS,
  ...QR_SPECIAL_PERMISSIONS,
  ...ISSUE_PERMISSIONS,
  ...AI_PERMISSIONS,
  ...ANALYTICS_PERMISSIONS,
  ...COMMUNICATION_PERMISSIONS,
  ...WORK_PERMISSIONS,
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/** Descriptions for the identity permissions. CMS ones are generated below. */
const ACCESS_PERMISSION_DESCRIPTIONS: Record<(typeof ACCESS_PERMISSIONS)[number], string> = {
  USER_READ: 'View users within the active tenant.',
  USER_CREATE: 'Invite or create users within the active tenant.',
  USER_UPDATE: 'Update user details and account status within the active tenant.',
  USER_DELETE: 'Permanently remove a user. Reserved for platform administration.',

  ROLE_READ: 'View roles and their permissions.',
  ROLE_ASSIGN: 'Grant a role to a user, bounded by the actor’s own rank.',
  ROLE_REVOKE: 'Revoke a role from a user, bounded by the actor’s own rank.',

  ORGANIZATION_READ: 'View organisation details.',
  ORGANIZATION_UPDATE: 'Update organisation details.',
  ORGANIZATION_CREATE: 'Create a new organisation. Platform administration only.',

  CAMPAIGN_READ: 'View campaigns within the active tenant.',
  CAMPAIGN_CREATE: 'Create a campaign within the active tenant.',
  CAMPAIGN_UPDATE: 'Update a campaign within the active tenant.',
  CAMPAIGN_DELETE: 'Archive or delete a campaign within the active tenant.',

  AUDIT_READ: 'Read the audit log for the active tenant.',

  PROFILE_READ: 'Read one’s own profile.',
  PROFILE_UPDATE: 'Update one’s own profile.',

  SESSION_READ_OWN: 'List one’s own active sessions.',
  SESSION_REVOKE_OWN: 'Revoke one’s own sessions.',
  SESSION_REVOKE_ANY: 'Revoke another user’s sessions within the active tenant.',
};

/** Human-readable descriptions, seeded into the database for the admin UI. */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  ...ACCESS_PERMISSION_DESCRIPTIONS,
  ...(Object.fromEntries(
    [...CONTENT_PERMISSIONS, ...CONTENT_SPECIAL_PERMISSIONS].map((permission) => [
      permission,
      describeContentPermission(permission as AnyContentPermission),
    ]),
  ) as Record<AnyContentPermission, string>),
  ...(Object.fromEntries(
    [...QR_GRID_PERMISSIONS, ...QR_SPECIAL_PERMISSIONS].map((permission) => [
      permission,
      describeQrPermission(permission as AnyQrPermission),
    ]),
  ) as Record<AnyQrPermission, string>),
  ...(Object.fromEntries(
    ISSUE_PERMISSIONS.map((permission) => [
      permission,
      describeIssuePermission(permission as IssuePermission),
    ]),
  ) as Record<IssuePermission, string>),
  ...(Object.fromEntries(
    AI_PERMISSIONS.map((permission) => [
      permission,
      describeAiPermission(permission as AiPermission),
    ]),
  ) as Record<AiPermission, string>),
  ...(Object.fromEntries(
    ANALYTICS_PERMISSIONS.map((permission) => [
      permission,
      describeAnalyticsPermission(permission as AnalyticsPermission),
    ]),
  ) as Record<AnalyticsPermission, string>),
  ...(Object.fromEntries(
    COMMUNICATION_PERMISSIONS.map((permission) => [
      permission,
      describeCommunicationPermission(permission as CommunicationPermission),
    ]),
  ) as Record<CommunicationPermission, string>),
  ...(Object.fromEntries(
    WORK_PERMISSIONS.map((permission) => [
      permission,
      describeWorkPermission(permission as WorkPermission),
    ]),
  ) as Record<WorkPermission, string>),
};

/**
 * Everything a content editor needs short of publishing.
 *
 * Publishing is withheld deliberately: an editor can prepare anything, but
 * making it public - speaking on the campaign's behalf - is a separate act
 * requiring a separate grant.
 */
const CONTENT_EDITING: readonly Permission[] = [
  'CONTENT_READ_UNPUBLISHED',
  'PROJECT_CREATE',
  'PROJECT_UPDATE',
  'ACHIEVEMENT_CREATE',
  'ACHIEVEMENT_UPDATE',
  'NEWS_CREATE',
  'NEWS_UPDATE',
  'EVENT_CREATE',
  'EVENT_UPDATE',
  'PRIORITY_CREATE',
  'PRIORITY_UPDATE',
  'GALLERY_CREATE',
  'GALLERY_UPDATE',
  'MEDIA_CREATE',
  'MEDIA_UPDATE',
  'CANDIDATE_PROFILE_UPDATE',
  'VISION_UPDATE',
  'CONTACT_UPDATE',
];

/** Publishing, unpublishing, archiving and destructive actions. */
const CONTENT_PUBLISHING: readonly Permission[] = [
  'PROJECT_PUBLISH',
  'PROJECT_DELETE',
  'ACHIEVEMENT_PUBLISH',
  'ACHIEVEMENT_DELETE',
  'ACHIEVEMENT_VERIFY',
  'NEWS_PUBLISH',
  'NEWS_DELETE',
  'EVENT_PUBLISH',
  'EVENT_DELETE',
  'PRIORITY_PUBLISH',
  'PRIORITY_DELETE',
  'GALLERY_PUBLISH',
  'GALLERY_DELETE',
  'MEDIA_DELETE',
];

/**
 * Seeing that QR campaigns and codes exist.
 *
 * Read is bundled separately from analytics: a viewer may legitimately need to
 * know which codes are in circulation (to answer "is this poster still live?")
 * without being shown how the campaign performed.
 */
const QR_VIEWING: readonly Permission[] = ['QR_CAMPAIGN_READ', 'QR_CODE_READ'];

/**
 * Creating and editing campaigns and codes, but not changing their status.
 *
 * The split mirrors the CMS's editing-versus-publishing boundary for the same
 * reason: drafting a QR code is ordinary work, whereas activating one puts a
 * live redirect behind something that will be physically printed, and pausing
 * one silently breaks every poster already on a wall.
 */
const QR_EDITING: readonly Permission[] = [
  ...QR_VIEWING,
  'QR_CAMPAIGN_CREATE',
  'QR_CAMPAIGN_UPDATE',
  'QR_CODE_CREATE',
  'QR_CODE_UPDATE',
  'QR_CODE_DOWNLOAD',
];

/** Status transitions: activate, pause, archive. */
const QR_LIFECYCLE: readonly Permission[] = ['QR_CAMPAIGN_ARCHIVE', 'QR_CODE_ARCHIVE'];

/**
 * Seeing the submission backlog: what was reported, where, and how it is going.
 *
 * Deliberately excludes the citizen's contact details, the staff notes and the
 * attachments. Those are separate grants because they are separate disclosures
 * - somebody triaging a queue needs to know a drain is blocked in Ward 12, not
 * who reported it or what their phone number is.
 */
const ISSUE_VIEWING: readonly Permission[] = ['ISSUE_READ'];

/** Working a submission: triage, ownership and progress. */
const ISSUE_HANDLING: readonly Permission[] = [
  ...ISSUE_VIEWING,
  'ISSUE_UPDATE',
  'ISSUE_ASSIGN',
  'ISSUE_STATUS_UPDATE',
  'ISSUE_PRIORITY_UPDATE',
  'ISSUE_MODERATE',
  'ISSUE_NOTE_READ',
  'ISSUE_NOTE_CREATE',
  'ISSUE_ATTACHMENT_READ',
];

/**
 * The citizen's own details.
 *
 * Held apart from everything else and granted to the two roles whose job is to
 * respond to people. A citizen typed their phone number so the campaign could
 * call them back about a drain; that is the only reason anybody should see it.
 */
const ISSUE_CITIZEN_CONTACT: readonly Permission[] = ['ISSUE_CONTACT_READ'];

/**
 * Reading what the organisation has told citizens, and what reached them.
 *
 * The baseline for anybody working the inbox: somebody triaging a submission
 * needs to know whether the citizen has already been told something, or a
 * second staff member repeats it.
 */
const COMMUNICATION_VIEWING: readonly Permission[] = ['COMMUNICATION_READ'];

/**
 * Speaking to citizens, and closing the loop when they reply.
 *
 * Publishing and sending are grouped because both are the organisation
 * addressing a member of the public, and a role that may do one has no
 * principled reason to be refused the other. Drafting is deliberately ungated -
 * see the note in `communication.ts`.
 */
const COMMUNICATION_OPERATING: readonly Permission[] = [
  ...COMMUNICATION_VIEWING,
  'COMMUNICATION_PUBLISH',
  'COMMUNICATION_SEND',
  'FOLLOW_UP_REVIEW',
];

/**
 * Preparing the case for a claim: attaching evidence and reading what is there.
 *
 * Grouped with editing rather than with verifying, and that split is the whole
 * point of Phase 9. Assembling a work order and three photographs is ordinary
 * editorial work. Declaring that they establish the claim is not, and the same
 * person doing both by default would make the verified badge self-issued.
 *
 * `EVIDENCE_READ` is separate from `CONTENT_READ_UNPUBLISHED` because a draft
 * and an internal review note are different disclosures: the note says how a
 * claim was checked and sometimes who said so, which is working material and
 * occasionally a source's identity.
 */
const EVIDENCE_HANDLING: readonly Permission[] = ['EVIDENCE_READ', 'EVIDENCE_MANAGE'];

/**
 * Working the verification queue - triage, not judgment.
 *
 * Held more widely than the decision grants on purpose: seeing what is waiting
 * and routing it to somebody is coordination, and a content manager watching
 * their own submissions move through review is the ordinary case. Neither
 * assigning a reviewer nor opening a review changes what the public is told.
 */
const VERIFICATION_TRIAGE: readonly Permission[] = ['VERIFICATION_REVIEW'];

/**
 * Reading AI output that already exists. Cheap and side-effect free.
 *
 * Bundled separately from causing a generation for the same reason QR viewing
 * is separate from QR editing: looking at a summary somebody already paid for
 * is ordinary work, whereas producing one spends money with a third party.
 */
const AI_VIEWING: readonly Permission[] = ['AI_INSIGHT_READ'];

/**
 * Causing generations to happen, and deciding what the organisation stands
 * behind afterwards.
 *
 * Review is grouped with processing rather than granted more widely because
 * approving a summary is what converts model output into an administrative
 * statement - the endorsement, not the generation, is the consequential act.
 */
const AI_OPERATING: readonly Permission[] = [
  ...AI_VIEWING,
  'AI_ISSUE_PROCESS',
  'AI_ISSUE_REGENERATE',
  'AI_SUMMARY_REVIEW',
];

/**
 * Permissions every authenticated user holds, regardless of role.
 *
 * These concern only the actor's own account, so they cannot be used to reach
 * another user's or another tenant's data.
 */
export const SELF_SERVICE_PERMISSIONS: readonly Permission[] = [
  'PROFILE_READ',
  'PROFILE_UPDATE',
  'SESSION_READ_OWN',
  'SESSION_REVOKE_OWN',
];

/**
 * Alias kept for readability inside the matrix below. These are granted as a
 * BASELINE to every authenticated user by `resolveAuthority`, not only through
 * a role - otherwise a user who belongs to no organisation (or who is acting
 * outside any tenant) could not read their own profile or revoke their own
 * sessions, which are exactly the things nobody should need permission for.
 */
const SELF_SERVICE = SELF_SERVICE_PERMISSIONS;

/**
 * The role to permission matrix.
 *
 * Least privilege: a role gets exactly what its job requires. Note that no
 * organisation-scoped role holds USER_DELETE or ORGANIZATION_CREATE - those are
 * platform administration, which keeps a tenant admin inside their tenant.
 */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  // Global administration. Holds every permission by construction below.
  SUPER_ADMIN: [...PERMISSIONS],

  // Full administration of one organisation, but never of the platform.
  CAMPAIGN_ADMIN: [
    ...SELF_SERVICE,
    'USER_READ',
    'USER_CREATE',
    'USER_UPDATE',
    'ROLE_READ',
    'ROLE_ASSIGN',
    'ROLE_REVOKE',
    'ORGANIZATION_READ',
    'ORGANIZATION_UPDATE',
    'CAMPAIGN_READ',
    'CAMPAIGN_CREATE',
    'CAMPAIGN_UPDATE',
    'CAMPAIGN_DELETE',
    'AUDIT_READ',
    'SESSION_REVOKE_ANY',
    // A campaign admin runs the site: full editorial control including
    // publishing and verification.
    ...CONTENT_EDITING,
    ...CONTENT_PUBLISHING,
    // ...and full control of outreach channels, including taking one down.
    ...QR_EDITING,
    ...QR_LIFECYCLE,
    'QR_ANALYTICS_READ',
    // ...and full handling of what citizens send in, including their contact
    // details and the category vocabulary.
    ...ISSUE_HANDLING,
    ...ISSUE_CITIZEN_CONTACT,
    'ISSUE_ANALYTICS_READ',
    'ISSUE_CATEGORY_MANAGE',
    // ...and full authority over the Phase 6 assistant, including the two
    // grants that cost money and the one that endorses its output.
    ...AI_OPERATING,
    'AI_ANALYTICS_READ',
    // ...and may take aggregate analytics out of the platform.
    'ANALYTICS_EXPORT',
    // ...and speaks to citizens on the campaign's behalf.
    ...COMMUNICATION_OPERATING,
    // ...and holds the Phase 9 verification authority. ACHIEVEMENT_VERIFY came
    // with CONTENT_PUBLISHING above; WORK_VERIFY extends the same authority to
    // development projects, which had no verification concept before Phase 9.
    ...EVIDENCE_HANDLING,
    ...VERIFICATION_TRIAGE,
    'WORK_VERIFY',
  ],

  // The candidate: sees drafts of what will be published in their name and may
  // edit the profile that represents them, but does not run the CMS.
  CANDIDATE: [
    ...SELF_SERVICE,
    'ORGANIZATION_READ',
    'CAMPAIGN_READ',
    'CONTENT_READ_UNPUBLISHED',
    'CANDIDATE_PROFILE_UPDATE',
    // Sees how outreach performed without being able to change any of it.
    ...QR_VIEWING,
    'QR_ANALYTICS_READ',
    // Sees what constituents are raising, and the aggregate picture. NOT their
    // contact details, and not the staff notes written about their reports.
    ...ISSUE_VIEWING,
    'ISSUE_ANALYTICS_READ',
    // Sees what is being said to citizens in their name, and cannot say it.
    ...COMMUNICATION_VIEWING,
    // Reads the aggregate picture the assistant produces. Cannot generate it,
    // and pointedly cannot approve it: endorsing an administrative summary is
    // staff work, not the candidate's.
    ...AI_VIEWING,
  ],

  // Phase 3 content duties and Phase 4 QR authoring: prepares everything,
  // publishes nothing and activates nothing.
  CONTENT_MANAGER: [
    ...SELF_SERVICE,
    'USER_READ',
    'ORGANIZATION_READ',
    'CAMPAIGN_READ',
    'ROLE_READ',
    ...CONTENT_EDITING,
    ...QR_EDITING,
    'QR_ANALYTICS_READ',
    // Phase 9: assembles the evidence behind a claim and watches it through the
    // queue, but cannot verify it. Deliberately mirrors this role's existing
    // edit-but-never-publish boundary - a content manager prepares the case and
    // somebody else decides whether it holds.
    ...EVIDENCE_HANDLING,
    ...VERIFICATION_TRIAGE,
  ],

  // Phase 5 issue duties: the role this whole module exists for. Full handling
  // of citizen submissions including their contact details, because responding
  // to people is the job. No user or role administration, and no CMS or QR
  // authority - an issue manager runs the inbox, not the website.
  ISSUE_MANAGER: [
    ...SELF_SERVICE,
    'USER_READ',
    'ORGANIZATION_READ',
    'CAMPAIGN_READ',
    'ROLE_READ',
    ...ISSUE_HANDLING,
    ...ISSUE_CITIZEN_CONTACT,
    'ISSUE_ANALYTICS_READ',
    // The assistant exists to help this role work the inbox, so it holds the
    // full set: triaging a backlog is exactly the job AI summaries shorten.
    ...AI_OPERATING,
    // Replying to citizens IS the inbox job, so this role holds the full
    // communication set - it is the role Phase 8 primarily exists for.
    ...COMMUNICATION_OPERATING,
  ],

  // Coordinates field staff, so needs to see who they are - and prints and
  // distributes the physical QR assets, so needs to download them without
  // being able to edit or retire the codes themselves.
  FIELD_COORDINATOR: [
    ...SELF_SERVICE,
    'USER_READ',
    'ORGANIZATION_READ',
    'CAMPAIGN_READ',
    ...QR_VIEWING,
    'QR_CODE_DOWNLOAD',
    // Works the submissions assigned to them: reads the report, sees the
    // photograph, records what they did and moves it along. Deliberately NOT
    // granted the citizen's contact details by default - a coordinator who
    // genuinely needs to phone people should be given ISSUE_CONTACT_READ
    // explicitly, as a decision somebody made rather than a side effect.
    ...ISSUE_VIEWING,
    'ISSUE_STATUS_UPDATE',
    'ISSUE_NOTE_READ',
    'ISSUE_NOTE_CREATE',
    'ISSUE_ATTACHMENT_READ',
    // Sees what the citizen has already been told, so a field visit does not
    // contradict it. Cannot publish or send: speaking on the organisation's
    // behalf is not a coordinator's authority.
    ...COMMUNICATION_VIEWING,
  ],

  // Read-only analysis. No USER_READ (analytics is aggregate) and no
  // CONTENT_READ_UNPUBLISHED - an analyst has no reason to see drafts.
  // QR analytics IS the analyst's job, so it is granted here and nowhere is it
  // paired with a mutation.
  ANALYST: [
    ...SELF_SERVICE,
    'ORGANIZATION_READ',
    'CAMPAIGN_READ',
    ...QR_VIEWING,
    'QR_ANALYTICS_READ',
    // Aggregate only, and pointedly NOT ISSUE_READ. An analyst's question is
    // "how many drainage reports came from Ward 12?", which the aggregates
    // answer. Reading the submissions themselves would mean reading free text
    // that citizens sometimes fill with personal circumstances, for no
    // analytical gain.
    'ISSUE_ANALYTICS_READ',
    // Aggregate AI intelligence and the operational metrics behind it - what
    // the assistant cost and how often it failed is an analyst's question.
    // No generation and no approval: reading the numbers is the whole role.
    ...AI_VIEWING,
    'AI_ANALYTICS_READ',
    // The one role whose entire job is aggregate analysis, so the one role
    // besides the administrator that may export it. Deliberately NOT granted to
    // ISSUE_MANAGER: they run the inbox, and an export is a copy of the
    // organisation's data on somebody's laptop rather than a triage tool.
    'ANALYTICS_EXPORT',
  ],

  // Minimal read-only access: can see what exists, can change nothing, and is
  // shown neither performance data, citizen contact details nor staff notes.
  VIEWER: [...SELF_SERVICE, 'ORGANIZATION_READ', ...QR_VIEWING, ...ISSUE_VIEWING],
};

/** Permissions granted by a set of roles, de-duplicated. */
export function permissionsForRoles(roles: readonly RoleKey[]): Permission[] {
  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      granted.add(permission);
    }
  }
  return [...granted];
}

/** Every role key, for seeding and iteration. */
export const ALL_ROLE_KEYS = ROLE_KEYS;
