import { getEnv } from '../../config/env';
import { getLogger } from '../../logging/logger';
import { prisma } from '../../database/prisma';
import { isAiEnabled } from './provider/index';
import { processIssue } from './issueInsight.service';

/**
 * Background AI processing.
 *
 * WHAT THIS IS: an in-process FIFO with bounded size and bounded concurrency.
 * Work is enqueued, a worker drains it, and the durable state - which issues
 * have been processed and which failed - lives in `issue_ai_insights`, not in
 * this array.
 *
 * WHAT THIS IS NOT, STATED PLAINLY: a durable job queue. The project has no
 * queue infrastructure (no BullMQ, no Redis worker, no cron), and Phase 6 does
 * not add one, because adding distributed infrastructure to ship one feature is
 * how a platform acquires an operational dependency nobody signed up for. The
 * consequences are real and are documented rather than hidden:
 *
 *  - Work queued but not yet run is LOST on restart. Rows stay at QUEUED, and
 *    `requeueStranded` picks them up on next boot.
 *  - Two API instances each run their own queue. Two workers could process the
 *    same issue simultaneously; the result is one wasted call, because the
 *    write is an idempotent upsert keyed on `issueId`. Wasteful, not corrupting.
 *  - There is no scheduled retry. A failed generation stays FAILED until a
 *    person retries it, which is the honest behaviour: silent retries of a
 *    failing provider spend money without anybody deciding to.
 *
 * The upgrade path is a real queue behind `enqueueIssue`, and nothing else in
 * the module would change.
 *
 * ---------------------------------------------------------------------------
 * THE RULE THAT MATTERS MOST
 * ---------------------------------------------------------------------------
 *
 * CITIZEN SUBMISSION MUST NEVER DEPEND ON ANY OF THIS. `enqueueIssue` is
 * synchronous, returns void, catches everything, and is called AFTER the
 * submission has been committed and the citizen already has their reference
 * number. If AI is disabled, misconfigured, saturated or on fire, a person
 * reporting a broken drain gets exactly the same response they would have got
 * in Phase 5.
 */

interface QueueEntry {
  readonly issueId: string;
  readonly correlationId: string | null;
}

const pending: QueueEntry[] = [];
const queued = new Set<string>();
let activeWorkers = 0;
let processedCount = 0;
let failedCount = 0;

/**
 * Adds an issue to the processing backlog. Never throws, never blocks.
 *
 * Every early return here is a case where the correct behaviour is to do
 * nothing at all rather than to surface a problem: the caller is a citizen
 * submission path that has already succeeded, and there is no failure it could
 * usefully report.
 */
export function enqueueIssue(issueId: string, correlationId: string | null = null): void {
  try {
    const env = getEnv();

    if (!env.AI_ENABLED || !isAiEnabled()) return;
    // Already waiting. Enqueuing twice would buy a duplicate provider call.
    if (queued.has(issueId)) return;
    if (pending.length >= env.AI_QUEUE_MAX_SIZE) {
      getLogger().warn({ issueId }, 'AI queue is full; skipping automatic processing');
      return;
    }

    pending.push({ issueId, correlationId });
    queued.add(issueId);

    // Started detached on purpose: `enqueueIssue` returns to its caller
    // immediately, and the worker runs on a later tick.
    void startWorkers();
  } catch (error) {
    // The catch-all is the point of this function. Nothing that happens in the
    // AI subsystem may propagate into a submission response.
    getLogger().error({ err: error, issueId }, 'AI enqueue failed; submission is unaffected');
  }
}

/** Spins up workers until the configured concurrency is reached. */
async function startWorkers(): Promise<void> {
  const env = getEnv();

  while (activeWorkers < env.AI_QUEUE_CONCURRENCY && pending.length > 0) {
    activeWorkers += 1;
    void drain().finally(() => {
      activeWorkers -= 1;
    });
  }
}

/** One worker: takes entries until the backlog is empty. */
async function drain(): Promise<void> {
  const logger = getLogger();

  for (;;) {
    const entry = pending.shift();
    if (!entry) return;
    queued.delete(entry.issueId);

    try {
      const ok = await processIssue(entry.issueId, { correlationId: entry.correlationId });
      if (ok) processedCount += 1;
      else failedCount += 1;
    } catch (error) {
      // `processIssue` is documented never to throw. If it does anyway, the
      // worker must survive it - one poisoned entry must not stop the backlog.
      failedCount += 1;
      logger.error({ err: error, issueId: entry.issueId }, 'AI queue worker caught an error');
    }
  }
}

/**
 * Re-enqueues work stranded by a restart.
 *
 * Called once at startup. Bounded, because a large stranded backlog after a
 * crash could otherwise produce a thundering spend the moment the process comes
 * back - the remainder stays QUEUED and is picked up by a later boot or by a
 * person, which is a slower recovery and a much more predictable bill.
 */
export async function requeueStranded(limit = 100): Promise<number> {
  if (!isAiEnabled()) return 0;

  try {
    const stranded = await prisma.issueAiInsight.findMany({
      // PROCESSING is included: a row in that state after a restart is by
      // definition abandoned, because the only worker that could have owned it
      // died with the process.
      where: { processingStatus: { in: ['QUEUED', 'PROCESSING'] } },
      select: { issueId: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const row of stranded) enqueueIssue(row.issueId);

    if (stranded.length > 0) {
      getLogger().info({ count: stranded.length }, 'Re-queued stranded AI processing jobs');
    }

    return stranded.length;
  } catch (error) {
    getLogger().error({ err: error }, 'Could not re-queue stranded AI jobs');
    return 0;
  }
}

/** In-memory queue state, for the admin dashboard's health panel. */
export function queueStats(): {
  pending: number;
  activeWorkers: number;
  processed: number;
  failed: number;
} {
  return { pending: pending.length, activeWorkers, processed: processedCount, failed: failedCount };
}

/** Test helper: drains the queue and waits for workers to finish. */
export async function waitForQueueDrain(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while ((pending.length > 0 || activeWorkers > 0) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Test helper. Never called by the running API. */
export function resetQueue(): void {
  pending.length = 0;
  queued.clear();
  processedCount = 0;
  failedCount = 0;
}
