/**
 * Phase 4 QR campaign model: statuses, categories and permissions.
 *
 * Lives in `@rk/types` for the same reason the content vocabulary does - a
 * status string that means one thing to the server and another to the admin
 * console is how a paused QR code ends up still redirecting.
 *
 * SCOPE NOTE. Everything here describes an outreach CHANNEL, never a person.
 * There is deliberately no field, enum member or permission in this file that
 * could hold a political opinion, an affiliation, a supporter score, or any
 * other attribute of an individual. That absence is a product requirement, not
 * an oversight, and anything added here must preserve it.
 */

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

/**
 * What kind of outreach a QR campaign represents.
 *
 * This is a description of where the printed code physically lives, which is
 * the whole point: comparing a poster against a pamphlet is the question the
 * campaign team actually has.
 */
export const QR_CAMPAIGN_TYPES = [
  'POSTER',
  'PAMPHLET',
  'BANNER',
  'EVENT',
  'SOCIAL_MEDIA',
  'OFFICE',
  'DOOR_TO_DOOR',
  'OTHER',
] as const;
export type QrCampaignType = (typeof QR_CAMPAIGN_TYPES)[number];

/**
 * Campaign lifecycle.
 *
 * Distinct from the QR code's own status. A campaign can be COMPLETED while
 * individual codes stay ACTIVE - the posters are still on walls, and scans
 * still deserve to reach the website rather than a dead end.
 */
export const QR_CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;
export type QrCampaignStatus = (typeof QR_CAMPAIGN_STATUSES)[number];

// ---------------------------------------------------------------------------
// QR code
// ---------------------------------------------------------------------------

/**
 * QR code lifecycle.
 *
 * Only ACTIVE redirects. PAUSED and ARCHIVED both show a public notice instead,
 * and neither is deleted: a printed code cannot be recalled, so its identifier
 * must keep resolving to *something* explanatory forever.
 */
export const QR_CODE_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type QrCodeStatus = (typeof QR_CODE_STATUSES)[number];

export function redirectsPublicly(status: QrCodeStatus): boolean {
  return status === 'ACTIVE';
}

// ---------------------------------------------------------------------------
// Scan classification
// ---------------------------------------------------------------------------

/**
 * Device class, derived from the User-Agent at scan time and then discarded.
 *
 * Coarse on purpose. "Mobile vs desktop" answers a real question about how
 * people reach the site; a full device fingerprint answers no campaign question
 * at all and would make the scan row identifying.
 *
 * BOT is a first-class value rather than a flag hidden in the UI, because a
 * link-preview crawler is not a person and reporting it as one would inflate
 * every number the campaign team relies on.
 */
export const SCAN_DEVICE_CATEGORIES = ['MOBILE', 'TABLET', 'DESKTOP', 'BOT', 'UNKNOWN'] as const;
export type ScanDeviceCategory = (typeof SCAN_DEVICE_CATEGORIES)[number];

/** Operating-system family. Same coarseness rule as the device category. */
export const SCAN_OS_CATEGORIES = [
  'IOS',
  'ANDROID',
  'WINDOWS',
  'MACOS',
  'LINUX',
  'OTHER',
  'UNKNOWN',
] as const;
export type ScanOsCategory = (typeof SCAN_OS_CATEGORIES)[number];

/**
 * Where the scan came from, bucketed.
 *
 * The full referrer URL is never stored: it can carry a search query or a
 * private group link, neither of which a campaign needs and both of which are
 * about the person rather than the channel.
 */
