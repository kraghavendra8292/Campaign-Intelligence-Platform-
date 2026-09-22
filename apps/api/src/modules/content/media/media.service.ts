import type { AuthContext, MediaKind, VideoPlatform } from '@rk/types';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { auditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../auth/auth.service';
import {
  clampContentPageSize,
  optionalText,
  requireContentAccess,
  requireText,
} from '../shared/contentGuards';
import { assertSafeUrl } from '../shared/sanitize';
import { validateUpload } from './fileValidation';
import { getMediaStorage } from './storage';

/**
 * Media library.
 *
 * Two kinds of record live here: uploaded bytes (images, PDFs) and references
 * to externally hosted video. Both are tenant-owned, and every lookup filters
 * by `organizationId` so one campaign can never attach another's photograph to
 * its own project.
 */

const MEDIA_SELECT = {
  id: true,
  kind: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  altText: true,
  caption: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type MediaRecord = Awaited<ReturnType<typeof mediaService.getById>>;

/** Hosts we are willing to embed a player from. */
const VIDEO_HOSTS: Record<VideoPlatform, readonly string[]> = {
  YOUTUBE: ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'],
  VIMEO: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
  OTHER: [],
};

export const mediaService = {
  /**
   * Stores an uploaded file.
   *
   * Validation runs before anything is written, so an invalid upload never
   * reaches storage and cannot leave an orphaned object behind.
   */
  async upload(
    auth: AuthContext,
    input: { buffer: Buffer; originalName: string; declaredMimeType: string; altText?: string },
    meta: RequestMetadata,
  ) {
    const { organizationId } = requireContentAccess(auth, 'MEDIA', 'CREATE');

    const validated = validateUpload({
      buffer: input.buffer,
      declaredMimeType: input.declaredMimeType,
      originalName: input.originalName,
    });

    const stored = await getMediaStorage().put({
      organizationId,
      filename: input.originalName,
      content: input.buffer,
      contentType: validated.mimeType,
    });

    const asset = await prisma.mediaAsset.create({
      data: {
        organizationId,
        kind: validated.kind,
        storageKey: stored.storageKey,
        // Truncated for the column, and only ever rendered as text.
        originalName: input.originalName.slice(0, 255),
        mimeType: validated.mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        width: validated.width ?? null,
        height: validated.height ?? null,
        altText: optionalText(input.altText, 'altText', 300),
        uploadedByUserId: auth.userId,
      },
      select: MEDIA_SELECT,
    });

    await auditService.record({
      action: 'CONTENT_CREATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'MediaAsset',
      entityId: asset.id,
      metadata: { kind: asset.kind, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return asset;
  },

  /** Registers an externally hosted video. No bytes are stored. */
  async createVideoReference(
    auth: AuthContext,
    input: { url: string; platform: VideoPlatform; title: string },
    meta: RequestMetadata,
  ) {
    const { organizationId } = requireContentAccess(auth, 'MEDIA', 'CREATE');
    const url = mediaService.assertVideoUrl(input.url, input.platform);

    const asset = await prisma.mediaAsset.create({
      data: {
        organizationId,
        kind: 'VIDEO_LINK',
        storageKey: url,
        originalName: requireText(input.title, 'title', 255),
        mimeType: 'text/uri-list',
        sizeBytes: 0,
        uploadedByUserId: auth.userId,
      },
      select: MEDIA_SELECT,
    });

    await auditService.record({
      action: 'CONTENT_CREATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'MediaAsset',
      entityId: asset.id,
      metadata: { kind: 'VIDEO_LINK', platform: input.platform },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return asset;
  },

  /**
   * Validates a video URL against a host allow-list.
   *
   * An arbitrary URL in an iframe is an embedding of somebody else's page into
   * this origin's UI; restricting the host is what keeps that to known players.
   */
  assertVideoUrl(rawUrl: string, platform: VideoPlatform): string {
    const url = assertSafeUrl(rawUrl, 'videoUrl');
    const host = new URL(url).hostname.toLowerCase();

    if (platform === 'OTHER') {
      // Still https-only via assertSafeUrl, but no host restriction - the UI
      // links out rather than embedding for this case.
      return url;
    }

    const allowed = VIDEO_HOSTS[platform];
    if (!allowed.includes(host)) {
      throw AppError.validation(`That link is not a recognised ${platform.toLowerCase()} URL.`, {
        details: { field: 'videoUrl' },
      });
    }

    return url;
  },

  async list(
    auth: AuthContext,
    args: { first?: number | null; after?: string | null; kind?: MediaKind | null },
  ) {
    const { organizationId } = requireContentAccess(auth, 'MEDIA', 'UPDATE');
    const first = clampContentPageSize(args.first, 24);

    const where = {
      organizationId,
      ...(args.kind ? { kind: args.kind } : {}),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.mediaAsset.findMany({
        where,
        select: MEDIA_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: first + 1,
        ...(args.after ? { cursor: { id: args.after }, skip: 1 } : {}),
      }),
      prisma.mediaAsset.count({ where }),
    ]);

    const hasNextPage = rows.length > first;
    const nodes = hasNextPage ? rows.slice(0, first) : rows;

    return {
      nodes,
      totalCount,
      hasNextPage,
      endCursor: hasNextPage ? (nodes.at(-1)?.id ?? null) : null,
    };
  },

  async getById(auth: AuthContext, mediaId: string) {
    const { organizationId } = requireContentAccess(auth, 'MEDIA', 'UPDATE');

    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, organizationId },
      select: MEDIA_SELECT,
    });

    if (!asset) throw AppError.notFound('Media not found.');
    return asset;
  },

  /** Updates descriptive metadata. The bytes themselves are immutable. */
  async updateMetadata(
    auth: AuthContext,
    input: { mediaId: string; altText?: string | null; caption?: string | null },
    meta: RequestMetadata,
  ) {
    const { organizationId } = requireContentAccess(auth, 'MEDIA', 'UPDATE');

    const existing = await prisma.mediaAsset.findFirst({
      where: { id: input.mediaId, organizationId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound('Media not found.');

    const asset = await prisma.mediaAsset.update({
      where: { id: existing.id },
      data: {
        altText: optionalText(input.altText, 'altText', 300),
        caption: optionalText(input.caption, 'caption', 500),
      },
      select: MEDIA_SELECT,
    });

    await auditService.record({
      action: 'CONTENT_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'MediaAsset',
      entityId: asset.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return asset;
  },

  /**
   * Deletes a media asset and its stored bytes.
   *
   * Refuses while the asset is still referenced. Deleting it anyway would blank
   * a published page's image, and SetNull would hide that it ever happened -
   * better to tell the editor what is using it.
   */
  async delete(auth: AuthContext, mediaId: string, meta: RequestMetadata) {
    const { organizationId } = requireContentAccess(auth, 'MEDIA', 'DELETE');

    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, organizationId },
      select: {
        id: true,
        storageKey: true,
        kind: true,
        _count: {
          select: {
            projectMedia: true,
            achievementMedia: true,
            albumItems: true,
            projectCovers: true,
            achievementCovers: true,
            newsCovers: true,
            eventCovers: true,
            albumCovers: true,
            priorityImages: true,
            videoThumbnails: true,
            evidenceDocuments: true,
            candidateProfileImages: true,
            candidateCoverImages: true,
          },
        },
      },
    });

    if (!asset) throw AppError.notFound('Media not found.');

    const references = Object.values(asset._count).reduce((sum, count) => sum + count, 0);
    if (references > 0) {
      throw AppError.conflict(
        `This file is used by ${references} item(s). Remove those references before deleting it.`,
      );
    }

    await prisma.mediaAsset.delete({ where: { id: asset.id } });

    // Row first, bytes second: a deleted row with an orphaned object is
    // recoverable housekeeping, whereas deleted bytes behind a live row is a
    // broken page.
    if (asset.kind !== 'VIDEO_LINK') {
      await getMediaStorage().remove(asset.storageKey);
    }

    await auditService.record({
      action: 'CONTENT_DELETED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'MediaAsset',
      entityId: asset.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return { success: true };
  },

  /**
   * Resolves an asset for serving, and says whether it may be served anonymously.
   *
   * Backs the `<img src>` on a public page, so the common case takes no auth.
   *
   * PHASE 9 ADDED `restricted`, AND IT CLOSES A REAL HOLE. Before it, this
   * route served every stored object to anybody holding its id, with no regard
   * for what the object was attached to. Phase 3 hid unpublished evidence from
   * the public GraphQL API but the underlying document stayed downloadable, so
   * the privacy of a completion certificate rested entirely on nobody learning
   * a UUID - and staff ids appear in CMS payloads, screenshots and support
   * threads. Phase 9 makes evidence a first-class concept, which would have
   * turned that from a latent hole into a routine one.
   *
   * The rule is deliberately narrow, so no Phase 1-8 asset changes behaviour:
   * an asset is restricted only when it is used as evidence and has no public
   * exposure anywhere. Concretely, it is servable anonymously when EITHER
   *
   *   - some evidence row referencing it is `isPublic` on PUBLISHED content, or
   *   - it is referenced by any ordinary content relation (a cover image, a
   *     gallery item, a project photograph), all of which are already public.
   *
   * An asset used ONLY as private evidence is restricted, and the route then
   * requires an authenticated caller holding EVIDENCE_READ in the owning
   * tenant.
   */
  async resolveForServing(mediaId: string) {
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        organizationId: true,
        storageKey: true,
        mimeType: true,
        kind: true,
        originalName: true,
        _count: {
          select: {
            projectMedia: true,
            achievementMedia: true,
            albumItems: true,
            projectCovers: true,
            achievementCovers: true,
            newsCovers: true,
            eventCovers: true,
            albumCovers: true,
            priorityImages: true,
            videoThumbnails: true,
            candidateProfileImages: true,
            candidateCoverImages: true,
            evidenceDocuments: true,
          },
        },
      },
    });

    if (!asset) return null;

    const { evidenceDocuments, ...ordinaryReferences } = asset._count;
    const usedAsOrdinaryContent = Object.values(ordinaryReferences).some((count) => count > 0);

    if (evidenceDocuments === 0 || usedAsOrdinaryContent) {
      return { ...asset, restricted: false };
    }

    // Used only as evidence: servable anonymously only if some referencing item
    // is published evidence on published content. Both halves matter - evidence
    // marked public on a DRAFT claim is not public, because the claim it
    // supports has not been made yet.
    const publiclyExposed = await prisma.workEvidence.findFirst({
      where: {
        documentId: asset.id,
        isPublic: true,
        OR: [{ achievement: { status: 'PUBLISHED' } }, { project: { status: 'PUBLISHED' } }],
      },
      select: { id: true },
    });

    return { ...asset, restricted: publiclyExposed === null };
  },

  /** Confirms a media id belongs to the tenant before it is referenced. */
  async assertBelongsToTenant(
    organizationId: string,
    mediaId: string | null | undefined,
    field: string,
  ): Promise<string | null> {
    if (!mediaId) return null;

    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, organizationId },
      select: { id: true },
    });

    if (!asset) {
      throw AppError.validation('That image is not available in this organisation.', {
        details: { field },
      });
    }

    return asset.id;
  },
};
