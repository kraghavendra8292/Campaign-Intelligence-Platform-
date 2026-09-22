import { z } from 'zod';
import { AI_LIMITS, findBannedOutputTerm, type AiFailureKind } from '@rk/types';

/**
 * Validation of everything a model returns.
 *
 * THE PREMISE: AI OUTPUT IS UNTRUSTED INPUT. It arrives over the network, it is
 * shaped by text a member of the public wrote, and the vendor can change the
 * model underneath us without notice. It gets the same treatment as a request
 * body from the internet - parsed, schema-checked, bounded and safety-screened
 * before it is allowed near the database.
 *
 * Four checks, in order, because each assumes the previous one passed:
 *
 * 1. PARSE      - is it JSON at all? Models emit markdown fences and prose
 *                 apologies, especially under load.
 * 2. SCHEMA     - are the fields present and the right types? (zod)
 * 3. BOUNDS     - is every string within its column's ceiling? Enforced here
 *                 rather than by truncating at the database, because a silent
 *                 trim stores a sentence cut mid-word and calls it success.
 * 4. SAFETY     - does it contain political classification language, or a
 *                 category this tenant does not have? This is the check that
 *                 does not depend on the prompt having been obeyed.
 *
 * A failure returns a CLASSIFIED result rather than throwing. The caller
 * records it against the generation and moves on: a model that returned
 * nonsense is an operational event to surface for review, not an exception that
 * takes down a queue worker.
 */

export type AiValidationFailure = {
  readonly ok: false;
  readonly kind: Extract<AiFailureKind, 'INVALID_OUTPUT' | 'SAFETY_REJECTED'>;
  /** Safe for an administrator to read. Never raw model output. */
  readonly reason: string;
};

export type AiValidationSuccess<T> = { readonly ok: true; readonly value: T };
export type AiValidationResult<T> = AiValidationSuccess<T> | AiValidationFailure;

function invalid(reason: string): AiValidationFailure {
  return { ok: false, kind: 'INVALID_OUTPUT', reason };
}

function unsafe(reason: string): AiValidationFailure {
  return { ok: false, kind: 'SAFETY_REJECTED', reason };
}

/**
 * Extracts a JSON object from a completion.
 *
 * Tolerates the two things models do even when told not to: wrapping the object
 * in a markdown fence, and prefixing it with a sentence. Tolerated rather than
 * rejected because both are cosmetic and common, and failing a usable answer
 * over a fence would spend the budget again for nothing. Anything beyond those
 * two is a failure.
 */
function parseJsonObject(raw: string): AiValidationResult<unknown> {
  const withoutFence = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return invalid('The model did not return a JSON object.');
  }

  try {
    return { ok: true, value: JSON.parse(withoutFence.slice(start, end + 1)) };
  } catch {
    return invalid('The model returned malformed JSON.');
  }
}

/**
 * Screens generated prose for political-classification language.
 *
 * Applied to every free-text field that will be stored or displayed. See
 * `AI_BANNED_OUTPUT_TERMS` for why the list is narrow and what it is for: this
 * is the backstop for a model ignoring its instructions, not the primary
 * control.
 */
