import type { NotificationChannel, NotificationFailureKind } from '@rk/types';

/**
 * The outbound-message seam.
 *
 * Transport-shaped, for exactly the reason the Phase 6 AI provider is: a
 * provider with one method per event would put the templates and the safety
 * rules inside each vendor adapter, so a second vendor reimplements all five
 * and the "never interpolate a citizen's phone number" rule exists in as many
 * copies as there are providers. The first copy to drift is an incident.
 *
 * So a provider does one thing: take an already-rendered message and try to
 * deliver it. Rendering lives in `templates/`, the variable allow-list lives in
 * `@rk/types`, and both are shared by every provider - a new adapter inherits
 * every safety control because it never had the opportunity to skip one.
 *
 * A provider MUST NOT:
 *  - retry on its own (retries are a budget and duplicate-delivery decision the
 *    caller owns);
 *  - log the recipient address at info level or above;
 *  - throw anything but `NotificationProviderError`, so the caller can always
 *    classify a failure without reading vendor error shapes.
 */

export interface RenderedMessage {
  /** Where it goes. Never logged in full by any provider. */
  readonly destination: string;
  readonly subject: string;
  /** Plain text. There is no HTML body anywhere in this phase - see templates. */
  readonly body: string;
}

export interface NotificationSendResult {
  /**
   * Provider-side identifier, when one is returned.
   *
   * Stored nowhere in Phase 8: no provider in use returns a usable one, and a
   * column that is always null invites somebody to start putting something else
   * in it. Present on the interface so a future adapter has somewhere to put it.
   */
  readonly providerMessageId?: string | undefined;
  /**
   * Whether the provider CONFIRMED delivery rather than merely accepting the
   * message. Almost always false: SMTP acceptance is not delivery, and
   * recording it as such would make the dashboard's delivery rate a fiction.
   */
  readonly confirmedDelivery: boolean;
}

/**
 * The only error type a provider may throw.
 *
 * Carries a classified kind rather than a vendor code, because everything
 * downstream - the retry decision, the delivery row, the sentence an
 * administrator reads - needs the category. The original message goes to the
 * server log and never to a client: provider errors routinely echo the
 * recipient address back.
 */
export class NotificationProviderError extends Error {
  readonly kind: NotificationFailureKind;
  /** Whether retrying the identical message could plausibly succeed. */
  readonly retryable: boolean;

  constructor(kind: NotificationFailureKind, message: string, retryable = false) {
    super(message);
    this.name = 'NotificationProviderError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

export interface NotificationProvider {
  /** Short stable identifier for logs and the admin dashboard: "log", "smtp". */
  readonly name: string;
  readonly channel: NotificationChannel;
  /**
   * Whether the provider can send right now.
   *
   * Checked before a send is attempted, so a missing credential becomes an
   * honest SKIPPED with a "not configured" reason rather than a FAILED row that
   * pollutes the failure rate with a configuration problem.
   */
  isAvailable(): boolean;
  send(message: RenderedMessage, timeoutMs: number): Promise<NotificationSendResult>;
}
