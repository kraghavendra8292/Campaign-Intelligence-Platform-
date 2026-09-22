import { DEFAULT_ISSUE_CATEGORIES, type AuthContext, type CampaignStatus } from '@rk/types';
import { slugify } from '@rk/utils';
import { prisma } from '../../database/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../audit/audit.service';
import { authorizationService } from '../auth/authorization.service';
import type { RequestMetadata } from '../auth/auth.service';

/**
 * Organisation and campaign administration.
 *
 * Organisations are the tenant root, so creating one is platform-level work:
 * no organisation-scoped role can mint a new tenant. Campaigns live *inside* an
 * organisation and are administered by that tenant's admins - but every
 * campaign query is still filtered by `organizationId`, because a campaign id
 * on its own carries no tenant proof.
 */

const ORGANIZATION_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const CAMPAIGN_SELECT = {
  id: true,
  organizationId: true,
  slug: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const organizationService = {
  /** The active tenant. */
  async getActiveOrganization(auth: AuthContext) {
    const { organizationId } = authorizationService.requireOrganization(
      authorizationService.requirePermission(auth, 'ORGANIZATION_READ'),
    );

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: ORGANIZATION_SELECT,
    });

    if (!organization) throw AppError.notFound('Organisation not found.');
    return organization;
  },

  /**
   * Lists organisations visible to the caller.
   *
   * A platform admin sees every tenant; everyone else sees exactly the tenants
   * they hold a membership in. There is no "list all" path for a tenant user.
   */
  async listVisibleOrganizations(auth: AuthContext) {
    authorizationService.requireAuth(auth);

    if (auth.isPlatformAdmin) {
      return prisma.organization.findMany({
        select: ORGANIZATION_SELECT,
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
    }

    return prisma.organization.findMany({
      where: { memberships: { some: { userId: auth.userId } } },
      select: ORGANIZATION_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  },

  /** Creates a tenant. Platform administration only. */
  async createOrganization(auth: AuthContext, name: string, meta: RequestMetadata) {
    authorizationService.requirePermission(auth, 'ORGANIZATION_CREATE');
    authorizationService.requirePlatformAdmin(auth);

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      throw AppError.validation('Organisation name is too short.', { details: { field: 'name' } });
    }

    const slug = slugify(trimmed);
    if (!slug) {
      throw AppError.validation('Organisation name must contain letters or digits.', {
        details: { field: 'name' },
      });
    }

    const clash = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (clash) throw AppError.conflict('An organisation with a similar name already exists.');

    const organization = await prisma.organization.create({
      data: {
        slug,
        name: trimmed,
        // Phase 5: a tenant without a category vocabulary has a broken public
        // feedback form from the moment it exists, so the defaults are created
        // with it rather than left to a later seed run that may never happen.
        issueCategories: {
          create: DEFAULT_ISSUE_CATEGORIES.map((category, index) => ({
            key: category.key,
            label: category.label,
            displayOrder: index,
          })),
        },
      },
      select: ORGANIZATION_SELECT,
    });

    await auditService.record({
      action: 'ORGANIZATION_CREATED',
      organizationId: organization.id,
      actorUserId: auth.userId,
      entityType: 'Organization',
      entityId: organization.id,
      metadata: { slug },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return organization;
  },

  /** Renames the active tenant. The slug is immutable: it is a public URL. */
  async updateOrganization(auth: AuthContext, name: string, meta: RequestMetadata) {
    const { organizationId } = authorizationService.requireOrganization(
      authorizationService.requirePermission(auth, 'ORGANIZATION_UPDATE'),
    );

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      throw AppError.validation('Organisation name is too short.', { details: { field: 'name' } });
    }

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: { name: trimmed },
      select: ORGANIZATION_SELECT,
    });

    await auditService.record({
      action: 'ORGANIZATION_UPDATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'Organization',
      entityId: organizationId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return organization;
  },
};

export const campaignService = {
  /** Campaigns in the active tenant. Always filtered by organizationId. */
  async listCampaigns(auth: AuthContext) {
    const { organizationId } = authorizationService.requireOrganization(
      authorizationService.requirePermission(auth, 'CAMPAIGN_READ'),
    );

    return prisma.campaign.findMany({
      where: { organizationId },
      select: CAMPAIGN_SELECT,
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  },

  /**
   * Loads one campaign.
   *
   * `findFirst` with both id AND organizationId, never `findUnique({ id })`:
   * the tenant filter is what makes a guessed id from another organisation
   * return nothing.
   */
  async getCampaign(auth: AuthContext, campaignId: string) {
    const { organizationId } = authorizationService.requireOrganization(
      authorizationService.requirePermission(auth, 'CAMPAIGN_READ'),
    );

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      select: CAMPAIGN_SELECT,
    });

    if (!campaign) throw AppError.notFound('Campaign not found.');
    return campaign;
  },

  async createCampaign(auth: AuthContext, name: string, meta: RequestMetadata) {
    const { organizationId } = authorizationService.requireOrganization(
      authorizationService.requirePermission(auth, 'CAMPAIGN_CREATE'),
    );

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      throw AppError.validation('Campaign name is too short.', { details: { field: 'name' } });
    }

    const slug = slugify(trimmed);
    if (!slug) {
      throw AppError.validation('Campaign name must contain letters or digits.', {
        details: { field: 'name' },
      });
    }

    // Slugs are unique per tenant, so this check is scoped too.
    const clash = await prisma.campaign.findFirst({
      where: { organizationId, slug },
      select: { id: true },
    });
    if (clash) throw AppError.conflict('A campaign with a similar name already exists.');

    const campaign = await prisma.campaign.create({
      data: { organizationId, slug, name: trimmed },
      select: CAMPAIGN_SELECT,
    });

    await auditService.record({
      action: 'CAMPAIGN_CREATED',
      organizationId,
      campaignId: campaign.id,
      actorUserId: auth.userId,
      entityType: 'Campaign',
      entityId: campaign.id,
      metadata: { slug },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return campaign;
  },

  async updateCampaign(
    auth: AuthContext,
    campaignId: string,
    changes: { name?: string | null; status?: CampaignStatus | null },
    meta: RequestMetadata,
  ) {
    const { organizationId } = authorizationService.requireOrganization(
      authorizationService.requirePermission(auth, 'CAMPAIGN_UPDATE'),
    );

    // Prove tenant ownership before any write touches the row.
    const existing = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound('Campaign not found.');

    const name = changes.name?.trim();
    if (name !== undefined && name.length < 2) {
      throw AppError.validation('Campaign name is too short.', { details: { field: 'name' } });
    }

    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data: { ...(name ? { name } : {}), ...(changes.status ? { status: changes.status } : {}) },
      select: CAMPAIGN_SELECT,
    });

    await auditService.record({
      action: 'CAMPAIGN_UPDATED',
      organizationId,
      campaignId: campaign.id,
      actorUserId: auth.userId,
      entityType: 'Campaign',
      entityId: campaign.id,
      metadata: { status: changes.status ?? undefined },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return campaign;
  },

  /** Archives a campaign. Soft by design: history stays referenceable. */
  async archiveCampaign(auth: AuthContext, campaignId: string, meta: RequestMetadata) {
    const { organizationId } = authorizationService.requireOrganization(
      authorizationService.requirePermission(auth, 'CAMPAIGN_DELETE'),
    );

    const existing = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound('Campaign not found.');

    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data: { status: 'ARCHIVED' },
      select: CAMPAIGN_SELECT,
    });

    await auditService.record({
      action: 'CAMPAIGN_DELETED',
      organizationId,
      campaignId: campaign.id,
      actorUserId: auth.userId,
      entityType: 'Campaign',
      entityId: campaign.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return campaign;
  },
};
