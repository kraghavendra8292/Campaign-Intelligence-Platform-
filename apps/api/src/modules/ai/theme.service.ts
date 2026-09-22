import type { AuthContext } from '@rk/types';
import { AI_LIMITS } from '@rk/types';
import { prisma } from '../../database/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../audit/audit.service';
import type { RequestMeta } from '../issues/cms/issue.service';
import { runGeneration } from './aiExecution.service';
import {
  buildThemeDetectionPrompt,
  PROMPT_TEXT_LIMITS,
  THEME_DETECTION_PROMPT_VERSION,
  type ThemeSampleItem,
} from './prompts/index';
import { prepareCitizenText } from './shared/redaction';
import { consumeAiBudget, requireAiAccess, requireAiAvailable } from './shared/aiGuards';
import { THEME_DETECTION_JSON_SCHEMA, validateThemeDetection } from './validation/aiOutput';

/**
 * Aggregate theme intelligence.
 *
 * A theme is a statement about SUBJECT MATTER over a period: "road
 * infrastructure came up repeatedly between these dates". Stated once more here
 * because this is the file where the line is easiest to cross: a theme is never
 * a statement about a ward's politics, a community's disposition, or the people
 * who submitted the reports. The prompt forbids it, the validator screens for
 * it, and the schema has nowhere to record it.
 *
 * THE COUNTING RULE. The model clusters; the database counts. The model is sent
 * a bounded SAMPLE and is told explicitly not to produce figures. Every
 * `issueCount` is then computed here from the memberships the model returned,
 * intersected with issues that actually exist in the period. A model asked to
 * both cluster and count will do both confidently, and the count will be a
 * guess about data it only partly saw.
 */

