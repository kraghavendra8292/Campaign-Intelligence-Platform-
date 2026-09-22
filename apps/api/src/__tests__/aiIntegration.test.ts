import { describe, expect, it } from 'vitest';
import { OpenAiProvider } from '../modules/ai/provider/openAiProvider';
import { buildIssueInsightPrompt } from '../modules/ai/prompts/index';
import { ISSUE_INSIGHT_JSON_SCHEMA, validateIssueInsight } from '../modules/ai/validation/aiOutput';

/**
 * OPT-IN test against a REAL AI provider.
 *
 * Skipped unless BOTH `AI_INTEGRATION_TEST=true` and `OPENAI_API_KEY` are set.
 * It never runs in CI, never runs in `npm test`, and a developer who has a key
 * in their `.env` still does not run it by accident - the explicit flag is a
 * second, deliberate switch.
 *
 * WHAT IT IS FOR, and why the rest of the suite does not do this.
 *
 * `ai.test.ts` proves the platform's own behaviour: validation, safety
 * screening, privacy, tenancy, review. It uses the mock provider because those
 * properties are ours and must hold regardless of which vendor is configured -
 * and because a test suite that needed a paid API key to pass is a test suite
 * that stops being run.
 *
 * This file proves something different and much narrower: that the CONTRACT
 * with the real provider still holds. Vendors change response shapes, deprecate
 * models, and alter how strictly they honour a JSON schema. None of that is
 * visible to a mock. So this asks the real provider one small question and
 * checks that the answer survives the same validation the production path
 * applies.
 *
 * It costs one short completion. Run it before a deployment, after changing
 * `AI_MODEL`, or when a provider announces a breaking change.
 *
 *   AI_INTEGRATION_TEST=true npx vitest run src/__tests__/aiIntegration.test.ts
 *
 * NOTE ON DATA: the prompt below is synthetic. No citizen text, and no database
 * row, is involved - this test must never be the thing that sends real
 * submissions to a provider.
 */

const enabled =
  process.env.AI_INTEGRATION_TEST === 'true' && (process.env.OPENAI_API_KEY?.length ?? 0) > 0;

describe.skipIf(!enabled)('real AI provider contract', () => {
  const provider = new OpenAiProvider({
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
  });

  it('returns structured output that passes production validation', async () => {
    expect(provider.isAvailable()).toBe(true);

    const allowedCategoryKeys = ['ROADS', 'WATER', 'DRAINAGE', 'SANITATION', 'OTHER'];

    const result = await provider.generate({
      messages: buildIssueInsightPrompt({
        // Synthetic. Deliberately not read from the database.
        title: 'Road near the school is damaged',
        description:
          'The road beside the primary school has been broken for several months. ' +
          'During rain it fills with water and children and two-wheelers struggle to pass.',
        allowedCategoryKeys,
        currentCategoryKey: null,
        area: 'Ward 12',
      }),
      schemaName: 'issue_insight',
      schema: ISSUE_INSIGHT_JSON_SCHEMA,
      maxTokens: 900,
      temperature: 0.2,
      timeoutMs: 30_000,
    });

    expect(result.content.length).toBeGreaterThan(0);
    expect(result.model.length).toBeGreaterThan(0);

    // The contract that actually matters: real output survives the same
    // validation the production path applies. A vendor change that broke the
    // shape would fail here rather than in front of an administrator.
    const validation = validateIssueInsight(result.content, allowedCategoryKeys);

    if (!validation.ok) {
      throw new Error(
        `Real provider output failed production validation (${validation.kind}): ${validation.reason}`,
      );
    }

    expect(validation.value.summary.length).toBeGreaterThan(10);
    // The model must choose from the supplied vocabulary or return null; it may
    // legitimately decide none fits, so both are accepted.
    if (validation.value.suggestedCategoryKey !== null) {
      expect(allowedCategoryKeys).toContain(validation.value.suggestedCategoryKey);
    }
  }, 60_000);

  it('reports token usage, so cost tracking is not a guess', async () => {
    const result = await provider.generate({
      messages: buildIssueInsightPrompt({
        title: 'Streetlight not working',
        description: 'The streetlight outside the community hall has been off for two weeks.',
        allowedCategoryKeys: ['OTHER'],
        currentCategoryKey: null,
        area: null,
      }),
      schemaName: 'issue_insight',
      schema: ISSUE_INSIGHT_JSON_SCHEMA,
      maxTokens: 900,
      temperature: 0.2,
      timeoutMs: 30_000,
    });

    // Nothing in this platform estimates tokens from character counts. If a
    // provider stops reporting usage, the cost column must read "not priced"
    // rather than silently start showing a fabricated number - this asserts the
    // input to that decision is really there.
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
  }, 60_000);
});
