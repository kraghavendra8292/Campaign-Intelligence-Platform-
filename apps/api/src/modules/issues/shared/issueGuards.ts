import { randomInt } from 'node:crypto';
import {
  ISSUE_LIMITS,
  REFERENCE_ALPHABET,
  REFERENCE_RANDOM_LENGTH,
  SUBMISSION_TYPE_PREFIX,
  canTransition,
  type AuthContext,
  type IssueStatus,
  type Permission,
  type SubmissionType,
} from '@rk/types';
import { AppError } from '../../../errors/AppError';
import { authorizationService } from '../../auth/authorization.service';

/**
 * Authorization, validation and reference rules for citizen submissions.
 *
 * Centralised for the reason every prior phase centralised its guards: a rule
 * re-implemented per call site is a rule one call site will eventually be
 * missing. Here the stakes are a citizen's phone number, so the contact-access
 * check in particular exists exactly once.
 */

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/** Asserts an issue permission and returns the active tenant with it. */
export function requireIssueAccess(
  auth: AuthContext | null,
  permission: Permission,
): { auth: AuthContext; organizationId: string } {
  const permitted = authorizationService.requirePermission(auth, permission);
  return authorizationService.requireOrganization(permitted);
}

/**
 * Whether the caller may see the citizen's own details.
 *
 * Returns a boolean rather than throwing, because the normal response to
 * lacking it is to REDACT the fields and still show the submission - not to
 * fail the query. Somebody triaging a backlog has a legitimate need to read the
 * report without any need to know who sent it.
 */
export function canReadContact(auth: AuthContext | null): boolean {
  return authorizationService.can(auth, 'ISSUE_CONTACT_READ');
}

export function canReadNotes(auth: AuthContext | null): boolean {
  return authorizationService.can(auth, 'ISSUE_NOTE_READ');
}

export function canReadAttachments(auth: AuthContext | null): boolean {
  return authorizationService.can(auth, 'ISSUE_ATTACHMENT_READ');
}

// ---------------------------------------------------------------------------
// Reference numbers
// ---------------------------------------------------------------------------

/**
 * Builds a reference such as `ISS-2026-7F3K9XQ2`.
 *
 * `randomInt` from `node:crypto`, not `Math.random`: this string is the only
 * thing standing between a stranger and the status of somebody's report, so it
 * must not come from a predictable generator.
 */
export function generateReferenceNumber(type: SubmissionType, now = new Date()): string {
  let suffix = '';
  for (let i = 0; i < REFERENCE_RANDOM_LENGTH; i += 1) {
    suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `${SUBMISSION_TYPE_PREFIX[type]}-${now.getUTCFullYear()}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Citizen-facing validation
// ---------------------------------------------------------------------------

/**
 * Error messages here are read by a member of the public on their phone, often
 * while standing next to the problem they are reporting. They say what to do,
 * never what went wrong internally.
 */

export function requireTitle(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';

  if (trimmed.length === 0) {
    throw AppError.validation('Please enter a short title.', { details: { field: 'title' } });
  }
  if (trimmed.length > ISSUE_LIMITS.titleMax) {
    throw AppError.validation(`Please keep the title under ${ISSUE_LIMITS.titleMax} characters.`, {
      details: { field: 'title', limit: ISSUE_LIMITS.titleMax },
    });
  }
  return trimmed;
}

export function requireDescription(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';

  if (trimmed.length === 0) {
    throw AppError.validation('Please describe what you would like to share.', {
      details: { field: 'description' },
    });
  }
  if (trimmed.length < ISSUE_LIMITS.descriptionMin) {
    throw AppError.validation('Please add a little more detail so the team can help.', {
      details: { field: 'description' },
    });
  }
  if (trimmed.length > ISSUE_LIMITS.descriptionMax) {
    throw AppError.validation(
      `Please keep the description under ${ISSUE_LIMITS.descriptionMax} characters.`,
      { details: { field: 'description', limit: ISSUE_LIMITS.descriptionMax } },
    );
  }
  return trimmed;
}

export function optionalText(
  value: string | null | undefined,
  field: string,
  max: number,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.length > max) {
    throw AppError.validation(`Please keep this under ${max} characters.`, {
      details: { field, limit: max },
    });
  }
  return trimmed;
}

/**
 * Validates an email only enough to catch a typo.
 *
 * Deliberately permissive. A citizen mistyping their address loses the reply;
 * a citizen rejected by an over-strict pattern loses the whole submission, and
 * real addresses routinely defeat clever regular expressions.
 */
export function optionalEmail(value: string | null | undefined): string | null {
  const trimmed = optionalText(value, 'contactEmail', ISSUE_LIMITS.contactEmailMax);
  if (trimmed === null) return null;

  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(trimmed)) {
    throw AppError.validation('Please check the email address.', {
      details: { field: 'contactEmail' },
    });
  }
  return trimmed.toLowerCase();
}

/**
 * Validates a phone number loosely.
 *
 * Digits, spaces and the usual punctuation, 6 to 20 digits. No country-specific
 * rule: the platform should not reject a valid number because it was written in
 * an unexpected format, and the number is only ever dialled by a person.
 */
export function optionalPhone(value: string | null | undefined): string | null {
  const trimmed = optionalText(value, 'contactPhone', ISSUE_LIMITS.contactPhoneMax);
  if (trimmed === null) return null;

  if (!/^[+()\-\s\d]+$/.test(trimmed)) {
    throw AppError.validation('Please check the phone number.', {
      details: { field: 'contactPhone' },
    });
  }

  const digits = trimmed.replace(/\D/g, '').length;
  if (digits < 6 || digits > 20) {
    throw AppError.validation('Please check the phone number.', {
      details: { field: 'contactPhone' },
    });
  }
  return trimmed;
}

/** Rejects a coordinate outside its real-world range. */
export function optionalCoordinate(
  value: number | null | undefined,
  field: string,
  limit: number,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    throw AppError.validation('That location could not be read.', { details: { field } });
  }
  return value;
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/**
 * Asserts a status change is one the workflow permits.
 *
 * Enumerated transitions rather than "set it to anything", so a submission
 * cannot jump from SUBMITTED straight to CLOSED and skip the acknowledgement a
 * citizen is waiting on. The message names both ends, because an administrator
 * seeing "invalid transition" with no detail learns nothing.
 */
export function assertTransition(from: IssueStatus, to: IssueStatus): void {
  if (from === to) {
    throw AppError.validation(`This submission is already ${humanStatus(to)}.`, {
      details: { field: 'status' },
    });
  }

  if (!canTransition(from, to)) {
    throw AppError.validation(
      `A submission cannot move from ${humanStatus(from)} to ${humanStatus(to)}.`,
      { details: { field: 'status', from, to } },
    );
  }
}

export function humanStatus(status: IssueStatus): string {
  return status.replace(/_/g, ' ').toLowerCase();
}

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

export const MAX_ISSUE_PAGE_SIZE = 100;

export function clampIssuePageSize(requested: number | null | undefined, fallback = 25): number {
  const value = requested ?? fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw AppError.validation('`first` must be a positive integer.', {
      details: { field: 'first' },
    });
  }
  return Math.min(value, MAX_ISSUE_PAGE_SIZE);
}

export function clampOffset(requested: number | null | undefined): number {
  const value = requested ?? 0;
  if (!Number.isInteger(value) || value < 0) {
    throw AppError.validation('`offset` must be zero or a positive integer.', {
      details: { field: 'offset' },
    });
  }
  return value;
}
