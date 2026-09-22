import {
  AiProviderError,
  type AiGenerationRequest,
  type AiGenerationResult,
  type AiProvider,
} from './aiProvider';

/**
 * OpenAI chat-completions adapter.
 *
 * WHY `fetch` RATHER THAN THE VENDOR SDK. The SDK is a substantial dependency
 * whose value here would be retries, streaming and helpers this module either
 * does not use or deliberately owns itself: retries are a budget decision that
 * belongs to the caller (see `AI_MAX_RETRIES`), and nothing in Phase 6 streams
 * - every operation returns a small structured object. What is left is one
 * POST, so it is one POST. Node 20's global `fetch` and `AbortSignal.timeout`
 * cover it, and the seam stays exactly as wide as the interface.
 *
 * Structured output is requested via `response_format: json_schema` with
 * `strict: true`, which makes the model's reply conform to the supplied schema
 * at generation time rather than being checked afterwards. The check still runs
 * afterwards regardless - constrained decoding narrows what a model can emit,
 * it does not make output trustworthy, and a provider that quietly stopped
 * honouring the constraint must not become a persistence path.
 */
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  readonly model: string;

  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(options: { apiKey?: string | undefined; baseUrl: string; model: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.model = options.model;
  }

  isAvailable(): boolean {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    if (!this.isAvailable()) {
      throw new AiProviderError('NOT_CONFIGURED', 'OPENAI_API_KEY is not set.');
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          max_completion_tokens: request.maxTokens,
          temperature: request.temperature,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: request.schemaName,
              strict: true,
              schema: request.schema,
            },
          },
        }),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      // `AbortSignal.timeout` rejects with a TimeoutError DOMException; a
      // genuine network failure rejects with a TypeError. They are different
      // operational problems - one is "the provider is slow", the other is
      // "we cannot reach it" - so they are classified separately rather than
      // both becoming a generic failure.
      const name = (error as { name?: string } | null)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new AiProviderError(
          'TIMEOUT',
          `Provider timed out after ${request.timeoutMs}ms.`,
          true,
        );
      }
      throw new AiProviderError(
        'PROVIDER_UNAVAILABLE',
        `Could not reach the provider: ${String((error as Error | null)?.message ?? 'unknown')}`,
        true,
      );
    }

    if (!response.ok) {
      throw classifyHttpFailure(response.status, await safeBodyText(response));
    }

    let payload: OpenAiChatResponse;
    try {
      payload = (await response.json()) as OpenAiChatResponse;
    } catch {
      throw new AiProviderError('INVALID_OUTPUT', 'Provider returned a non-JSON body.');
    }

    const choice = payload.choices?.[0];

    // A truncated reply is reported as invalid rather than parsed. Half a JSON
    // object is not a partial answer, and `length` here means the token ceiling
    // was hit - which is a configuration problem worth surfacing as itself.
    if (choice?.finish_reason === 'length') {
      throw new AiProviderError(
        'INVALID_OUTPUT',
        'Provider truncated the response at the token limit.',
      );
    }

    const content = choice?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new AiProviderError('INVALID_OUTPUT', 'Provider returned an empty completion.');
    }

    return {
      content,
      model: payload.model ?? this.model,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? null,
        completionTokens: payload.usage?.completion_tokens ?? null,
        totalTokens: payload.usage?.total_tokens ?? null,
      },
    };
  }
}

/**
 * Maps an HTTP status onto a failure category and a retry decision.
 *
 * 429 and 5xx are retryable; 4xx is not, because retrying a malformed or
 * unauthorised request just spends the budget again on the same rejection.
 */
function classifyHttpFailure(status: number, body: string): AiProviderError {
  if (status === 429) {
    return new AiProviderError(
      'RATE_LIMITED',
      `Provider rate limited the request (${status}).`,
      true,
    );
  }
  if (status === 401 || status === 403) {
    return new AiProviderError('NOT_CONFIGURED', `Provider rejected the credential (${status}).`);
  }
  if (status >= 500) {
    return new AiProviderError('PROVIDER_UNAVAILABLE', `Provider error ${status}: ${body}`, true);
  }
  return new AiProviderError('PROVIDER_ERROR', `Provider rejected the request ${status}: ${body}`);
}

/**
 * Reads an error body for the server-side log, bounded.
 *
 * Capped because a provider error body can echo the whole request - which
 * contains citizen text - and an unbounded copy of it does not belong in a log
 * line. The truncated form is enough to identify the error class.
 */
async function safeBodyText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 400);
  } catch {
    return '(unreadable body)';
  }
}

interface OpenAiChatResponse {
  readonly model?: string;
  readonly choices?: readonly {
    readonly finish_reason?: string;
    readonly message?: { readonly content?: string };
  }[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}
