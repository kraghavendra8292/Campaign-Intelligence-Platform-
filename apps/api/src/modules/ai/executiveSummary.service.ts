import type { AuthContext } from '@rk/types';
import { AI_LIMITS } from '@rk/types';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../audit/audit.service';
import type { RequestMeta } from '../issues/cms/issue.service';
import { runGeneration } from './aiExecution.service';
import {
  buildExecutiveSummaryPrompt,
  EXECUTIVE_SUMMARY_PROMPT_VERSION,
  type ExecutiveSummaryEvidence,
} from './prompts/index';
import { consumeAiBudget, requireAiAccess, requireAiAvailable } from './shared/aiGuards';
import {
  collectSupportedNumbers,
  EXECUTIVE_SUMMARY_JSON_SCHEMA,
  validateExecutiveSummary,
} from './validation/aiOutput';

/**
 * Period briefings for administrators.
 *
 * THE ARCHITECTURE IS THE SAFEGUARD. The model is not asked to analyse
 * submissions; it is asked to WRITE UP statistics that this file computed. It
 * never sees a raw issue, so it cannot count one, and every number available to
 * it comes from `buildEvidence` below.
 *
 * That evidence object is then STORED on the row and rendered beside the prose
 * in the admin console. This is what makes "evidence-backed" a property of the
 * system rather than a claim about the prompt: a reader can check any figure in
 * the sentence against the table underneath it, and `validateExecutiveSummary`
 * has already flagged any number in the prose that the evidence does not
 * account for.
 *
 * PRIVACY NOTE: no citizen text of any kind is sent by this operation. The
 * prompt contains counts, labels and percentages - nothing anybody wrote.
 */

