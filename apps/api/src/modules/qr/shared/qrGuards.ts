import { randomInt } from 'node:crypto';
import {
  QR_CODE_ALPHABET,
  QR_CODE_PREFIX,
  QR_CODE_RANDOM_LENGTH,
  type AuthContext,
  type Permission,
  type QrAction,
  type QrEntity,
} from '@rk/types';
import { slugify } from '@rk/utils';
import { AppError } from '../../../errors/AppError';
import { authorizationService } from '../../auth/authorization.service';

/**
 * Authorization, validation and identifier rules shared by the QR module.
 *
 * Centralised for the same reason Phase 2 centralised `requirePermission` and
 * Phase 3 centralised the publishing check: a rule re-implemented per call site
 * is a rule that one call site will eventually be missing. The destination
 * validator below is the clearest example - it is the only thing standing
 * between an editor and an open redirect, so there is exactly one of it.
 */

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/** Maps an entity and action onto the generated permission key. */
export function qrPermission(entity: QrEntity, action: QrAction): Permission {
  return `${entity}_${action}` as Permission;
}

/**
 * Asserts the caller may act on a QR entity, and returns the active tenant.
 *
 * Returns both halves together so it is awkward to use the permission check
 * without also scoping the query to the tenant it was checked against.
 */
export function requireQrAccess(
  auth: AuthContext | null,
  entity: QrEntity,
  action: QrAction,
): { auth: AuthContext; organizationId: string } {
  const permitted = authorizationService.requirePermission(auth, qrPermission(entity, action));
  return authorizationService.requireOrganization(permitted);
}

/**
 * Asserts the caller may read aggregate analytics.
 *
 * Separate from `QR_CAMPAIGN_READ` on purpose: knowing a campaign exists and
 * knowing how it performed are different disclosures, and an analyst needs the
 * second without the first ever implying write access.
 */
export function requireQrAnalytics(auth: AuthContext | null): {
  auth: AuthContext;
  organizationId: string;
} {
  const permitted = authorizationService.requirePermission(auth, 'QR_ANALYTICS_READ');
  return authorizationService.requireOrganization(permitted);
}

/** Asserts the caller may download printable QR assets. */
export function requireQrDownload(auth: AuthContext | null): {
  auth: AuthContext;
  organizationId: string;
} {
  const permitted = authorizationService.requirePermission(auth, 'QR_CODE_DOWNLOAD');
  return authorizationService.requireOrganization(permitted);
}

// ---------------------------------------------------------------------------
// Public code generation
// ---------------------------------------------------------------------------

/**
 * Generates a public QR identifier.
 *
 * `randomInt` from `node:crypto` rather than `Math.random`: these identifiers
 * are the only thing protecting one tenant's scan counts from another tenant
 * walking the space, so they must not come from a predictable generator.
 *
 * The alphabet excludes I, L, O and U so somebody reading a code off a printed
 * poster cannot confuse it with 1, 0 or V.
 */
export function generateQrCodeIdentifier(): string {
  let suffix = '';
  for (let i = 0; i < QR_CODE_RANDOM_LENGTH; i += 1) {
    suffix += QR_CODE_ALPHABET[randomInt(QR_CODE_ALPHABET.length)];
  }
  return `${QR_CODE_PREFIX}${suffix}`;
}

// ---------------------------------------------------------------------------
// Destination validation - the open-redirect boundary
// ---------------------------------------------------------------------------

/**
 * Path segments that may begin a QR destination.
 *
 * An ALLOW-LIST, not a deny-list. A deny-list of dangerous schemes is the
 * classic way to get this wrong: every filter misses one encoding, and the cost
 * of a miss here is that a campaign's own printed QR codes send citizens to an
 * attacker's page while appearing to come from the candidate.
 *
 * These mirror the Phase 3 public route tree. Adding a public page means adding
 * it here too, which is deliberate friction.
 */
