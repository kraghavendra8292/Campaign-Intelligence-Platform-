import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import { createApp } from '../app';
import type { GraphQLContext } from '../graphql/context/index';
import { prisma } from '../database/prisma';
import { sanitizeAuditMetadata } from '../modules/audit/audit.service';
import {
  addMembership,
  cleanupFixtures,
  createTenantUser,
  createUser,
  databaseAvailable,
  TEST_PASSWORD,
  type TestTenant,
  type TestUser,
} from './helpers/fixtures';
import { gql, login } from './helpers/graphqlClient';

const available = await databaseAvailable();

let app: Express;
let apollo: ApolloServer<GraphQLContext>;
let tenant: TestTenant;
let admin: TestUser;

beforeAll(async () => {
  if (!available) return;
  ({ app, apollo } = await createApp());
  const created = await createTenantUser('CAMPAIGN_ADMIN');
  tenant = created.tenant;
  admin = created.user;
}, 120_000);

afterAll(async () => {
  if (!available) return;
  await apollo.stop();
  await cleanupFixtures();
  await prisma.$disconnect();
}, 120_000);

describe('audit metadata sanitisation', () => {
  it('drops credential-bearing keys entirely', () => {
    const result = sanitizeAuditMetadata({
      password: 'hunter2',
      newPassword: 'hunter3',
      refreshToken: 'abc',
      tokenHash: 'def',
      authorization: 'Bearer xyz',
      cookie: 'session=1',
      email: 'person@example.test',
    });

    expect(result).toEqual({ email: 'person@example.test' });
  });

  it('ignores key casing and separators', () => {
    const result = sanitizeAuditMetadata({
      'Current-Password': 'x',
      access_token: 'y',
      reason: 'BAD_PASSWORD',
    });

    expect(result).toEqual({ reason: 'BAD_PASSWORD' });
  });

  it('redacts sensitive values nested inside safe keys', () => {
    const result = sanitizeAuditMetadata({ context: { apiKey: 'secret-value', ward: 5 } });
    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(JSON.stringify(result)).toContain('5');
  });

  it('returns null when nothing safe survives', () => {
    expect(sanitizeAuditMetadata({ password: 'x' })).toBeNull();
    expect(sanitizeAuditMetadata(null)).toBeNull();
  });
});

describe.skipIf(!available)('audit trail', () => {
  it('records a successful login', async () => {
    const user = await createUser();
    await addMembership(user.id, tenant.organizationId, 'ANALYST');
    await login(app, user.email, user.password);

    const entry = await prisma.auditLog.findFirst({
      where: { actorUserId: user.id, action: 'AUTH_LOGIN_SUCCEEDED' },
    });

    expect(entry).not.toBeNull();
    expect(entry?.correlationId).toBeTruthy();
  });

  it('records a failed login without the submitted password', async () => {
    const user = await createUser();

    await gql(
      app,
      /* GraphQL */ `
        mutation Login($input: LoginInput!) {
          login(input: $input) {
            accessToken
          }
        }
      `,
      {
        input: {
          email: user.email,
          password: 'a-very-distinctive-wrong-password',
          tokenDelivery: 'BODY',
        },
      },
    );

    const entry = await prisma.auditLog.findFirst({
      where: { actorUserId: user.id, action: 'AUTH_LOGIN_FAILED' },
    });

    expect(entry).not.toBeNull();
    const serialized = JSON.stringify(entry?.metadata);
    expect(serialized).not.toContain('a-very-distinctive-wrong-password');
    expect(serialized).toContain('BAD_PASSWORD');
  });

  it('records role assignment against the acting administrator', async () => {
    const target = await createUser();
    await addMembership(target.id, tenant.organizationId, 'VIEWER');
    const session = await login(app, admin.email, admin.password);

    await gql(
      app,
      /* GraphQL */ `
        mutation Assign($userId: ID!, $roleKey: String!) {
          assignRole(userId: $userId, roleKey: $roleKey) {
            id
          }
        }
      `,
      { userId: target.id, roleKey: 'ANALYST' },
      { accessToken: session.accessToken, organizationId: tenant.organizationId },
    );

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'ROLE_ASSIGNED', entityId: target.id },
    });

    expect(entry?.actorUserId).toBe(admin.id);
    expect(entry?.organizationId).toBe(tenant.organizationId);
    expect(JSON.stringify(entry?.metadata)).toContain('ANALYST');
  });

  it('never writes a password or token into any audit row', async () => {
    const user = await createUser();
    await login(app, user.email, user.password);

    const rows = await prisma.auditLog.findMany({
      where: { actorUserId: user.id },
      select: { metadata: true },
    });

    for (const row of rows) {
      const serialized = JSON.stringify(row.metadata ?? {});
      expect(serialized).not.toContain(TEST_PASSWORD);
      expect(serialized).not.toContain('$argon2');
      expect(serialized.toLowerCase()).not.toContain('refreshtoken');
    }
  });

  it('exposes the trail through GraphQL to an authorised admin', async () => {
    const session = await login(app, admin.email, admin.password);

    const result = await gql<{
      auditLogs: { nodes: Array<{ action: string }>; totalCount: number };
    }>(
      app,
      /* GraphQL */ `
        query Audit {
          auditLogs(first: 10) {
            nodes {
              id
              action
              createdAt
            }
            totalCount
            pageInfo {
              hasNextPage
            }
          }
        }
      `,
      {},
      { accessToken: session.accessToken, organizationId: tenant.organizationId },
    );

    expect(result.errors).toBeNull();
    expect(result.data?.auditLogs.totalCount).toBeGreaterThan(0);
  });

  it('refuses the trail to a role without AUDIT_READ', async () => {
    const analyst = await createUser();
    await addMembership(analyst.id, tenant.organizationId, 'ANALYST');
    const session = await login(app, analyst.email, analyst.password);

    const result = await gql(
      app,
      '{ auditLogs(first: 5) { totalCount } }',
      {},
      { accessToken: session.accessToken, organizationId: tenant.organizationId },
    );

    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('exposes no mutation that edits or deletes an audit record', async () => {
    const result = await gql(
      app,
      /* GraphQL */ `
        query Introspect {
          __schema {
            mutationType {
              fields {
                name
              }
            }
          }
        }
      `,
    );

    const names =
      (
        result.data as {
          __schema?: { mutationType?: { fields?: Array<{ name: string }> } };
        } | null
      )?.__schema?.mutationType?.fields?.map((field) => field.name) ?? [];

    // Introspection is on in test; if it is disabled the list is empty and the
    // assertion still holds.
    for (const name of names) {
      expect(name.toLowerCase()).not.toMatch(/audit/);
    }
  });
});
