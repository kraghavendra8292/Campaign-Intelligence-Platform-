import {
  DEFAULT_LOCALE,
  isImageEvidenceType,
  type EvidenceType,
  type Locale,
  type ReviewDecision,
  type WorkSubjectType,
} from '@rk/types';
import type { GraphQLContext } from '../../graphql/context/index';
import { publicTenantService, type PublicTenant } from '../content/public/publicTenant.service';
import { evidenceService, type EvidenceInputV2 } from './evidence.service';
import { verificationService, type VerificationQueueFilter } from './verification.service';
import { publicTransparencyService, type PublicWorkFilter } from './publicTransparency.service';

/**
 * Phase 9 resolvers.
 *
 * Public and admin fields sit in one file but are grouped and commented apart,
 * and they never share a shaping helper: `publicEvidence` and `adminEvidence`
 * below are deliberately separate functions rather than one with a flag,
 * because a flag is one inverted boolean away from returning an internal note
 * to the public site.
 */

export interface SiteArgs {
  input?: { organizationSlug?: string | null; locale?: Locale | null } | null;
}

async function resolveSite(
  args: SiteArgs,
  context: GraphQLContext,
): Promise<{ tenant: PublicTenant; locale: Locale }> {
  const headerSlug = context.req.headers['x-organization-slug'];

  const tenant = await publicTenantService.resolve({
    organizationSlug: args.input?.organizationSlug ?? null,
    headerSlug: Array.isArray(headerSlug) ? headerSlug[0] : headerSlug,
    host: context.req.headers.host,
  });

  return { tenant, locale: args.input?.locale ?? DEFAULT_LOCALE };
}

function meta(context: GraphQLContext) {
  return {
    ipAddress: context.req.ip ?? null,
    userAgent: context.req.headers['user-agent'] ?? null,
    correlationId: context.req.correlationId,
  };
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

type EvidenceRow = {
  id: string;
  title: string;
  description: string | null;
  evidenceType: string;
  sourceNote: string | null;
  referenceNumber: string | null;
  issuingAuthority: string | null;
  issuedOn: Date | null;
  capturedOn: Date | null;
  capturedLocation: string | null;
  sortOrder: number;
  document: { id: string; originalName: string; mimeType: string; kind: string } | null;
};

/**
 * The public shape of one piece of evidence.
 *
 * Builds the result field by field rather than spreading the row. A spread
 * would carry whatever columns the selection happens to contain, so adding a
 * column to the service's select later would publish it silently; this way a
 * new field reaches the public site only when somebody writes it here.
 */
function publicEvidence(row: EvidenceRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    evidenceType: row.evidenceType,
    sourceNote: row.sourceNote,
    referenceNumber: row.referenceNumber,
    issuingAuthority: row.issuingAuthority,
    issuedOn: row.issuedOn,
    capturedOn: row.capturedOn,
    capturedLocation: row.capturedLocation,
    documentId: row.document?.id ?? null,
    documentName: row.document?.originalName ?? null,
    documentMimeType: row.document?.mimeType ?? null,
    // Drives inline rendering. Taken from the stored `kind`, which was decided
    // by magic-byte inspection at upload, rather than from the evidence type a
    // staff member chose - a document labelled BEFORE_PHOTO is still a PDF if
    // that is what was uploaded, and rendering it in an <img> would break.
    isImage:
      row.document?.kind === 'IMAGE' && isImageEvidenceType(row.evidenceType as EvidenceType),
  };
}

