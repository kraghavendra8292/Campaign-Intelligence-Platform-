import type { AuthContext, ContentCategory, ContentStatus, VideoPlatform } from '@rk/types';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { auditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../auth/auth.service';
import { mediaService } from '../media/media.service';
import {
  normalizeSlug,
  optionalText,
  requireCmsRead,
  requireContentAccess,
  requireText,
  resolveLocale,
  resolvePublishTransition,
  rethrowSlugConflict,
  transitionRequiresPublishPermission,
  type PublishAction,
} from '../shared/contentGuards';
import { auditActionFor } from './project.service';

/**
 * Ordered collections: priorities, photo albums and videos.
 *
 * Grouped because all three are short, manually ordered lists rather than
 * paginated archives - an editor arranges them by hand and the public site
 * renders them in that order.
 */

const PRIORITY_SELECT = {
  id: true,
  slug: true,
  locale: true,
  title: true,
  description: true,
  iconKey: true,
  category: true,
  displayOrder: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  image: { select: { id: true, altText: true, width: true, height: true } },
} as const;

const ALBUM_SELECT = {
  id: true,
  slug: true,
  locale: true,
  title: true,
  description: true,
  category: true,
  displayOrder: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  coverImage: { select: { id: true, altText: true, width: true, height: true } },
  items: {
    select: {
      id: true,
      caption: true,
      sortOrder: true,
      media: { select: { id: true, altText: true, width: true, height: true } },
    },
    orderBy: { sortOrder: 'asc' },
  },
} as const;

const VIDEO_SELECT = {
  id: true,
  slug: true,
  locale: true,
  title: true,
  description: true,
  videoUrl: true,
  platform: true,
  category: true,
  featured: true,
  displayOrder: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  thumbnail: { select: { id: true, altText: true, width: true, height: true } },
} as const;

export interface PriorityInput {
  readonly title: string;
  readonly slug?: string | null;
  readonly locale?: string | null;
  readonly description?: string | null;
  readonly iconKey?: string | null;
  readonly category?: ContentCategory | null;
  readonly imageId?: string | null;
  readonly displayOrder?: number | null;
}

export interface AlbumInput {
  readonly title: string;
  readonly slug?: string | null;
  readonly locale?: string | null;
  readonly description?: string | null;
  readonly category?: ContentCategory | null;
  readonly coverImageId?: string | null;
  readonly displayOrder?: number | null;
}

export interface VideoInput {
  readonly title: string;
  readonly slug?: string | null;
  readonly locale?: string | null;
  readonly description?: string | null;
  readonly videoUrl: string;
  readonly platform?: VideoPlatform | null;
  readonly category?: ContentCategory | null;
  readonly thumbnailId?: string | null;
  readonly featured?: boolean | null;
  readonly displayOrder?: number | null;
}

/**
 * Icon keys the frontend knows how to render.
 *
 * An allow-list rather than free text: the value selects a bundled icon
 * component, and accepting anything would either break the page or invite an
 * attempt to inject markup through the icon slot.
 */
const ALLOWED_ICON_KEYS = [
  'road',
  'water',
  'school',
  'health',
  'work',
  'agriculture',
  'services',
  'environment',
  'community',
] as const;

function normalizeIconKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  if (!(ALLOWED_ICON_KEYS as readonly string[]).includes(key)) {
    throw AppError.validation('Choose one of the available icons.', {
      details: { field: 'iconKey' },
    });
  }
  return key;
}

