import type { AuthContext } from '@rk/types';
import { AI_LIMITS } from '@rk/types';
import { prisma } from '../../database/prisma';
import { AppError } from '../../errors/AppError';
import { getLogger } from '../../logging/logger';
import { auditService } from '../audit/audit.service';
import type { RequestMeta } from '../issues/cms/issue.service';
import { runGeneration } from './aiExecution.service';
import {
  buildIssueInsightPrompt,
  PROMPT_TEXT_LIMITS,
  ISSUE_INSIGHT_PROMPT_VERSION,
} from './prompts/index';
import { prepareCitizenText } from './shared/redaction';
import { consumeAiBudget, requireAiAccess, requireAiAvailable } from './shared/aiGuards';
import {
  ISSUE_INSIGHT_JSON_SCHEMA,
  normalizeTopic,
  validateIssueInsight,
} from './validation/aiOutput';

/**
 * AI intelligence for a single citizen submission.
 *
 * THE CENTRAL RULE OF THIS FILE, and of the phase: nothing here writes to the
 * `issues` table. Not the summary, not the topics, not the suggested category.
 * The citizen's words and the campaign's official classification are the source
 * of truth, and AI output is a separate, clearly-labelled opinion about them
 * that a person may adopt, edit or discard.
 *
 * The one path that does change an issue is `acceptCategorySuggestion`, and it
 * is worth reading closely: it does not write `Issue.categoryId` itself. It
 * calls the ordinary Phase 5 `issueService.update` as the ADMINISTRATOR, so the
 * change is audited, appears in the issue history, and is attributed to the
 * person who accepted it. The AI never becomes the actor.
 */

/**
 * THE PRIVACY BOUNDARY, EXPRESSED AS A SELECT CLAUSE.
 *
 * This is the complete set of issue fields that any AI code path may load.
 * `contactName`, `contactPhone`, `contactEmail`, `addressDescription`,
 * `latitude` and `longitude` are absent, so they are never in memory in this
 * module, never in a prompt, and cannot leak through a later refactor that
 * forgets to filter - there is nothing to filter.
 *
 * `ward` and `locality` ARE included: a summary saying a problem is in Ward 12
 * is administratively useful, and a ward is a public administrative division,
 * not a person's address. `addressDescription` is excluded precisely because it
 * is free text where somebody may have typed their doorstep.
 */
const ISSUE_AI_SELECT = {
  id: true,
  organizationId: true,
  referenceNumber: true,
  title: true,
  description: true,
  categoryId: true,
  ward: true,
  locality: true,
  updatedAt: true,
} as const;

