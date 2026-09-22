import { randomUUID } from 'node:crypto';
import type { RoleKey } from '@rk/types';
import { prisma } from '../../database/prisma';
import { passwordService } from '../../modules/auth/password.service';

/**
 * Integration-test fixtures.
 *
 * Every entity is created with a run-unique suffix so a suite can run against a
 * shared development database without colliding with real data or with a
 * parallel run. `cleanupFixtures` removes exactly what was created, in
 * foreign-key-safe order.
 *
 * These tests deliberately use a real PostgreSQL rather than mocks: the
 * properties under test - unique constraints, transactional token redemption,
 * tenant-scoped `where` clauses - only exist in the database. A mocked Prisma
 * would happily "prove" isolation that the real query does not enforce.
 */

const SUITE_ID = randomUUID().slice(0, 8);
let counter = 0;

function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${SUITE_ID}-${counter}`;
}

export const TEST_PASSWORD = 'Test-Password-123456';

const createdUserIds: string[] = [];
const createdOrganizationIds: string[] = [];

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export interface TestTenant {
  organizationId: string;
  slug: string;
  campaignId: string;
}

/** Creates an organisation with one campaign. */
export async function createTenant(): Promise<TestTenant> {
  const slug = unique('org');

  const organization = await prisma.organization.create({
    data: { slug, name: `Test ${slug}` },
    select: { id: true },
  });
  createdOrganizationIds.push(organization.id);

  const campaign = await prisma.campaign.create({
    data: { organizationId: organization.id, slug: unique('camp'), name: 'Test Campaign' },
    select: { id: true },
  });

  return { organizationId: organization.id, slug, campaignId: campaign.id };
}

/** Creates an ACTIVE user with a known password and no memberships. */
export async function createUser(
  overrides: { status?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED' } = {},
): Promise<TestUser> {
  const email = `${unique('user')}@example.test`;
  const passwordHash = await passwordService.hashPassword(TEST_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email,
      fullName: 'Test User',
      passwordHash,
      status: overrides.status ?? 'ACTIVE',
    },
    select: { id: true, email: true },
  });

  createdUserIds.push(user.id);
  return { id: user.id, email: user.email, password: TEST_PASSWORD };
}

/** Grants an organisation-scoped role. */
export async function addMembership(
  userId: string,
  organizationId: string,
  roleKey: RoleKey,
): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  await prisma.organizationMembership.create({
    data: { organizationId, userId, roleId: role.id },
  });
}

/** Grants SUPER_ADMIN, which is platform-scoped rather than tenant-scoped. */
export async function makePlatformAdmin(userId: string): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  await prisma.platformRoleAssignment.create({ data: { userId, roleId: role.id } });
}

/** A user who is a member of a fresh tenant with the given role. */
export async function createTenantUser(
  roleKey: RoleKey,
): Promise<{ user: TestUser; tenant: TestTenant }> {
  const tenant = await createTenant();
  const user = await createUser();
  await addMembership(user.id, tenant.organizationId, roleKey);
  return { user, tenant };
}

/**
 * Removes everything this suite created.
 *
 * Ordered so foreign keys never block a delete: audit rows reference users with
 * SetNull, but sessions and memberships cascade from the user, and campaigns
 * from the organisation.
 */
export async function cleanupFixtures(): Promise<void> {
  if (createdUserIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.platformRoleAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.organizationMembership.deleteMany({ where: { userId: { in: createdUserIds } } });
  }

  if (createdOrganizationIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: createdOrganizationIds } },
    });
    await prisma.invitation.deleteMany({
      where: { organizationId: { in: createdOrganizationIds } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
  }

  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }

  createdUserIds.length = 0;
  createdOrganizationIds.length = 0;
}

/** True when a database is reachable, so suites can skip rather than fail. */
export async function databaseAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // The authorization model must be seeded for any of this to mean anything.
    const roles = await prisma.role.count();
    return roles > 0;
  } catch {
    return false;
  }
}
