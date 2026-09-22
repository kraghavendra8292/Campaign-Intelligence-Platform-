/**
 * Development seed.
 *
 * Idempotent: every write is an upsert, so it can be re-run safely.
 *
 * Creates the authorization model (roles, permissions, their mapping) which is
 * REQUIRED in every environment including production - the application resolves
 * permissions from these tables. The demo organisation and the bootstrap super
 * admin are development conveniences and are created only when explicitly
 * asked for.
 *
 * No password is ever hardcoded. The bootstrap admin is created only when
 * SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD are both supplied.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PERMISSION_DESCRIPTIONS,
  PERMISSIONS,
  ROLE_DEFINITIONS,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
} from '@rk/types';
import { PrismaClient } from '../src/generated/prisma/client';
import { requireDirectDatabaseUrl } from '../src/config/databaseUrl';
import { seedDemoContent } from './seedContent';
import { seedDemoQrCampaigns } from './seedQr';
import { seedDemoIssues, seedIssueCategories } from './seedIssues';

const connectionString = requireDirectDatabaseUrl();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function seedPermissions(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const key of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { description: PERMISSION_DESCRIPTIONS[key] },
      create: { key, description: PERMISSION_DESCRIPTIONS[key] },
      select: { id: true },
    });
    ids.set(key, permission.id);
  }

  console.log(`Seeded ${PERMISSIONS.length} permissions.`);
  return ids;
}

async function seedRoles(permissionIds: Map<string, string>): Promise<void> {
  for (const key of ROLE_KEYS) {
    const definition = ROLE_DEFINITIONS[key];

    const role = await prisma.role.upsert({
      where: { key },
      update: {
        name: definition.name,
        description: definition.description,
        scope: definition.scope,
        rank: definition.rank,
      },
      create: {
        key,
        name: definition.name,
        description: definition.description,
        scope: definition.scope,
        rank: definition.rank,
      },
      select: { id: true },
    });

    const desired = ROLE_PERMISSIONS[key];
    const desiredIds = desired
      .map((permission) => permissionIds.get(permission))
      .filter((id): id is string => Boolean(id));

    // Replace the mapping rather than merge: the matrix in code is the source
    // of truth, so a permission removed there must disappear from the database
    // too. Merging would let a revoked permission survive forever.
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: desiredIds } },
    });

    for (const permissionId of desiredIds) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  console.log(`Seeded ${ROLE_KEYS.length} roles and their permission mappings.`);
}

/**
 * Bootstrap platform administrator.
 *
 * Opt-in only. Without it there is no way to obtain the first SUPER_ADMIN,
 * since the role cannot be granted through a tenant membership - but silently
 * creating a known-credential admin would be a backdoor.
 */
async function seedSuperAdmin(): Promise<void> {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const fullName = process.env.SEED_SUPER_ADMIN_NAME?.trim() || 'Platform Administrator';

  if (!email || !password) {
    console.log(
      'Skipped super admin: set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD to create one.',
    );
    return;
  }

  if (password.length < 12) {
    throw new Error('SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters.');
  }

  // Imported lazily so the seed does not load the hashing native module unless
  // it is actually creating an account.
  const { passwordService } = await import('../src/modules/auth/password.service');
  const passwordHash = await passwordService.hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, status: 'ACTIVE', fullName },
    create: { email, passwordHash, fullName, status: 'ACTIVE' },
    select: { id: true, email: true },
  });

  const role = await prisma.role.findUniqueOrThrow({
    where: { key: 'SUPER_ADMIN' },
    select: { id: true },
  });

  await prisma.platformRoleAssignment.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  // The address is printed so a developer knows which account to use. The
  // password is not, and is never stored anywhere but as an Argon2id digest.
  console.log(`Seeded SUPER_ADMIN: ${user.email}`);
}

/** A demo tenant, so the admin app has something to show. Development only. */
async function seedDemoOrganization(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipped demo organisation: NODE_ENV is production.');
    return;
  }

  const organization = await prisma.organization.upsert({
    where: { slug: 'demo-campaign' },
    update: { name: 'Demo Campaign Organisation' },
    create: { slug: 'demo-campaign', name: 'Demo Campaign Organisation', status: 'ACTIVE' },
    select: { id: true, slug: true },
  });

  await prisma.campaign.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug: 'ward-5' } },
    update: {},
    create: {
      organizationId: organization.id,
      slug: 'ward-5',
      name: 'Ward 5 Campaign',
      status: 'ACTIVE',
    },
  });

  // If a bootstrap admin exists, give them a membership too, so the demo
  // tenant is reachable from the admin UI without further setup.
  const adminEmail = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail) {
    const admin = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    });
    const role = await prisma.role.findUnique({
      where: { key: 'CAMPAIGN_ADMIN' },
      select: { id: true },
    });

    if (admin && role) {
      await prisma.organizationMembership.upsert({
        where: { organizationId_userId: { organizationId: organization.id, userId: admin.id } },
        update: {},
        create: { organizationId: organization.id, userId: admin.id, roleId: role.id },
      });
    }
  }

  console.log(`Seeded demo organisation "${organization.slug}" with one campaign.`);
}

/**
 * Phase 3 demo site content, for two organisations.
 *
 * Skipped in production: this is fictional demonstration content and must
 * never be written into a real campaign's database.
 */
async function seedContent(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipped demo site content: NODE_ENV is production.');
    return;
  }

  await seedDemoContent(prisma);
  await seedDemoQrCampaigns(prisma);
  await seedDemoIssues(prisma);
}

async function main(): Promise<void> {
  const permissionIds = await seedPermissions();
  await seedRoles(permissionIds);
  await seedSuperAdmin();
  await seedDemoOrganization();
  // Categories are CONFIGURATION, not demo content: the public feedback form
  // cannot work without them, so this runs in every environment - including
  // production, unlike `seedContent` below.
  await seedIssueCategories(prisma);
  await seedContent();
}

try {
  await main();
  console.log('Seed completed successfully.');
} catch (error) {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
