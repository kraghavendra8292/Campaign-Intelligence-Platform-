import type { AuthContext } from '@rk/types';
import { prisma } from '../../database/prisma';
import { AppError } from '../../errors/AppError';
import { requireAiAccess } from './shared/aiGuards';
import { normalizeTopic } from './validation/aiOutput';

/**
 * Potentially-similar submission suggestions.
 *
 * WHY THERE ARE NO EMBEDDINGS HERE.
 *
 * The obvious implementation is a vector column, an embedding model and a
 * similarity index. It was rejected for this phase, and the reasoning is worth
 * recording because "add pgvector" will be proposed again:
 *
 *  - It is a SECOND provider dependency with its own key, cost, latency and
 *    failure mode, needed on every submission rather than on demand.
 *  - It requires a database extension and a backfill of every historical issue,
 *    which is a migration with real risk against a live tenant database.
 *  - The job is narrow. These are short civic reports with a controlled
 *    category vocabulary, and duplicates look like "road near school damaged"
 *    versus "potholes outside the school road". Lexical and topical overlap
 *    finds those. Embeddings would find paraphrases with no shared vocabulary,
 *    which is a real capability that this problem does not often need.
 *  - The output is a SUGGESTION a human reads. The cost of a mediocre
 *    suggestion is that somebody glances at an unrelated issue; the cost of the
 *    infrastructure is permanent.
 *
 * So similarity is computed from data the platform already has: the topics the
 * AI extracted, the title words, the category and the ward. It is deterministic,
 * costs one indexed query, needs no provider, and keeps working when AI is
 * switched off (title overlap alone still functions).
 *
 * THE HARD RULE: THIS ONLY EVER SUGGESTS. Nothing in Phase 6 merges issues,
 * closes duplicates, or alters a status based on a similarity score. There is
 * no merge mutation in the schema and no auto-close path in the code. An
 * administrator opens both and decides, exactly as they would have without it.
 */

/** Candidate pool ceiling. Bounds the work regardless of tenant size. */
const CANDIDATE_LIMIT = 400;
/** Below this combined score, a pair is not worth an administrator's attention. */
const MIN_SCORE = 0.18;
const DEFAULT_RESULTS = 5;

/**
 * Words carrying no discriminating signal in civic reports.
 *
 * Short and domain-specific. "Road" is NOT here - it discriminates usefully.
 * "Please" and "issue" are, because they appear in a third of all submissions
 * and would make every pair look slightly similar.
 */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'from',
  'by',
  'near',
  'our',
  'my',
  'we',
  'i',
  'it',
  'this',
  'that',
  'there',
  'here',
  'has',
  'have',
  'had',
  'not',
  'no',
  'very',
  'please',
  'kindly',
  'request',
  'sir',
  'madam',
  'issue',
  'problem',
  'complaint',
  'area',
  'people',
  'public',
  'many',
  'much',
  'since',
  'due',
]);

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  return new Set(tokens);
}

/**
 * Jaccard overlap: shared members over total distinct members.
 *
 * Chosen over raw intersection size because it is length-normalised. A long
 * rambling report shares more words with everything, and an unnormalised count
 * would rank the longest submissions as similar to all of them.
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export const similarityService = {
  /**
   * Submissions that may describe the same problem as this one.
   *
   * WEIGHTS, and why each is where it is. Topics are weighted highest because
   * they are the most abstracted signal - two reports that both yielded "road
   * damage" and "school access" are about the same thing even with no shared
   * vocabulary. Title overlap is next: it is concrete evidence, available even
   * when neither issue has been processed by AI. Category and ward are weak
   * bonuses rather than filters - two drainage reports in Ward 12 are worth
   * surfacing together, but sharing a ward alone means very little in a tenant
   * where most submissions come from a handful of wards.
   */
  async findSimilar(auth: AuthContext, issueId: string, limit = DEFAULT_RESULTS) {
    const { organizationId } = requireAiAccess(auth, 'AI_INSIGHT_READ');

    const subject = await prisma.issue.findFirst({
      where: { id: issueId, organizationId },
      select: {
        id: true,
        title: true,
        categoryId: true,
        ward: true,
        aiTopics: { select: { normalized: true } },
      },
    });
    if (!subject) throw AppError.notFound('Submission not found.');

    // Tenant-scoped by construction: `organizationId` comes from the verified
    // auth context, never from an argument.
    const candidates = await prisma.issue.findMany({
      where: {
        organizationId,
        id: { not: issueId },
        // Rejected and spam submissions are excluded: suggesting that a genuine
        // report duplicates something already dismissed would quietly push an
        // administrator toward dismissing it too.
        moderationStatus: { not: 'SPAM' },
        status: { not: 'REJECTED' },
      },
      select: {
        id: true,
        referenceNumber: true,
        title: true,
        status: true,
        categoryId: true,
        ward: true,
        submittedAt: true,
        category: { select: { id: true, key: true, label: true } },
        aiTopics: { select: { normalized: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: CANDIDATE_LIMIT,
    });

    const subjectTopics = new Set(subject.aiTopics.map((topic) => topic.normalized));
    const subjectTitle = tokenize(subject.title);
    const subjectWard = subject.ward ? normalizeTopic(subject.ward) : null;

    const scored = candidates.map((candidate) => {
      const topicScore = jaccard(
        subjectTopics,
        new Set(candidate.aiTopics.map((topic) => topic.normalized)),
      );
      const titleScore = jaccard(subjectTitle, tokenize(candidate.title));
      const categoryBonus =
        subject.categoryId && candidate.categoryId === subject.categoryId ? 1 : 0;
      const wardBonus =
        subjectWard && candidate.ward && normalizeTopic(candidate.ward) === subjectWard ? 1 : 0;

      const score = topicScore * 0.45 + titleScore * 0.35 + categoryBonus * 0.12 + wardBonus * 0.08;

      return { candidate, score, topicScore, titleScore };
    });

    return scored
      .filter((entry) => entry.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Math.max(limit, 1), 20))
      .map((entry) => ({
        issue: {
          id: entry.candidate.id,
          referenceNumber: entry.candidate.referenceNumber,
          title: entry.candidate.title,
          status: entry.candidate.status,
          submittedAt: entry.candidate.submittedAt,
          category: entry.candidate.category,
        },
        // Rounded to two places. Any more would imply a precision this scoring
        // does not have - it is a heuristic ranking, not a measurement.
        score: Math.round(entry.score * 100) / 100,
        /**
         * What drove the match, so an administrator can judge the suggestion
         * rather than trusting the number. A pair matched only by a shared
         * category is visibly weaker than one matched by topics, and saying so
         * is more useful than a slightly lower score.
         */
        basis: entry.topicScore > entry.titleScore ? 'TOPICS' : 'WORDING',
      }));
  },
};
