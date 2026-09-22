import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../database/prisma';
import { healthRepository } from '../modules/health/health.repository';

/**
 * Database connectivity test.
 *
 * Requires a reachable PostgreSQL (`npm run db:up`). When the database is not
 * running the suite is skipped rather than failed, so a developer can run the
 * unit tests before provisioning infrastructure. CI always starts PostgreSQL,
 * so these assertions do execute there.
 */
const databaseReachable = await probeDatabase();

async function probeDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('database connectivity', () => {
  it('executes a round trip against PostgreSQL', async () => {
    const rows = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 AS result`;
    expect(rows[0]?.result).toBe(1);
  });

  it('reports the database as healthy through the repository probe', async () => {
    const health = await healthRepository.probeDatabase();

    expect(health.name).toBe('database');
    expect(health.status).toBe('OK');
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('exposes the tenancy and identity tables', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const names = tables.map((row) => row.table_name);

    expect(names).toContain('organizations');
    expect(names).toContain('users');
    expect(names).toContain('roles');
    // Phase 2 renamed `memberships` to `organization_memberships` and added
    // the campaign, permission, session and audit tables.
    expect(names).toContain('organization_memberships');
    expect(names).toContain('campaigns');
    expect(names).toContain('permissions');
    expect(names).toContain('role_permissions');
    expect(names).toContain('sessions');
    expect(names).toContain('audit_logs');
  });

  it('can count tenants through the Prisma client', async () => {
    await expect(prisma.organization.count()).resolves.toBeTypeOf('number');
  });
});

describe.skipIf(databaseReachable)('database connectivity (skipped)', () => {
  it('reports why the database suite did not run', () => {
    expect(databaseReachable).toBe(false);
  });
});