export const executiveSummaryService = {
  async generate(auth: AuthContext, input: { from: Date; to: Date }, meta: RequestMeta) {
    const { organizationId } = requireAiAccess(auth, 'AI_ISSUE_PROCESS');
    requireAiAvailable();

    if (input.to <= input.from) {
      throw AppError.validation('The period end must be after its start.', {
        details: { field: 'to' },
      });
    }

    const evidence = await buildEvidence(organizationId, input.from, input.to);

    if (evidence.totalIssues === 0) {
      throw AppError.validation('There are no submissions in the selected period to summarise.');
    }

    consumeAiBudget(organizationId, 'generate');

    const outcome = await runGeneration({
      organizationId,
      operation: 'EXECUTIVE_SUMMARY',
      schemaName: 'executive_summary',
      schema: EXECUTIVE_SUMMARY_JSON_SCHEMA,
      messages: buildExecutiveSummaryPrompt(evidence),
      actorUserId: auth.userId,
      correlationId: meta.correlationId,
    });

    if (!outcome.ok) throw AppError.validation(outcome.reason);

    const validation = validateExecutiveSummary(
      outcome.result.content,
      collectSupportedNumbers(evidence as unknown as Record<string, unknown>),
    );
    if (!validation.ok) throw AppError.validation(validation.reason);

    const unsupported = validation.value.unsupportedFigures;

    const created = await prisma.aiExecutiveSummary.create({
      data: {
        organizationId,
        periodStart: input.from,
        periodEnd: input.to,
        summary: validation.value.summary,
        keyThemes: [...validation.value.keyThemes],
        evidence: evidence as unknown as Prisma.InputJsonValue,
        // A summary containing a figure the evidence cannot account for is NOT
        // rejected - see the note in `validateExecutiveSummary` on why a hard
        // failure there would reject correct summaries. It is marked for review
        // so a person checks it before it is used, which is the whole point of
        // the review workflow.
        reviewStatus: unsupported.length > 0 ? 'PENDING_REVIEW' : 'GENERATED',
        model: outcome.result.model.slice(0, 120),
        promptVersion: EXECUTIVE_SUMMARY_PROMPT_VERSION,
        generatedByUserId: auth.userId,
      },
      include: {
        generatedBy: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });

    await auditService.record({
      action: 'AI_EXECUTIVE_SUMMARY_GENERATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'AiExecutiveSummary',
      entityId: created.id,
      metadata: {
        periodStart: input.from.toISOString(),
        periodEnd: input.to.toISOString(),
        totalIssues: evidence.totalIssues,
        unsupportedFigureCount: unsupported.length,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return { ...created, unsupportedFigures: unsupported };
  },

  async list(auth: AuthContext, args: { first?: number | null } = {}) {
    const { organizationId } = requireAiAccess(auth, 'AI_INSIGHT_READ');

    return prisma.aiExecutiveSummary.findMany({
      where: { organizationId },
      include: {
        generatedBy: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { generatedAt: 'desc' },
      take: Math.min(Math.max(args.first ?? 10, 1), 50),
    });
  },

  async getById(auth: AuthContext, id: string) {
    const { organizationId } = requireAiAccess(auth, 'AI_INSIGHT_READ');

    const summary = await prisma.aiExecutiveSummary.findFirst({
      where: { id, organizationId },
      include: {
        generatedBy: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!summary) throw AppError.notFound('Executive summary not found.');

    return summary;
  },

  /**
   * Approves, edits or rejects a briefing.
   *
   * Same three-verb shape as the per-issue review, and the same rule about
   * edits: the administrator's text lands in `editedSummary` so the model's
   * original wording survives.
   */
  async review(
    auth: AuthContext,
    input: { id: string; decision: 'APPROVE' | 'REJECT' | 'EDIT'; editedSummary?: string | null },
    meta: RequestMeta,
  ) {
    const { organizationId } = requireAiAccess(auth, 'AI_SUMMARY_REVIEW');

    const existing = await prisma.aiExecutiveSummary.findFirst({
      where: { id: input.id, organizationId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound('Executive summary not found.');

    let editedSummary: string | null | undefined;
    if (input.decision === 'EDIT') {
      const trimmed = input.editedSummary?.trim() ?? '';
      if (trimmed.length < 20) {
        throw AppError.validation('An edited summary is too short to be useful.', {
          details: { field: 'editedSummary' },
        });
      }
      if (trimmed.length > AI_LIMITS.executiveSummaryMax) {
        throw AppError.validation(
          `An edited summary may be at most ${AI_LIMITS.executiveSummaryMax} characters.`,
          { details: { field: 'editedSummary' } },
        );
      }
      editedSummary = trimmed;
    }

    const updated = await prisma.aiExecutiveSummary.update({
      where: { id: existing.id },
      data: {
        reviewStatus: input.decision === 'REJECT' ? 'REJECTED' : 'APPROVED',
        ...(editedSummary === undefined ? {} : { editedSummary }),
        reviewedAt: new Date(),
        reviewedByUserId: auth.userId,
      },
      include: {
        generatedBy: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, fullName: true } },
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
      entityType: 'AiExecutiveSummary',
      entityId: existing.id,
      metadata: { decision: input.decision },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return updated;
  },
};

/**
 * Computes every figure a briefing may cite.
 *
 * EXPORTED because the test suite asserts directly against it: the guarantee
 * "the AI cannot invent a statistic" is only meaningful if the statistics are
 * independently checkable, and a test that went through the model to verify
 * arithmetic would be testing the model.
 *
 * The previous-period comparison uses a window of EQUAL LENGTH immediately
 * before the selected one. Equal length matters: comparing a 30-day period
 * against a calendar month would produce a change figure that is partly an
 * artefact of the window, and the model would faithfully report the artefact.
 */
export async function buildEvidence(
  organizationId: string,
  from: Date,
  to: Date,
): Promise<ExecutiveSummaryEvidence> {
  const periodMs = to.getTime() - from.getTime();
  const previousFrom = new Date(from.getTime() - periodMs);

  const windowed = { organizationId, submittedAt: { gte: from, lt: to } };

  const [
    totalIssues,
    previousPeriodTotal,
    categoryRows,
    statusRows,
    priorityRows,
    sourceRows,
    wardRows,
    openCount,
    resolvedInPeriod,
    categories,
  ] = await Promise.all([
    prisma.issue.count({ where: windowed }),
    prisma.issue.count({
      where: { organizationId, submittedAt: { gte: previousFrom, lt: from } },
    }),
    prisma.issue.groupBy({ by: ['categoryId'], where: windowed, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ['status'], where: windowed, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ['priority'], where: windowed, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ['source'], where: windowed, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ['ward'], where: windowed, _count: { _all: true } }),
    prisma.issue.count({
      where: { organizationId, status: { notIn: ['CLOSED', 'REJECTED'] } },
    }),
    prisma.issue.count({
      where: { organizationId, resolvedAt: { gte: from, lt: to } },
    }),
    prisma.issueCategory.findMany({
      where: { organizationId },
      select: { id: true, label: true },
    }),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const humanise = (value: string): string => {
    const lower = value.replace(/_/g, ' ').toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };

  return {
    periodStart: from.toISOString(),
    periodEnd: to.toISOString(),
    totalIssues,
    previousPeriodTotal,
    // Null rather than 0 or 100 when the previous period was empty: a percentage
    // change from zero is undefined, and any number here would be quoted by the
    // model as though it meant something.
    changeFromPreviousPct:
      previousPeriodTotal === 0
        ? null
        : Math.round(((totalIssues - previousPeriodTotal) / previousPeriodTotal) * 1000) / 10,

    byCategory: categoryRows
      .map((row) => ({
        label: row.categoryId
          ? (categoryById.get(row.categoryId)?.label ?? 'Not categorised')
          : 'Not categorised',
        count: row._count._all,
        // Pre-computed so the model quotes a share rather than dividing - a
        // model doing arithmetic in prose is where invented percentages come
        // from.
        sharePct: totalIssues === 0 ? 0 : Math.round((row._count._all / totalIssues) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count),

    byStatus: statusRows
      .map((row) => ({ label: humanise(row.status), count: row._count._all }))
      .sort((a, b) => b.count - a.count),

    byPriority: priorityRows
      .map((row) => ({ label: humanise(row.priority), count: row._count._all }))
      .sort((a, b) => b.count - a.count),

    bySource: sourceRows
      .map((row) => ({ label: humanise(row.source), count: row._count._all }))
      .sort((a, b) => b.count - a.count),

    byWard: wardRows
      .filter((row) => row.ward !== null && row.ward.trim().length > 0)
      .map((row) => ({ label: row.ward as string, count: row._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),

    openCount,
    resolvedInPeriod,
  };
}