/** The staff shape. Carries the internal note; callers have checked EVIDENCE_READ. */
function adminEvidence(
  row: {
    id: string;
    achievementId: string | null;
    projectId: string | null;
    internalNote: string | null;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
    uploadedBy: { id: string; fullName: string } | null;
  } & EvidenceRow,
) {
  return {
    ...publicEvidence(row),
    subjectType: row.achievementId ? 'ACHIEVEMENT' : 'PROJECT',
    subjectId: row.achievementId ?? row.projectId,
    internalNote: row.internalNote,
    isPublic: row.isPublic,
    sortOrder: row.sortOrder,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function flattenProjectMedia<T extends { media: unknown }>(row: T) {
  const { media, ...rest } = row;
  return { ...rest, image: media };
}

/** Decimal columns are serialised as strings so no precision is lost in JSON. */
function decimalToString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export const workResolvers = {
  Query: {
    // -----------------------------------------------------------------------
    // Public. Unauthenticated, published content only.
    // -----------------------------------------------------------------------
    publicWorks: async (
      _p: unknown,
      args: SiteArgs & { filter?: PublicWorkFilter | null },
      context: GraphQLContext,
    ) => {
      const { tenant, locale } = await resolveSite(args, context);
      return publicTransparencyService.works(tenant, locale, args.filter ?? {});
    },

    publicWork: async (_p: unknown, args: SiteArgs & { slug: string }, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      const work = await publicTransparencyService.workBySlug(tenant, locale, args.slug);
      return {
        ...work,
        costAmount: decimalToString(work.costAmount),
        media: work.media.map(flattenProjectMedia),
        evidence: work.evidence.map(publicEvidence),
      };
    },

    publicAchievementEvidence: async (
      _p: unknown,
      args: SiteArgs & { slug: string },
      context: GraphQLContext,
    ) => {
      const { tenant, locale } = await resolveSite(args, context);
      const rows = await publicTransparencyService.achievementEvidence(tenant, locale, args.slug);
      return rows.map(publicEvidence);
    },

    transparencySummary: async (_p: unknown, args: SiteArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      return publicTransparencyService.summary(tenant, locale);
    },

    transparencyRecentlyVerified: async (
      _p: unknown,
      args: SiteArgs & { limit?: number | null },
      context: GraphQLContext,
    ) => {
      const { tenant, locale } = await resolveSite(args, context);
      return publicTransparencyService.recentlyVerified(tenant, locale, args.limit ?? 6);
    },

    transparencyAreas: async (_p: unknown, args: SiteArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      return publicTransparencyService.areas(tenant, locale);
    },

    // -----------------------------------------------------------------------
    // Admin. Every one of these asserts a permission inside its service.
    // -----------------------------------------------------------------------
    workEvidence: async (
      _p: unknown,
      args: { subjectType: WorkSubjectType; subjectId: string },
      context: GraphQLContext,
    ) => {
      const rows = await evidenceService.listForSubject(
        context.auth,
        args.subjectType,
        args.subjectId,
      );
      return rows.map(adminEvidence);
    },

    verificationHistory: (
      _p: unknown,
      args: { subjectType: WorkSubjectType; subjectId: string },
      context: GraphQLContext,
    ) => verificationService.history(context.auth, args.subjectType, args.subjectId),

    verificationQueue: (
      _p: unknown,
      args: { filter?: VerificationQueueFilter | null },
      context: GraphQLContext,
    ) => verificationService.queue(context.auth, args.filter ?? {}),
  },

  Mutation: {
    addWorkEvidence: async (
      _p: unknown,
      args: { subjectType: WorkSubjectType; subjectId: string; input: EvidenceInputV2 },
      context: GraphQLContext,
    ) =>
      adminEvidence(
        await evidenceService.add(
          context.auth,
          args.subjectType,
          args.subjectId,
          args.input,
          meta(context),
        ),
      ),

    updateWorkEvidence: async (
      _p: unknown,
      args: { evidenceId: string; input: EvidenceInputV2 },
      context: GraphQLContext,
    ) =>
      adminEvidence(
        await evidenceService.update(context.auth, args.evidenceId, args.input, meta(context)),
      ),

    setWorkEvidenceVisibility: async (
      _p: unknown,
      args: { evidenceId: string; isPublic: boolean },
      context: GraphQLContext,
    ) =>
      adminEvidence(
        await evidenceService.setVisibility(
          context.auth,
          args.evidenceId,
          args.isPublic,
          meta(context),
        ),
      ),

    removeWorkEvidence: (_p: unknown, args: { evidenceId: string }, context: GraphQLContext) =>
      evidenceService.remove(context.auth, args.evidenceId, meta(context)),

    submitWorkForVerification: async (
      _p: unknown,
      args: { subjectType: WorkSubjectType; subjectId: string },
      context: GraphQLContext,
    ) =>
      verificationService.submitForReview(
        context.auth,
        args.subjectType,
        args.subjectId,
        meta(context),
      ),

    assignWorkReviewer: (
      _p: unknown,
      args: { subjectType: WorkSubjectType; subjectId: string; reviewerUserId: string },
      context: GraphQLContext,
    ) =>
      verificationService.assignReviewer(
        context.auth,
        args.subjectType,
        args.subjectId,
        args.reviewerUserId,
        meta(context),
      ),

    decideWorkVerification: (
      _p: unknown,
      args: {
        subjectType: WorkSubjectType;
        subjectId: string;
        decision: ReviewDecision;
        reason?: string | null;
      },
      context: GraphQLContext,
    ) =>
      verificationService.decide(
        context.auth,
        args.subjectType,
        args.subjectId,
        args.decision,
        args.reason,
        meta(context),
      ),

    withdrawWorkVerification: (
      _p: unknown,
      args: { subjectType: WorkSubjectType; subjectId: string; reason: string },
      context: GraphQLContext,
    ) =>
      verificationService.withdraw(
        context.auth,
        args.subjectType,
        args.subjectId,
        args.reason,
        meta(context),
      ),
  },
};