const ALLOWED_DESTINATION_ROOTS = [
  '', // the site root, "/"
  'about',
  'vision',
  'work',
  'achievements',
  'news',
  'events',
  'gallery',
  'contact',
  'search',
  'privacy',
  'terms',
] as const;

/** One path segment: unreserved URL characters only. */
const SEGMENT_PATTERN = /^[A-Za-z0-9._~-]{1,120}$/;

export const MAX_DESTINATION_LENGTH = 500;

/**
 * Validates and normalises a QR destination.
 *
 * Only INTERNAL paths are accepted. Phase 4 deliberately does not support
 * absolute external URLs: storing one would turn an editor with `QR_CODE_UPDATE`
 * into somebody who can repoint printed material at any site on the internet,
 * and no campaign requirement justifies that. If external destinations are ever
 * needed they belong behind their own permission and their own host allow-list.
 *
 * Rejected, in order, because each is a distinct bypass:
 *   - anything containing a scheme      → `javascript:`, `data:`, `file:`
 *   - protocol-relative `//evil.test`   → a browser treats this as absolute
 *   - backslashes                       → some browsers normalise `\` to `/`
 *   - encoded traversal or separators   → `%2e%2e`, `%2f`, `%5c`
 *   - `..` segments                     → escapes the intended subtree
 *   - a root outside the allow-list     → an unknown public page
 */
export function validateDestinationPath(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();

  if (value.length === 0) {
    throw AppError.validation('A destination page is required.', {
      details: { field: 'destinationPath' },
    });
  }

  if (value.length > MAX_DESTINATION_LENGTH) {
    throw AppError.validation(`Must be ${MAX_DESTINATION_LENGTH} characters or fewer.`, {
      details: { field: 'destinationPath', limit: MAX_DESTINATION_LENGTH },
    });
  }

  // A colon anywhere means a scheme is being attempted. Checked before any
  // normalisation so no later step can accidentally strip the evidence.
  if (value.includes(':')) {
    throw AppError.validation('Enter a page on this website, not a full web address.', {
      details: { field: 'destinationPath' },
    });
  }

  if (value.includes('\\')) {
    throw AppError.validation('That destination contains characters that are not allowed.', {
      details: { field: 'destinationPath' },
    });
  }

  // Percent-encoding is rejected outright rather than decoded. Decoding would
  // mean validating the result and then storing the original, and the gap
  // between those two strings is exactly where traversal bugs live.
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    throw AppError.validation('That destination contains characters that are not allowed.', {
      details: { field: 'destinationPath' },
    });
  }

  if (!value.startsWith('/')) {
    throw AppError.validation('A destination must start with "/".', {
      details: { field: 'destinationPath' },
    });
  }

  // `//host` is protocol-relative and navigates off-site.
  if (value.startsWith('//')) {
    throw AppError.validation('Enter a page on this website, not another domain.', {
      details: { field: 'destinationPath' },
    });
  }

  // Query strings and fragments are not accepted: UTM parameters are generated
  // by the redirect from the code's own attribution fields, and letting an
  // editor supply their own would make the recorded landing path disagree with
  // where the citizen actually arrived.
  if (value.includes('?') || value.includes('#')) {
    throw AppError.validation('Remove any "?" or "#" - tracking parameters are added for you.', {
      details: { field: 'destinationPath' },
    });
  }

  // Split, dropping the empty segment created by the leading slash and any
  // trailing slash, so "/work/" and "/work" normalise identically.
  const segments = value
    .split('/')
    .slice(1)
    .filter((segment) => segment.length > 0);

  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw AppError.validation('That destination is not a valid page.', {
        details: { field: 'destinationPath' },
      });
    }
    if (!SEGMENT_PATTERN.test(segment)) {
      throw AppError.validation('That destination contains characters that are not allowed.', {
        details: { field: 'destinationPath' },
      });
    }
  }

  // Public detail pages are one level deep ("/work/:slug"); nothing on the
  // Phase 3 site is deeper, so anything deeper is a mistake or an attempt.
  if (segments.length > 2) {
    throw AppError.validation('That destination is not a valid page.', {
      details: { field: 'destinationPath' },
    });
  }

  const root = segments[0] ?? '';
  if (!(ALLOWED_DESTINATION_ROOTS as readonly string[]).includes(root)) {
    throw AppError.validation(
      'That page does not exist on the public website. Choose one of the listed destinations.',
      { details: { field: 'destinationPath' } },
    );
  }

  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

