/**
 * Phase 6 AI issue intelligence: vocabulary, limits and permissions.
 *
 * SCOPE NOTE, and it is the most important thing in this file - it extends the
 * one at the top of `issues.ts` rather than relaxing it.
 *
 * Phase 5 established that a citizen writing about a broken drain has told us
 * about a drain. Phase 6 adds a model that reads those reports, and a model is
 * exactly the component most likely to be asked to infer something about the
 * person instead. So the same absence is enforced here, structurally:
 *
 *  - There is no enum member, field or permission that can hold a political
 *    opinion, an affiliation, a supporter or opponent score, a voting
 *    intention, an ideology, a caste, a religion, or any inference about an
 *    individual citizen.
 *  - Every AI-derived record attaches to an ISSUE or to an AGGREGATE PERIOD.
 *    None attaches to a person. There is no citizen-keyed AI table, and the
 *    schema gives nowhere to put one.
 *  - Topics and themes describe SUBJECT MATTER ("road damage"), never a
 *    disposition ("frustrated with the council").
 *
 * The banned-output vocabulary below is not decoration: it is checked against
 * model output at runtime, so a provider that ignores its instructions and
 * returns a political classification fails validation rather than being
 * persisted.
 */

// ---------------------------------------------------------------------------
// Processing state
// ---------------------------------------------------------------------------

/**
 * Where an AI generation has got to.
 *
 * Distinct from review state below, and the split matters. Processing is about
 * the MACHINE ("did the provider answer?"); review is about the HUMAN ("has
 * anybody checked what it said?"). Collapsing them would make "the model
 * succeeded" and "a person approved it" the same fact, which is the single
 * assumption this whole phase exists to avoid.
 *
 * REQUIRES_REVIEW is a processing outcome rather than a review state: it means
 * the generation completed but something about it - low confidence, a category
 * the tenant does not have, output that tripped a safety check - means it must
 * not be shown as ordinary AI output.
 */
export const AI_PROCESSING_STATUSES = [
  'NOT_PROCESSED',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'REQUIRES_REVIEW',
] as const;
export type AiProcessingStatus = (typeof AI_PROCESSING_STATUSES)[number];

/** Processing states that mean no usable output exists yet. */
export const AI_INCOMPLETE_STATUSES: readonly AiProcessingStatus[] = [
  'NOT_PROCESSED',
  'QUEUED',
  'PROCESSING',
  'FAILED',
];

// ---------------------------------------------------------------------------
// Review state
// ---------------------------------------------------------------------------

/**
 * What a human has decided about a generation.
 *
 * GENERATED is the honest default: the model produced something and nobody has
 * looked at it. It is deliberately NOT called "pending" - PENDING_REVIEW means
 * somebody actively queued it for attention, which is a different claim.
 *
 * STALE is set by the system, never by a person: it means the underlying issue
 * changed after this output was generated, so the summary may now describe text
 * that no longer exists. An approved summary that goes stale keeps the record
 * of its approval - `reviewedAt` and `reviewedByUserId` survive - because
 * somebody did approve it, of the older text.
 */
export const AI_REVIEW_STATUSES = [
  'GENERATED',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'STALE',
] as const;
export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number];

/** Review states in which output may be presented as human-checked. */
export const AI_TRUSTED_REVIEW_STATUSES: readonly AiReviewStatus[] = ['APPROVED'];

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

/**
 * Banded confidence.
 *
 * Bands rather than the raw float in the UI, because a number like 0.87 reads
 * as a measurement and it is not one - it is a token-probability artefact the
 * model emitted about its own guess, with no calibration against whether the
 * guess was right. The float is stored (providers report it, and it is useful
 * for tuning thresholds) but what an administrator is shown is a band, so the
 * interface never implies a precision that does not exist.
 */
export const AI_CONFIDENCE_BANDS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type AiConfidenceBand = (typeof AI_CONFIDENCE_BANDS)[number];

