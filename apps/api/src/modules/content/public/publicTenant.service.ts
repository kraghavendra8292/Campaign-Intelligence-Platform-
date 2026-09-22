import type { Locale } from '@rk/types';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';

/**
 * Tenant resolution for the PUBLIC website.
 *
 * The admin API resolves a tenant from the authenticated session. The public
 * site has no session, so it must name the tenant some other way - and that
 * changes the security question rather than removing it.
 *
 * WHY A SLUG IS SAFE TO ACCEPT HERE
 * A public site's identity is not a secret: `demo-campaign.example.com` or
 * `/?org=demo-campaign` is the address a visitor types. Accepting the slug is
 * not the same as accepting an `organizationId` from an authenticated client,
 * which Phase 2 forbids - there the id would grant *authority*, whereas here it
 * only selects which already-public content to show. What protects the data is
 * that every public query filters to PUBLISHED content within that one tenant,
 * so naming a tenant reveals exactly what that tenant chose to publish.
 *
 * RESOLUTION ORDER
 *   1. explicit `organizationSlug` argument  - used by the dev/single-host setup
 *   2. `x-organization-slug` header          - set by an edge/proxy
 *   3. Host header                           - custom domain or subdomain
 *
 * Only ACTIVE organisations resolve, so suspending a tenant takes their public
 * site down immediately.
 */

export interface PublicTenant {
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
}

export interface PublicTenantInput {
  readonly organizationSlug?: string | null;
  readonly headerSlug?: string | undefined;
  readonly host?: string | undefined;
  readonly locale?: Locale;
}

/** Slugs are lower-case, hyphenated and short; anything else cannot be a slug. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Derives a candidate slug from a Host header.
 *
 * Supports `<slug>.rkcampaign.app` style subdomains. A fully custom domain
 * needs a domain-to-tenant mapping table, which is deliberately out of Phase 3
 * scope - this is the single place that mapping would be added.
 */
export function slugFromHost(host: string | undefined): string | null {
  if (!host) return null;

  const hostname = host.split(':')[0]?.toLowerCase() ?? '';
  const labels = hostname.split('.');

  // Needs at least <sub>.<domain>.<tld>; bare domains and localhost do not
  // identify a tenant.
  if (labels.length < 3) return null;

  const candidate = labels[0];
  if (!candidate || candidate === 'www' || candidate === 'api') return null;

  return SLUG_PATTERN.test(candidate) ? candidate : null;
}

export const publicTenantService = {
  /**
   * Resolves the tenant whose public site is being rendered.
   *
   * Throws NOT_FOUND when the tenant is unknown or suspended - the same answer
   * for both, so the response does not reveal that a suspended campaign exists.
   */
  async resolve(input: PublicTenantInput): Promise<PublicTenant> {
    const candidate =
      normalizeSlug(input.organizationSlug) ??
      normalizeSlug(input.headerSlug) ??
      slugFromHost(input.host);

    if (!candidate) {
      throw AppError.badRequest(
        'No candidate site was specified. Supply organizationSlug, the x-organization-slug header, or use a site subdomain.',
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true, slug: true, name: true, status: true },
    });

    if (!organization || organization.status !== 'ACTIVE') {
      throw AppError.notFound('This candidate site is not available.');
    }

    return {
      organizationId: organization.id,
      slug: organization.slug,
      name: organization.name,
    };
  },
};

function normalizeSlug(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return null;
  return SLUG_PATTERN.test(trimmed) ? trimmed : null;
}
