import { getEnv } from '../../../config/env';
import { getLogger } from '../../../logging/logger';
import {
  NotificationProviderError,
  type NotificationProvider,
  type NotificationSendResult,
  type RenderedMessage,
} from './notificationProvider';

/**
 * Provider selection, in one place.
 *
 * Same shape as `getMediaStorage()` in Phase 3 and `getAiProvider()` in Phase 6:
 * a lazily constructed process-wide instance plus a setter for tests.
 * Consistency matters more than novelty - anybody who has read either of those
 * already knows how this works, including that `setNotificationProvider` is the
 * seam and not a back door into configuration.
 */

/**
 * Writes the message to the server log instead of sending it.
 *
 * TWO JOBS, and the second is why this is production code rather than a test
 * double:
 *
 * 1. The whole follow-up loop - consent, queue, delivery state, dashboard,
 *    retry - is exercisable without an email account, so the feature is
 *    demonstrable rather than theoretical.
 * 2. Tests run the REAL service layer, including template rendering and the
 *    variable allow-list. A test that stubbed the service would prove nothing
 *    about the rendering it skipped.
 *
 * THE RECIPIENT IS LOGGED REDACTED even here. A development log is still a file
 * on somebody's disk, and a citizen's address is a citizen's address. The body
 * is logged in full because it contains only what the templates produce.
 */
class LogEmailProvider implements NotificationProvider {
  readonly name = 'log';
  readonly channel = 'EMAIL' as const;

  isAvailable(): boolean {
    return true;
  }

  send(message: RenderedMessage): Promise<NotificationSendResult> {
    getLogger().info(
      {
        channel: 'EMAIL',
        provider: 'log',
        to: redactEmail(message.destination),
        subject: message.subject,
        body: message.body,
      },
      'Notification (development log provider - nothing was actually sent)',
    );

    // Never claims delivery. Acceptance by a log file is not delivery, and a
    // dashboard showing DELIVERED for these would be lying.
    return Promise.resolve({ confirmedDelivery: false });
  }
}

/**
 * SMTP transport.
 *
 * DELIBERATELY NOT IMPLEMENTED, and it fails loudly rather than silently.
 *
 * Implementing it means adding `nodemailer` and an SMTP account, and neither
 * exists in this project. A stub that returned success would put "SENT" in
 * front of an administrator for messages nobody received - the single most
 * damaging thing a communication dashboard can do, because it converts a
 * missing feature into a false record.
 *
 * So this throws NOT_CONFIGURED, the notification is recorded as SKIPPED with
 * an honest reason, and production startup refuses `EMAIL_PROVIDER=smtp`
 * without full credentials. The work remaining is this class's `send` method
 * and one dependency; everything around it - queue, retry, idempotency,
 * templates, delivery tracking, dashboard - is finished and exercised.
 */
class SmtpEmailProvider implements NotificationProvider {
  readonly name = 'smtp';
  readonly channel = 'EMAIL' as const;

  isAvailable(): boolean {
    return false;
  }

  send(): Promise<NotificationSendResult> {
    return Promise.reject(
      new NotificationProviderError(
        'NOT_CONFIGURED',
        'The SMTP provider is declared but not implemented in this build. ' +
          'Set EMAIL_PROVIDER=log for development, or implement SmtpEmailProvider.send.',
      ),
    );
  }
}

let provider: NotificationProvider | null = null;

export function getNotificationProvider(): NotificationProvider {
  if (provider) return provider;

  provider = getEnv().EMAIL_PROVIDER === 'smtp' ? new SmtpEmailProvider() : new LogEmailProvider();

  return provider;
}

/** Swap point for tests, and for a future provider. */
export function setNotificationProvider(next: NotificationProvider | null): void {
  provider = next;
}

/**
 * Whether outbound messages may be attempted at all.
 *
 * Two independent conditions, both required: the operator turned the feature
 * on, AND the selected provider can actually send. Callers use this to record
 * an honest SKIPPED instead of queueing work that is certain to fail - which
 * would otherwise fill the dashboard's failure counter with a configuration
 * problem dressed as an outage.
 */
export function areNotificationsEnabled(): boolean {
  return getEnv().NOTIFICATIONS_ENABLED && getNotificationProvider().isAvailable();
}

/**
 * Masks an address for storage and logs.
 *
 * Keeps the first character and the domain, so an administrator can tell a
 * message went to the right sort of place and spot an obviously wrong domain,
 * without the table reproducing somebody's address for every member of staff
 * who can open the communication centre.
 */
export function redactEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) return '***';

  const local = address.slice(0, at);
  const domain = address.slice(at);
  const head = local.slice(0, 1);

  return `${head}${'*'.repeat(Math.max(2, Math.min(local.length - 1, 6)))}${domain}`;
}

export { NotificationProviderError } from './notificationProvider';
export type {
  NotificationProvider,
  NotificationSendResult,
  RenderedMessage,
} from './notificationProvider';