export const themeService = {
  /**
   * Detects themes across a period and replaces the stored set for it.
   *
   * Regeneration for an identical period REPLACES rather than accumulates:
   * two overlapping theme sets for the same dates would leave the dashboard
   * double-counting, and there is no question a superseded set answers that the
   * audit log does not.
   */
  async generate(auth: AuthContext, input: { from: Date; to: Date }, meta: RequestMeta) {
    const { organizationId } = requireAiAccess(auth, 'AI_ISSUE_PROCESS');
    requireAiAvailable();

    if (input.to <= input.from) {
      throw AppError.validation('The period end must be after its start.', {
        details: { field: 'to' },
      });
    }

    const windowed = {
      organizationId,
      submittedAt: { gte: input.from, lt: input.to },
    };

    // Every figure the model will be shown comes from these queries, not from
    // the sample it reads.
    const [totalIssues, categoryRows, categories, sampleRows] = await Promise.all([
      prisma.issue.count({ where: windowed }),
      prisma.issue.groupBy({ by: ['categoryId'], where: windowed, _count: { _all: true } }),
      prisma.issueCategory.findMany({
        where: { organizationId },
        select: { id: true, key: true, label: true },
      }),
      /**
       * The sample.
       *
       * Titles and AI topics only - never descriptions. A description is the
       * long free-text field where a citizen may have written about their
       * circumstances, and theme detection does not need it: the title plus the
       * already-extracted topics carry the subject matter. This keeps the
       * aggregate operation to a far smaller exposure than the per-issue one,
       * and keeps the prompt within a sane token budget.
       */
      prisma.issue.findMany({
        where: windowed,
        select: {
          id: true,
          referenceNumber: true,
          title: true,
          category: { select: { label: true } },
          aiTopics: { select: { topic: true } },
        },
        orderBy: { submittedAt: 'desc' },
        take: AI_LIMITS.themeSampleMax,
      }),
    ]);

    if (totalIssues === 0) {
      throw AppError.validation('There are no submissions in the selected period to analyse.');
    }

    consumeAiBudget(organizationId, 'generate');

    const categoryById = new Map(categories.map((category) => [category.id, category]));

    const sample: ThemeSampleItem[] = sampleRows.map((row) => ({
      reference: row.referenceNumber,
      // Titles are citizen-authored, so they go through the same sanitiser as
      // any other free text before entering a prompt.
      title: prepareCitizenText(row.title, PROMPT_TEXT_LIMITS.themeSampleTitle).text,
      categoryLabel: row.category?.label ?? null,
      topics: row.aiTopics.map((topic) => topic.topic),
    }));

    const outcome = await runGeneration({
      organizationId,
      operation: 'THEME_DETECTION',
      schemaName: 'theme_detection',
      schema: THEME_DETECTION_JSON_SCHEMA,
      messages: buildThemeDetectionPrompt({
        periodStart: input.from.toISOString(),
        periodEnd: input.to.toISOString(),
        totalIssues,
        categoryCounts: categoryRows.map((row) => {
          const category = row.categoryId ? categoryById.get(row.categoryId) : undefined;
          return {
            key: category?.key ?? 'UNCATEGORISED',
            label: category?.label ?? 'Not categorised',
            count: row._count._all,
          };
        }),
        sample,
      }),
      actorUserId: auth.userId,
      correlationId: meta.correlationId,
    });

    if (!outcome.ok) throw AppError.validation(outcome.reason);

    const validation = validateThemeDetection(
      outcome.result.content,
      sample.map((item) => item.reference),
    );
    if (!validation.ok) throw AppError.validation(validation.reason);

    const referenceToId = new Map(sampleRows.map((row) => [row.referenceNumber, row.id]));

    const created = await prisma.$transaction(async (tx) => {
      // Replace the stored set for exactly this period.
      await tx.issueTheme.deleteMany({
        where: { organizationId, periodStart: input.from, periodEnd: input.to },
      });

      const themes = [];
      for (const theme of validation.value) {
        const issueIds = theme.issueReferences
          .map((reference) => referenceToId.get(reference))
          .filter((id): id is string => typeof id === 'string');

        const row = await tx.issueTheme.create({
          data: {
            organizationId,
            name: theme.name.slice(0, 120),
            description: theme.description?.slice(0, 600) ?? null,
            generatedSummary: theme.summary,
            // DATABASE-COMPUTED, from memberships that survived validation.
            // Never a number the model wrote.
            issueCount: issueIds.length,
            periodStart: input.from,
            periodEnd: input.to,
            model: outcome.result.model.slice(0, 120),
            promptVersion: THEME_DETECTION_PROMPT_VERSION,
            memberships: {
              createMany: {
                data: issueIds.map((issueId) => ({ issueId })),
                skipDuplicates: true,
              },
            },
          },
          select: { id: true },
        });
        themes.push(row);
      }
      return themes;
    });

    await auditService.record({
      action: 'AI_THEMES_GENERATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'IssueTheme',
      metadata: {
        themeCount: created.length,
        periodStart: input.from.toISOString(),
        periodEnd: input.to.toISOString(),
        sampledIssues: sample.length,
        totalIssuesInPeriod: totalIssues,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return this.list(auth, { from: input.from, to: input.to });
  },

  /** Stored themes, most recent period first. */
  async list(auth: AuthContext, args: { from?: Date | null; to?: Date | null } = {}) {
    const { organizationId } = requireAiAccess(auth, 'AI_INSIGHT_READ');

    return prisma.issueTheme.findMany({
      where: {
        organizationId,
        ...(args.from ? { periodStart: { gte: args.from } } : {}),
        ...(args.to ? { periodEnd: { lte: args.to } } : {}),
      },
      include: {
        reviewedBy: { select: { id: true, fullName: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: [{ generatedAt: 'desc' }, { issueCount: 'desc' }],
      take: 50,
    });
  },

  /** The submissions behind one theme, for the "show me why" drill-down. */
  async members(auth: AuthContext, themeId: string) {
    const { organizationId } = requireAiAccess(auth, 'AI_INSIGHT_READ');

    const theme = await prisma.issueTheme.findFirst({
      where: { id: themeId, organizationId },
      select: { id: true },
    });
    if (!theme) throw AppError.notFound('Theme not found.');

    const memberships = await prisma.issueThemeMembership.findMany({
      where: { themeId },
      select: {
        confidence: true,
        issue: {
          select: {
            id: true,
            referenceNumber: true,
            title: true,
            status: true,
            submittedAt: true,
            category: { select: { id: true, key: true, label: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return memberships.map((membership) => ({
      ...membership.issue,
      confidence: membership.confidence,
    }));
  },

  /** Approves or rejects a generated theme set entry. */
  async review(auth: AuthContext, input: { themeId: string; approve: boolean }, meta: RequestMeta) {
    const { organizationId } = requireAiAccess(auth, 'AI_SUMMARY_REVIEW');

    const theme = await prisma.issueTheme.findFirst({
      where: { id: input.themeId, organizationId },
      select: { id: true },
    });
    if (!theme) throw AppError.notFound('Theme not found.');

    const updated = await prisma.issueTheme.update({
      where: { id: theme.id },
      data: {
        reviewStatus: input.approve ? 'APPROVED' : 'REJECTED',
        reviewedAt: new Date(),
        reviewedByUserId: auth.userId,
      },
      include: {
        reviewedBy: { select: { id: true, fullName: true } },
        _count: { select: { memberships: true } },
      },
    });

    await auditService.record({
      action: input.approve ? 'AI_OUTPUT_APPROVED' : 'AI_OUTPUT_REJECTED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'IssueTheme',
      entityId: theme.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return updated;
  },
};
