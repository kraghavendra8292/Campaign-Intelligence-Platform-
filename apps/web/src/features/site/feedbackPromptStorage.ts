/**
 * Client flags for site feedback UX.
 *
 * "Given" is stored in localStorage so a visitor cannot submit again after
 * refresh. Prompt dismiss is in-memory for this page lifetime only — so a hard
 * refresh (fresh visit) can ask again, while SPA navigations after dismiss do not.
 *
 * Earlier builds wrote dismiss into sessionStorage, which survived refresh and
 * permanently blocked the 30s popup in the same tab. That key is cleared once.
 */

const GIVEN_KEY = 'rk.siteFeedback.given';
const LEGACY_DISMISSED_KEY = 'rk.siteFeedback.promptDismissed';
export const SITE_FEEDBACK_GIVEN_EVENT = 'rk:site-feedback-given';

/**
 * Wall-clock deadline for the dwell prompt, keyed by org.
 *
 * Kept at module scope so React Strict Mode's mount → unmount → remount cycle
 * (and brief HMR remounts) does not reset the 30s timer back to zero.
 */
const promptDeadlines = new Map<string, number>();

/** Dismissed for this JS realm only (cleared on full page reload). */
let promptDismissedThisLoad = false;

function givenKey(organizationSlug: string | null | undefined): string {
  return `${GIVEN_KEY}:${organizationSlug?.trim() || 'default'}`;
}

function deadlineKey(organizationSlug: string | null | undefined): string {
  return organizationSlug?.trim() || 'default';
}

function readLocal(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeLocal(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* private mode */
  }
}

/** Drop the legacy session flag that blocked the popup across refreshes. */
function clearLegacyDismissFlag(): void {
  try {
    sessionStorage.removeItem(LEGACY_DISMISSED_KEY);
  } catch {
    /* private mode */
  }
}

clearLegacyDismissFlag();

export function hasSiteFeedbackBeenGiven(organizationSlug?: string | null): boolean {
  // Prefer the org-scoped key; also honour a legacy unscoped flag from earlier builds.
  return readLocal(givenKey(organizationSlug)) || readLocal(GIVEN_KEY);
}

export function markSiteFeedbackGiven(organizationSlug?: string | null): void {
  writeLocal(givenKey(organizationSlug));
  promptDismissedThisLoad = true;
  promptDeadlines.delete(deadlineKey(organizationSlug));
  clearLegacyDismissFlag();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(SITE_FEEDBACK_GIVEN_EVENT, {
        detail: { organizationSlug: organizationSlug ?? null },
      }),
    );
  }
}

export function wasSiteFeedbackPromptDismissed(): boolean {
  return promptDismissedThisLoad;
}

export function markSiteFeedbackPromptDismissed(): void {
  promptDismissedThisLoad = true;
  promptDeadlines.clear();
  clearLegacyDismissFlag();
}

/** Remaining ms until the dwell prompt should open, or 0 if due now. */
export function getSiteFeedbackPromptDelayMs(
  organizationSlug: string | null | undefined,
  dwellMs: number,
  now = Date.now(),
): number {
  const key = deadlineKey(organizationSlug);
  let deadline = promptDeadlines.get(key);
  if (deadline == null) {
    deadline = now + dwellMs;
    promptDeadlines.set(key, deadline);
  }
  return Math.max(0, deadline - now);
}

/** Test helper — clears dwell deadlines and in-memory dismiss without touching given. */
export function resetSiteFeedbackPromptDeadlines(): void {
  promptDeadlines.clear();
  promptDismissedThisLoad = false;
  clearLegacyDismissFlag();
}
