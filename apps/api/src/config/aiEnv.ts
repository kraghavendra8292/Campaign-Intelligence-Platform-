import { z } from 'zod';
import { booleanSchema, httpUrlSchema } from '@rk/config';

/**
 * Phase 6 AI configuration.
 *
 * THE PROVIDER KEY IS SERVER-SIDE ONLY. It is read here, held in the validated
 * env object, and passed to the provider adapter. It is never selected into a
 * GraphQL type, never written to a database column, never placed in a log line
 * (the logger's redactor covers the key name as well), and there is no Vite
 * `VITE_`-prefixed twin anywhere in `apps/web` - the browser has no path to a
 * provider and is not meant to.
 *
 * THE WHOLE PHASE IS OFF BY DEFAULT. `AI_ENABLED` defaults false and no key has
 * a default, so a deployment that has not deliberately configured AI runs with
 * the assistant disabled: the admin console reports it as unavailable, the
 * queue accepts nothing, and - the part that matters - citizen submission is
 * completely unaffected, because it never depended on this in the first place.
 */
export const aiEnvSchema = {
  /**
   * Master switch.
   *
   * Off by default rather than inferred from the presence of a key. Inference
   * would mean pasting a key into an environment file silently began spending
   * money on every submission; enabling AI should be a decision somebody made.
   */
  AI_ENABLED: booleanSchema(false),

  /**
   * Which adapter serves requests.
   *
   * `mock` is not only for tests: it lets the entire admin console, review
   * workflow and dashboard be exercised in development without a provider
   * account or a single paid call. It returns deterministic, clearly-labelled
   * placeholder output.
   */
  AI_PROVIDER: z.enum(['openai', 'mock']).default('mock'),

  /** Provider credential. No default, and never logged or returned. */
  OPENAI_API_KEY: z.string().min(1).optional(),
  /** Overridable for Azure OpenAI or a compatible gateway. */
  OPENAI_BASE_URL: httpUrlSchema.default('https://api.openai.com/v1'),

  /**
   * Model identifier, as configuration rather than a literal in business logic.
   *
   * Stored on every generation (`model` column) so output produced by an older
   * model stays attributable after this value changes.
   */
  AI_MODEL: z.string().min(1).default('gpt-4o-mini'),

  /**
   * Output ceiling per call. Bounds cost and matches the fact that every
   * operation here produces a short structured object, not an essay.
   */
  AI_MAX_TOKENS: z.coerce.number().int().min(64).max(8192).default(900),

  /**
   * Sampling temperature.
   *
   * Deliberately low. These are administrative summaries of what a citizen
   * actually wrote; the desirable property is faithfulness to the source, not
   * variety. A higher value buys nothing here and makes invention more likely.
   */
  AI_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.2),

  /** Per-request timeout. A hung provider must not hold a queue slot. */
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),

  /**
   * Retries for TRANSIENT failures only (timeout, 429, 5xx).
   *
   * Invalid output is never retried by this counter: a model that returned
   * unparseable JSON will usually do it again, and the useful response is to
   * surface it for review rather than to pay for the same failure three times.
   */
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  /**
   * Whether a new submission is queued for processing automatically.
   *
   * On by default, but note what that does NOT mean: the enqueue is a
   * fire-and-forget call made after the submission has already been committed
   * and the citizen already has their reference number. When AI is disabled or
   * the queue is full it is a no-op. Nothing about citizen submission can fail
   * because of anything in this file.
   */
  AI_AUTO_PROCESS_ON_SUBMIT: booleanSchema(true),

  /**
   * In-process worker concurrency.
   *
   * One by default. The queue is a background convenience running inside the
   * API process (see `aiQueue.ts` for why that is a documented limitation
   * rather than an architecture), and a single worker keeps provider
   * concurrency predictable without a distributed lock.
   */
  AI_QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  /** Bound on the in-memory backlog. Beyond this, enqueue is refused. */
  AI_QUEUE_MAX_SIZE: z.coerce.number().int().min(10).max(10_000).default(500),

  /**
   * Generation budget per organisation per window.
   *
   * Tenant-scoped rather than per-user, because the cost lands on the tenant:
   * three administrators each regenerating politely still adds up to one bill.
   */
  AI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(3_600_000),
  AI_RATE_LIMIT_MAX_PER_ORG: z.coerce.number().int().min(1).default(300),
  /** Tighter ceiling for regeneration, the one operation that is unbounded. */
  AI_REGENERATE_MAX_PER_ORG: z.coerce.number().int().min(1).default(50),

  /**
   * Per-million-token rates used for the ESTIMATED cost column.
   *
   * Optional and with no default on purpose. A default price would be a guess
   * that renders as a dollar figure in an admin dashboard, which is worse than
   * showing nothing: unpriced usage reports as "not priced" rather than as
   * "$0.00". Set these to the rates your account actually pays.
   */
  AI_COST_PER_MILLION_INPUT_USD: z.coerce.number().min(0).optional(),
  AI_COST_PER_MILLION_OUTPUT_USD: z.coerce.number().min(0).optional(),
};
