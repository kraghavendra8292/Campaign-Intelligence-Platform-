/**
 * Homepage opinion pulse: lightweight Great / Ok / Worst reactions.
 *
 * Distinct from Phase 5 Issues. Issues are trackable cases with status workflow.
 * Site feedback is a short public pulse with optional commentary — no inbox
 * triage, no contact fields, no reference numbers.
 */

export const SITE_FEEDBACK_REACTIONS = ['GREAT', 'OK', 'WORST'] as const;
export type SiteFeedbackReaction = (typeof SITE_FEEDBACK_REACTIONS)[number];

export function isSiteFeedbackReaction(value: unknown): value is SiteFeedbackReaction {
  return (
    typeof value === 'string' &&
    (SITE_FEEDBACK_REACTIONS as readonly string[]).includes(value)
  );
}

export const SITE_FEEDBACK_LIMITS = {
  /** Maximum commentary length (characters). */
  maxCommentChars: 500,
  /** Submissions allowed per IP per window (public write surface). */
  maxPerWindow: 20,
  /** Window length in milliseconds. */
  windowMs: 60_000,
} as const;
