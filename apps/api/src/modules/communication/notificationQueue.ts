import { getEnv } from '../../config/env';
import { getLogger } from '../../logging/logger';
import { prisma } from '../../database/prisma';
import { notificationService, type NotificationRequest } from './notification.service';
import { areNotificationsEnabled } from './provider/index';

/**
 * Background delivery.
 *
 * THE SAME SHAPE AS PHASE 6's `aiQueue`, DELIBERATELY. The brief said to reuse
 * the queue infrastructure if a phase had introduced one, and Phase 6 did - but
 * what it introduced was an in-process FIFO pattern, not a shared broker with a
 * job type. Importing `aiQueue` and giving it a second job kind would mean one
 * worker pool where an AI generation stuck on a slow model delays an email
 * about a pothole, and one backlog ceiling shared between two workloads with
 * very different costs.
 *
 * So this is a second instance of the same PATTERN, with its own concurrency
 * and its own bound, and the day either becomes a real broker both move behind
 * `enqueue` with no change above it. The alternative - one queue, two job types
 * - is the design that would have to be undone first.
 *
 * WHAT THIS IS NOT, stated as plainly as it was in Phase 6: a durable queue.
 * Work queued but not yet run is lost on restart; rows stay QUEUED and
 * `requeueStranded` picks them up at next boot. Two API instances each run
 * their own queue, and both could pick up the same row - the idempotency key
 * makes that a wasted call rather than a duplicate email, because the second
 * `deliver` sees a terminal status and stops.
 *
 * ---------------------------------------------------------------------------
 * THE RULE THAT MATTERS MOST
 * ---------------------------------------------------------------------------
 *
 * NOTHING ADMINISTRATIVE MAY DEPEND ON THIS. `enqueueNotification` is
 * synchronous, returns void, catches everything, and is called AFTER the status
 * change or publication has been committed. A staff member moving an issue to
 * RESOLVED must never see an error because a mail provider is unreachable.
 */

interface QueueEntry {
  readonly notificationId: string;
}

const pending: QueueEntry[] = [];
const queued = new Set<string>();
let activeWorkers = 0;
let processedCount = 0;
let failedCount = 0;

/**
 * Enqueues that have started but whose database row does not exist yet.
 *
 * `enqueueNotification` returns immediately and writes the row on a later tick,
 * so between those two moments the queue looks idle while work is genuinely in
 * flight. Without this counter, anything asking "is the queue drained?" - the
 * tests, and any future graceful-shutdown path - gets a confident yes and then
 * a row appears afterwards.
 */
let inFlightEnqueues = 0;

/**
 * Queues a notification and schedules delivery. Never throws, never blocks.
 *
 * Every early return is a case where doing nothing is correct: the caller is an
 * administrative action that has already succeeded, and there is no failure it
 * could usefully report to the person who performed it.
 */
export function enqueueNotification(request: NotificationRequest): void {
  try {
    if (!areNotificationsEnabled()) return;

    // The queue write and the delivery are both detached. `queue()` is async
    // and already swallows its own errors, so this cannot reject.
    inFlightEnqueues += 1;
    void notificationService
      .queue(request)
      .then((outcome) => {
        if (!outcome.queued) return;
        scheduleDelivery(outcome.notificationId);
      })
      .catch((error: unknown) => {
        getLogger().error({ err: error }, 'Notification enqueue failed; the action is unaffected');
      })
      .finally(() => {
        inFlightEnqueues -= 1;
      });
  } catch (error) {
    // The catch-all is the point. Nothing in the communication subsystem may
    // propagate into an administrative response.
    getLogger().error({ err: error }, 'Notification enqueue threw; the action is unaffected');
  }
}

/** Adds an already-created notification row to the worker backlog. */
export function scheduleDelivery(notificationId: string): void {
  try {
    const env = getEnv();

    if (queued.has(notificationId)) return;
    if (pending.length >= env.NOTIFICATION_QUEUE_MAX_SIZE) {
      getLogger().warn({ notificationId }, 'Notification queue is full; delivery deferred');
      return;
    }

    pending.push({ notificationId });
    queued.add(notificationId);
    void startWorkers();
  } catch (error) {
    getLogger().error({ err: error, notificationId }, 'Could not schedule notification delivery');
  }
}

async function startWorkers(): Promise<void> {
  const env = getEnv();

  while (activeWorkers < env.NOTIFICATION_QUEUE_CONCURRENCY && pending.length > 0) {
    activeWorkers += 1;
    void drain().finally(() => {
      activeWorkers -= 1;
    });
  }
}

async function drain(): Promise<void> {
  const logger = getLogger();

  for (;;) {
    const entry = pending.shift();
    if (!entry) return;
    queued.delete(entry.notificationId);

    try {
      const ok = await notificationService.deliver(entry.notificationId);
      if (ok) processedCount += 1;
      else failedCount += 1;
    } catch (error) {
      // `deliver` is documented never to throw. If it does anyway, the worker
      // must survive it - one poisoned entry must not stop the backlog.
      failedCount += 1;
      logger.error({ err: error, notificationId: entry.notificationId }, 'Worker caught an error');
    }
  }
}

/**
 * Re-queues work stranded by a restart.
 *
 * Bounded, for the reason Phase 6's equivalent is: a large stranded backlog
 * after a crash could otherwise send a citizen a burst of stale messages the
 * moment the process returns. PROCESSING rows are included because after a
 * restart they are by definition abandoned - the only worker that owned them
 * died with the process - and `deliver` re-checks consent and terminal status
 * before doing anything.
 */
export async function requeueStranded(limit = 200): Promise<number> {
  if (!areNotificationsEnabled()) return 0;

  try {
    const stranded = await prisma.issueNotification.findMany({
      where: { status: { in: ['QUEUED', 'PROCESSING'] } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const row of stranded) scheduleDelivery(row.id);

    if (stranded.length > 0) {
      getLogger().info({ count: stranded.length }, 'Re-queued stranded notifications');
    }

    return stranded.length;
  } catch (error) {
    getLogger().error({ err: error }, 'Could not re-queue stranded notifications');
    return 0;
  }
}

/** In-memory state for the communication dashboard's health panel. */
export function notificationQueueStats(): {
  pending: number;
  activeWorkers: number;
  processed: number;
  failed: number;
} {
  // `pending` includes work whose row is still being written, so the dashboard
  // does not show an idle queue while messages are on their way into it.
  return {
    pending: pending.length + inFlightEnqueues,
    activeWorkers,
    processed: processedCount,
    failed: failedCount,
  };
}

/** Test helper: waits for the backlog to drain. */
export async function waitForNotificationQueue(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (
    (pending.length > 0 || activeWorkers > 0 || inFlightEnqueues > 0) &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Test helper. Never called by the running API. */
export function resetNotificationQueue(): void {
  pending.length = 0;
  queued.clear();
  processedCount = 0;
  failedCount = 0;
  inFlightEnqueues = 0;
}
