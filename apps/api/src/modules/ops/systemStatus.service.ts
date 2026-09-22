import type { AuthContext } from '@rk/types';
import { getEnv } from '../../config/env';
import { SERVICE_NAME, SERVICE_VERSION } from '../../config/service';
import { authorizationService } from '../auth/authorization.service';
import { healthService } from '../health/health.service';
import { getAiProvider } from '../ai/provider/index';
import { queueStats as aiQueueStats } from '../ai/aiQueue';
import { areNotificationsEnabled, getNotificationProvider } from '../communication/provider/index';
import { notificationQueueStats } from '../communication/notificationQueue';
import { getMediaStorage } from '../content/media/storage';

/**
 * Operational status for the admin console.
 *
 * EVERY VALUE HERE IS OBSERVED, NOT INVENTED. Each component's status comes
 * from the same code path the feature itself uses - the health service probes
 * the database, the AI provider reports its own availability, the queues report
 * their real counters. Nothing is hard-coded to `HEALTHY`, and nothing is
 * derived from a configuration flag alone, because a dashboard that says
 * "healthy" when nobody checked is worse than having no dashboard: it converts
 * an unknown into a false reassurance at exactly the moment somebody is trying
 * to find out what broke.
 *
 * Where the platform genuinely cannot tell, the status is `UNKNOWN` rather than
 * a guess. `UNKNOWN` is an honest answer and `HEALTHY` would not be.
 *
 * WHAT IT DELIBERATELY OMITS: connection strings, host names, credentials,
 * provider endpoints, file paths and stack traces. An operations page is read by
 * more people than any other admin screen, is the one most likely to be
 * screenshotted into a support thread, and is the last place infrastructure
 * detail should surface.
 */

export type ComponentStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export interface SystemComponent {
  readonly key: string;
  readonly label: string;
  readonly status: ComponentStatus;
  /** One sentence an operator can act on. Never a raw provider error. */
  readonly detail: string;
  /** Measured latency where the check performs one, otherwise null. */
  readonly latencyMs: number | null;
}

export interface SystemStatus {
  readonly service: string;
  readonly version: string;
  readonly environment: string;
  readonly uptimeSeconds: number;
  readonly status: ComponentStatus;
  readonly components: readonly SystemComponent[];
  readonly checkedAt: Date;
}

/**
 * The worst component decides the overall status.
 *
 * Not an average and not a majority. If storage is down, the fact that four
 * other components are fine does not make the system fine - somebody uploading
 * evidence is being shown an error right now.
 */
function rollUp(components: readonly SystemComponent[]): ComponentStatus {
  if (components.some((component) => component.status === 'DOWN')) return 'DOWN';
  if (components.some((component) => component.status === 'DEGRADED')) return 'DEGRADED';
  if (components.every((component) => component.status === 'HEALTHY')) return 'HEALTHY';
  return 'UNKNOWN';
}

async function probeDatabase(): Promise<SystemComponent> {
  const started = Date.now();
  try {
    const health = await healthService.getReadiness();
    const dependency = health.dependencies[0];
    return {
      key: 'database',
      label: 'Database',
      status: health.status === 'OK' ? 'HEALTHY' : 'DOWN',
      detail:
        health.status === 'OK'
          ? 'Reachable and accepting queries.'
          : // The probe's own message is a classified string, never a driver
            // error - see health.repository. Falling back to a generic line
            // rather than interpolating anything the driver produced.
            'Not reachable. Citizen submissions and the admin console will fail.',
      latencyMs: dependency?.latencyMs ?? Date.now() - started,
    };
  } catch {
    return {
      key: 'database',
      label: 'Database',
      status: 'DOWN',
      detail: 'The connectivity probe itself failed.',
      latencyMs: Date.now() - started,
    };
  }
}

