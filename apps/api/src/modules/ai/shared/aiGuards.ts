import type { AuthContext, Permission } from '@rk/types';
import { AppError } from '../../../errors/AppError';
import { authorizationService } from '../../auth/authorization.service';
import { getEnv } from '../../../config/env';
import { isAiEnabled } from '../provider/index';

/**
 * Authorization, availability and budget rules for AI operations.
 *
 * Same shape and same reasoning as `issueGuards.ts`: a rule re-implemented per
 * call site is a rule one call site will eventually be missing. Here the stakes
 * are a third-party bill and a tenant boundary, so both checks exist once.
 */

/** Asserts an AI permission and returns the active tenant with it. */
export function requireAiAccess(
  auth: AuthContext | null,
  permission: Permission,
): { auth: AuthContext; organizationId: string } {
  const permitted = authorizationService.requirePermission(auth, permission);
  return authorizationService.requireOrganization(permitted);
}

/**
 * Asserts the assistant is actually usable before work is accepted.
 *
 * Fails with a plain, safe message. Deliberately does NOT say whether the cause
 * is a missing key, a disabled flag or an unreachable provider: that detail is
 * deployment configuration, it is in the server log, and an administrator's
 * useful action is the same in every case.
 */
export function requireAiAvailable(): void {
  if (!isAiEnabled()) {
    throw AppError.validation(
      'AI processing is currently unavailable. Submissions and issue management are unaffected.',
    );
  }
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

/**
 * Per-tenant generation budget, held in memory.
 *
 * WHY PER ORGANISATION rather than per user: the cost lands on the tenant. Three
 * administrators each regenerating politely still produces one bill, and a
 * per-user limit would let a campaign with ten staff spend ten times as much
 * before anything pushed back.
 *
 * WHY A SEPARATE, TIGHTER LIMIT FOR REGENERATION: first-time processing is
 * naturally bounded - an issue can only be processed from scratch once, so the
 * ceiling is the submission volume. Regeneration has no such bound; it is the
 * one operation a frustrated or malicious administrator can repeat forever.
 *
 * LIMITATION, and it is the same one the Phase 1 rate limiter carries: this
 * store is per process. Two API instances each allow the full budget. The fix
 * is the same Redis store the HTTP limiter is waiting on, and until then the
 * hard ceiling on spend is the provider-side quota on the account - which is
 * where a spend limit belongs anyway.
 */
interface BudgetWindow {
  count: number;
  resetAt: number;
}

const generationBudget = new Map<string, BudgetWindow>();
const regenerationBudget = new Map<string, BudgetWindow>();

function consume(
  store: Map<string, BudgetWindow>,
  key: string,
  max: number,
  windowMs: number,
  now: number,
): boolean {
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= max) return false;

  existing.count += 1;
  return true;
}

/**
 * Consumes one unit of a tenant's generation budget.
 *
 * Regeneration consumes from BOTH budgets: it is a generation, and it is also a
 * regeneration. Charging it only to the tighter bucket would let an
 * administrator exhaust the overall budget through repeated regeneration while
 * the general counter reported headroom.
 */
export function consumeAiBudget(
  organizationId: string,
  kind: 'generate' | 'regenerate',
  now = Date.now(),
): void {
  const env = getEnv();

  if (kind === 'regenerate') {
    const allowed = consume(
      regenerationBudget,
      organizationId,
      env.AI_REGENERATE_MAX_PER_ORG,
      env.AI_RATE_LIMIT_WINDOW_MS,
      now,
    );
    if (!allowed) {
      throw AppError.rateLimited(
        'This organisation has reached its AI regeneration limit for now. Please try again later.',
      );
    }
  }

  const allowed = consume(
    generationBudget,
    organizationId,
    env.AI_RATE_LIMIT_MAX_PER_ORG,
    env.AI_RATE_LIMIT_WINDOW_MS,
    now,
  );
  if (!allowed) {
    throw AppError.rateLimited(
      'This organisation has reached its AI processing limit for now. Please try again later.',
    );
  }
}

/** Test helper. Never called by the running API. */
export function resetAiBudgets(): void {
  generationBudget.clear();
  regenerationBudget.clear();
}
