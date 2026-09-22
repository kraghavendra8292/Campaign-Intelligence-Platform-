import { z } from 'zod';
import { booleanSchema, httpUrlSchema } from '@rk/config';

/**
 * Phase 8 citizen communication configuration.
 *
 * NO PROVIDER CREDENTIAL HAS A DEFAULT, and the whole outbound channel is OFF
 * unless a deployment turns it on. With `NOTIFICATIONS_ENABLED=false` the
 * platform still records consent, still queues nothing, and still shows the
 * citizen their status page - what it does not do is quietly pretend to send
 * mail that nobody receives.
 *
 * THE MOCK PROVIDER IS NOT A TEST FIXTURE. It is how a developer, and a
 * deployment that has not yet bought an email service, exercises the entire
 * follow-up loop - consent, queue, send, delivery state, admin dashboard -
 * without a provider account. Production refuses it, because a communication
 * dashboard reporting "SENT" for messages that went to a log file is worse than
 * one reporting that the channel is unconfigured.
 */
export const communicationEnvSchema = {
  /**
   * Master switch for OUTBOUND messages.
   *
   * Off by default rather than inferred from the presence of an API key.
   * Inference would mean pasting a key into an environment file silently began
   * emailing members of the public.
   */
  NOTIFICATIONS_ENABLED: booleanSchema(false),

  /**
   * Which adapter delivers email. `log` writes to the server log and marks the
   * notification SENT; `smtp` uses a real server.
   */
  EMAIL_PROVIDER: z.enum(['log', 'smtp']).default('log'),

  /** Envelope sender. Required before anything can be sent for real. */
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().min(1).max(120).default('Campaign office'),

  /** SMTP transport. No defaults; all required when EMAIL_PROVIDER=smtp. */
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_SECURE: booleanSchema(false),

  /** Per-send timeout. A hung provider must not hold a queue worker. */
  NOTIFICATION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),

  /**
   * Base URL for the links inside a message.
   *
   * Separate from `PUBLIC_SITE_URL` for the same reason `QR_SCAN_BASE_URL` is:
   * the tracking page lives on the web app, and getting this wrong means
   * emailing citizens a link that does not resolve. It defaults to the public
   * site because that is correct in every single-host deployment.
   */
  NOTIFICATION_LINK_BASE_URL: httpUrlSchema.default('http://localhost:5173'),

  /**
   * Public-endpoint budgets, in the same spirit as the Phase 5 submission
   * limits: loose enough that a household behind one NAT is never blocked,
   * tight enough to stop a script.
   *
   * Follow-up is tighter than tracking because it WRITES, and because a
   * citizen has one genuine follow-up to give per issue, not twenty.
   */
  FOLLOW_UP_WINDOW_MS: z.coerce.number().int().min(1000).default(3_600_000),
  FOLLOW_UP_MAX_PER_WINDOW: z.coerce.number().int().min(1).default(10),

  /** Subscription and unsubscribe changes per IP per window. */
  SUBSCRIPTION_WINDOW_MS: z.coerce.number().int().min(1000).default(3_600_000),
  SUBSCRIPTION_MAX_PER_WINDOW: z.coerce.number().int().min(1).default(20),

  /**
   * Ceiling on outbound messages per issue per day.
   *
   * The protection a citizen actually needs from this feature. Without it, a
   * staff member editing a status ten times in an afternoon sends ten emails
   * about one pothole, and the platform has become the thing it was supposed to
   * avoid being.
   */
  NOTIFICATION_MAX_PER_ISSUE_PER_DAY: z.coerce.number().int().min(1).max(50).default(6),

  /** In-process worker concurrency for the notification queue. */
  NOTIFICATION_QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  NOTIFICATION_QUEUE_MAX_SIZE: z.coerce.number().int().min(10).max(10_000).default(1000),
};