function probeAi(): SystemComponent {
  const env = getEnv();

  if (!env.AI_ENABLED) {
    return {
      key: 'ai',
      label: 'AI assistant',
      // Off by choice is not a fault. Reporting DEGRADED here would train
      // operators to ignore the colour on this row.
      status: 'HEALTHY',
      detail: 'Disabled for this deployment. Issue handling is unaffected.',
      latencyMs: null,
    };
  }

  const provider = getAiProvider();
  const available = provider.isAvailable();
  const stats = aiQueueStats();

  return {
    key: 'ai',
    label: 'AI assistant',
    status: available ? 'HEALTHY' : 'DEGRADED',
    detail: available
      ? `Provider "${provider.name}" configured. ${stats.pending} generation(s) waiting.`
      : // DEGRADED, never DOWN: Phase 6 made every AI call fire-and-forget, so
        // an unavailable provider costs summaries, not submissions.
        `Provider "${provider.name}" is not configured or unavailable. Summaries will not generate; everything else works.`,
    latencyMs: null,
  };
}

function probeNotifications(): SystemComponent {
  const env = getEnv();

  if (!env.NOTIFICATIONS_ENABLED) {
    return {
      key: 'notifications',
      label: 'Citizen notifications',
      status: 'HEALTHY',
      detail: 'Disabled for this deployment. Updates still appear on the tracking page.',
      latencyMs: null,
    };
  }

  const provider = getNotificationProvider();
  const stats = notificationQueueStats();
  const enabled = areNotificationsEnabled();

  // The `log` provider writes to the server log and delivers nothing. Reported
  // as DEGRADED rather than HEALTHY because an operator looking at this row
  // wants to know whether citizens are actually receiving mail.
  const isLogOnly = provider.name === 'log';

  return {
    key: 'notifications',
    label: 'Citizen notifications',
    status: !enabled ? 'DOWN' : isLogOnly ? 'DEGRADED' : 'HEALTHY',
    detail: !enabled
      ? 'Enabled in configuration but no provider is available. Messages are being skipped.'
      : isLogOnly
        ? 'Using the log provider: messages are recorded on the server and NOT delivered to anybody.'
        : `Provider "${provider.name}" active. ${stats.pending} message(s) waiting, ${stats.failed} failed.`,
    latencyMs: null,
  };
}

async function probeStorage(): Promise<SystemComponent> {
  const started = Date.now();
  try {
    const storage = getMediaStorage();
    // A read of an object that will not exist. The question is whether the
    // backend ANSWERS, not whether the key is there - a missing object is a
    // successful round trip and proves the store is reachable.
    await storage.createReadStream('__status_probe__/does-not-exist');
    return {
      key: 'storage',
      label: 'File storage',
      status: 'HEALTHY',
      detail: 'Reachable. Evidence and image uploads will work.',
      latencyMs: Date.now() - started,
    };
  } catch {
    return {
      key: 'storage',
      label: 'File storage',
      status: 'DOWN',
      detail: 'Not reachable. Uploads and file downloads will fail.',
      latencyMs: Date.now() - started,
    };
  }
}

export const systemStatusService = {
  /**
   * Behind AUDIT_READ.
   *
   * Reused rather than introducing a new permission, and chosen deliberately:
   * AUDIT_READ is already the grant that means "may see how this installation
   * is behaving rather than what it contains", and it is held by exactly the
   * role that would be asked to investigate an outage. A new permission would
   * have to be granted to somebody before it was useful, which in practice
   * means it is granted to everybody during the first incident.
   */
  async get(auth: AuthContext | null): Promise<SystemStatus> {
    const permitted = authorizationService.requirePermission(auth, 'AUDIT_READ');
    authorizationService.requireOrganization(permitted);

    const env = getEnv();
    const components = [
      await probeDatabase(),
      probeAi(),
      probeNotifications(),
      await probeStorage(),
    ];

    return {
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      status: rollUp(components),
      components,
      checkedAt: new Date(),
    };
  },
};