export const priorityCmsService = {
  async list(auth: AuthContext, args: { status?: ContentStatus | null; locale?: string | null }) {
    const { organizationId } = requireCmsRead(auth);

    return prisma.priority.findMany({
      where: {
        organizationId,
        ...(args.locale ? { locale: resolveLocale(args.locale) } : {}),
        ...(args.status ? { status: args.status } : {}),
      },
      select: PRIORITY_SELECT,
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
      take: 100,
    });
  },

  async create(auth: AuthContext, input: PriorityInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'PRIORITY', 'CREATE');
    const data = await priorityCmsService.buildData(organizationId, input);

    try {
      const priority = await prisma.priority.create({
        data: { ...data, organizationId, status: 'DRAFT' },
        select: PRIORITY_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_CREATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'Priority',
        entityId: priority.id,
        metadata: { slug: priority.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return priority;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  async update(auth: AuthContext, id: string, input: PriorityInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'PRIORITY', 'UPDATE');

    const existing = await prisma.priority.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound('Priority not found.');

    const data = await priorityCmsService.buildData(organizationId, input);

    try {
      const priority = await prisma.priority.update({
        where: { id: existing.id },
        data,
        select: PRIORITY_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_UPDATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'Priority',
        entityId: priority.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return priority;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  /**
   * Applies a new display order.
   *
   * Written in one transaction so a partially applied reorder cannot leave the
   * public page in an order nobody chose.
   */
  async reorder(auth: AuthContext, orderedIds: readonly string[], meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'PRIORITY', 'UPDATE');

    const owned = await prisma.priority.findMany({
      where: { organizationId, id: { in: [...orderedIds] } },
      select: { id: true },
    });

    // Every id must belong to this tenant, or the whole reorder is rejected -
    // a foreign id in the list is not a partial success.
    if (owned.length !== orderedIds.length) {
      throw AppError.validation('One or more items could not be found.', {
        details: { field: 'orderedIds' },
      });
    }

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.priority.update({ where: { id }, data: { displayOrder: index } }),
      ),
    );

    await auditService.record({
      action: 'CONTENT_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Priority',
      metadata: { reordered: orderedIds.length },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return priorityCmsService.list(auth, {});
  },

  async transition(auth: AuthContext, id: string, action: PublishAction, meta: RequestMetadata) {
    const { organizationId } = transitionRequiresPublishPermission(action)
      ? requireContentAccess(auth, 'PRIORITY', 'PUBLISH')
      : requireContentAccess(auth, 'PRIORITY', 'UPDATE');

    const existing = await prisma.priority.findFirst({
      where: { id, organizationId },
      select: { id: true, publishedAt: true },
    });
    if (!existing) throw AppError.notFound('Priority not found.');

    const next = resolvePublishTransition(action, existing.publishedAt);

    const priority = await prisma.priority.update({
      where: { id: existing.id },
      data: { status: next.status, publishedAt: next.publishedAt },
      select: PRIORITY_SELECT,
    });

    await auditService.record({
      action: auditActionFor(action),
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Priority',
      entityId: priority.id,
      metadata: { status: next.status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return priority;
  },

  async delete(auth: AuthContext, id: string, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'PRIORITY', 'DELETE');

    const existing = await prisma.priority.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
    if (!existing) throw AppError.notFound('Priority not found.');
    if (existing.status === 'PUBLISHED') {
      throw AppError.conflict('Unpublish this priority before deleting it.');
    }

    await prisma.priority.delete({ where: { id: existing.id } });

    await auditService.record({
      action: 'CONTENT_DELETED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Priority',
      entityId: existing.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return { success: true };
  },

  async buildData(organizationId: string, input: PriorityInput) {
    const title = requireText(input.title, 'title', 200);

    return {
      slug: normalizeSlug(input.slug, title),
      locale: resolveLocale(input.locale),
      title,
      description: optionalText(input.description, 'description', 1000),
      iconKey: normalizeIconKey(input.iconKey),
      category: input.category ?? 'OTHER',
      imageId: await mediaService.assertBelongsToTenant(organizationId, input.imageId, 'imageId'),
      displayOrder: input.displayOrder ?? 0,
    };
  },
};

export const galleryCmsService = {
  async listAlbums(
    auth: AuthContext,
    args: { status?: ContentStatus | null; locale?: string | null },
  ) {
    const { organizationId } = requireCmsRead(auth);

    return prisma.galleryAlbum.findMany({
      where: {
        organizationId,
        ...(args.locale ? { locale: resolveLocale(args.locale) } : {}),
        ...(args.status ? { status: args.status } : {}),
      },
      select: ALBUM_SELECT,
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
      take: 100,
    });
  },

  async createAlbum(auth: AuthContext, input: AlbumInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'GALLERY', 'CREATE');
    const data = await galleryCmsService.buildAlbumData(organizationId, input);

    try {
      const album = await prisma.galleryAlbum.create({
        data: { ...data, organizationId, status: 'DRAFT' },
        select: ALBUM_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_CREATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'GalleryAlbum',
        entityId: album.id,
        metadata: { slug: album.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return album;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  async updateAlbum(auth: AuthContext, id: string, input: AlbumInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'GALLERY', 'UPDATE');

    const existing = await prisma.galleryAlbum.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound('Album not found.');

    const data = await galleryCmsService.buildAlbumData(organizationId, input);

    try {
      const album = await prisma.galleryAlbum.update({
        where: { id: existing.id },
        data,
        select: ALBUM_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_UPDATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'GalleryAlbum',
        entityId: album.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return album;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  /** Replaces an album's photos. */
  async setAlbumItems(
    auth: AuthContext,
    albumId: string,
    items: Array<{ mediaId: string; caption?: string | null }>,
    meta: RequestMetadata,
  ) {
    const { organizationId } = requireContentAccess(auth, 'GALLERY', 'UPDATE');

    const album = await prisma.galleryAlbum.findFirst({
      where: { id: albumId, organizationId },
      select: { id: true },
    });
    if (!album) throw AppError.notFound('Album not found.');

    for (const item of items.slice(0, 200)) {
      await mediaService.assertBelongsToTenant(organizationId, item.mediaId, 'mediaId');
    }

    await prisma.$transaction(async (tx) => {
      await tx.galleryItem.deleteMany({ where: { albumId: album.id } });
      if (items.length > 0) {
        await tx.galleryItem.createMany({
          data: items.slice(0, 200).map((item, index) => ({
            albumId: album.id,
            mediaId: item.mediaId,
            caption: item.caption?.slice(0, 400) ?? null,
            sortOrder: index,
          })),
          skipDuplicates: true,
        });
      }
    });

    await auditService.record({
      action: 'CONTENT_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'GalleryAlbum',
      entityId: album.id,
      metadata: { photoCount: items.length },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    const updated = await prisma.galleryAlbum.findFirstOrThrow({
      where: { id: album.id },
      select: ALBUM_SELECT,
    });
    return updated;
  },

  async transitionAlbum(
    auth: AuthContext,
    id: string,
    action: PublishAction,
    meta: RequestMetadata,
  ) {
    const { organizationId } = transitionRequiresPublishPermission(action)
      ? requireContentAccess(auth, 'GALLERY', 'PUBLISH')
      : requireContentAccess(auth, 'GALLERY', 'UPDATE');

    const existing = await prisma.galleryAlbum.findFirst({
      where: { id, organizationId },
      select: { id: true, publishedAt: true },
    });
    if (!existing) throw AppError.notFound('Album not found.');

    const next = resolvePublishTransition(action, existing.publishedAt);

    const album = await prisma.galleryAlbum.update({
      where: { id: existing.id },
      data: { status: next.status, publishedAt: next.publishedAt },
      select: ALBUM_SELECT,
    });

    await auditService.record({
      action: auditActionFor(action),
      organizationId,
      actorUserId: auth.userId,
      entityType: 'GalleryAlbum',
      entityId: album.id,
      metadata: { status: next.status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return album;
  },

  async deleteAlbum(auth: AuthContext, id: string, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'GALLERY', 'DELETE');

    const existing = await prisma.galleryAlbum.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
    if (!existing) throw AppError.notFound('Album not found.');
    if (existing.status === 'PUBLISHED') {
      throw AppError.conflict('Unpublish this album before deleting it.');
    }

    await prisma.galleryAlbum.delete({ where: { id: existing.id } });

    await auditService.record({
      action: 'CONTENT_DELETED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'GalleryAlbum',
      entityId: existing.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return { success: true };
  },

  async buildAlbumData(organizationId: string, input: AlbumInput) {
    const title = requireText(input.title, 'title', 250);

    return {
      slug: normalizeSlug(input.slug, title),
      locale: resolveLocale(input.locale),
      title,
      description: optionalText(input.description, 'description', 1000),
      category: input.category ?? 'OTHER',
      coverImageId: await mediaService.assertBelongsToTenant(
        organizationId,
        input.coverImageId,
        'coverImageId',
      ),
      displayOrder: input.displayOrder ?? 0,
    };
  },

  // --- Videos --------------------------------------------------------------

  async listVideos(
    auth: AuthContext,
    args: { status?: ContentStatus | null; locale?: string | null },
  ) {
    const { organizationId } = requireCmsRead(auth);

    return prisma.videoEntry.findMany({
      where: {
        organizationId,
        ...(args.locale ? { locale: resolveLocale(args.locale) } : {}),
        ...(args.status ? { status: args.status } : {}),
      },
      select: VIDEO_SELECT,
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
      take: 100,
    });
  },

  async createVideo(auth: AuthContext, input: VideoInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'GALLERY', 'CREATE');
    const data = await galleryCmsService.buildVideoData(organizationId, input);

    try {
      const video = await prisma.videoEntry.create({
        data: { ...data, organizationId, status: 'DRAFT' },
        select: VIDEO_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_CREATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'VideoEntry',
        entityId: video.id,
        metadata: { slug: video.slug, platform: video.platform },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return video;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  async updateVideo(auth: AuthContext, id: string, input: VideoInput, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'GALLERY', 'UPDATE');

    const existing = await prisma.videoEntry.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound('Video not found.');

    const data = await galleryCmsService.buildVideoData(organizationId, input);

    try {
      const video = await prisma.videoEntry.update({
        where: { id: existing.id },
        data,
        select: VIDEO_SELECT,
      });

      await auditService.record({
        action: 'CONTENT_UPDATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'VideoEntry',
        entityId: video.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      return video;
    } catch (error) {
      rethrowSlugConflict(error, data.slug);
    }
  },

  async transitionVideo(
    auth: AuthContext,
    id: string,
    action: PublishAction,
    meta: RequestMetadata,
  ) {
    const { organizationId } = transitionRequiresPublishPermission(action)
      ? requireContentAccess(auth, 'GALLERY', 'PUBLISH')
      : requireContentAccess(auth, 'GALLERY', 'UPDATE');

    const existing = await prisma.videoEntry.findFirst({
      where: { id, organizationId },
      select: { id: true, publishedAt: true },
    });
    if (!existing) throw AppError.notFound('Video not found.');

    const next = resolvePublishTransition(action, existing.publishedAt);

    const video = await prisma.videoEntry.update({
      where: { id: existing.id },
      data: { status: next.status, publishedAt: next.publishedAt },
      select: VIDEO_SELECT,
    });

    await auditService.record({
      action: auditActionFor(action),
      organizationId,
      actorUserId: auth.userId,
      entityType: 'VideoEntry',
      entityId: video.id,
      metadata: { status: next.status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return video;
  },

  async deleteVideo(auth: AuthContext, id: string, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'GALLERY', 'DELETE');

    const existing = await prisma.videoEntry.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
    if (!existing) throw AppError.notFound('Video not found.');
    if (existing.status === 'PUBLISHED') {
      throw AppError.conflict('Unpublish this video before deleting it.');
    }

    await prisma.videoEntry.delete({ where: { id: existing.id } });

    await auditService.record({
      action: 'CONTENT_DELETED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'VideoEntry',
      entityId: existing.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return { success: true };
  },

  async buildVideoData(organizationId: string, input: VideoInput) {
    const title = requireText(input.title, 'title', 250);
    const platform: VideoPlatform = input.platform ?? 'YOUTUBE';

    return {
      slug: normalizeSlug(input.slug, title),
      locale: resolveLocale(input.locale),
      title,
      description: optionalText(input.description, 'description', 1000),
      // Host allow-listed, so only a known player can be embedded.
      videoUrl: mediaService.assertVideoUrl(input.videoUrl, platform),
      platform,
      category: input.category ?? 'OTHER',
      thumbnailId: await mediaService.assertBelongsToTenant(
        organizationId,
        input.thumbnailId,
        'thumbnailId',
      ),
      featured: input.featured ?? false,
      displayOrder: input.displayOrder ?? 0,
    };
  },
};
