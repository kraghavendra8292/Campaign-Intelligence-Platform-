import type { AuthContext, QrCodeStatus } from '@rk/types';
import { slugify } from '@rk/utils';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { auditService } from '../../audit/audit.service';
import {
  clampQrPageSize,
  generateQrCodeIdentifier,
  optionalText,
  optionalUtm,
  parseCoordinate,
  requireQrAccess,
  requireText,
  validateDestinationPath,
} from '../shared/qrGuards';
import type { RequestMeta } from './qrCampaign.service';

/**
 * QR code administration.
 *
 * A QR code is the unit a campaign team actually compares - "the poster on 12th
 * Main" against "the pamphlet" - so its attribution metadata (source, ward,
 * area) is the axis every analytics rollup groups by.
 */

const CODE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  destinationPath: true,
  status: true,
  source: true,
  placement: true,
  area: true,
  ward: true,
  locality: true,
  latitude: true,
  longitude: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  utmContent: true,
  createdAt: true,
  updatedAt: true,
  activatedAt: true,
  deactivatedAt: true,
  campaign: { select: { id: true, name: true, slug: true, campaignType: true, status: true } },
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { scanEvents: true } },
} satisfies Prisma.QrCodeSelect;

export interface QrCodeInput {
  readonly name: string;
  readonly description?: string | null;
  readonly destinationPath: string;
  readonly source?: string | null;
  readonly placement?: string | null;
  readonly area?: string | null;
  readonly ward?: string | null;
  readonly locality?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly utmSource?: string | null;
  readonly utmMedium?: string | null;
  readonly utmCampaign?: string | null;
  readonly utmContent?: string | null;
}

export interface QrCodeListArgs {
  readonly first?: number | null;
  readonly campaignId?: string | null;
  readonly status?: QrCodeStatus | null;
  readonly search?: string | null;
}

export const QR_CODE_ACTIONS = ['ACTIVATE', 'PAUSE', 'ARCHIVE'] as const;
export type QrCodeAction = (typeof QR_CODE_ACTIONS)[number];

const ACTION_STATUS: Record<QrCodeAction, QrCodeStatus> = {
  ACTIVATE: 'ACTIVE',
  PAUSE: 'PAUSED',
  ARCHIVE: 'ARCHIVED',
};

/**
 * Allocates an unused public identifier.
 *
 * Retries on collision rather than trusting the odds. Thirty-two to the eighth
 * is a large space, but "large" is not "unique", and a collision here would
 * either fail a create or - far worse, were the unique index missing - attach
 * one campaign's scans to another's code. The database index is the real
 * guarantee; this loop just avoids surfacing it as an error.
 */
