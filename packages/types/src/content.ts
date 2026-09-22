/**
 * Phase 3 content model: shared statuses, locales and CMS permissions.
 *
 * Kept in `@rk/types` so the API, the public site and the CMS all agree on the
 * same status vocabulary - a status string that means one thing to the server
 * and another to the client is exactly how draft content ends up on a public
 * page.
 */

/**
 * Editorial lifecycle, shared by every CMS entity.
 *
 * Deliberately separate from domain lifecycle (a project's `PLANNED` /
 * `COMPLETED`) and from verification. Conflating them is tempting but wrong: a
 * completed project may still be an unpublished draft, and a verified
 * achievement is not automatically public.
 *
 * PUBLISHED is the ONLY status the public API will ever return.
 */
export const CONTENT_STATUSES = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** The single predicate the public data layer filters on. */
export function isPubliclyVisible(status: ContentStatus): boolean {
  return status === 'PUBLISHED';
}

/** Domain lifecycle of a development project. Not a publishing state. */
export const PROJECT_STATUSES = [
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLED',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Lifecycle of a public event. Not a publishing state. */
export const EVENT_STATUSES = ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/**
 * Whether a claim has been checked by staff.
 *
 * Separate from publishing so an achievement cannot become "verified" merely by
 * being published, and so verification can require a different permission.
 */
/**
 * Whether staff have checked a claim.
 *
 * Phase 9 added REJECTED here rather than starting a second verification enum.
 * Without it a reviewer who found the evidence insufficient had to set the
 * claim back to UNVERIFIED, which is indistinguishable from "nobody has looked
 * yet" - so the next reviewer began from scratch and the submitter was never
 * told anything.
 */
export const VERIFICATION_STATUSES = ['UNVERIFIED', 'IN_REVIEW', 'VERIFIED', 'REJECTED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Content categories. Seeded as data; this list is the starting vocabulary. */
export const CONTENT_CATEGORIES = [
  'INFRASTRUCTURE',
  'EDUCATION',
  'HEALTHCARE',
  'WATER',
  'AGRICULTURE',
  'EMPLOYMENT',
  'PUBLIC_SERVICES',
  'ENVIRONMENT',
  'OTHER',
] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

/**
 * Supported content locales.
 *
 * Content rows carry a locale and are keyed `(organizationId, slug, locale)`,
 * so a Kannada translation is a sibling row rather than a column on the English
 * one. That keeps per-locale publishing independent - a translation can stay in
 * draft while the original is live.
 */
export const LOCALES = ['en', 'kn'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Media kinds the library accepts. */
export const MEDIA_KINDS = ['IMAGE', 'DOCUMENT', 'VIDEO_LINK'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** External video hosts we are willing to embed. */
export const VIDEO_PLATFORMS = ['YOUTUBE', 'VIMEO', 'OTHER'] as const;
export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number];

// ---------------------------------------------------------------------------
// CMS permissions
// ---------------------------------------------------------------------------

/**
 * CMS-managed entities and the actions that can be taken on them.
 *
 * Permissions are generated from the cross product rather than hand-listed:
 * seven entities times four actions is twenty-eight strings, and a hand-written
 * list of that size reliably drifts. Generating them means a new entity cannot
 * be added without its full permission set existing.
 */
export const CONTENT_ENTITIES = [
  'PROJECT',
  'ACHIEVEMENT',
  'NEWS',
  'EVENT',
  'PRIORITY',
  'GALLERY',
  'MEDIA',
] as const;
export type ContentEntity = (typeof CONTENT_ENTITIES)[number];

export const CONTENT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'PUBLISH'] as const;
export type ContentAction = (typeof CONTENT_ACTIONS)[number];

/** `PROJECT_CREATE`, `NEWS_PUBLISH`, and so on - checked at compile time. */
export type ContentPermission = `${ContentEntity}_${ContentAction}`;

function buildContentPermissions(): ContentPermission[] {
  const result: ContentPermission[] = [];
  for (const entity of CONTENT_ENTITIES) {
    for (const action of CONTENT_ACTIONS) {
      result.push(`${entity}_${action}`);
    }
  }
  return result;
}

export const CONTENT_PERMISSIONS: readonly ContentPermission[] = buildContentPermissions();

/**
 * Permissions that do not fit the entity × action grid.
 *
 * `CONTENT_READ_UNPUBLISHED` is the gate for seeing drafts at all: without it a
 * CMS user sees exactly what the public sees. `ACHIEVEMENT_VERIFY` is separate
 * from publishing on purpose - attesting that something is true is a different
 * act, and a different trust level, from making it visible.
 */
export const CONTENT_SPECIAL_PERMISSIONS = [
  'CONTENT_READ_UNPUBLISHED',
  'ACHIEVEMENT_VERIFY',
  'CANDIDATE_PROFILE_UPDATE',
  'VISION_UPDATE',
  'CONTACT_UPDATE',
] as const;

export type ContentSpecialPermission = (typeof CONTENT_SPECIAL_PERMISSIONS)[number];

export type AnyContentPermission = ContentPermission | ContentSpecialPermission;

/** Human-readable descriptions for the seeded `permissions` table. */
export function describeContentPermission(permission: AnyContentPermission): string {
  const special: Record<ContentSpecialPermission, string> = {
    CONTENT_READ_UNPUBLISHED: 'View draft, in-review and archived content in the CMS.',
    ACHIEVEMENT_VERIFY: 'Mark an achievement as verified after checking its evidence.',
    CANDIDATE_PROFILE_UPDATE: 'Edit the public candidate profile.',
    VISION_UPDATE: 'Edit the vision statement.',
    CONTACT_UPDATE: 'Edit public contact information and social links.',
  };

  if (permission in special) {
    return special[permission as ContentSpecialPermission];
  }

  const [entity, action] = permission.split('_') as [ContentEntity, ContentAction];
  const noun = entity.toLowerCase().replace('_', ' ');
  const verb: Record<ContentAction, string> = {
    CREATE: 'Create',
    UPDATE: 'Edit',
    DELETE: 'Delete',
    PUBLISH: 'Publish, unpublish or archive',
  };

  return `${verb[action]} ${noun} content within the active tenant.`;
}
