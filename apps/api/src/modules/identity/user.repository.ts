import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';

/**
 * Tenant-scoped data access for users.
 *
 * Every method here takes an `organizationId` and filters on it. That is the
 * whole point of the layer: there is deliberately no `findById(id)` that a
 * resolver could reach for, because the natural shape of that call -
 * `findUnique({ where: { id } })` - silently ignores the tenant boundary and
 * would return a user from any organisation.
 *
 * A user may belong to several organisations, so "a user in this tenant" means
 * "a user with a membership in this tenant", and the filter is written against
 * the membership rather than against the user row.
 */

/** The user shape services and resolvers work with. Never includes the hash. */
export const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type UserRecord = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export interface UserPageArgs {
  readonly first: number;
  readonly afterCursor?: string | null;
  readonly search?: string | null;
  readonly status?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | null;
}

export const userRepository = {
  /**
   * Lists users holding a membership in one organisation.
   *
   * Cursor pagination on `id` with a stable `createdAt, id` ordering: offset
   * pagination would skip or repeat rows as users are invited during paging.
   */
  async listForOrganization(
    organizationId: string,
    args: UserPageArgs,
  ): Promise<{ users: UserRecord[]; hasNextPage: boolean; totalCount: number }> {
    const where: Prisma.UserWhereInput = {
      memberships: { some: { organizationId } },
      ...(args.status ? { status: args.status } : {}),
      ...(args.search
        ? {
            OR: [
              { email: { contains: args.search, mode: 'insensitive' } },
              { fullName: { contains: args.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        // One extra row tells us whether another page exists without a count.
        take: args.first + 1,
        ...(args.afterCursor ? { cursor: { id: args.afterCursor }, skip: 1 } : {}),
      }),
      prisma.user.count({ where }),
    ]);

    const hasNextPage = rows.length > args.first;
    return { users: hasNextPage ? rows.slice(0, args.first) : rows, hasNextPage, totalCount };
  },

  /**
   * Loads one user, but only if they belong to the given organisation.
   * Returns null for a user in another tenant, exactly as for a missing id.
   */
  async findInOrganization(userId: string, organizationId: string): Promise<UserRecord | null> {
    return prisma.user.findFirst({
      where: { id: userId, memberships: { some: { organizationId } } },
      select: USER_SELECT,
    });
  },

  /** Unscoped lookup. Platform-admin paths only; never call from a tenant path. */
  async findByIdUnscoped(userId: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  },

  /** The membership row binding a user to a tenant, with its role. */
  async findMembership(userId: string, organizationId: string) {
    return prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: {
        id: true,
        createdAt: true,
        organization: { select: { id: true, slug: true, name: true, status: true } },
        role: { select: { id: true, key: true, name: true, rank: true, scope: true } },
      },
    });
  },

  /** Every organisation the user belongs to. Used by `myMemberships`. */
  async listMembershipsForUser(userId: string) {
    return prisma.organizationMembership.findMany({
      where: { userId },
      select: {
        id: true,
        createdAt: true,
        organization: { select: { id: true, slug: true, name: true, status: true } },
        role: { select: { id: true, key: true, name: true, rank: true, scope: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },
};
