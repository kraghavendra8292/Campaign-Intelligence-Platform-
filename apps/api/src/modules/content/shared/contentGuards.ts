import {
  DEFAULT_LOCALE,
  isLocale,
  type AuthContext,
  type ContentAction,
  type ContentEntity,
  type ContentStatus,
  type Locale,
  type Permission,
} from '@rk/types';
import { slugify } from '@rk/utils';
import { AppError } from '../../../errors/AppError';
import { authorizationService } from '../../auth/authorization.service';

/**
 * Authorization and lifecycle rules shared by every CMS entity.
 *
 * Centralised for the same reason Phase 2 centralised `requirePermission`: a
 * publishing check that is re-implemented per entity is a publishing check that
 * one entity will eventually be missing.
 */

/** Maps an entity and action onto the generated permission key. */
export function contentPermission(entity: ContentEntity, action: ContentAction): Permission {
  return `${entity}_${action}` as Permission;
}

/**
 * Asserts the caller may perform a CMS action, and returns the active tenant.
 *
 * Both halves matter: the permission decides *whether* they may act, the tenant
 * decides *where*. Returning them together makes it awkward to use one without
 * the other.
 */
export function requireContentAccess(
  auth: AuthContext | null,
  entity: ContentEntity,
  action: ContentAction,
): { auth: AuthContext; organizationId: string } {
  const permitted = authorizationService.requirePermission(auth, contentPermission(entity, action));
  return authorizationService.requireOrganization(permitted);
}

/**
 * Asserts the caller may see unpublished content.
 *
 * Without this a CMS user sees exactly what a visitor sees, which is the
 * correct default: reading drafts is a privilege, not a consequence of being
 * signed in.
 */
export function requireCmsRead(auth: AuthContext | null): {
  auth: AuthContext;
  organizationId: string;
} {
  const permitted = authorizationService.requirePermission(auth, 'CONTENT_READ_UNPUBLISHED');
  return authorizationService.requireOrganization(permitted);
}

/** Publishing transitions a CMS user may request. */
export const PUBLISH_ACTIONS = ['PUBLISH', 'UNPUBLISH', 'SUBMIT_FOR_REVIEW', 'ARCHIVE'] as const;
export type PublishAction = (typeof PUBLISH_ACTIONS)[number];

/**
 * Resolves a publishing transition into a concrete status and timestamp.
 *
 * `publishedAt` is set once, on first publish, and then preserved: it is the
 * date shown to readers and used for ordering, so re-publishing after an edit
 * must not silently reorder the news feed.
 *
 * Unpublishing returns content to DRAFT and clears the date, because the item
 * was never really "published" from a reader's point of view if it is pulled.
 */
export function resolvePublishTransition(
  action: PublishAction,
  currentPublishedAt: Date | null,
): { status: ContentStatus; publishedAt: Date | null } {
  switch (action) {
    case 'PUBLISH':
      return { status: 'PUBLISHED', publishedAt: currentPublishedAt ?? new Date() };
    case 'SUBMIT_FOR_REVIEW':
      return { status: 'IN_REVIEW', publishedAt: currentPublishedAt };
    case 'UNPUBLISH':
      return { status: 'DRAFT', publishedAt: null };
    case 'ARCHIVE':
      // Archived content keeps its original date so the audit trail and any
      // future restore reflect when it actually went live.
      return { status: 'ARCHIVED', publishedAt: currentPublishedAt };
  }
}

/**
 * Which transitions require the entity's PUBLISH permission.
 *
 * Moving something to review is ordinary editorial work; making it public - or
 * taking it down - is not.
 */
export function transitionRequiresPublishPermission(action: PublishAction): boolean {
  return action !== 'SUBMIT_FOR_REVIEW';
}

/** Parses and defaults a client-supplied locale. */
export function resolveLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  if (!isLocale(value)) {
    throw AppError.validation('Unsupported language.', { details: { field: 'locale' } });
  }
  return value;
}

/**
 * Normalises a slug, deriving one from the title when none is supplied.
 *
 * Slugs are part of a public URL, so they are generated rather than accepted
 * verbatim: an editor pasting a title with punctuation, or a path traversal
 * attempt, both reduce to a safe token.
 */
export function normalizeSlug(explicit: string | null | undefined, fallbackTitle: string): string {
  const source = explicit && explicit.trim().length > 0 ? explicit : fallbackTitle;
  const slug = slugify(source);

  if (!slug) {
    throw AppError.validation('A title containing letters or digits is required.', {
      details: { field: 'slug' },
    });
  }

  return slug;
}

/** Bounds a page size so a client cannot request an entire table. */
export const MAX_CONTENT_PAGE_SIZE = 50;

export function clampContentPageSize(requested: number | null | undefined, fallback = 12): number {
  const value = requested ?? fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw AppError.validation('`first` must be a positive integer.', {
      details: { field: 'first' },
    });
  }
  return Math.min(value, MAX_CONTENT_PAGE_SIZE);
}

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
 * Translates a unique-constraint violation into a usable message.
 *
 * Prisma reports P2002 for the `(organizationId, slug, locale)` index, which
 * from an editor's point of view means "that web address is taken".
 */
export function rethrowSlugConflict(error: unknown, slug: string): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  ) {
    throw AppError.conflict(
      `The web address "${slug}" is already used by another item in this language.`,
    );
  }
  throw error;
}
