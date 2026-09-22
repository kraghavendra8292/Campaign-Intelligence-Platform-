import type { AiFailureKind, AiOperation } from '@rk/types';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import { getEnv } from '../../config/env';
import { getLogger } from '../../logging/logger';
import {
  AiProviderError,
  getAiProvider,
  type AiGenerationResult,
  type AiMessage,
} from './provider/index';

/**
 * The single path from this platform to an AI provider.
 *
 * Every generation in Phase 6 goes through `runGeneration`. That is the point:
 * retry policy, timeout, usage logging and cost estimation are properties of
 * "calling a model", not of summarising an issue, and implementing them three
 * times is how two of the three end up without a usage log.
 *
 * WHAT THIS FUNCTION DOES NOT DO, deliberately:
 *  - It does not build prompts. Those live in `prompts/`.
 *  - It does not validate output. That lives in `validation/`.
 *  - It does not decide whether the caller is allowed to spend money. That is
 *    `aiGuards.ts`, checked before this is reached.
 *
 * It transports, retries, and records. Nothing else.
 */

export interface GenerationRequest {
  readonly organizationId: string;
  readonly operation: AiOperation;
  readonly messages: readonly AiMessage[];
  readonly schemaName: string;
  readonly schema: Record<string, unknown>;
  readonly actorUserId?: string | null;
  readonly correlationId?: string | null;
}

export type GenerationOutcome =
  | { readonly ok: true; readonly result: AiGenerationResult }
  | { readonly ok: false; readonly kind: AiFailureKind; readonly reason: string };

/**
 * Calls the provider, retrying transient failures, and records what happened.
 *
 * RETRY POLICY. Only failures the provider marked retryable are retried -
 * timeouts, 429s and 5xx. A 4xx, a missing credential or malformed output is
 * not: the identical request would fail identically, and paying twice for the
 * same rejection is worse than surfacing it.
 *
 * Backoff is exponential with a fixed base. No jitter, because the concurrency
 * here is one or two workers in a single process, and the thundering-herd
 * problem jitter solves does not exist at that scale.
 *
 * NEVER THROWS. A provider failure is an expected operational event, not an
 * exception: a queue worker that crashed on a 500 would stop processing the
 * backlog, and a resolver that propagated a vendor error would surface provider
 * internals to a client. Callers get a classified outcome and decide.
 */
export async function runGeneration(request: GenerationRequest): Promise<GenerationOutcome> {
  const env = getEnv();
  const provider = getAiProvider();
  const logger = getLogger();
  const startedAt = Date.now();

  if (!provider.isAvailable()) {
    await recordUsage({
      request,
      provider: provider.name,
      model: provider.model,
      success: false,
      failureKind: 'NOT_CONFIGURED',
      durationMs: 0,
      usage: null,
    });
    return { ok: false, kind: 'NOT_CONFIGURED', reason: 'AI processing is not configured.' };
  }

  let lastError: AiProviderError = new AiProviderError('UNKNOWN', 'No attempt was made.');

  for (let attempt = 0; attempt <= env.AI_MAX_RETRIES; attempt += 1) {
    try {
      const result = await provider.generate({
        messages: request.messages,
        schemaName: request.schemaName,
        schema: request.schema,
        maxTokens: env.AI_MAX_TOKENS,
        temperature: env.AI_TEMPERATURE,
        timeoutMs: env.AI_TIMEOUT_MS,
      });

      await recordUsage({
        request,
        provider: provider.name,
        model: result.model,
        success: true,
        failureKind: null,
        durationMs: Date.now() - startedAt,
        usage: result.usage,
      });

      return { ok: true, result };
    } catch (error) {
      lastError =
        error instanceof AiProviderError
          ? error
          : // A provider that threw something else has broken its contract. It
            // is still contained here rather than propagated, because the
            // caller's correct response is identical either way.
            new AiProviderError(
              'UNKNOWN',
              `Provider threw an unexpected error: ${String((error as Error | null)?.message ?? error)}`,
            );

      // The full provider message goes to the server log and nowhere else: it
      // can echo the request, which contains (redacted) citizen text.
      logger.warn(
        {
          operation: request.operation,
          organizationId: request.organizationId,
          attempt: attempt + 1,
          kind: lastError.kind,
          err: lastError.message,
        },
        'AI generation attempt failed',
      );

      if (!lastError.retryable || attempt === env.AI_MAX_RETRIES) break;

      await delay(2 ** attempt * 500);
    }
  }

  await recordUsage({
    request,
    provider: provider.name,
    model: provider.model,
    success: false,
    failureKind: lastError.kind,
    durationMs: Date.now() - startedAt,
    usage: null,
  });

  return { ok: false, kind: lastError.kind, reason: safeFailureReason(lastError.kind) };
}

