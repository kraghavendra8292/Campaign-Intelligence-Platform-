import type { AuthContext, ContentCategory, Locale } from '@rk/types';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { auditService } from '../../audit/audit.service';
import { authorizationService } from '../../auth/authorization.service';
import type { RequestMetadata } from '../../auth/auth.service';
import { mediaService } from '../media/media.service';
import { assertSafeUrl, sanitizeRichText, toPlainText } from '../shared/sanitize';
import {
  optionalText,
  requireCmsRead,
  requireText,
  resolveLocale,
  resolvePublishTransition,
  type PublishAction,
} from '../shared/contentGuards';
import { auditActionFor } from './project.service';

/**
 * Singleton site content: the candidate profile, the vision statement and
 * contact details.
 *
 * These are upserted rather than created, one row per tenant per locale, so an
 * editor never has to decide whether they are creating or editing - there is
 * exactly one profile per language and the form always has something to save.
 */

const PROFILE_SELECT = {
  id: true,
  locale: true,
  fullName: true,
  displayName: true,
  designation: true,
  shortBio: true,
  fullBioHtml: true,
  experienceHtml: true,
  publicServiceHtml: true,
  focusAreas: true,
  status: true,
  publishedAt: true,
  metaTitle: true,
  metaDescription: true,
  updatedAt: true,
  profileImage: { select: { id: true, altText: true, width: true, height: true } },
  coverImage: { select: { id: true, altText: true, width: true, height: true } },
} as const;

const VISION_SELECT = {
  id: true,
  locale: true,
  headline: true,
  summary: true,
  statementHtml: true,
  status: true,
  publishedAt: true,
  metaTitle: true,
  metaDescription: true,
  updatedAt: true,
} as const;

const CONTACT_SELECT = {
  id: true,
  locale: true,
  officeName: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  phone: true,
  alternatePhone: true,
  email: true,
  officeHours: true,
  mapEmbedUrl: true,
  latitude: true,
  longitude: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
} as const;

export interface CandidateProfileInput {
  readonly locale?: string | null;
  readonly fullName: string;
  readonly displayName?: string | null;
  readonly designation?: string | null;
  readonly shortBio?: string | null;
  readonly fullBioHtml?: string | null;
  readonly experienceHtml?: string | null;
  readonly publicServiceHtml?: string | null;
  readonly focusAreas?: readonly ContentCategory[] | null;
  readonly profileImageId?: string | null;
  readonly coverImageId?: string | null;
  readonly metaTitle?: string | null;
  readonly metaDescription?: string | null;
}

export interface VisionInput {
  readonly locale?: string | null;
  readonly headline: string;
  readonly summary?: string | null;
  readonly statementHtml?: string | null;
  readonly metaTitle?: string | null;
  readonly metaDescription?: string | null;
}

export interface ContactInput {
  readonly locale?: string | null;
  readonly officeName?: string | null;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly postalCode?: string | null;
  readonly phone?: string | null;
  readonly alternatePhone?: string | null;
  readonly email?: string | null;
  readonly officeHours?: string | null;
  readonly mapEmbedUrl?: string | null;
}

export interface SocialLinkInput {
  readonly platform: string;
  readonly label?: string | null;
  readonly url: string;
  readonly displayOrder?: number | null;
  readonly isActive?: boolean | null;
}

/** Requires a specific singleton permission plus an active tenant. */
function requireSingletonAccess(
  auth: AuthContext,
  permission: 'CANDIDATE_PROFILE_UPDATE' | 'VISION_UPDATE' | 'CONTACT_UPDATE',
) {
  const permitted = authorizationService.requirePermission(auth, permission);
  return authorizationService.requireOrganization(permitted);
}

