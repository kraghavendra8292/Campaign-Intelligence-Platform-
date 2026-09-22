/**
 * Multi-tenancy primitives.
 *
 * Every business entity added from Phase 2 onwards is expected to be scoped to
 * an organization (tenant). These types exist so that tenant scoping is a
 * first-class, explicitly typed concept from the very first line of code
 * rather than something retrofitted later.
 */

/** Opaque identifier of a tenant (an Organization row). */
export type OrganizationId = string;

/** Opaque identifier of a platform user. */
export type UserId = string;

/**
 * Marker interface for any record that belongs to exactly one tenant.
 * Future business models (candidates, issues, projects, ...) should extend it.
 */
export interface TenantScoped {
  readonly organizationId: OrganizationId;
}

/**
 * The tenant resolved for the current request.
 *
 * Phase 1 never populates this (there is no authentication yet); it defines the
 * shape that Phase 2 tenant resolution middleware will fill in.
 */
export interface TenantContext {
  readonly organizationId: OrganizationId;
  readonly slug: string;
}