export const SCAN_REFERRER_CATEGORIES = [
  'DIRECT',
  'SEARCH',
  'SOCIAL',
  'MESSAGING',
  'OTHER',
] as const;
export type ScanReferrerCategory = (typeof SCAN_REFERRER_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Analytics date ranges
// ---------------------------------------------------------------------------

/**
 * Named ranges offered in the analytics UI.
 *
 * Named presets rather than free dates by default, so the common questions
 * ("how did we do this week?") resolve to one bounded query, and so the server
 * can reject an unbounded range without arguing with the client about it.
 */
export const ANALYTICS_RANGES = [
  'TODAY',
  'YESTERDAY',
  'LAST_7_DAYS',
  'LAST_30_DAYS',
  // Added in Phase 7, whose decision dashboard needs a quarter to see a trend
  // that a month is too short to show. Shared with the Phase 4 and Phase 5
  // dashboards deliberately: a preset must mean the same thing everywhere, and
  // two range resolvers would eventually disagree about where a period starts.
  'LAST_90_DAYS',
  'THIS_MONTH',
  'PREVIOUS_MONTH',
  'CUSTOM',
] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/**
 * Hardest bound on how much history one analytics query may span.
 *
 * A campaign question never needs more than a couple of years, and an
 * unbounded range is how a single click turns into a table scan.
 */
export const MAX_ANALYTICS_RANGE_DAYS = 400;

/** Time-of-day buckets for aggregate timing analysis. */
export const SCAN_HOUR_BUCKETS = ['H00_06', 'H06_12', 'H12_18', 'H18_24'] as const;
export type ScanHourBucket = (typeof SCAN_HOUR_BUCKETS)[number];

export function hourBucket(hour: number): ScanHourBucket {
  if (hour < 6) return 'H00_06';
  if (hour < 12) return 'H06_12';
  if (hour < 18) return 'H12_18';
  return 'H18_24';
}

// ---------------------------------------------------------------------------
// Public QR resolution outcome
// ---------------------------------------------------------------------------

/**
 * What happened when a citizen scanned.
 *
 * NOT_FOUND is returned for an unknown code AND for a code belonging to a
 * suspended organisation, so the redirect endpoint cannot be used to probe
 * which identifiers exist.
 */
export const QR_RESOLUTION_OUTCOMES = ['REDIRECT', 'NOT_FOUND', 'PAUSED', 'ARCHIVED'] as const;
export type QrResolutionOutcome = (typeof QR_RESOLUTION_OUTCOMES)[number];

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * QR entities and the actions available on them.
 *
 * Generated from the cross product, as the CMS permissions are, so a new QR
 * entity cannot be introduced without its full permission set.
 *
 * The actions are READ / CREATE / UPDATE / ARCHIVE rather than the CMS's
 * CREATE / UPDATE / DELETE / PUBLISH. There is no DELETE because a printed QR
 * code cannot be un-printed: removing the row would turn every physical poster
 * into a dead link, so ARCHIVE is the only retirement path.
 */
export const QR_ENTITIES = ['QR_CAMPAIGN', 'QR_CODE'] as const;
export type QrEntity = (typeof QR_ENTITIES)[number];

export const QR_ACTIONS = ['READ', 'CREATE', 'UPDATE', 'ARCHIVE'] as const;
export type QrAction = (typeof QR_ACTIONS)[number];

/** `QR_CAMPAIGN_CREATE`, `QR_CODE_ARCHIVE`, and so on. */
export type QrGridPermission = `${QrEntity}_${QrAction}`;

function buildQrPermissions(): QrGridPermission[] {
  const result: QrGridPermission[] = [];
  for (const entity of QR_ENTITIES) {
    for (const action of QR_ACTIONS) {
      result.push(`${entity}_${action}`);
    }
  }
  return result;
}

export const QR_GRID_PERMISSIONS: readonly QrGridPermission[] = buildQrPermissions();

/**
 * QR permissions outside the grid.
 *
 * `QR_ANALYTICS_READ` is separate from `QR_CAMPAIGN_READ` because seeing that a
 * campaign exists and seeing how it performed are different disclosures - an
 * analyst needs the second without the ability to touch the first.
 *
 * `QR_CODE_DOWNLOAD` is separate because downloading the printable asset is
 * what a field coordinator does, and it should not require the ability to edit
 * the code they are printing.
 */
export const QR_SPECIAL_PERMISSIONS = ['QR_ANALYTICS_READ', 'QR_CODE_DOWNLOAD'] as const;
export type QrSpecialPermission = (typeof QR_SPECIAL_PERMISSIONS)[number];

export type AnyQrPermission = QrGridPermission | QrSpecialPermission;

/** Human-readable descriptions for the seeded `permissions` table. */
export function describeQrPermission(permission: AnyQrPermission): string {
  const special: Record<QrSpecialPermission, string> = {
    QR_ANALYTICS_READ: 'View aggregate QR scan analytics within the active tenant.',
    QR_CODE_DOWNLOAD: 'Download printable QR code assets within the active tenant.',
  };

  if (permission in special) {
    return special[permission as QrSpecialPermission];
  }

  const [entity, action] = splitQrPermission(permission as QrGridPermission);
  const noun = entity === 'QR_CAMPAIGN' ? 'QR campaign' : 'QR code';
  const verb: Record<QrAction, string> = {
    READ: 'View',
    CREATE: 'Create',
    UPDATE: 'Edit',
    ARCHIVE: 'Activate, pause or archive',
  };

  return `${verb[action]} ${noun}s within the active tenant.`;
}

/**
 * Splits a generated permission back into its parts.
 *
 * Written out rather than `split('_')` because both entity names themselves
 * contain an underscore, so naive splitting yields `QR` and `CAMPAIGN`.
 */
export function splitQrPermission(permission: QrGridPermission): [QrEntity, QrAction] {
  for (const entity of QR_ENTITIES) {
    const prefix = `${entity}_`;
    if (permission.startsWith(prefix)) {
      return [entity, permission.slice(prefix.length) as QrAction];
    }
  }
  throw new Error(`Not a QR grid permission: ${permission}`);
}

// ---------------------------------------------------------------------------
// Public QR code identifiers
// ---------------------------------------------------------------------------

/**
 * Shape of the public code printed under a QR image.
 *
 * `RK-QR-` followed by eight Crockford-style base32 characters (no I, L, O or
 * U, so a human reading a code off a poster cannot confuse it with 1 or 0).
 *
 * Deliberately RANDOM rather than sequential. A sequential code would let
 * anyone enumerate every QR code on the platform, discover other tenants'
 * campaigns, and inflate their scan counts by walking the range.
 */
export const QR_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const QR_CODE_PREFIX = 'RK-QR-';
export const QR_CODE_RANDOM_LENGTH = 8;

const QR_CODE_PATTERN = new RegExp(
  `^${QR_CODE_PREFIX}[${QR_CODE_ALPHABET}]{${QR_CODE_RANDOM_LENGTH}}$`,
);

/**
 * Whether a string could be one of our codes.
 *
 * Checked before the database is touched, so a scan of a malformed or hostile
 * identifier costs a regex rather than a query.
 */
export function isQrCodeIdentifier(value: string): boolean {
  return QR_CODE_PATTERN.test(value);
}