export const siteProfileService = {
  // --- Candidate profile ---------------------------------------------------

  async getProfile(auth: AuthContext, locale?: string | null) {
    const { organizationId } = requireCmsRead(auth);
    return prisma.candidateProfile.findUnique({
      where: { organizationId_locale: { organizationId, locale: resolveLocale(locale) } },
      select: PROFILE_SELECT,
    });
  },

  async updateProfile(auth: AuthContext, input: CandidateProfileInput, meta: RequestMetadata) {
    const { organizationId } = requireSingletonAccess(auth, 'CANDIDATE_PROFILE_UPDATE');
    const locale: Locale = resolveLocale(input.locale);

    const fullBioHtml = sanitizeRichText(input.fullBioHtml);

    const data = {
      fullName: requireText(input.fullName, 'fullName', 200),
      displayName: optionalText(input.displayName, 'displayName', 200),
      designation: optionalText(input.designation, 'designation', 200),
      shortBio: optionalText(input.shortBio, 'shortBio', 600),
      fullBioHtml,
      experienceHtml: sanitizeRichText(input.experienceHtml),
      publicServiceHtml: sanitizeRichText(input.publicServiceHtml),
      focusAreas: input.focusAreas ? [...input.focusAreas].slice(0, 9) : [],
      profileImageId: await mediaService.assertBelongsToTenant(
        organizationId,
        input.profileImageId,
        'profileImageId',
      ),
      coverImageId: await mediaService.assertBelongsToTenant(
        organizationId,
        input.coverImageId,
        'coverImageId',
      ),
      metaTitle: optionalText(input.metaTitle, 'metaTitle', 200),
      metaDescription:
        optionalText(input.metaDescription, 'metaDescription', 400) ??
        toPlainText(fullBioHtml ?? input.shortBio, 300),
    };

    const profile = await prisma.candidateProfile.upsert({
      where: { organizationId_locale: { organizationId, locale } },
      update: data,
      // A new profile starts as a draft: editing is not publishing.
      create: { ...data, organizationId, locale, status: 'DRAFT' },
      select: PROFILE_SELECT,
    });

    await auditService.record({
      action: 'CONTENT_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'CandidateProfile',
      entityId: profile.id,
      metadata: { locale },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return profile;
  },

  // --- Vision --------------------------------------------------------------

  async getVision(auth: AuthContext, locale?: string | null) {
    const { organizationId } = requireCmsRead(auth);
    return prisma.vision.findUnique({
      where: { organizationId_locale: { organizationId, locale: resolveLocale(locale) } },
      select: VISION_SELECT,
    });
  },

  async updateVision(auth: AuthContext, input: VisionInput, meta: RequestMetadata) {
    const { organizationId } = requireSingletonAccess(auth, 'VISION_UPDATE');
    const locale: Locale = resolveLocale(input.locale);
    const statementHtml = sanitizeRichText(input.statementHtml);

    const data = {
      headline: requireText(input.headline, 'headline', 300),
      summary: optionalText(input.summary, 'summary', 600),
      statementHtml,
      metaTitle: optionalText(input.metaTitle, 'metaTitle', 200),
      metaDescription:
        optionalText(input.metaDescription, 'metaDescription', 400) ??
        toPlainText(statementHtml ?? input.summary, 300),
    };

    const vision = await prisma.vision.upsert({
      where: { organizationId_locale: { organizationId, locale } },
      update: data,
      create: { ...data, organizationId, locale, status: 'DRAFT' },
      select: VISION_SELECT,
    });

    await auditService.record({
      action: 'CONTENT_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Vision',
      entityId: vision.id,
      metadata: { locale },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return vision;
  },

  // --- Contact -------------------------------------------------------------

  async getContact(auth: AuthContext, locale?: string | null) {
    const { organizationId } = requireCmsRead(auth);

    const [contact, socialLinks] = await Promise.all([
      prisma.contactInformation.findUnique({
        where: { organizationId_locale: { organizationId, locale: resolveLocale(locale) } },
        select: CONTACT_SELECT,
      }),
      prisma.socialLink.findMany({
        where: { organizationId },
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          platform: true,
          label: true,
          url: true,
          displayOrder: true,
          isActive: true,
        },
      }),
    ]);

    return { contact, socialLinks };
  },

  async updateContact(auth: AuthContext, input: ContactInput, meta: RequestMetadata) {
    const { organizationId } = requireSingletonAccess(auth, 'CONTACT_UPDATE');
    const locale: Locale = resolveLocale(input.locale);

    const data = {
      officeName: optionalText(input.officeName, 'officeName', 200),
      addressLine1: optionalText(input.addressLine1, 'addressLine1', 250),
      addressLine2: optionalText(input.addressLine2, 'addressLine2', 250),
      city: optionalText(input.city, 'city', 120),
      state: optionalText(input.state, 'state', 120),
      postalCode: optionalText(input.postalCode, 'postalCode', 20),
      phone: optionalText(input.phone, 'phone', 40),
      alternatePhone: optionalText(input.alternatePhone, 'alternatePhone', 40),
      email: optionalText(input.email, 'email', 320),
      officeHours: optionalText(input.officeHours, 'officeHours', 300),
      // The map URL ends up in an iframe src, so it is validated as a real
      // absolute URL rather than trusted as typed.
      mapEmbedUrl: input.mapEmbedUrl?.trim()
        ? assertSafeUrl(input.mapEmbedUrl, 'mapEmbedUrl')
        : null,
    };

    const contact = await prisma.contactInformation.upsert({
      where: { organizationId_locale: { organizationId, locale } },
      update: data,
      create: { ...data, organizationId, locale, status: 'DRAFT' },
      select: CONTACT_SELECT,
    });

    await auditService.record({
      action: 'CONTENT_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'ContactInformation',
      entityId: contact.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return contact;
  },

  /** Replaces the social links for a tenant. */
  async setSocialLinks(
    auth: AuthContext,
    links: readonly SocialLinkInput[],
    meta: RequestMetadata,
  ) {
    const { organizationId } = requireSingletonAccess(auth, 'CONTACT_UPDATE');

    const prepared = links.slice(0, 12).map((link, index) => ({
      organizationId,
      platform: requireText(link.platform, 'platform', 40).toLowerCase(),
      label: optionalText(link.label, 'label', 120),
      url: assertSafeUrl(link.url, 'url'),
      displayOrder: link.displayOrder ?? index,
      isActive: link.isActive ?? true,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.socialLink.deleteMany({ where: { organizationId } });
      if (prepared.length > 0) {
        await tx.socialLink.createMany({ data: prepared, skipDuplicates: true });
      }
    });

    await auditService.record({
      action: 'CONTENT_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'SocialLink',
      metadata: { count: prepared.length },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return prisma.socialLink.findMany({
      where: { organizationId },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        platform: true,
        label: true,
        url: true,
        displayOrder: true,
        isActive: true,
      },
    });
  },

  /**
   * Publishing transition for any of the three singletons.
   *
   * Shared because the lifecycle is identical; the `entity` argument selects
   * both the table and the permission.
   */
  async transitionSingleton(
    auth: AuthContext,
    entity: 'CANDIDATE_PROFILE' | 'VISION' | 'CONTACT',
    action: PublishAction,
    locale: string | null | undefined,
    meta: RequestMetadata,
  ) {
    const permission =
      entity === 'CANDIDATE_PROFILE'
        ? 'CANDIDATE_PROFILE_UPDATE'
        : entity === 'VISION'
          ? 'VISION_UPDATE'
          : 'CONTACT_UPDATE';

    const { organizationId } = requireSingletonAccess(auth, permission);
    const resolved: Locale = resolveLocale(locale);
    const key = { organizationId_locale: { organizationId, locale: resolved } };

    const current =
      entity === 'CANDIDATE_PROFILE'
        ? await prisma.candidateProfile.findUnique({ where: key, select: { publishedAt: true } })
        : entity === 'VISION'
          ? await prisma.vision.findUnique({ where: key, select: { publishedAt: true } })
          : await prisma.contactInformation.findUnique({
              where: key,
              select: { publishedAt: true },
            });

    if (!current) {
      throw AppError.notFound('Save this content before publishing it.');
    }

    const next = resolvePublishTransition(action, current.publishedAt);
    const data = { status: next.status, publishedAt: next.publishedAt };

    const result =
      entity === 'CANDIDATE_PROFILE'
        ? await prisma.candidateProfile.update({ where: key, data, select: PROFILE_SELECT })
        : entity === 'VISION'
          ? await prisma.vision.update({ where: key, data, select: VISION_SELECT })
          : await prisma.contactInformation.update({ where: key, data, select: CONTACT_SELECT });

    await auditService.record({
      action: auditActionFor(action),
      organizationId,
      actorUserId: auth.userId,
      entityType: entity,
      entityId: result.id,
      metadata: { status: next.status, locale: resolved },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return result;
  },
};
