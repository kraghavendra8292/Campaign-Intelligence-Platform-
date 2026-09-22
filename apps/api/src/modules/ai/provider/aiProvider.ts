import type { AiFailureKind } from '@rk/types';

/**
 * The AI provider seam.
 *
 * WHY THIS INTERFACE IS TRANSPORT-SHAPED rather than operation-shaped.
 *
 * The obvious design is a provider with one method per feature -
 * `generateIssueSummary()`, `suggestCategory()`, `extractTopics()` and so on.
 * It reads well and it is what the phase brief sketches. It was rejected here
 * for one reason: it puts the prompts, the output schemas and the safety
 * validation INSIDE each provider. A second provider would then have to
 * reimplement all six, and the safety rules - the banned-term check, the
 * evidence constraint, the "treat citizen text as data" framing - would exist
 * in as many copies as there are vendors. The first copy to drift is a privacy
 * incident.
 *
 * So the provider does exactly one thing: turn a structured request into a
 * structured response, or fail in a way the caller can classify. Prompts live
 * in `prompts/`, validation lives in `validation/`, and both are shared by
 * every provider. Adding a vendor is a single class implementing two methods,
 * and it inherits every safety control automatically because it never had the
 * opportunity to skip one.
 *
 * A provider MUST NOT:
 *  - log or persist the prompt it was given (it contains citizen text, already
 *    redacted but still not for a third system's disk);
 *  - retry on its own in a way the caller cannot see (retries cost money and
 *    belong to the caller's budget);
 *  - throw anything other than `AiProviderError`, so the service layer can
 *    always classify a failure without inspecting vendor error shapes.
 */

/** One message in a request. `system` carries instructions, `user` the data. */
export interface AiMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

export interface AiGenerationRequest {
  readonly messages: readonly AiMessage[];
  /**
   * Name of the JSON shape expected back.
   *
   * Passed to providers that support server-side structured output so the model
   * is constrained rather than merely asked. Providers without that capability
   * ignore it, and validation catches the difference - the schema check in
   * `validation/` runs identically either way.
   */
  readonly schemaName: string;
  /** JSON Schema for the expected response, for providers that enforce it. */
  readonly schema: Record<string, unknown>;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly timeoutMs: number;
}

/** Token usage as REPORTED by the provider. Never estimated locally. */
export interface AiTokenUsage {
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
}

export interface AiGenerationResult {
  /**
   * The raw text the model returned.
   *
   * Deliberately typed as `string`, not `unknown` or a parsed object: the
   * provider's job ends at transport. Parsing is validation's job, and a
   * provider that pre-parsed would be deciding what counts as well-formed.
   */
  readonly content: string;
  readonly model: string;
  readonly usage: AiTokenUsage;
}

/**
 * The only error type a provider may throw.
 *
 * Carries a CLASSIFIED kind rather than a vendor code, because everything
 * downstream - the retry decision, the usage log, the failure reason shown to
 * an administrator - needs the category, not the vendor's phrasing. The
 * original message is kept for server-side logging and is never surfaced to a
 * client: provider errors can echo request content.
 */
export class AiProviderError extends Error {
  readonly kind: AiFailureKind;
  /** Whether retrying the identical request could plausibly succeed. */
  readonly retryable: boolean;

  constructor(kind: AiFailureKind, message: string, retryable = false) {
    super(message);
    this.name = 'AiProviderError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

export interface AiProvider {
  /** Short stable identifier recorded in the usage log: "openai", "mock". */
  readonly name: string;
  /** The model this provider is configured to call. */
  readonly model: string;
  /**
   * Whether the provider is usable right now.
   *
   * Checked before a generation is attempted so a missing key becomes an
   * honest "AI is not configured" rather than a failed call that still costs a
   * queue slot and writes a failure row.
   */
  isAvailable(): boolean;
  generate(request: AiGenerationRequest): Promise<AiGenerationResult>;
}
