/**
 * Platform roles.
 *
 * These keys are the stable authorization identifiers. Display names live in
 * the database and may be renamed freely; NOTHING may authorize on a display
 * name. Authorization is always evaluated on permissions (see `permissions.ts`)
 * - roles exist only to bundle permissions and to bound privilege escalation.
 */
export const ROLE_KEYS = [
  'SUPER_ADMIN',
  'CAMPAIGN_ADMIN',
  'CANDIDATE',
  'CONTENT_MANAGER',
  'ISSUE_MANAGER',
  'FIELD_COORDINATOR',
  'ANALYST',
  'VIEWER',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value);
}

/**
 * Where a role may be granted.
 *
 * PLATFORM roles are global and are never attached to an organisation;
 * ORGANIZATION roles are granted through a membership in exactly one tenant.
 */
export const ROLE_SCOPES = ['PLATFORM', 'ORGANIZATION'] as const;
export type RoleScope = (typeof ROLE_SCOPES)[number];

/**
 * Privilege rank, used to bound role assignment.
 *
 * An actor may only grant or revoke a role ranked strictly BELOW their own
 * highest rank, which is what stops a CAMPAIGN_ADMIN minting peers or
 * escalating to SUPER_ADMIN. Ranks are relative; the exact numbers carry no
 * meaning beyond their ordering.
 */
export const ROLE_RANK: Record<RoleKey, number> = {
  SUPER_ADMIN: 100,
  CAMPAIGN_ADMIN: 80,
  CANDIDATE: 60,
  CONTENT_MANAGER: 50,
  ISSUE_MANAGER: 50,
  FIELD_COORDINATOR: 40,
  ANALYST: 30,
  VIEWER: 10,
};

export const ROLE_SCOPE: Record<RoleKey, RoleScope> = {
  SUPER_ADMIN: 'PLATFORM',
  CAMPAIGN_ADMIN: 'ORGANIZATION',
  CANDIDATE: 'ORGANIZATION',
  CONTENT_MANAGER: 'ORGANIZATION',
  ISSUE_MANAGER: 'ORGANIZATION',
  FIELD_COORDINATOR: 'ORGANIZATION',
  ANALYST: 'ORGANIZATION',
  VIEWER: 'ORGANIZATION',
};

export interface RoleDefinition {
  readonly key: RoleKey;
  readonly name: string;
  readonly description: string;
  readonly scope: RoleScope;
  readonly rank: number;
}

export const ROLE_DEFINITIONS: Record<RoleKey, RoleDefinition> = {
  SUPER_ADMIN: {
    key: 'SUPER_ADMIN',
    name: 'Super Admin',
    description: 'Global platform administration across every organisation.',
    scope: 'PLATFORM',
    rank: ROLE_RANK.SUPER_ADMIN,
  },
  CAMPAIGN_ADMIN: {
    key: 'CAMPAIGN_ADMIN',
    name: 'Campaign Admin',
    description: 'Administers one organisation, its campaigns, users and roles.',
    scope: 'ORGANIZATION',
    rank: ROLE_RANK.CAMPAIGN_ADMIN,
  },
  CANDIDATE: {
    key: 'CANDIDATE',
    name: 'Candidate',
    description: 'The candidate. Own profile and read access; no administration.',
    scope: 'ORGANIZATION',
    rank: ROLE_RANK.CANDIDATE,
  },
  CONTENT_MANAGER: {
    key: 'CONTENT_MANAGER',
    name: 'Content Manager',
    description: 'Manages published content from Phase 3. No role administration.',
    scope: 'ORGANIZATION',
    rank: ROLE_RANK.CONTENT_MANAGER,
  },
  ISSUE_MANAGER: {
    key: 'ISSUE_MANAGER',
    name: 'Issue Manager',
    description: 'Works reported issues from Phase 5. No role administration.',
    scope: 'ORGANIZATION',
    rank: ROLE_RANK.ISSUE_MANAGER,
  },
  FIELD_COORDINATOR: {
    key: 'FIELD_COORDINATOR',
    name: 'Field Coordinator',
    description: 'Coordinates field staff. No role administration.',
    scope: 'ORGANIZATION',
    rank: ROLE_RANK.FIELD_COORDINATOR,
  },
  ANALYST: {
    key: 'ANALYST',
    name: 'Analyst',
    description: 'Read-only analytical access. No user administration.',
    scope: 'ORGANIZATION',
    rank: ROLE_RANK.ANALYST,
  },
  VIEWER: {
    key: 'VIEWER',
    name: 'Viewer',
    description: 'Minimal read-only access.',
    scope: 'ORGANIZATION',
    rank: ROLE_RANK.VIEWER,
  },
};

/** The highest rank among a set of roles; 0 when the set is empty. */
export function highestRank(roles: readonly RoleKey[]): number {
  return roles.reduce((max, role) => Math.max(max, ROLE_RANK[role] ?? 0), 0);
}