function screenText(fields: readonly (string | null | undefined)[]): AiValidationFailure | null {
  for (const field of fields) {
    if (!field) continue;
    const banned = findBannedOutputTerm(field);
    if (banned) {
      return unsafe(
        `Output was rejected because it contained the term "${banned}", which suggests ` +
          'a classification of people rather than a description of a reported problem.',
      );
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Issue insight
// ---------------------------------------------------------------------------

const issueInsightSchema = z.object({
  summary: z.string().min(AI_LIMITS.summaryMin).max(AI_LIMITS.summaryMax),
  // `.nullish()` rather than `.optional()`: a model told to return null when
  // nothing fits will return null, and treating that as a missing field would
  // fail a correct answer.
  suggestedCategoryKey: z.string().max(80).nullish(),
  categoryConfidence: z.number().min(0).max(1).nullish(),
  categoryReason: z.string().max(AI_LIMITS.reasonMax).nullish(),
  topics: z.array(z.string().min(1).max(AI_LIMITS.topicMax)).max(AI_LIMITS.topicsPerIssueMax),
});

export interface ValidatedIssueInsight {
  readonly summary: string;
  readonly suggestedCategoryKey: string | null;
  readonly categoryConfidence: number | null;
  readonly categoryReason: string | null;
  readonly topics: readonly string[];
}

/**
 * The JSON Schema handed to providers that constrain decoding.
 *
 * Kept beside the zod schema and deliberately equivalent. They serve different
 * ends - this one shapes generation, zod verifies it - and the zod check runs
 * whether or not the provider honoured this.
 */
export const ISSUE_INSIGHT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'suggestedCategoryKey', 'categoryConfidence', 'categoryReason', 'topics'],
  properties: {
    summary: { type: 'string' },
    suggestedCategoryKey: { type: ['string', 'null'] },
    categoryConfidence: { type: ['number', 'null'] },
    categoryReason: { type: ['string', 'null'] },
    topics: { type: 'array', items: { type: 'string' } },
  },
};

/**
 * Validates an issue insight against the tenant's own category vocabulary.
 *
 * `allowedCategoryKeys` is what stops a hallucinated category reaching the
 * suggestion column. A key outside the list is DISCARDED rather than failing
 * the whole generation - the summary and topics are still useful, and throwing
 * them away because the category guess was wrong would be a worse outcome for
 * the administrator than a suggestion-free insight.
 */
export function validateIssueInsight(
  raw: string,
  allowedCategoryKeys: readonly string[],
): AiValidationResult<ValidatedIssueInsight> {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) return parsed;

  const result = issueInsightSchema.safeParse(parsed.value);
  if (!result.success) {
    const issue = result.error.issues[0];
    return invalid(
      `The model's response did not match the expected shape` +
        (issue ? ` (${issue.path.join('.') || 'root'}: ${issue.message}).` : '.'),
    );
  }

  const data = result.data;

  const unsafeField = screenText([data.summary, data.categoryReason, ...data.topics]);
  if (unsafeField) return unsafeField;

  const allowed = new Set(allowedCategoryKeys);
  const suggestedKey =
    data.suggestedCategoryKey && allowed.has(data.suggestedCategoryKey)
      ? data.suggestedCategoryKey
      : null;

  // Normalise, de-duplicate and drop empties. A model asked for topics will
  // occasionally return "road damage" and "Road Damage" as separate entries.
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const topic of data.topics) {
    const trimmed = topic.trim();
    if (trimmed.length === 0) continue;
    const key = normalizeTopic(trimmed);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    topics.push(trimmed);
  }

  return {
    ok: true,
    value: {
      summary: data.summary.trim(),
      suggestedCategoryKey: suggestedKey,
      // Confidence is meaningless without a category, so it is cleared with it
      // rather than left behind as a number attached to nothing.
      categoryConfidence: suggestedKey ? (data.categoryConfidence ?? null) : null,
      categoryReason: suggestedKey ? (data.categoryReason?.trim() ?? null) : null,
      topics,
    },
  };
}

/**
 * Canonical form of a topic, used for grouping and for similarity.
 *
 * Lower-cased, punctuation stripped, whitespace collapsed. Exported because
 * the similarity service must normalise identically - two implementations
 * would silently stop matching each other.
 */
export function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, ' ')
    .trim()
    .slice(0, 80);
}

// ---------------------------------------------------------------------------
// Theme detection
// ---------------------------------------------------------------------------

const themeDetectionSchema = z.object({
  themes: z
    .array(
      z.object({
        name: z.string().min(1).max(AI_LIMITS.themeNameMax),
        description: z.string().max(AI_LIMITS.themeDescriptionMax).nullish(),
        summary: z.string().max(AI_LIMITS.themeSummaryMax).nullish(),
        issueReferences: z.array(z.string().max(40)).max(500).default([]),
      }),
    )
    .max(AI_LIMITS.themesPerRunMax),
});

export interface ValidatedTheme {
  readonly name: string;
  readonly description: string | null;
  readonly summary: string | null;
  readonly issueReferences: readonly string[];
}

export const THEME_DETECTION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['themes'],
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'summary', 'issueReferences'],
        properties: {
          name: { type: 'string' },
          description: { type: ['string', 'null'] },
          summary: { type: ['string', 'null'] },
          issueReferences: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

/**
 * Validates detected themes and discards references the model did not see.
 *
 * `knownReferences` is the sample that was actually sent. A reference outside it
 * is a fabrication - the model inventing a plausible-looking "ISS-2026-…"
 * string - and is dropped silently rather than failing the run, because the
 * theme itself is still valid and the membership counts are recomputed from the
 * surviving references anyway.
 */
export function validateThemeDetection(
  raw: string,
  knownReferences: readonly string[],
): AiValidationResult<readonly ValidatedTheme[]> {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) return parsed;

  const result = themeDetectionSchema.safeParse(parsed.value);
  if (!result.success) {
    const issue = result.error.issues[0];
    return invalid(
      `The model's theme response did not match the expected shape` +
        (issue ? ` (${issue.path.join('.') || 'root'}: ${issue.message}).` : '.'),
    );
  }

  const known = new Set(knownReferences);
  const themes: ValidatedTheme[] = [];

  for (const theme of result.data.themes) {
    const unsafeField = screenText([theme.name, theme.description, theme.summary]);
    if (unsafeField) return unsafeField;

    themes.push({
      name: theme.name.trim(),
      description: theme.description?.trim() ?? null,
      summary: theme.summary?.trim() ?? null,
      issueReferences: [...new Set(theme.issueReferences.filter((ref) => known.has(ref)))],
    });
  }

  // Themes with no surviving membership are dropped: a theme that matches no
  // issue in the period is not an observation about the period.
  return { ok: true, value: themes.filter((theme) => theme.issueReferences.length > 0) };
}