/** The destination roots an editor may choose from, for the admin UI. */
export const PUBLIC_DESTINATION_ROOTS: readonly string[] = ALLOWED_DESTINATION_ROOTS.map((root) =>
  root === '' ? '/' : `/${root}`,
);

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

/** Rejects a blank required string with a field-specific message. */
export function requireText(value: string | null | undefined, field: string, max: number): string {
  const trimmed = value?.trim() ?? '';

  if (trimmed.length === 0) {
    throw AppError.validation('This field is required.', { details: { field } });
  }
  if (trimmed.length > max) {
    throw AppError.validation(`Must be ${max} characters or fewer.`, {
      details: { field, limit: max },
    });
  }
  return trimmed;
}

/** Trims an optional string, collapsing blanks to null. */
export function optionalText(
  value: string | null | undefined,
  field: string,
  max: number,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.length > max) {
    throw AppError.validation(`Must be ${max} characters or fewer.`, {
      details: { field, limit: max },
    });
  }
  return trimmed;
}

/**
 * Normalises a UTM value.
 *
 * Restricted to an unreserved character set because these end up in a query
 * string. Anything outside it is rejected rather than encoded, so what an
 * editor types is what appears in the URL.
 */
export function optionalUtm(value: string | null | undefined, field: string): string | null {
  const trimmed = optionalText(value, field, 120);
  if (trimmed === null) return null;

  if (!/^[A-Za-z0-9._~-]+$/.test(trimmed)) {
    throw AppError.validation(
      'Use letters, digits, dots, dashes or underscores only - no spaces or symbols.',
      { details: { field } },
    );
  }
  return trimmed;
}

/** Normalises a tenant-scoped slug, deriving one from the name when absent. */
export function normalizeCampaignSlug(
  explicit: string | null | undefined,
  fallbackName: string,
): string {
  const source = explicit && explicit.trim().length > 0 ? explicit : fallbackName;
  const slug = slugify(source);

  if (!slug) {
    throw AppError.validation('A name containing letters or digits is required.', {
      details: { field: 'slug' },
    });
  }
  return slug.slice(0, 80);
}

/** Parses an optional date, rejecting nonsense rather than storing Invalid Date. */
export function parseOptionalDate(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw AppError.validation('Enter a valid date.', { details: { field } });
  }
  return parsed;
}

/** Rejects an end date that precedes its start. */
export function assertDateRange(start: Date | null, end: Date | null): void {
  if (start && end && end.getTime() < start.getTime()) {
    throw AppError.validation('The end date cannot be before the start date.', {
      details: { field: 'endDate' },
    });
  }
}

/** Rejects a coordinate outside its real-world range. */
export function parseCoordinate(
  value: number | null | undefined,
  field: string,
  limit: number,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    throw AppError.validation(`Enter a valid ${field}.`, { details: { field } });
  }
  return value;
}

/** Bounds a page size so a client cannot request an entire table. */
export const MAX_QR_PAGE_SIZE = 100;

export function clampQrPageSize(requested: number | null | undefined, fallback = 25): number {
  const value = requested ?? fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw AppError.validation('`first` must be a positive integer.', {
      details: { field: 'first' },
    });
  }
  return Math.min(value, MAX_QR_PAGE_SIZE);
}

/** Translates a unique-constraint violation into a usable message. */
export function rethrowSlugConflict(error: unknown, slug: string): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  ) {
    throw AppError.conflict(`The address "${slug}" is already used by another QR campaign.`);
  }
  throw error;
}
