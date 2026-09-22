import { PERMISSIONS, PERMISSION_DESCRIPTIONS, ROLE_KEYS, ROLE_PERMISSIONS } from '@rk/types';
import { prisma } from '../src/database/prisma';

/**
 * Re-applies the authorization model to an existing database.
 *
 * WHY THIS EXISTS SEPARATELY FROM `seed.ts`. Authorization is CODE - the role
 * matrix in `@rk/types` is the source of truth and the tables are a projection
 * of it - so every phase that adds a permission has to push it into a database
 * that already holds real data. The full seed also creates a demo organisation
 * and demo content, which is exactly what nobody wants to run against an
 * environment that is already in use.
 *
 * This does the two things that must happen and nothing else: upsert every
 * permission, and make each role's grants match the matrix. It is idempotent
 * and safe to run repeatedly.
 *
 * Revocation is real: a permission removed from a role in code is DELETED from
 * that role here. Merging instead would let a revoked grant survive forever,
 * which is the failure mode where somebody keeps an authority the code says
 * they lost.
 *
 * It never touches users, memberships, organisations or content.
 *
 *   npm run db:sync-auth -w @rk/api
 */
async function main(): Promise<void> {
  const permissionIds = new Map<string, string>();

  for (const key of PERMISSIONS) {
    const description = PERMISSION_DESCRIPTIONS[key];
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
      select: { id: true },
    });
    permissionIds.set(key, permission.id);
  }
  console.log(`Synced ${PERMISSIONS.length} permissions.`);

  let granted = 0;
  let revoked = 0;

  for (const roleKey of ROLE_KEYS) {
    const role = await prisma.role.findUnique({ where: { key: roleKey }, select: { id: true } });
    if (!role) {
      // Roles are created by the full seed. A missing one means this database
      // was never seeded, which is a different problem from a stale grant.
      console.warn(`Role ${roleKey} is not present; skipping. Run the full seed first.`);
      continue;
    }

    const desiredIds = (ROLE_PERMISSIONS[roleKey] ?? [])
      .map((permission) => permissionIds.get(permission))
      .filter((id): id is string => Boolean(id));

    const removed = await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: desiredIds } },
    });
    revoked += removed.count;

    for (const permissionId of desiredIds) {
      const result = await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
        select: { roleId: true },
      });
      if (result) granted += 1;
    }
  }

  console.log(`Synced ${ROLE_KEYS.length} roles: ${granted} grants in place, ${revoked} revoked.`);
}

try {
  await main();
  console.log('Authorization sync completed.');
} catch (error) {
  console.error('Authorization sync failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
