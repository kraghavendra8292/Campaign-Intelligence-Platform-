import type {
  AuthContext,
  ContentCategory,
  ContentStatus,
  MediaKind,
  VerificationStatus,
} from '@rk/types';
import type { GraphQLContext } from '../../../graphql/context/index';
import { authorizationService } from '../../auth/authorization.service';
import type { PublishAction } from '../shared/contentGuards';
import { mediaService } from '../media/media.service';
import { projectCmsService, type ProjectInput } from './project.service';
import {
  achievementCmsService,
  type AchievementInput,
  type EvidenceInput,
} from './achievement.service';
import {
  eventCmsService,
  newsCmsService,
  type EventInput,
  type NewsInput,
} from './editorial.service';
import {
  galleryCmsService,
  priorityCmsService,
  type AlbumInput,
  type PriorityInput,
  type VideoInput,
} from './collections.service';
import {
  siteProfileService,
  type CandidateProfileInput,
  type ContactInput,
  type SocialLinkInput,
  type VisionInput,
} from './siteProfile.service';

/**
 * CMS resolvers.
 *
 * Uniformly thin: authenticate, delegate, map. Every permission and tenant
 * check lives in the service layer, so a resolver cannot accidentally be the
 * only thing standing between a client and another tenant's content.
 */

/** Narrows the context to an authenticated caller. */
function actor(context: GraphQLContext): AuthContext {
  return authorizationService.requireAuth(context.auth);
}

/** Prisma nests joined media; the CMS schema exposes it as `image`. */
function flattenMedia<T extends { media: unknown }>(row: T) {
  const { media, ...rest } = row;
  return { ...rest, image: media };
}

function flattenEvidence(row: {
  id: string;
  title: string;
  description: string | null;
  sourceNote: string | null;
  internalNote: string | null;
  isPublic: boolean;
  sortOrder: number;
  document: { id: string; originalName: string } | null;
}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    sourceNote: row.sourceNote,
    internalNote: row.internalNote,
    isPublic: row.isPublic,
    sortOrder: row.sortOrder,
    documentId: row.document?.id ?? null,
    documentName: row.document?.originalName ?? null,
  };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapProject<T extends Record<string, unknown>>(project: T) {
  return {
    ...project,
    latitude: toNumber(project.latitude),
    longitude: toNumber(project.longitude),
    costAmount: toNumber(project.costAmount),
    media: Array.isArray(project.media) ? project.media.map(flattenMedia) : [],
    updates: project.updates ?? [],
  };
}

function mapAchievement<T extends Record<string, unknown>>(achievement: T) {
  return {
    ...achievement,
    media: Array.isArray(achievement.media) ? achievement.media.map(flattenMedia) : [],
    evidence: Array.isArray(achievement.evidence)
      ? achievement.evidence.map((item) =>
          flattenEvidence(item as Parameters<typeof flattenEvidence>[0]),
        )
      : [],
  };
}

function mapAlbum<T extends Record<string, unknown>>(album: T) {
  return {
    ...album,
    items: Array.isArray(album.items) ? album.items.map(flattenMedia) : [],
  };
}

function connection<T>(page: {
  nodes: T[];
  hasNextPage: boolean;
  endCursor: string | null;
  totalCount: number;
}) {
  return {
    nodes: page.nodes,
    pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.endCursor },
    totalCount: page.totalCount,
  };
}

export interface ListArgs {
  first?: number | null;
  after?: string | null;
  status?: ContentStatus | null;
  category?: ContentCategory | null;
  search?: string | null;
  locale?: string | null;
}

/** Dates arrive as ISO strings through the DateTime scalar. */
function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

