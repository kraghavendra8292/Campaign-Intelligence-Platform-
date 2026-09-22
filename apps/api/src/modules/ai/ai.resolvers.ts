import type { AuthContext } from '@rk/types';
import { confidenceBand } from '@rk/types';
import type { GraphQLContext } from '../../graphql/context/index';
import { authorizationService } from '../auth/authorization.service';
import type { RequestMeta } from '../issues/cms/issue.service';
import { issueInsightService } from './issueInsight.service';
import { similarityService } from './similarity.service';
import { themeService } from './theme.service';
import { executiveSummaryService } from './executiveSummary.service';
import { aiDashboardService } from './aiDashboard.service';

/**
 * AI resolvers.
 *
 * Thin, like every other resolver module in this codebase: authenticate,
 * delegate, map. Every permission check, tenant scope and budget decision lives
 * in the service layer, so a resolver is never the only thing between a client
 * and another tenant's data.
 *
 * THERE ARE NO PUBLIC RESOLVERS IN THIS FILE. Unlike the issue module, which
 * groups its anonymous handlers first, every handler here calls `actor()`. That
 * uniformity is the point - there is no "which of these is public?" question to
 * get wrong, because the answer is none of them.
 */

function actor(context: GraphQLContext): AuthContext {
  return authorizationService.requireAuth(context.auth);
}

function meta(context: GraphQLContext): RequestMeta {
  return {
    ipAddress: context.requestMeta.ipAddress,
    userAgent: context.requestMeta.userAgent,
    correlationId: context.correlationId,
  };
}

/** The DateTime scalar yields `Date`; services take `Date`. */
function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

/** Exported because the merged root resolver map's inferred type names it. */
export interface PeriodArg {
  from: Date | string;
  to: Date | string;
}