async function allocateIdentifier(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateQrCodeIdentifier();
    const clash = await prisma.qrCode.findUnique({
      where: { code: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw AppError.internal('Could not allocate a QR identifier. Please try again.');
}

/**
 * Derives UTM values when the editor has not supplied them.
 *
 * Defaults chosen so the numbers mean something downstream without anyone
 * having to understand UTM conventions: the medium is the campaign TYPE
 * (poster, pamphlet), the campaign is its slug, and the content is the
 * individual code's name. An editor who knows what they want can override any
 * of them.
 */
function deriveUtm(
  input: QrCodeInput,
  campaign: { slug: string; campaignType: string },
  codeName: string,
): { source: string; medium: string; campaign: string; content: string } {
  return {
    source: optionalUtm(input.utmSource, 'utmSource') ?? 'qr',
    medium: optionalUtm(input.utmMedium, 'utmMedium') ?? campaign.campaignType.toLowerCase(),
    campaign: optionalUtm(input.utmCampaign, 'utmCampaign') ?? campaign.slug,
    // A name of only punctuation slugifies to an empty string, which would
    // produce `utm_content=` and break the attribution it exists to carry.
    content:
      optionalUtm(input.utmContent, 'utmContent') ?? (slugify(codeName).slice(0, 120) || 'qr'),
  };
}

export const qrCodeService = {
  async list(auth: AuthContext, args: QrCodeListArgs) {
    const { organizationId } = requireQrAccess(auth, 'QR_CODE', 'READ');
    const take = clampQrPageSize(args.first);

    const where: Prisma.QrCodeWhereInput = {
      organizationId,
      ...(args.campaignId ? { campaignId: args.campaignId } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.search
        ? { name: { contains: args.search.trim(), mode: 'insensitive' as const } }
        : {}),
    };

    const [nodes, totalCount] = await Promise.all([
      prisma.qrCode.findMany({
        where,
        select: CODE_SELECT,
        orderBy: [{ createdAt: 'desc' }],
        take,
      }),
      prisma.qrCode.count({ where }),
    ]);

    return { nodes, totalCount };
  },

  async getById(auth: AuthContext, id: string) {
    const { organizationId } = requireQrAccess(auth, 'QR_CODE', 'READ');

    const code = await prisma.qrCode.findFirst({
      where: { id, organizationId },
      select: CODE_SELECT,
    });

    if (!code) throw AppError.notFound('This QR code is not available.');
    return code;
  },

  async create(auth: AuthContext, campaignId: string, input: QrCodeInput, meta: RequestMeta) {
    const { organizationId } = requireQrAccess(auth, 'QR_CODE', 'CREATE');

    // The parent is loaded tenant-scoped, so a campaign id belonging to another
    // organisation cannot be used to plant a code inside it.
    const campaign = await prisma.qrCampaign.findFirst({
      where: { id: campaignId, organizationId },
      select: { id: true, slug: true, campaignType: true },
    });
    if (!campaign) throw AppError.notFound('This QR campaign is not available.');

    const name = requireText(input.name, 'name', 200);
    const destinationPath = validateDestinationPath(input.destinationPath);
    const utm = deriveUtm(input, campaign, name);
    const code = await allocateIdentifier();

    const created = await prisma.qrCode.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        code,
        name,
        description: optionalText(input.description, 'description', 1000),
        destinationPath,
        // ACTIVE on creation, unlike a campaign. A QR code has no useful draft
        // state: it does not exist physically until somebody prints it, and an
        // inactive code that gets printed by mistake is a dead poster.
        status: 'ACTIVE',
        activatedAt: new Date(),
        source: optionalText(input.source, 'source', 120),
        placement: optionalText(input.placement, 'placement', 200),
        area: optionalText(input.area, 'area', 120),
        ward: optionalText(input.ward, 'ward', 120),
        locality: optionalText(input.locality, 'locality', 120),
        latitude: parseCoordinate(input.latitude, 'latitude', 90),
        longitude: parseCoordinate(input.longitude, 'longitude', 180),
        utmSource: utm.source,
        utmMedium: utm.medium,
        utmCampaign: utm.campaign,
        utmContent: utm.content,
        createdById: auth.userId,
      },
      select: CODE_SELECT,
    });

    await auditService.record({
      action: 'QR_CODE_CREATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'QrCode',
      entityId: created.id,
      metadata: { code: created.code, name: created.name, destination: created.destinationPath },
      ...meta,
    });

    return created;
  },

  async update(auth: AuthContext, id: string, input: QrCodeInput, meta: RequestMeta) {
    const { organizationId } = requireQrAccess(auth, 'QR_CODE', 'UPDATE');

    const existing = await prisma.qrCode.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        code: true,
        destinationPath: true,
        campaign: { select: { slug: true, campaignType: true } },
      },
    });
    if (!existing) throw AppError.notFound('This QR code is not available.');

    const name = requireText(input.name, 'name', 200);
    const destinationPath = validateDestinationPath(input.destinationPath);
    const utm = deriveUtm(input, existing.campaign, name);

    const updated = await prisma.qrCode.update({
      where: { id: existing.id },
      data: {
        name,
        description: optionalText(input.description, 'description', 1000),
        destinationPath,
        source: optionalText(input.source, 'source', 120),
        placement: optionalText(input.placement, 'placement', 200),
        area: optionalText(input.area, 'area', 120),
        ward: optionalText(input.ward, 'ward', 120),
        locality: optionalText(input.locality, 'locality', 120),
        latitude: parseCoordinate(input.latitude, 'latitude', 90),
        longitude: parseCoordinate(input.longitude, 'longitude', 180),
        utmSource: utm.source,
        utmMedium: utm.medium,
        utmCampaign: utm.campaign,
        utmContent: utm.content,
      },
      select: CODE_SELECT,
    });

    await auditService.record({
      action: 'QR_CODE_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'QrCode',
      entityId: updated.id,
      // The destination change is recorded explicitly: re-pointing a printed
      // code is the single highest-consequence edit available here, and the
      // audit trail should show the before and after without a diff.
      metadata: {
        code: updated.code,
        name: updated.name,
        destinationFrom: existing.destinationPath,
        destinationTo: destinationPath,
      },
      ...meta,
    });

    return updated;
  },

  /**
   * Activates, pauses or archives one code.
   *
   * `deactivatedAt` records when it stopped redirecting and `activatedAt` when
   * it started, so a gap in a code's scan history has a documented cause rather
   * than looking like a tracking failure.
   */
  async transition(auth: AuthContext, id: string, action: QrCodeAction, meta: RequestMeta) {
    const { organizationId } = requireQrAccess(auth, 'QR_CODE', 'ARCHIVE');

    const existing = await prisma.qrCode.findFirst({
      where: { id, organizationId },
      select: { id: true, code: true, status: true, activatedAt: true },
    });
    if (!existing) throw AppError.notFound('This QR code is not available.');

    const status = ACTION_STATUS[action];
    const now = new Date();

    const updated = await prisma.qrCode.update({
      where: { id: existing.id },
      data: {
        status,
        ...(status === 'ACTIVE'
          ? { activatedAt: existing.activatedAt ?? now, deactivatedAt: null }
          : { deactivatedAt: now }),
      },
      select: CODE_SELECT,
    });

    await auditService.record({
      action: 'QR_CODE_STATUS_CHANGED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'QrCode',
      entityId: updated.id,
      metadata: { code: updated.code, from: existing.status, to: status, requested: action },
      ...meta,
    });

    return updated;
  },
};