/** Below this, a category suggestion is never presented as actionable. */
export const AI_LOW_CONFIDENCE_THRESHOLD = 0.5;
/** At or above this, a suggestion is banded HIGH. */
export const AI_HIGH_CONFIDENCE_THRESHOLD = 0.8;

export function confidenceBand(confidence: number | null | undefined): AiConfidenceBand {
  if (confidence === null || confidence === undefined) return 'LOW';
  if (confidence >= AI_HIGH_CONFIDENCE_THRESHOLD) return 'HIGH';
  if (confidence >= AI_LOW_CONFIDENCE_THRESHOLD) return 'MEDIUM';
  return 'LOW';
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * The AI operations this platform performs. The complete list.
 *
 * Enumerated rather than free text so the usage log, the rate limiter and the
 * cost rollup all speak the same vocabulary, and so adding a seventh operation
 * is a deliberate edit here rather than a string typed into a service.
 */
export const AI_OPERATIONS = [
  /** Summary, category suggestion and topics for one issue, in one call. */
  'ISSUE_INSIGHT',
  /** Recurring subject-matter themes across an aggregate set of issues. */
  'THEME_DETECTION',
  /** Period narrative written from backend-computed statistics. */
  'EXECUTIVE_SUMMARY',
] as const;
export type AiOperation = (typeof AI_OPERATIONS)[number];

/** Why a generation failed, for operational metrics. Never provider internals. */
export const AI_FAILURE_KINDS = [
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ERROR',
  'TIMEOUT',
  'RATE_LIMITED',
  'INVALID_OUTPUT',
  'SAFETY_REJECTED',
  'NOT_CONFIGURED',
  'UNKNOWN',
] as const;
export type AiFailureKind = (typeof AI_FAILURE_KINDS)[number];

// ---------------------------------------------------------------------------
// Prompt versions
// ---------------------------------------------------------------------------

/**
 * Versioned prompt identifiers, stored on every generation.
 *
 * Recorded so a later prompt change is traceable: when a summary reads oddly
 * six months from now, the question "which instructions produced this?" has an
 * answer. Bump the version rather than editing a prompt in place - an edited
 * prompt silently invalidates the provenance of every row that cites it.
 */
export const AI_PROMPT_VERSIONS = {
  ISSUE_INSIGHT: 'ISSUE_INSIGHT_V1',
  THEME_DETECTION: 'THEME_DETECTION_V1',
  EXECUTIVE_SUMMARY: 'EXECUTIVE_SUMMARY_V1',
} as const satisfies Record<AiOperation, string>;

export type AiPromptVersion = (typeof AI_PROMPT_VERSIONS)[AiOperation];

// ---------------------------------------------------------------------------
// Output limits
// ---------------------------------------------------------------------------

/**
 * Ceilings on model output.
 *
 * Enforced on the way in from the provider, not merely in the UI. A model that
 * ignores "two sentences" and returns four kilobytes must not be able to widen
 * a table column's practical contents or break a layout, and truncating at the
 * database boundary would store a sentence cut mid-word. Output longer than
 * these is a validation failure, which is visible, rather than a silent trim.
 */
export const AI_LIMITS = {
  summaryMax: 600,
  summaryMin: 10,
  topicMax: 60,
  topicsPerIssueMax: 8,
  themeNameMax: 80,
  themeDescriptionMax: 400,
  themeSummaryMax: 1200,
  themesPerRunMax: 12,
  executiveSummaryMax: 2500,
  keyThemesMax: 8,
  reasonMax: 300,

  /**
   * How many issues may inform one aggregate run.
   *
   * A ceiling on cost and on prompt size, not a statement about how many issues
   * exist. Themes are detected from a representative sample of titles and
   * topics; the COUNTS reported alongside them come from the database over the
   * whole period, never from the sample.
   */
  themeSampleMax: 150,
  /** Issues per issue-insight batch run. */
  batchMax: 50,
} as const;

// ---------------------------------------------------------------------------
// Output safety vocabulary
// ---------------------------------------------------------------------------

/**
 * Terms that must never appear in AI output about citizens.
 *
 * This is a LAST-LINE CHECK, not the primary control. The primary controls are
 * the prompts (which never ask for any of this) and the data model (which has
 * nowhere to store it). This list catches the case where a provider ignores
 * both - because "the model was told not to" is not a safeguard, it is a hope.
 *
 * Matched case-insensitively on word boundaries against generated text. A hit
 * marks the generation SAFETY_REJECTED and it is never persisted as usable
 * output.
 *
 * Deliberately narrow. Broad matching would reject legitimate administrative
 * language - a citizen may well report a problem at a polling station, and a
 * summary saying so is correct. What is banned is language that CLASSIFIES A
 * PERSON politically, so the entries target that construction.
 */
export const AI_BANNED_OUTPUT_TERMS: readonly string[] = [
  'supporter',
  'opponent',
  'anti-incumbent',
  'pro-incumbent',
  'vote share',
  'voting intention',
  'voter intention',
  'will vote',
  'likely to vote',
  'political affiliation',
  'party affiliation',
  'political leaning',
  'political preference',
  'ideology',
  'ideological',
  'caste',
  'religion',
  'communal',
  'swing voter',
  'vote bank',
  'persuadable',
  'sentiment score',
  'loyalty score',
];

const BANNED_TERM_PATTERN = new RegExp(
  `\\b(${AI_BANNED_OUTPUT_TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i',
);

/**
 * Whether generated text contains banned political-classification language.
 *
 * Returns the offending term so the failure can be logged specifically enough
 * to investigate a prompt regression, without logging the whole output.
 */
export function findBannedOutputTerm(text: string): string | null {
  const match = BANNED_TERM_PATTERN.exec(text);
  return match?.[1]?.toLowerCase() ?? null;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * AI permissions.
 *
 * Hand-listed rather than generated from an entity × action grid, for the same
 * reason the issue set is: these are not a clean product. Reading an insight,
 * spending money generating one, and approving one for administrative use are
 * three different acts with three different risks - a cost, a disclosure and an
 * endorsement - and flattening them would mean whoever could read AI output
 * could also run up an unbounded provider bill.
 *
 * Four deliberately separate grants:
 *
 *  - `AI_INSIGHT_READ`      - see AI output that already exists. Cheap, and the
 *    baseline for anybody working the issue queue.
 *  - `AI_ISSUE_PROCESS`     - cause a generation to happen. COSTS MONEY, so it
 *    is separate from reading and is rate limited on top.
 *  - `AI_ISSUE_REGENERATE`  - re-run a generation that already succeeded. Held
 *    apart from first-time processing because it is the unbounded one: an
 *    issue can only be processed from scratch once, but it can be regenerated
 *    forever.
 *  - `AI_SUMMARY_REVIEW`    - approve, edit or reject. This is the act that
 *    turns model output into something the organisation stands behind, and it
 *    is the whole point of the human-in-the-loop design.
 */
export const AI_PERMISSIONS = [
  'AI_INSIGHT_READ',
  'AI_ISSUE_PROCESS',
  'AI_ISSUE_REGENERATE',
  'AI_SUMMARY_REVIEW',
  'AI_ANALYTICS_READ',
] as const;

export type AiPermission = (typeof AI_PERMISSIONS)[number];

/** Human-readable descriptions for the seeded `permissions` table. */
export function describeAiPermission(permission: AiPermission): string {
  const descriptions: Record<AiPermission, string> = {
    AI_INSIGHT_READ: 'View AI-generated summaries, topics and themes for submissions.',
    AI_ISSUE_PROCESS: 'Run AI processing on a submission. Consumes provider quota.',
    AI_ISSUE_REGENERATE:
      'Re-run AI processing on a submission that already has output. Rate limited.',
    AI_SUMMARY_REVIEW: 'Approve, edit or reject AI-generated output for administrative use.',
    AI_ANALYTICS_READ: 'View AI operational metrics, usage and estimated cost.',
  };

  return descriptions[permission];
}