export const issueInsightService = {
  /**
   * Queues an issue for processing, or processes it immediately.
   *
   * Returns the insight row in whatever state it reached, so the caller always
   * has something to show - "QUEUED" is a real answer, and an admin console
   * that got an exception instead would have to invent one.
   */
  async requestProcessing(
    auth: AuthContext,
    issueId: string,
    meta: RequestMeta,
    options: { regenerate?: boolean } = {},
  ) {
    const regenerate = options.regenerate ?? false;
    const { organizationId } = requireAiAccess(
      auth,
      regenerate ? 'AI_ISSUE_REGENERATE' : 'AI_ISSUE_PROCESS',
    );

    requireAiAvailable();

    const issue = await prisma.issue.findFirst({
      where: { id: issueId, organizationId },
      select: ISSUE_AI_SELECT,
    });
    if (!issue) throw AppError.notFound('Submission not found.');

    const existing = await prisma.issueAiInsight.findUnique({
      where: { issueId },
      select: { id: true, processingStatus: true, generation: true, sourceUpdatedAt: true },
    });

    // CACHING. A completed, current insight is not regenerated just because
    // somebody pressed the button again - that would spend money to produce the
    // same sentences. Regeneration is an explicit, separately-permissioned act.
    if (
      !regenerate &&
      existing?.processingStatus === 'COMPLETED' &&
      existing.sourceUpdatedAt?.getTime() === issue.updatedAt.getTime()
    ) {
      return this.getByIssueId(auth, issueId);
    }

    if (existing?.processingStatus === 'PROCESSING') {
      throw AppError.conflict('This submission is already being processed.');
    }

    consumeAiBudget(organizationId, regenerate ? 'regenerate' : 'generate');

    await auditService.record({
      action: regenerate ? 'AI_OUTPUT_REGENERATED' : 'AI_PROCESSING_REQUESTED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Issue',
      entityId: issueId,
      metadata: { generation: (existing?.generation ?? 0) + 1 },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    await upsertQueued(organizationId, issueId);

    // Processed inline rather than handed to the queue, because this call came
    // from a person who is looking at a spinner. The QUEUE exists for the
    // automatic path (a submission arriving with nobody watching); a manual
    // request wants its answer in the response.
    await processIssue(issueId, { actorUserId: auth.userId, correlationId: meta.correlationId });

    return this.getByIssueId(auth, issueId);
  },

  /**
   * The insight for one issue, with staleness resolved at read time.
   *
   * Staleness is computed on READ rather than written by a background sweep:
   * a sweep would need to run often enough to beat an administrator opening the
   * page, and comparing two timestamps costs nothing. The stored `reviewStatus`
   * is left alone; what changes is what the caller is TOLD, which is the honest
   * arrangement - the row records what a human decided, the response records
   * whether that decision still applies to the current text.
   */
  async getByIssueId(auth: AuthContext, issueId: string) {
    const { organizationId } = requireAiAccess(auth, 'AI_INSIGHT_READ');

    const issue = await prisma.issue.findFirst({
      where: { id: issueId, organizationId },
      select: { id: true, updatedAt: true },
    });
    if (!issue) throw AppError.notFound('Submission not found.');

    const insight = await prisma.issueAiInsight.findUnique({
      where: { issueId },
      include: {
        topics: { orderBy: { confidence: 'desc' } },
        suggestedCategory: { select: { id: true, key: true, label: true } },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!insight) return null;

    return decorate(insight, issue.updatedAt);
  },

  /**
   * Approves, edits or rejects a generation.
   *
   * The three verbs are one method because they are one state transition with
   * one audit shape, and splitting them produced three near-identical bodies
   * that had to be kept in step.
   *
   * An EDIT stores the administrator's text in `editedSummary` and leaves
   * `summary` untouched, so "what did the model actually say?" remains
   * answerable after somebody corrected it. An edit also counts as approval:
   * somebody read it, fixed it and is standing behind the result.
   */
  async review(
    auth: AuthContext,
    input: {
      issueId: string;
      decision: 'APPROVE' | 'REJECT' | 'EDIT';
      editedSummary?: string | null;
    },
    meta: RequestMeta,
  ) {
    const { organizationId } = requireAiAccess(auth, 'AI_SUMMARY_REVIEW');

    const insight = await prisma.issueAiInsight.findFirst({
      where: { issueId: input.issueId, organizationId },
      select: { id: true, processingStatus: true },
    });
    if (!insight) throw AppError.notFound('No AI output exists for this submission.');

    if (
      insight.processingStatus !== 'COMPLETED' &&
      insight.processingStatus !== 'REQUIRES_REVIEW'
    ) {
      throw AppError.validation('There is no completed AI output to review.');
    }

    let editedSummary: string | null | undefined;
    if (input.decision === 'EDIT') {
      const trimmed = input.editedSummary?.trim() ?? '';
      if (trimmed.length < AI_LIMITS.summaryMin) {
        throw AppError.validation('An edited summary is too short to be useful.', {
          details: { field: 'editedSummary' },
        });
      }
      if (trimmed.length > AI_LIMITS.summaryMax) {
        throw AppError.validation(
          `An edited summary may be at most ${AI_LIMITS.summaryMax} characters.`,
          { details: { field: 'editedSummary' } },
        );
      }
      editedSummary = trimmed;
    }

    await prisma.issueAiInsight.update({
      where: { id: insight.id },
      data: {
        reviewStatus: input.decision === 'REJECT' ? 'REJECTED' : 'APPROVED',
        ...(editedSummary === undefined ? {} : { editedSummary }),
        reviewedAt: new Date(),
        reviewedByUserId: auth.userId,
      },
    });

    await auditService.record({
      action:
        input.decision === 'REJECT'
          ? 'AI_OUTPUT_REJECTED'
          : input.decision === 'EDIT'
            ? 'AI_OUTPUT_EDITED'
            : 'AI_OUTPUT_APPROVED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'IssueAiInsight',
      entityId: insight.id,
      // The summary text itself is deliberately not recorded: it is a
      // paraphrase of a citizen's report, and the audit log is widely readable
      // within a tenant.
      metadata: { issueId: input.issueId, decision: input.decision },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return this.getByIssueId(auth, input.issueId);
  },

  /**
   * Acts on the category the model proposed.
   *
   * ACCEPTING DOES NOT MAKE THE AI THE AUTHOR OF THE CHANGE. The write goes
   * through the ordinary Phase 5 update path, as the administrator, so it
   * produces the same audit row and the same entry in the issue's history
   * timeline as a manual recategorisation - because that is what it is. The
   * only thing the AI did was propose it.
   *
   * REJECTING changes nothing about the issue. It records that a person
   * considered the suggestion and declined it, which is what stops the same
   * suggestion being re-presented as though nobody had looked.
   */
  async decideCategorySuggestion(
    auth: AuthContext,
    input: { issueId: string; accept: boolean },
    meta: RequestMeta,
  ) {
    const { organizationId } = requireAiAccess(auth, 'AI_SUMMARY_REVIEW');

    const insight = await prisma.issueAiInsight.findFirst({
      where: { issueId: input.issueId, organizationId },
      select: { id: true, suggestedCategoryId: true, categoryAccepted: true },
    });
    if (!insight) throw AppError.notFound('No AI output exists for this submission.');
    if (!insight.suggestedCategoryId) {
      throw AppError.validation('This submission has no AI category suggestion.');
    }
    if (insight.categoryAccepted !== null) {
      throw AppError.conflict('This category suggestion has already been decided.');
    }

    if (input.accept) {
      // Imported lazily to keep the module graph acyclic: the issue service has
      // no knowledge of AI, and this is the only direction the dependency runs.
      const { issueService } = await import('../issues/cms/issue.service');

      // NOTE THE DOUBLE PERMISSION, which is deliberate rather than accidental.
      // This method already required AI_SUMMARY_REVIEW; `issueService.update`
      // independently requires ISSUE_UPDATE. So accepting a suggestion is
      // possible only for somebody who could have made the same change by hand.
      // Accepting is a shortcut for a decision they were already entitled to
      // make - never a way to reach one they were not.
      //
      // The update runs BEFORE the insight is marked decided, so a rejected
      // authorisation leaves the suggestion open rather than recording a
      // decision that did not take effect.
      await issueService.update(
        auth,
        input.issueId,
        { categoryId: insight.suggestedCategoryId },
        meta,
      );
    }

    await prisma.issueAiInsight.update({
      where: { id: insight.id },
      data: { categoryAccepted: input.accept, categoryDecidedAt: new Date() },
    });

    await auditService.record({
      action: input.accept ? 'AI_CATEGORY_SUGGESTION_ACCEPTED' : 'AI_CATEGORY_SUGGESTION_REJECTED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'IssueAiInsight',
      entityId: insight.id,
      metadata: { issueId: input.issueId, categoryId: insight.suggestedCategoryId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return this.getByIssueId(auth, input.issueId);
  },

  /** Paged list for the AI console's review queue. */
  async list(
    auth: AuthContext,
    args: {
      processingStatus?: string | null;
      reviewStatus?: string | null;
      first?: number | null;
      offset?: number | null;
    },
  ) {
    const { organizationId } = requireAiAccess(auth, 'AI_INSIGHT_READ');

    const take = Math.min(Math.max(args.first ?? 20, 1), 100);
    const skip = Math.max(args.offset ?? 0, 0);

    const where = {
      organizationId,
      ...(args.processingStatus ? { processingStatus: args.processingStatus as 'COMPLETED' } : {}),
      ...(args.reviewStatus ? { reviewStatus: args.reviewStatus as 'GENERATED' } : {}),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.issueAiInsight.findMany({
        where,
        include: {
          topics: { orderBy: { confidence: 'desc' } },
          suggestedCategory: { select: { id: true, key: true, label: true } },
          reviewedBy: { select: { id: true, fullName: true } },
          issue: {
            select: { id: true, referenceNumber: true, title: true, updatedAt: true },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        skip,
      }),
      prisma.issueAiInsight.count({ where }),
    ]);

    const hasMore = rows.length > take;
    const nodes = hasMore ? rows.slice(0, take) : rows;

    return {
      nodes: nodes.map((row) => ({
        ...decorate(row, row.issue.updatedAt),
        issue: row.issue,
      })),
      totalCount,
      hasMore,
    };
  },
};

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

/** Creates or resets the insight row into QUEUED before work begins. */
async function upsertQueued(organizationId: string, issueId: string): Promise<void> {
  await prisma.issueAiInsight.upsert({
    where: { issueId },
    create: { organizationId, issueId, processingStatus: 'QUEUED' },
    update: {
      processingStatus: 'QUEUED',
      failureKind: null,
      failureReason: null,
    },
  });
}

/**
 * Runs one issue through the model and persists the result.
 *
 * EXPORTED AND DELIBERATELY UNAUTHENTICATED. The queue worker calls this with
 * no `AuthContext`, because no user is present when a submission arrives at
 * 3am. Authorization happened when the work was ENQUEUED; re-checking here
 * would mean either inventing a system actor or refusing to process anything
 * that was not manually triggered.
 *
 * The tenant boundary is still absolute: `organizationId` is read from the
 * issue row itself, never passed in, so this cannot be pointed at another
 * tenant's data by a caller.
 *
 * NEVER THROWS. Every failure is recorded on the row and returned as `false`.
 * A queue worker that threw would stop the backlog.
 */
export async function processIssue(
  issueId: string,
  context: { actorUserId?: string | null; correlationId?: string | null } = {},
): Promise<boolean> {
  const logger = getLogger();

  const issue = await prisma.issue.findUnique({ where: { id: issueId }, select: ISSUE_AI_SELECT });
  if (!issue) return false;

  const categories = await prisma.issueCategory.findMany({
    where: { organizationId: issue.organizationId, isActive: true },
    select: { id: true, key: true },
    orderBy: { displayOrder: 'asc' },
  });

  await prisma.issueAiInsight.upsert({
    where: { issueId },
    create: {
      organizationId: issue.organizationId,
      issueId,
      processingStatus: 'PROCESSING',
      startedAt: new Date(),
    },
    update: { processingStatus: 'PROCESSING', startedAt: new Date() },
  });

  // Citizen free text is redacted and neutralised here, once, before it can
  // reach a prompt. `prepareCitizenText` is the only sanitiser; see the note in
  // `redaction.ts` on why there is exactly one.
  const title = prepareCitizenText(issue.title, PROMPT_TEXT_LIMITS.issueTitle);
  const description = prepareCitizenText(issue.description, PROMPT_TEXT_LIMITS.issueDescription);

  const currentCategoryKey = issue.categoryId
    ? (categories.find((category) => category.id === issue.categoryId)?.key ?? null)
    : null;

  const outcome = await runGeneration({
    organizationId: issue.organizationId,
    operation: 'ISSUE_INSIGHT',
    schemaName: 'issue_insight',
    schema: ISSUE_INSIGHT_JSON_SCHEMA,
    messages: buildIssueInsightPrompt({
      title: title.text,
      description: description.text,
      allowedCategoryKeys: categories.map((category) => category.key),
      currentCategoryKey,
      // Ward or locality only - a coarse administrative division, never an
      // address. See `ISSUE_AI_SELECT`.
      area: issue.ward ?? issue.locality,
    }),
    actorUserId: context.actorUserId ?? null,
    correlationId: context.correlationId ?? null,
  });

  if (!outcome.ok) {
    await failInsight(issueId, outcome.kind, outcome.reason);
    return false;
  }

  const validation = validateIssueInsight(
    outcome.result.content,
    categories.map((category) => category.key),
  );

  if (!validation.ok) {
    // Invalid or unsafe output is a REVIEWABLE outcome, not a silent discard:
    // the administrator is told the model returned something unusable, which is
    // information about the model rather than about their backlog.
    logger.warn(
      { issueId, kind: validation.kind },
      'AI issue insight failed validation and was discarded',
    );
    await failInsight(issueId, validation.kind, validation.reason);
    return false;
  }

  const value = validation.value;
  const suggestedCategoryId = value.suggestedCategoryKey
    ? (categories.find((category) => category.key === value.suggestedCategoryKey)?.id ?? null)
    : null;

  // Low confidence is not a failure - the summary and topics are still good -
  // but the CATEGORY suggestion must not be presented as actionable, so the
  // whole generation is marked for review rather than shown as routine output.
  const lowConfidence = suggestedCategoryId !== null && (value.categoryConfidence ?? 0) < 0.5;

  const insight = await prisma.issueAiInsight.update({
    where: { issueId },
    data: {
      processingStatus: lowConfidence ? 'REQUIRES_REVIEW' : 'COMPLETED',
      reviewStatus: 'GENERATED',
      summary: value.summary,
      // A regeneration supersedes any earlier human edit and decision: the text
      // it was an edit OF no longer exists.
      editedSummary: null,
      suggestedCategoryId,
      categoryConfidence: value.categoryConfidence,
      categoryReason: value.categoryReason,
      categoryAccepted: null,
      categoryDecidedAt: null,
      model: outcome.result.model.slice(0, 120),
      promptVersion: ISSUE_INSIGHT_PROMPT_VERSION,
      generation: { increment: 1 },
      sourceUpdatedAt: issue.updatedAt,
      completedAt: new Date(),
      failureKind: null,
      failureReason: null,
      reviewedAt: null,
      reviewedByUserId: null,
    },
    select: { id: true },
  });

  // Topics are replaced wholesale rather than merged: they describe THIS
  // generation, and a merge would leave topics from a superseded reading of
  // text that may since have been edited.
  await prisma.$transaction([
    prisma.issueAiTopic.deleteMany({ where: { issueId } }),
    prisma.issueAiTopic.createMany({
      data: value.topics.map((topic) => ({
        organizationId: issue.organizationId,
        issueId,
        insightId: insight.id,
        topic: topic.slice(0, 80),
        normalized: normalizeTopic(topic),
        confidence: value.categoryConfidence,
      })),
      skipDuplicates: true,
    }),
  ]);

  return true;
}

/** Records a failure on the insight row, incrementing the attempt counter. */
async function failInsight(issueId: string, kind: string, reason: string): Promise<void> {
  try {
    await prisma.issueAiInsight.update({
      where: { issueId },
      data: {
        processingStatus: 'FAILED',
        failureKind: kind as 'UNKNOWN',
        failureReason: reason.slice(0, 300),
        completedAt: new Date(),
        retryCount: { increment: 1 },
      },
    });
  } catch (error) {
    getLogger().error({ err: error, issueId }, 'Failed to record AI failure state');
  }
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * Adds derived, read-time fields to an insight row.
 *
 * `isStale` compares the issue's current `updatedAt` against the value captured
 * at generation. `displaySummary` resolves the edited-versus-generated choice in
 * ONE place, so no caller can accidentally show the model's original after an
 * administrator corrected it.
 */
function decorate<
  T extends {
    summary: string | null;
    editedSummary: string | null;
    sourceUpdatedAt: Date | null;
    reviewStatus: string;
  },
>(insight: T, issueUpdatedAt: Date) {
  const isStale =
    insight.sourceUpdatedAt !== null &&
    insight.sourceUpdatedAt.getTime() !== issueUpdatedAt.getTime();

  return {
    ...insight,
    isStale,
    // The stored review decision is preserved; what is REPORTED reflects that a
    // decision about older text no longer describes the current text.
    effectiveReviewStatus: isStale ? 'STALE' : insight.reviewStatus,
    displaySummary: insight.editedSummary ?? insight.summary,
    isEdited: insight.editedSummary !== null,
  };
}