export const cmsResolvers = {
  Query: {
    cmsCandidateProfile: (_p: unknown, args: { locale?: string | null }, context: GraphQLContext) =>
      siteProfileService.getProfile(actor(context), args.locale),

    cmsVision: (_p: unknown, args: { locale?: string | null }, context: GraphQLContext) =>
      siteProfileService.getVision(actor(context), args.locale),

    cmsPriorities: (_p: unknown, args: ListArgs, context: GraphQLContext) =>
      priorityCmsService.list(actor(context), {
        status: args.status ?? null,
        locale: args.locale ?? null,
      }),

    cmsProjects: async (_p: unknown, args: ListArgs, context: GraphQLContext) => {
      const page = await projectCmsService.list(actor(context), args);
      return connection({ ...page, nodes: page.nodes.map(mapProject) });
    },

    cmsProject: async (_p: unknown, args: { id: string }, context: GraphQLContext) =>
      mapProject(await projectCmsService.getById(actor(context), args.id)),

    cmsAchievements: async (_p: unknown, args: ListArgs, context: GraphQLContext) => {
      const page = await achievementCmsService.list(actor(context), args);
      return connection({ ...page, nodes: page.nodes.map(mapAchievement) });
    },

    cmsAchievement: async (_p: unknown, args: { id: string }, context: GraphQLContext) =>
      mapAchievement(await achievementCmsService.getById(actor(context), args.id)),

    cmsNews: async (_p: unknown, args: ListArgs, context: GraphQLContext) =>
      connection(await newsCmsService.list(actor(context), args)),

    cmsNewsArticle: (_p: unknown, args: { id: string }, context: GraphQLContext) =>
      newsCmsService.getById(actor(context), args.id),

    cmsEvents: async (_p: unknown, args: ListArgs, context: GraphQLContext) =>
      connection(await eventCmsService.list(actor(context), args)),

    cmsEvent: (_p: unknown, args: { id: string }, context: GraphQLContext) =>
      eventCmsService.getById(actor(context), args.id),

    cmsAlbums: async (_p: unknown, args: ListArgs, context: GraphQLContext) => {
      const albums = await galleryCmsService.listAlbums(actor(context), {
        status: args.status ?? null,
        locale: args.locale ?? null,
      });
      return albums.map(mapAlbum);
    },

    cmsVideos: (_p: unknown, args: ListArgs, context: GraphQLContext) =>
      galleryCmsService.listVideos(actor(context), {
        status: args.status ?? null,
        locale: args.locale ?? null,
      }),

    cmsContactInformation: (
      _p: unknown,
      args: { locale?: string | null },
      context: GraphQLContext,
    ) => siteProfileService.getContact(actor(context), args.locale),

    cmsMedia: async (
      _p: unknown,
      args: { first?: number | null; after?: string | null; kind?: MediaKind | null },
      context: GraphQLContext,
    ) => connection(await mediaService.list(actor(context), args)),
  },

  Mutation: {
    // --- Singletons --------------------------------------------------------
    updateCandidateProfile: (
      _p: unknown,
      args: { input: CandidateProfileInput },
      context: GraphQLContext,
    ) => siteProfileService.updateProfile(actor(context), args.input, context.requestMeta),

    updateVision: (_p: unknown, args: { input: VisionInput }, context: GraphQLContext) =>
      siteProfileService.updateVision(actor(context), args.input, context.requestMeta),

    updateContactInformation: (
      _p: unknown,
      args: { input: ContactInput },
      context: GraphQLContext,
    ) => siteProfileService.updateContact(actor(context), args.input, context.requestMeta),

    setSocialLinks: (_p: unknown, args: { links: SocialLinkInput[] }, context: GraphQLContext) =>
      siteProfileService.setSocialLinks(actor(context), args.links, context.requestMeta),

    transitionSingleton: async (
      _p: unknown,
      args: {
        entity: 'CANDIDATE_PROFILE' | 'VISION' | 'CONTACT';
        action: PublishAction;
        locale?: string | null;
      },
      context: GraphQLContext,
    ) => {
      await siteProfileService.transitionSingleton(
        actor(context),
        args.entity,
        args.action,
        args.locale,
        context.requestMeta,
      );
      return true;
    },

    // --- Priorities --------------------------------------------------------
    createPriority: (_p: unknown, args: { input: PriorityInput }, context: GraphQLContext) =>
      priorityCmsService.create(actor(context), args.input, context.requestMeta),

    updatePriority: (
      _p: unknown,
      args: { id: string; input: PriorityInput },
      context: GraphQLContext,
    ) => priorityCmsService.update(actor(context), args.id, args.input, context.requestMeta),

    deletePriority: async (_p: unknown, args: { id: string }, context: GraphQLContext) => {
      await priorityCmsService.delete(actor(context), args.id, context.requestMeta);
      return true;
    },

    reorderPriorities: (_p: unknown, args: { orderedIds: string[] }, context: GraphQLContext) =>
      priorityCmsService.reorder(actor(context), args.orderedIds, context.requestMeta),

    transitionPriority: (
      _p: unknown,
      args: { id: string; action: PublishAction },
      context: GraphQLContext,
    ) => priorityCmsService.transition(actor(context), args.id, args.action, context.requestMeta),

    // --- Projects ----------------------------------------------------------
    createProject: async (
      _p: unknown,
      args: { input: ProjectInput & { startDate?: unknown; completionDate?: unknown } },
      context: GraphQLContext,
    ) =>
      mapProject(
        await projectCmsService.create(
          actor(context),
          {
            ...args.input,
            startDate: isoOrNull(args.input.startDate),
            completionDate: isoOrNull(args.input.completionDate),
          },
          context.requestMeta,
        ),
      ),

    updateProject: async (
      _p: unknown,
      args: {
        id: string;
        input: ProjectInput & { startDate?: unknown; completionDate?: unknown };
      },
      context: GraphQLContext,
    ) =>
      mapProject(
        await projectCmsService.update(
          actor(context),
          args.id,
          {
            ...args.input,
            startDate: isoOrNull(args.input.startDate),
            completionDate: isoOrNull(args.input.completionDate),
          },
          context.requestMeta,
        ),
      ),

    deleteProject: async (_p: unknown, args: { id: string }, context: GraphQLContext) => {
      await projectCmsService.delete(actor(context), args.id, context.requestMeta);
      return true;
    },

    setProjectMedia: async (
      _p: unknown,
      args: {
        id: string;
        media: Array<{ mediaId: string; role: 'GALLERY' | 'BEFORE' | 'AFTER'; caption?: string }>;
      },
      context: GraphQLContext,
    ) =>
      mapProject(
        await projectCmsService.setMedia(actor(context), args.id, args.media, context.requestMeta),
      ),

    transitionProject: async (
      _p: unknown,
      args: { id: string; action: PublishAction },
      context: GraphQLContext,
    ) =>
      mapProject(
        await projectCmsService.transition(
          actor(context),
          args.id,
          args.action,
          context.requestMeta,
        ),
      ),

    // --- Achievements ------------------------------------------------------
    createAchievement: async (
      _p: unknown,
      args: { input: AchievementInput & { achievedOn?: unknown } },
      context: GraphQLContext,
    ) =>
      mapAchievement(
        await achievementCmsService.create(
          actor(context),
          { ...args.input, achievedOn: isoOrNull(args.input.achievedOn) },
          context.requestMeta,
        ),
      ),

    updateAchievement: async (
      _p: unknown,
      args: { id: string; input: AchievementInput & { achievedOn?: unknown } },
      context: GraphQLContext,
    ) =>
      mapAchievement(
        await achievementCmsService.update(
          actor(context),
          args.id,
          { ...args.input, achievedOn: isoOrNull(args.input.achievedOn) },
          context.requestMeta,
        ),
      ),

    deleteAchievement: async (_p: unknown, args: { id: string }, context: GraphQLContext) => {
      await achievementCmsService.delete(actor(context), args.id, context.requestMeta);
      return true;
    },

    setAchievementMedia: async (
      _p: unknown,
      args: { id: string; media: Array<{ mediaId: string; caption?: string }> },
      context: GraphQLContext,
    ) =>
      mapAchievement(
        await achievementCmsService.setMedia(
          actor(context),
          args.id,
          args.media,
          context.requestMeta,
        ),
      ),

    setAchievementEvidence: async (
      _p: unknown,
      args: { id: string; evidence: EvidenceInput[] },
      context: GraphQLContext,
    ) =>
      mapAchievement(
        await achievementCmsService.setEvidence(
          actor(context),
          args.id,
          args.evidence,
          context.requestMeta,
        ),
      ),

    setAchievementVerification: async (
      _p: unknown,
      args: { id: string; verification: VerificationStatus },
      context: GraphQLContext,
    ) =>
      mapAchievement(
        await achievementCmsService.setVerification(
          actor(context),
          args.id,
          args.verification,
          context.requestMeta,
        ),
      ),

    transitionAchievement: async (
      _p: unknown,
      args: { id: string; action: PublishAction },
      context: GraphQLContext,
    ) =>
      mapAchievement(
        await achievementCmsService.transition(
          actor(context),
          args.id,
          args.action,
          context.requestMeta,
        ),
      ),

    // --- News --------------------------------------------------------------
    createNews: (_p: unknown, args: { input: NewsInput }, context: GraphQLContext) =>
      newsCmsService.create(actor(context), args.input, context.requestMeta),

    updateNews: (_p: unknown, args: { id: string; input: NewsInput }, context: GraphQLContext) =>
      newsCmsService.update(actor(context), args.id, args.input, context.requestMeta),

    deleteNews: async (_p: unknown, args: { id: string }, context: GraphQLContext) => {
      await newsCmsService.delete(actor(context), args.id, context.requestMeta);
      return true;
    },

    transitionNews: (
      _p: unknown,
      args: { id: string; action: PublishAction },
      context: GraphQLContext,
    ) => newsCmsService.transition(actor(context), args.id, args.action, context.requestMeta),

    // --- Events ------------------------------------------------------------
    createEvent: (
      _p: unknown,
      args: { input: EventInput & { startsAt: unknown; endsAt?: unknown } },
      context: GraphQLContext,
    ) =>
      eventCmsService.create(
        actor(context),
        {
          ...args.input,
          startsAt: isoOrNull(args.input.startsAt) ?? '',
          endsAt: isoOrNull(args.input.endsAt),
        },
        context.requestMeta,
      ),

    updateEvent: (
      _p: unknown,
      args: { id: string; input: EventInput & { startsAt: unknown; endsAt?: unknown } },
      context: GraphQLContext,
    ) =>
      eventCmsService.update(
        actor(context),
        args.id,
        {
          ...args.input,
          startsAt: isoOrNull(args.input.startsAt) ?? '',
          endsAt: isoOrNull(args.input.endsAt),
        },
        context.requestMeta,
      ),

    deleteEvent: async (_p: unknown, args: { id: string }, context: GraphQLContext) => {
      await eventCmsService.delete(actor(context), args.id, context.requestMeta);
      return true;
    },

    cancelEvent: (_p: unknown, args: { id: string }, context: GraphQLContext) =>
      eventCmsService.cancel(actor(context), args.id, context.requestMeta),

    transitionEvent: (
      _p: unknown,
      args: { id: string; action: PublishAction },
      context: GraphQLContext,
    ) => eventCmsService.transition(actor(context), args.id, args.action, context.requestMeta),

    // --- Gallery -----------------------------------------------------------
    createAlbum: async (_p: unknown, args: { input: AlbumInput }, context: GraphQLContext) =>
      mapAlbum(
        await galleryCmsService.createAlbum(actor(context), args.input, context.requestMeta),
      ),

    updateAlbum: async (
      _p: unknown,
      args: { id: string; input: AlbumInput },
      context: GraphQLContext,
    ) =>
      mapAlbum(
        await galleryCmsService.updateAlbum(
          actor(context),
          args.id,
          args.input,
          context.requestMeta,
        ),
      ),

    deleteAlbum: async (_p: unknown, args: { id: string }, context: GraphQLContext) => {
      await galleryCmsService.deleteAlbum(actor(context), args.id, context.requestMeta);
      return true;
    },

    setAlbumItems: async (
      _p: unknown,
      args: { id: string; items: Array<{ mediaId: string; caption?: string }> },
      context: GraphQLContext,
    ) =>
      mapAlbum(
        await galleryCmsService.setAlbumItems(
          actor(context),
          args.id,
          args.items,
          context.requestMeta,
        ),
      ),

    transitionAlbum: async (
      _p: unknown,
      args: { id: string; action: PublishAction },
      context: GraphQLContext,
    ) =>
      mapAlbum(
        await galleryCmsService.transitionAlbum(
          actor(context),
          args.id,
          args.action,
          context.requestMeta,
        ),
      ),

    createVideo: (_p: unknown, args: { input: VideoInput }, context: GraphQLContext) =>
      galleryCmsService.createVideo(actor(context), args.input, context.requestMeta),

    updateVideo: (_p: unknown, args: { id: string; input: VideoInput }, context: GraphQLContext) =>
      galleryCmsService.updateVideo(actor(context), args.id, args.input, context.requestMeta),

    deleteVideo: async (_p: unknown, args: { id: string }, context: GraphQLContext) => {
      await galleryCmsService.deleteVideo(actor(context), args.id, context.requestMeta);
      return true;
    },

    transitionVideo: (
      _p: unknown,
      args: { id: string; action: PublishAction },
      context: GraphQLContext,
    ) =>
      galleryCmsService.transitionVideo(actor(context), args.id, args.action, context.requestMeta),

    // --- Media -------------------------------------------------------------
    updateMediaMetadata: (
      _p: unknown,
      args: { id: string; altText?: string | null; caption?: string | null },
      context: GraphQLContext,
    ) =>
      mediaService.updateMetadata(
        actor(context),
        { mediaId: args.id, altText: args.altText, caption: args.caption },
        context.requestMeta,
      ),

    deleteMedia: async (_p: unknown, args: { id: string }, context: GraphQLContext) => {
      await mediaService.delete(actor(context), args.id, context.requestMeta);
      return true;
    },
  },
};
