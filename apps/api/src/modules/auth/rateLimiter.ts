/**
 * Attempt limiting for authentication actions.
 *
 * The interface is the point: `InMemoryAttemptLimiter` is correct for a single
 * process and is what Phase 1 deliberately deferred Redis for, but it does NOT
 * coordinate across instances - two API replicas each allow the configured
 * budget. Swapping in a Redis-backed implementation is the only change needed
 * for horizontal scaling; no call site moves.
 *
 * PRODUCTION REQUIREMENT: with more than one API instance, a shared store is
 * mandatory or the login budget is multiplied by the replica count.
 */
export interface AttemptLimiter {
  /**
   * Records an attempt and reports whether the caller is over budget.
   * Called BEFORE the expensive work, so a flood is shed cheaply.
   */
  consume(key: string, limit: number, windowMs: number): Promise<AttemptResult>;

  /** Clears the counter for a key, e.g. after a successful login. */
  reset(key: string): Promise<void>;
}

export interface AttemptResult {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Seconds until the window resets; 0 when allowed. */
  readonly retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class InMemoryAttemptLimiter implements AttemptLimiter {
  private readonly buckets = new Map<string, Bucket>();
  /** Bounds memory: an attacker rotating keys must not grow the map forever. */
  private readonly maxKeys: number;

  constructor(maxKeys = 50_000) {
    this.maxKeys = maxKeys;
  }

  async consume(key: string, limit: number, windowMs: number): Promise<AttemptResult> {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      this.evictIfNeeded(now);
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
    }

    existing.count += 1;

    if (existing.count > limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - existing.count),
      retryAfterSeconds: 0,
    };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  /** Drops expired buckets, then the oldest, only when the cap is reached. */
  private evictIfNeeded(now: number): void {
    if (this.buckets.size < this.maxKeys) return;

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }

    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done) break;
      this.buckets.delete(oldest.value);
    }
  }
}

/** Namespaced keys, so one action's budget cannot exhaust another's. */
export const attemptKeys = {
  login: (email: string, ip: string) => `login:${email}:${ip}`,
  passwordReset: (email: string, ip: string) => `pwreset:${email}:${ip}`,
  refresh: (ip: string) => `refresh:${ip}`,
  invitation: (userId: string) => `invite:${userId}`,
};

let limiter: AttemptLimiter = new InMemoryAttemptLimiter();

export function getAttemptLimiter(): AttemptLimiter {
  return limiter;
}

/** Swap point for a Redis implementation, and for test isolation. */
export function setAttemptLimiter(next: AttemptLimiter): void {
  limiter = next;
}
