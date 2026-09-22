import { getEnv } from '../../../config/env';
import type { AiProvider } from './aiProvider';
import { MockAiProvider } from './mockAiProvider';
import { OpenAiProvider } from './openAiProvider';

/**
 * Provider selection, in one place.
 *
 * The same shape as `getMediaStorage()` in Phase 3, deliberately: a lazily
 * constructed process-wide instance plus a setter used by tests. Consistency
 * matters more than novelty here - anybody who has read the media adapter
 * already knows how this works, including that `setAiProvider` is the seam and
 * not a back door into configuration.
 *
 * No provider is constructed until something asks for one, so a deployment with
 * AI disabled never builds an HTTP client or reads a credential.
 */

let provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (provider) return provider;

  const env = getEnv();

  provider =
    env.AI_PROVIDER === 'openai'
      ? new OpenAiProvider({
          apiKey: env.OPENAI_API_KEY,
          baseUrl: env.OPENAI_BASE_URL,
          model: env.AI_MODEL,
        })
      : new MockAiProvider(env.AI_MODEL);

  return provider;
}

/** Swap point for tests, and for a future provider. */
export function setAiProvider(next: AiProvider | null): void {
  provider = next;
}

/**
 * Whether AI work may be attempted at all.
 *
 * Two independent conditions, and both are required: the operator turned the
 * feature on, AND the selected provider has what it needs to run. Callers use
 * this to fail fast with an honest "not configured" instead of enqueuing work
 * that is certain to fail - which would otherwise fill the dashboard's failure
 * counter with a configuration problem dressed up as an outage.
 */
export function isAiEnabled(): boolean {
  return getEnv().AI_ENABLED && getAiProvider().isAvailable();
}

export { AiProviderError } from './aiProvider';
export type {
  AiProvider,
  AiGenerationRequest,
  AiGenerationResult,
  AiMessage,
  AiTokenUsage,
} from './aiProvider';
export { MockAiProvider } from './mockAiProvider';
export { OpenAiProvider } from './openAiProvider';
