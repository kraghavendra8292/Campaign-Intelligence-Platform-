import {
  AiProviderError,
  type AiGenerationRequest,
  type AiGenerationResult,
  type AiProvider,
} from './aiProvider';

/**
 * Deterministic provider for tests and local development.
 *
 * TWO JOBS, and the second is why this is production code rather than a test
 * fixture:
 *
 * 1. Tests run the real service layer - real validation, real safety checks,
 *    real persistence - without a network call or an API key. A unit test that
 *    mocked the SERVICE would prove nothing about the validation it skipped.
 *
 * 2. A developer can exercise the whole admin console, review workflow and
 *    dashboard without a provider account. This is the difference between the
 *    AI screens being demonstrable and being theoretical.
 *
 * Output is derived from the input by simple string handling, never invented.
 * It is also unmistakably labelled - every summary opens with "[mock]" - so
 * placeholder text can never be mistaken for analysis if this provider is
 * somehow reached outside development. Production configuration refuses it
 * outright (see `assertProductionHardening`).
 *
 * `queueResponse` lets a test drive a specific reply - malformed JSON, a
 * political classification, an invented statistic - which is how the
 * hallucination and validation tests exercise paths a well-behaved model would
 * never produce.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly model: string;

  /** FIFO of scripted replies. Empty means "derive one from the input". */
  private readonly scripted: (string | AiProviderError)[] = [];
  private callCount = 0;
  private available = true;
  private lastSeenRequest: AiGenerationRequest | null = null;

  constructor(model = 'mock-model-v1') {
    this.model = model;
  }

  isAvailable(): boolean {
    return this.available;
  }

  /** Test hook: simulate an unconfigured or unreachable provider. */
  setAvailable(available: boolean): void {
    this.available = available;
  }

  /** Test hook: the next `generate` returns this raw content, or throws. */
  queueResponse(response: string | AiProviderError): void {
    this.scripted.push(response);
  }

  /** Test hook: how many generations were attempted. */
  get calls(): number {
    return this.callCount;
  }

  /**
   * Test hook: the exact request the service built.
   *
   * The privacy and prompt-injection tests assert against this. Inspecting the
   * REAL prompt is the only way to prove a citizen's phone number never
   * reached it - a test that checked the service's inputs instead would be
   * asserting about the layer above the one that matters.
   */
  get lastRequest(): AiGenerationRequest | null {
    return this.lastSeenRequest;
  }

  reset(): void {
    this.scripted.length = 0;
    this.callCount = 0;
    this.available = true;
    this.lastSeenRequest = null;
  }

  generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    this.callCount += 1;
    this.lastSeenRequest = request;

    if (!this.available) {
      return Promise.reject(
        new AiProviderError('PROVIDER_UNAVAILABLE', 'Mock provider is marked unavailable.', true),
      );
    }

    const scripted = this.scripted.shift();
    if (scripted instanceof AiProviderError) return Promise.reject(scripted);

    const content = scripted ?? this.derive(request);

    return Promise.resolve({
      content,
      model: this.model,
      // Plausible but clearly synthetic usage. Present so the usage-log path is
      // exercised; a test asserting a real token count against this would be
      // asserting against a constant, and the tests do not.
      usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
    });
  }

  /**
   * Builds a reply shaped like the requested schema.
   *
   * Keyed on `schemaName` rather than sniffing the prompt, so a new operation
   * that forgets to extend this fails loudly in tests instead of silently
   * receiving another operation's shape.
   */
  private derive(request: AiGenerationRequest): string {
    const userContent = request.messages.find((message) => message.role === 'user')?.content ?? '';

    switch (request.schemaName) {
      case 'issue_insight':
        return JSON.stringify({
          summary: `[mock] Administrative summary of the submitted report. ${firstWords(userContent, 12)}`,
          suggestedCategoryKey: firstCategoryKeyIn(userContent),
          categoryConfidence: 0.74,
          categoryReason: '[mock] Derived from wording in the report.',
          topics: ['road damage', 'access difficulty'],
        });

      case 'theme_detection':
        return JSON.stringify({
          themes: [
            {
              name: '[mock] Road infrastructure',
              description: '[mock] Recurring reports about road surfaces and access.',
              summary: '[mock] Multiple submissions describe damaged road surfaces.',
              issueReferences: [],
            },
          ],
        });

      case 'executive_summary':
        return JSON.stringify({
          summary:
            '[mock] During the selected period submissions were received across several categories. ' +
            'Figures shown alongside this summary are computed by the platform.',
          keyThemes: ['[mock] Roads', '[mock] Water supply'],
        });

      default:
        throw new AiProviderError(
          'PROVIDER_ERROR',
          `MockAiProvider has no scripted shape for schema "${request.schemaName}".`,
        );
    }
  }
}

function firstWords(text: string, count: number): string {
  return text.replace(/\s+/g, ' ').trim().split(' ').slice(0, count).join(' ');
}

/**
 * Echoes back a category key that appeared in the allowed list in the prompt.
 *
 * Echoing rather than inventing keeps the mock's suggestion valid for whatever
 * tenant vocabulary the test seeded, so the happy path stays green while the
 * unknown-category rejection test can still script an invalid key explicitly.
 */
function firstCategoryKeyIn(prompt: string): string | null {
  const match = /"allowedCategoryKeys"\s*:\s*\[\s*"([A-Z_]+)"/.exec(prompt);
  return match?.[1] ?? null;
}