// ---------------------------------------------------------------------------
// Executive summary
// ---------------------------------------------------------------------------

const executiveSummarySchema = z.object({
  summary: z.string().min(20).max(AI_LIMITS.executiveSummaryMax),
  keyThemes: z.array(z.string().min(1).max(AI_LIMITS.themeNameMax)).max(AI_LIMITS.keyThemesMax),
});

export interface ValidatedExecutiveSummary {
  readonly summary: string;
  readonly keyThemes: readonly string[];
  /**
   * Numbers in the prose that do not appear in the supplied evidence.
   *
   * NOT a hard failure - see `validateExecutiveSummary` for why - but surfaced
   * so the generation can be flagged REQUIRES_REVIEW and an administrator can
   * see exactly which figures to check.
   */
  readonly unsupportedFigures: readonly string[];
}

export const EXECUTIVE_SUMMARY_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'keyThemes'],
  properties: {
    summary: { type: 'string' },
    keyThemes: { type: 'array', items: { type: 'string' } },
  },
};

/**
 * Validates an executive summary and CHECKS ITS ARITHMETIC AGAINST THE EVIDENCE.
 *
 * This is the anti-hallucination control the brief asks for, and the design
 * decision worth explaining is why an unsupported figure FLAGS rather than
 * FAILS.
 *
 * Extracting numbers from prose is inherently approximate. "Submissions rose by
 * roughly a third" contains no digits and is supportable; "the 40 road reports"
 * where the evidence says 40 is supportable and trivially matched; but "in the
 * first 2 weeks" contains a 2 that is not a statistic at all. A hard failure on
 * any unmatched number would reject correct summaries for mentioning a week
 * number, and the operator's rational response would be to disable the check.
 *
 * So: every number in the prose is compared against the supplied evidence, and
 * any that cannot be accounted for is reported. The service marks such a
 * generation REQUIRES_REVIEW, the UI shows the figures beside the prose, and a
 * person decides. That is a control that survives contact with real output.
 */
export function validateExecutiveSummary(
  raw: string,
  supportedNumbers: readonly number[],
): AiValidationResult<ValidatedExecutiveSummary> {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) return parsed;

  const result = executiveSummarySchema.safeParse(parsed.value);
  if (!result.success) {
    const issue = result.error.issues[0];
    return invalid(
      `The model's summary did not match the expected shape` +
        (issue ? ` (${issue.path.join('.') || 'root'}: ${issue.message}).` : '.'),
    );
  }

  const data = result.data;

  const unsafeField = screenText([data.summary, ...data.keyThemes]);
  if (unsafeField) return unsafeField;

  return {
    ok: true,
    value: {
      summary: data.summary.trim(),
      keyThemes: data.keyThemes.map((theme) => theme.trim()),
      unsupportedFigures: findUnsupportedFigures(data.summary, supportedNumbers),
    },
  };
}

/**
 * Numbers in the prose that the evidence does not account for.
 *
 * Tolerances, each for a concrete reason rather than to be lenient:
 *
 *  - Percentages match within 0.5, because the model is asked to quote a
 *    computed share and may render 32.4 as 32.
 *  - Integers 1-12 are ignored: they are overwhelmingly ordinals, month counts
 *    and paragraph enumeration, not statistics.
 *  - A number matching any supplied figure exactly is supported, wherever it
 *    came from in the evidence object.
 */
function findUnsupportedFigures(
  summary: string,
  supportedNumbers: readonly number[],
): readonly string[] {
  const supported = new Set(supportedNumbers.map((value) => Math.round(value * 10) / 10));
  const unsupported: string[] = [];

  for (const match of summary.matchAll(/\d[\d,]*\.?\d*/g)) {
    const text = match[0];
    const value = Number.parseFloat(text.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;

    if (Number.isInteger(value) && value >= 1 && value <= 12) continue;

    const rounded = Math.round(value * 10) / 10;
    if (supported.has(rounded)) continue;

    const near = [...supported].some((candidate) => Math.abs(candidate - rounded) <= 0.5);
    if (near) continue;

    unsupported.push(text);
  }

  return [...new Set(unsupported)];
}

/**
 * Flattens an evidence object into every number a summary may legitimately cite.
 *
 * Includes derived values the model is expected to quote - shares and the
 * period-over-period change - because those are computed by the backend and
 * handed over, so a summary repeating them is citing evidence, not inventing it.
 */
export function collectSupportedNumbers(evidence: Record<string, unknown>): number[] {
  const numbers: number[] = [];

  const walk = (value: unknown): void => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      numbers.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) walk(item);
    }
  };

  walk(evidence);
  return numbers;
}
