import { DEFAULT_LOCALE, type ContentCategory, type Locale } from '@rk/types';
import type { GraphQLContext } from '../../../graphql/context/index';
import { publicContentService, type PublicListArgs } from './publicContent.service';
import { publicTenantService, type PublicTenant } from './publicTenant.service';

/**
 * Public website resolvers.
 *
 * Unauthenticated and read-only. Each one resolves the tenant first, then hands
 * off to `publicContentService`, which is the only place the published-only
 * filter is applied.
 *
 * Shapes are adapted here rather than in the service so the GraphQL type stays
 * the contract: `PublicProjectMedia.image` is flat in the schema but nested in
 * Prisma's result, and that mapping belongs at the transport edge.
 */

export interface SiteArgs {
  input?: { organizationSlug?: string | null; locale?: Locale | null } | null;
}

/** Resolves the tenant and locale for a public request. */
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

/** Prisma nests the joined asset; the schema exposes it as `image`. */
function flattenMedia<T extends { media: unknown }>(row: T) {
  const { media, ...rest } = row;
  return { ...rest, image: media };
}

/** Evidence exposes only the document's id and name, never its storage key. */
function flattenEvidence(row: {
  id: string;
  title: string;
  description: string | null;
  sourceNote: string | null;
  document: { id: string; originalName: string; mimeType: string } | null;
}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    sourceNote: row.sourceNote,
    documentId: row.document?.id ?? null,
    documentName: row.document?.originalName ?? null,
  };
}

/** Prisma returns Decimal for money and coordinates; GraphQL Float needs a number. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapProject<T extends Record<string, unknown>>(project: T) {
  const media = Array.isArray(project.media) ? project.media.map(flattenMedia) : [];

  return {
    ...project,
    latitude: toNumber(project.latitude),
    longitude: toNumber(project.longitude),
    costAmount: toNumber(project.costAmount),
    media,
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

export interface ListArgs extends SiteArgs {
  first?: number | null;
  after?: string | null;
  category?: ContentCategory | null;
  search?: string | null;
  featuredOnly?: boolean | null;
  upcomingOnly?: boolean | null;
}

function listArgs(args: ListArgs): PublicListArgs {
  return {
    first: args.first ?? null,
    after: args.after ?? null,
    category: args.category ?? null,
    search: args.search ?? null,
    featuredOnly: args.featuredOnly ?? null,
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

export const publicSiteResolvers = {
  Query: {
    publicSite: async (_parent: unknown, args: SiteArgs, context: GraphQLContext) => {
      const { tenant } = await resolveSite(args, context);
      return { id: tenant.organizationId, slug: tenant.slug, name: tenant.name };
    },

    publicHomepage: async (_parent: unknown, args: SiteArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      const page = await publicContentService.homepage(tenant, locale);

      return {
        ...page,
        featuredProjects: page.featuredProjects.map(mapProject),
        featuredAchievements: page.featuredAchievements.map(mapAchievement),
      };
    },

    publicCandidateProfile: async (_parent: unknown, args: SiteArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      return publicContentService.candidateProfile(tenant, locale);
    },

    publicVision: async (_parent: unknown, args: SiteArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      return publicContentService.vision(tenant, locale);
    },

    publicPriorities: async (_parent: unknown, args: SiteArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      return publicContentService.priorities(tenant, locale);
    },

    publicProjects: async (_parent: unknown, args: ListArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      const page = await publicContentService.projects(tenant, locale, listArgs(args));
      return connection({ ...page, nodes: page.nodes.map(mapProject) });
    },

    publicProject: async (
      _parent: unknown,
      args: SiteArgs & { slug: string },
      context: GraphQLContext,
    ) => {
      const { tenant, locale } = await resolveSite(args, context);
      return mapProject(await publicContentService.projectBySlug(tenant, locale, args.slug));
    },

    publicAchievements: async (_parent: unknown, args: ListArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      const page = await publicContentService.achievements(tenant, locale, listArgs(args));
      return connection({ ...page, nodes: page.nodes.map(mapAchievement) });
    },

    publicAchievement: async (
      _parent: unknown,
      args: SiteArgs & { slug: string },
      context: GraphQLContext,
    ) => {
      const { tenant, locale } = await resolveSite(args, context);
      return mapAchievement(
        await publicContentService.achievementBySlug(tenant, locale, args.slug),
      );
    },

    publicNews: async (_parent: unknown, args: ListArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      return connection(await publicContentService.news(tenant, locale, listArgs(args)));
    },

    publicNewsArticle: async (
      _parent: unknown,
      args: SiteArgs & { slug: string },
      context: GraphQLContext,
    ) => {
      const { tenant, locale } = await resolveSite(args, context);
      return publicContentService.newsBySlug(tenant, locale, args.slug);
    },

    publicEvents: async (_parent: unknown, args: ListArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      const page = await publicContentService.events(tenant, locale, {
        ...listArgs(args),
        upcomingOnly: args.upcomingOnly ?? null,
      });
      return connection(page);
    },

    publicEvent: async (
      _parent: unknown,
      args: SiteArgs & { slug: string },
      context: GraphQLContext,
    ) => {
      const { tenant, locale } = await resolveSite(args, context);
      return publicContentService.eventBySlug(tenant, locale, args.slug);
    },

    publicPhotoAlbums: async (_parent: unknown, args: SiteArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      const albums = await publicContentService.photoAlbums(tenant, locale);
      return albums.map((album) => ({ ...album, items: album.items.map(flattenMedia) }));
    },

    publicVideos: async (_parent: unknown, args: SiteArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      return publicContentService.videos(tenant, locale);
    },

    publicContactInformation: async (_parent: unknown, args: SiteArgs, context: GraphQLContext) => {
      const { tenant, locale } = await resolveSite(args, context);
      const result = await publicContentService.contactInformation(tenant, locale);

      return {
        contact: result.contact
          ? {
              ...result.contact,
              latitude: toNumber(result.contact.latitude),
              longitude: toNumber(result.contact.longitude),
            }
          : null,
        socialLinks: result.socialLinks,
      };
    },

    publicSearch: async (
      _parent: unknown,
      args: SiteArgs & { term: string; limitPerType?: number | null },
      context: GraphQLContext,
    ) => {
      const { tenant, locale } = await resolveSite(args, context);
      const results = await publicContentService.search(
        tenant,
        locale,
        args.term,
        args.limitPerType ?? 5,
      );

      return {
        ...results,
        projects: results.projects.map(mapProject),
        achievements: results.achievements.map(mapAchievement),
      };
    },
  },
};