/**
 * The failure text an administrator is shown.
 *
 * Mapped from the category rather than passed through from the provider, for
 * the same reason the audit log redacts: a provider error string can contain
 * the request body. These sentences also avoid implying the platform is broken
 * when it is not - the submissions and the issue console are untouched by any
 * of this, and the message says so where it matters.
 */
function safeFailureReason(kind: AiFailureKind): string {
  const reasons: Record<AiFailureKind, string> = {
    PROVIDER_UNAVAILABLE: 'The AI provider could not be reached. Processing can be retried later.',
    PROVIDER_ERROR: 'The AI provider rejected the request.',
    TIMEOUT: 'The AI provider did not respond in time. Processing can be retried later.',
    RATE_LIMITED: 'The AI provider is rate limiting requests. Processing can be retried later.',
    INVALID_OUTPUT: 'The AI response could not be read and was discarded.',
    SAFETY_REJECTED: 'The AI response was rejected by a safety check and was discarded.',
    NOT_CONFIGURED: 'AI processing is not configured for this deployment.',
    UNKNOWN: 'AI processing failed for an unknown reason.',
  };
  return reasons[kind];
}

/**
 * Writes one operational telemetry row.
 *
 * Best-effort and non-fatal: a telemetry write that failed must not turn a
 * successful generation into a failed one. It is logged and swallowed.
 *
 * NOTHING FROM THE PROMPT OR THE COMPLETION IS RECORDED - see the model comment
 * on `AiUsageLog`. This row answers "what did we run, how big was it, did it
 * work", and nothing about what anybody wrote.
 */
async function recordUsage(input: {
  request: GenerationRequest;
  provider: string;
  model: string;
  success: boolean;
  failureKind: AiFailureKind | null;
  durationMs: number;
  usage: AiGenerationResult['usage'] | null;
}): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        organizationId: input.request.organizationId,
        operation: input.request.operation,
        model: input.model.slice(0, 120),
        provider: input.provider.slice(0, 60),
        success: input.success,
        failureKind: input.failureKind,
        promptTokens: input.usage?.promptTokens ?? null,
        completionTokens: input.usage?.completionTokens ?? null,
        totalTokens: input.usage?.totalTokens ?? null,
        estimatedCostUsd: estimateCost(input.usage),
        durationMs: input.durationMs,
        correlationId: input.request.correlationId?.slice(0, 64) ?? null,
        actorUserId: input.request.actorUserId ?? null,
      },
    });
  } catch (error) {
    getLogger().error({ err: error }, 'Failed to write AI usage log');
  }
}

/**
 * Estimated cost from configured rates.
 *
 * Returns NULL - not zero - when rates are unconfigured or the provider did not
 * report usage. "Not priced" and "free" are different facts, and a dashboard
 * that renders the first as "$0.00" is lying about the second. Nothing here
 * estimates token counts from character lengths: a guessed token count with a
 * currency symbol in front of it is a fabricated number.
 */
function estimateCost(usage: AiGenerationResult['usage'] | null): Prisma.Decimal | null {
  const env = getEnv();
  const inputRate = env.AI_COST_PER_MILLION_INPUT_USD;
  const outputRate = env.AI_COST_PER_MILLION_OUTPUT_USD;

  if (inputRate === undefined || outputRate === undefined) return null;
  if (!usage || usage.promptTokens === null || usage.completionTokens === null) return null;

  const cost =
    (usage.promptTokens / 1_000_000) * inputRate +
    (usage.completionTokens / 1_000_000) * outputRate;

  return new Prisma.Decimal(cost.toFixed(6));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