function period(input: PeriodArg): { from: Date; to: Date } {
  return { from: new Date(input.from), to: new Date(input.to) };
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

/**
 * Service row to `IssueAiInsight`.
 *
 * The mapping is not mechanical, and the two places it diverges are load
 * bearing:
 *
 *  - `summary` is the DISPLAY text (edit if present, model's otherwise) while
 *    `generatedSummary` is always the model's original. A client asking for
 *    "the summary" gets the one it should show.
 *  - `reviewStatus` is the EFFECTIVE status, so an approval of text that has
 *    since been edited reports as STALE rather than as current approval.
 */
type InsightRow = Awaited<ReturnType<typeof issueInsightService.getByIssueId>>;

function shapeInsight(row: NonNullable<InsightRow>) {
  return {
    id: row.id,
    issueId: row.issueId,
    processingStatus: row.processingStatus,
    reviewStatus: row.effectiveReviewStatus,
    summary: row.displaySummary,
    generatedSummary: row.summary,
    isEdited: row.isEdited,
    isStale: row.isStale,

    categorySuggestion: row.suggestedCategory
      ? {
          category: row.suggestedCategory,
          confidence: row.categoryConfidence,
          band: confidenceBand(row.categoryConfidence),
          reason: row.categoryReason,
          accepted: row.categoryAccepted,
          decidedAt: row.categoryDecidedAt,
        }
      : null,

    topics: row.topics,

    model: row.model,
    promptVersion: row.promptVersion,
    generation: row.generation,
    failureReason: row.failureReason,
    retryCount: row.retryCount,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Service row to `AiExecutiveSummary`.
 *
 * `unsupportedFigures` is present on a freshly generated row and absent on one
 * read back from the database - it is a property of the generation, not of the
 * record - so it defaults to empty rather than being stored. A reader checking
 * an older summary has the evidence table for the same purpose.
 */
function shapeExecutiveSummary(row: {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  summary: string;
  editedSummary: string | null;
  keyThemes: string[];
  evidence: unknown;
  reviewStatus: string;
  model: string | null;
  promptVersion: string | null;
  generatedAt: Date;
  generatedBy?: { id: string; fullName: string } | null;
  reviewedAt: Date | null;
  reviewedBy?: { id: string; fullName: string } | null;
  unsupportedFigures?: readonly string[];
}) {
  const evidence = (row.evidence ?? {}) as Record<string, unknown>;

  return {
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    summary: row.editedSummary ?? row.summary,
    generatedSummary: row.summary,
    isEdited: row.editedSummary !== null,
    keyThemes: row.keyThemes,
    evidence: {
      totalIssues: Number(evidence.totalIssues ?? 0),
      previousPeriodTotal: Number(evidence.previousPeriodTotal ?? 0),
      changeFromPreviousPct:
        evidence.changeFromPreviousPct === null || evidence.changeFromPreviousPct === undefined
          ? null
          : Number(evidence.changeFromPreviousPct),
      openCount: Number(evidence.openCount ?? 0),
      resolvedInPeriod: Number(evidence.resolvedInPeriod ?? 0),
      byCategory: entries(evidence.byCategory),
      byStatus: entries(evidence.byStatus),
      byPriority: entries(evidence.byPriority),
      bySource: entries(evidence.bySource),
      byWard: entries(evidence.byWard),
    },
    unsupportedFigures: row.unsupportedFigures ?? [],
    reviewStatus: row.reviewStatus,
    model: row.model,
    promptVersion: row.promptVersion,
    generatedAt: row.generatedAt,
    generatedBy: row.generatedBy ?? null,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy ?? null,
  };
}

/** Normalises a stored evidence array back into the GraphQL entry shape. */
function entries(value: unknown): { label: string; count: number; sharePct: number | null }[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const entry = item as Record<string, unknown>;
    return {
      label: String(entry.label ?? ''),
      count: Number(entry.count ?? 0),
      sharePct: entry.sharePct === undefined ? null : Number(entry.sharePct),
    };
  });
}

export const aiResolvers = {
  Query: {
    aiIssueInsight: async (_p: unknown, args: { issueId: string }, context: GraphQLContext) => {
      const row = await issueInsightService.getByIssueId(actor(context), args.issueId);
      return row ? shapeInsight(row) : null;
    },

    aiIssueInsights: async (
      _p: unknown,
      args: {
        filter?: {
          processingStatus?: string | null;
          reviewStatus?: string | null;
          first?: number | null;
          offset?: number | null;
        } | null;
      },
      context: GraphQLContext,
    ) => {
      const result = await issueInsightService.list(actor(context), args.filter ?? {});
      return {
        nodes: result.nodes.map((node) => ({
          insight: shapeInsight(node),
          issueId: node.issue.id,
          referenceNumber: node.issue.referenceNumber,
          title: node.issue.title,
        })),
        totalCount: result.totalCount,
        hasMore: result.hasMore,
      };
    },

    aiSimilarIssues: (
      _p: unknown,
      args: { issueId: string; limit?: number | null },
      context: GraphQLContext,
    ) => similarityService.findSimilar(actor(context), args.issueId, args.limit ?? 5),

    aiThemes: (
      _p: unknown,
      args: { from?: Date | string | null; to?: Date | string | null },
      context: GraphQLContext,
    ) => themeService.list(actor(context), { from: asDate(args.from), to: asDate(args.to) }),

    aiThemeIssues: (_p: unknown, args: { themeId: string }, context: GraphQLContext) =>
      themeService.members(actor(context), args.themeId),

    aiExecutiveSummaries: async (
      _p: unknown,
      args: { first?: number | null },
      context: GraphQLContext,
    ) => {
      const rows = await executiveSummaryService.list(actor(context), { first: args.first });
      return rows.map(shapeExecutiveSummary);
    },

    aiExecutiveSummary: async (_p: unknown, args: { id: string }, context: GraphQLContext) =>
      shapeExecutiveSummary(await executiveSummaryService.getById(actor(context), args.id)),

    aiOverview: (_p: unknown, _a: unknown, context: GraphQLContext) =>
      aiDashboardService.overview(actor(context)),

    aiUsage: (
      _p: unknown,
      args: { from?: Date | string | null; to?: Date | string | null },
      context: GraphQLContext,
    ) => aiDashboardService.usage(actor(context), { from: asDate(args.from), to: asDate(args.to) }),
  },

  Mutation: {
    processIssueWithAi: async (_p: unknown, args: { issueId: string }, context: GraphQLContext) => {
      const row = await issueInsightService.requestProcessing(
        actor(context),
        args.issueId,
        meta(context),
      );
      return row ? shapeInsight(row) : null;
    },

    regenerateIssueAi: async (_p: unknown, args: { issueId: string }, context: GraphQLContext) => {
      const row = await issueInsightService.requestProcessing(
        actor(context),
        args.issueId,
        meta(context),
        { regenerate: true },
      );
      return row ? shapeInsight(row) : null;
    },

    reviewAiSummary: async (
      _p: unknown,
      args: {
        issueId: string;
        decision: 'APPROVE' | 'REJECT' | 'EDIT';
        editedSummary?: string | null;
      },
      context: GraphQLContext,
    ) => {
      const row = await issueInsightService.review(
        actor(context),
        {
          issueId: args.issueId,
          decision: args.decision,
          editedSummary: args.editedSummary ?? null,
        },
        meta(context),
      );
      return row ? shapeInsight(row) : null;
    },

    decideAiCategorySuggestion: async (
      _p: unknown,
      args: { issueId: string; accept: boolean },
      context: GraphQLContext,
    ) => {
      const row = await issueInsightService.decideCategorySuggestion(
        actor(context),
        { issueId: args.issueId, accept: args.accept },
        meta(context),
      );
      return row ? shapeInsight(row) : null;
    },

    generateAiThemes: (_p: unknown, args: { period: PeriodArg }, context: GraphQLContext) =>
      themeService.generate(actor(context), period(args.period), meta(context)),

    reviewAiTheme: (
      _p: unknown,
      args: { themeId: string; approve: boolean },
      context: GraphQLContext,
    ) => themeService.review(actor(context), args, meta(context)),

    generateAiExecutiveSummary: async (
      _p: unknown,
      args: { period: PeriodArg },
      context: GraphQLContext,
    ) =>
      shapeExecutiveSummary(
        await executiveSummaryService.generate(actor(context), period(args.period), meta(context)),
      ),

    reviewAiExecutiveSummary: async (
      _p: unknown,
      args: { id: string; decision: 'APPROVE' | 'REJECT' | 'EDIT'; editedSummary?: string | null },
      context: GraphQLContext,
    ) =>
      shapeExecutiveSummary(
        await executiveSummaryService.review(
          actor(context),
          { id: args.id, decision: args.decision, editedSummary: args.editedSummary ?? null },
          meta(context),
        ),
      ),
  },
};
