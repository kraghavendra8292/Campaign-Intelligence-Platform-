import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import { randomUUID } from 'node:crypto';
import { createApp } from '../app';
import type { GraphQLContext } from '../graphql/context/index';
import { prisma } from '../database/prisma';
import { sessionService } from '../modules/auth/session.service';
import {
  addMembership,
  cleanupFixtures,
  createTenant,
  createTenantUser,
  createUser,
  databaseAvailable,
  makePlatformAdmin,
  TEST_PASSWORD,
  type TestTenant,
  type TestUser,
} from './helpers/fixtures';
import { gql, login } from './helpers/graphqlClient';

/**
 * Adversarial tests.
 *
 * Each case models an attacker who has bypassed the frontend entirely and is
 * calling GraphQL directly with forged headers and guessed identifiers. The
 * point is not that the UI hides these actions - it is that the API refuses
 * them.
 */

const available = await databaseAvailable();

let app: Express;
let apollo: ApolloServer<GraphQLContext>;

// Tenant A and tenant B, plus an attacker who belongs only to A.
let tenantA: TestTenant;
let tenantB: TestTenant;
let adminA: TestUser;
let adminB: TestUser;
let viewerA: TestUser;
let memberB: TestUser;

beforeAll(async () => {
  if (!available) return;

  ({ app, apollo } = await createApp());

  const a = await createTenantUser('CAMPAIGN_ADMIN');
  tenantA = a.tenant;
  adminA = a.user;

  const b = await createTenantUser('CAMPAIGN_ADMIN');
  tenantB = b.tenant;
  adminB = b.user;

  viewerA = await createUser();
  await addMembership(viewerA.id, tenantA.organizationId, 'VIEWER');

  memberB = await createUser();
  await addMembership(memberB.id, tenantB.organizationId, 'CONTENT_MANAGER');
}, 120_000);

afterAll(async () => {
  if (!available) return;
  await apollo.stop();
  await cleanupFixtures();
  await prisma.$disconnect();
}, 120_000);

const USERS_QUERY = /* GraphQL */ `
  query Users {
    users(first: 50) {
      nodes {
        id
        email
      }
      totalCount
    }
  }
`;

const USER_QUERY = /* GraphQL */ `
  query User($id: ID!) {
    user(id: $id) {
      id
      email
    }
  }
`;

describe.skipIf(!available)('1. Cross-tenant read', () => {
  it('tenant A admin cannot list tenant B users even with B’s organisation header', async () => {
    const session = await login(app, adminA.email, adminA.password);

    // The attacker forges the tenant header with a real, valid organisation id.
    const result = await gql<{ users: { nodes: Array<{ id: string }> } }>(
      app,
      USERS_QUERY,
      {},
      { accessToken: session.accessToken, organizationId: tenantB.organizationId },
    );

    // Scope resolution refuses the header, so there is no active tenant.
    // Authority is then resolved for the null scope, where this user holds no
    // roles at all - so the permission check fails closed before any query
    // runs. FORBIDDEN (not NOT_FOUND or BAD_REQUEST) is also what an attacker
    // sees for a tenant that does not exist, so the response is not an oracle.
    expect(result.data?.users).toBeUndefined();
    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('scoped to its own tenant, the same call succeeds and excludes tenant B', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql<{ users: { nodes: Array<{ id: string }> } }>(
      app,
      USERS_QUERY,
      {},
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    const ids = result.data?.users.nodes.map((node) => node.id) ?? [];
    expect(ids).toContain(adminA.id);
    expect(ids).toContain(viewerA.id);
    expect(ids).not.toContain(adminB.id);
    expect(ids).not.toContain(memberB.id);
  });
});

describe.skipIf(!available)('2. Horizontal privilege escalation by id', () => {
  it('returns NOT_FOUND for a user in another tenant, not the record', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql(
      app,
      USER_QUERY,
      { id: memberB.id },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.data?.user).toBeUndefined();
    // NOT_FOUND rather than FORBIDDEN: FORBIDDEN would confirm the id exists.
    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('cannot suspend a user belonging to another tenant', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql(
      app,
      /* GraphQL */ `
        mutation Suspend($userId: ID!) {
          suspendUser(userId: $userId) {
            id
            status
          }
        }
      `,
      { userId: memberB.id },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('NOT_FOUND');

    const untouched = await prisma.user.findUniqueOrThrow({ where: { id: memberB.id } });
    expect(untouched.status).toBe('ACTIVE');
  });
});

describe.skipIf(!available)('3. Vertical privilege escalation', () => {
  it('a VIEWER cannot list users', async () => {
    const session = await login(app, viewerA.email, viewerA.password);
    expect(session.permissions).not.toContain('USER_READ');

    const result = await gql(
      app,
      USERS_QUERY,
      {},
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('a VIEWER cannot invite users', async () => {
    const session = await login(app, viewerA.email, viewerA.password);

    const result = await gql(
      app,
      /* GraphQL */ `
        mutation Create($input: CreateUserInput!) {
          createUser(input: $input) {
            id
          }
        }
      `,
      { input: { email: 'intruder@example.test', fullName: 'X', roleKey: 'VIEWER' } },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('FORBIDDEN');
  });
});

describe.skipIf(!available)('4. Role escalation', () => {
  it('a CAMPAIGN_ADMIN cannot assign SUPER_ADMIN', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql(
      app,
      /* GraphQL */ `
        mutation Assign($userId: ID!, $roleKey: String!) {
          assignRole(userId: $userId, roleKey: $roleKey) {
            id
          }
        }
      `,
      { userId: viewerA.id, roleKey: 'SUPER_ADMIN' },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('FORBIDDEN');

    const grants = await prisma.platformRoleAssignment.count({ where: { userId: viewerA.id } });
    expect(grants).toBe(0);
  });

  it('a CAMPAIGN_ADMIN cannot mint another CAMPAIGN_ADMIN (equal rank)', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql(
      app,
      /* GraphQL */ `
        mutation Assign($userId: ID!, $roleKey: String!) {
          assignRole(userId: $userId, roleKey: $roleKey) {
            id
          }
        }
      `,
      { userId: viewerA.id, roleKey: 'CAMPAIGN_ADMIN' },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('a CAMPAIGN_ADMIN CAN assign a lower-ranked role', async () => {
    const session = await login(app, adminA.email, adminA.password);
    const target = await createUser();
    await addMembership(target.id, tenantA.organizationId, 'VIEWER');

    const result = await gql(
      app,
      /* GraphQL */ `
        mutation Assign($userId: ID!, $roleKey: String!) {
          assignRole(userId: $userId, roleKey: $roleKey) {
            id
          }
        }
      `,
      { userId: target.id, roleKey: 'ANALYST' },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errors).toBeNull();

    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: tenantA.organizationId, userId: target.id },
      },
      select: { role: { select: { key: true } } },
    });
    expect(membership.role.key).toBe('ANALYST');
  });

  it('an admin cannot change their own role', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql(
      app,
      /* GraphQL */ `
        mutation Assign($userId: ID!, $roleKey: String!) {
          assignRole(userId: $userId, roleKey: $roleKey) {
            id
          }
        }
      `,
      { userId: adminA.id, roleKey: 'ANALYST' },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('FORBIDDEN');
  });
});

describe.skipIf(!available)('5. Identifier tampering', () => {
  it('a forged organisation header for a non-existent tenant yields no scope', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql(
      app,
      USERS_QUERY,
      {},
      { accessToken: session.accessToken, organizationId: randomUUID() },
    );

    // Identical to the response for a real tenant the caller cannot access,
    // so this cannot be used to discover which organisation ids exist.
    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('a malformed organisation header is ignored rather than trusted', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql(
      app,
      USERS_QUERY,
      {},
      { accessToken: session.accessToken, organizationId: "' OR 1=1 --" },
    );

    expect(result.data?.users).toBeUndefined();
  });

  it('a campaign id from another tenant does not resolve', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql<{ campaign: { id: string } }>(
      app,
      /* GraphQL */ `
        query Campaign($id: ID!) {
          campaign(id: $id) {
            id
          }
        }
      `,
      { id: tenantB.campaignId },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.data?.campaign).toBeUndefined();
    expect(result.errorCode).toBe('NOT_FOUND');
  });
});

describe.skipIf(!available)('6. Session replay', () => {
  it('a revoked session’s access token stops working immediately', async () => {
    const user = await createUser();
    await addMembership(user.id, tenantA.organizationId, 'ANALYST');
    const session = await login(app, user.email, user.password);

    const before = await gql(
      app,
      '{ me { user { id } } }',
      {},
      {
        accessToken: session.accessToken,
      },
    );
    expect((before.data as { me: unknown } | null)?.me).not.toBeNull();

    const record = await prisma.session.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });
    await sessionService.revokeSession(record.id, 'ADMIN_REVOKED');

    // Same token, still cryptographically valid and unexpired.
    const after = await gql<{ me: unknown }>(
      app,
      '{ me { user { id } } }',
      {},
      {
        accessToken: session.accessToken,
      },
    );
    expect(after.data?.me).toBeNull();
  });
});

describe.skipIf(!available)('7. Refresh token replay', () => {
  it('reusing a rotated refresh token revokes the whole family', async () => {
    const user = await createUser();
    await addMembership(user.id, tenantA.organizationId, 'ANALYST');
    const session = await login(app, user.email, user.password);

    const refreshMutation = /* GraphQL */ `
      mutation Refresh($input: RefreshTokenInput) {
        refreshToken(input: $input) {
          accessToken
          refreshToken
        }
      }
    `;

    const rotated = await gql<{ refreshToken: { refreshToken: string } }>(app, refreshMutation, {
      input: { refreshToken: session.refreshToken, tokenDelivery: 'BODY' },
    });
    const secondToken = rotated.data?.refreshToken.refreshToken;
    expect(secondToken).toBeTruthy();
    expect(secondToken).not.toBe(session.refreshToken);

    // Replay the original.
    const replay = await gql(app, refreshMutation, {
      input: { refreshToken: session.refreshToken, tokenDelivery: 'BODY' },
    });
    expect(replay.errorCode).toBe('UNAUTHENTICATED');

    // The legitimate rotated token is now dead too: the family was revoked.
    const afterReplay = await gql(app, refreshMutation, {
      input: { refreshToken: secondToken, tokenDelivery: 'BODY' },
    });
    expect(afterReplay.errorCode).toBe('UNAUTHENTICATED');

    const audit = await prisma.auditLog.findFirst({
      where: { actorUserId: user.id, action: 'AUTH_REFRESH_REPLAY_DETECTED' },
    });
    expect(audit).not.toBeNull();
  });
});

describe.skipIf(!available)('8. Password reset replay', () => {
  it('a used reset token cannot be redeemed twice', async () => {
    const user = await createUser();
    const { tokenService } = await import('../modules/auth/token.service');

    const raw = tokenService.generateOpaqueToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenService.hashOpaqueToken(raw),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const confirm = /* GraphQL */ `
      mutation Confirm($input: ConfirmPasswordResetInput!) {
        confirmPasswordReset(input: $input) {
          success
        }
      }
    `;

    const first = await gql(app, confirm, {
      input: {
        token: raw,
        newPassword: 'Brand-New-Password-1',
        confirmPassword: 'Brand-New-Password-1',
      },
    });
    expect(first.errors).toBeNull();

    const second = await gql(app, confirm, {
      input: {
        token: raw,
        newPassword: 'Another-Password-2222',
        confirmPassword: 'Another-Password-2222',
      },
    });
    expect(second.errorCode).toBe('VALIDATION_ERROR');
  });

  it('an expired reset token is rejected', async () => {
    const user = await createUser();
    const { tokenService } = await import('../modules/auth/token.service');

    const raw = tokenService.generateOpaqueToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenService.hashOpaqueToken(raw),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const result = await gql(
      app,
      /* GraphQL */ `
        mutation Confirm($input: ConfirmPasswordResetInput!) {
          confirmPasswordReset(input: $input) {
            success
          }
        }
      `,
      {
        input: {
          token: raw,
          newPassword: 'Brand-New-Password-1',
          confirmPassword: 'Brand-New-Password-1',
        },
      },
    );

    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });
});

describe.skipIf(!available)('9. Forged and expired tokens', () => {
  it('rejects a token signed with the wrong key', async () => {
    const { SignJWT } = await import('jose');
    const forged = await new SignJWT({ sid: randomUUID(), typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(adminA.id)
      .setIssuer('rk-campaign-api')
      .setAudience('rk-campaign-clients')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('an-attacker-chosen-signing-key-000000'));

    const result = await gql<{ me: unknown }>(
      app,
      '{ me { user { id } } }',
      {},
      {
        accessToken: forged,
      },
    );
    expect(result.data?.me).toBeNull();
  });

  it('rejects a well-formed but expired token', async () => {
    const { SignJWT } = await import('jose');
    const { getEnv } = await import('../config/env');

    const expired = await new SignJWT({ sid: randomUUID(), typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(adminA.id)
      .setIssuer(getEnv().JWT_ISSUER)
      .setAudience(getEnv().JWT_AUDIENCE)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(getEnv().JWT_SECRET));

    const result = await gql<{ me: unknown }>(
      app,
      '{ me { user { id } } }',
      {},
      {
        accessToken: expired,
      },
    );
    expect(result.data?.me).toBeNull();
  });

  it('rejects a token with the wrong audience', async () => {
    const { SignJWT } = await import('jose');
    const { getEnv } = await import('../config/env');

    const wrongAudience = await new SignJWT({ sid: randomUUID(), typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(adminA.id)
      .setIssuer(getEnv().JWT_ISSUER)
      .setAudience('some-other-service')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(getEnv().JWT_SECRET));

    const result = await gql<{ me: unknown }>(
      app,
      '{ me { user { id } } }',
      {},
      {
        accessToken: wrongAudience,
      },
    );
    expect(result.data?.me).toBeNull();
  });
});

describe.skipIf(!available)('10. Suspended account', () => {
  it('suspension immediately invalidates an existing session', async () => {
    const user = await createUser();
    await addMembership(user.id, tenantA.organizationId, 'ANALYST');
    const session = await login(app, user.email, user.password);

    const before = await gql<{ me: unknown }>(
      app,
      '{ me { user { id } } }',
      {},
      {
        accessToken: session.accessToken,
      },
    );
    expect(before.data?.me).not.toBeNull();

    const admin = await login(app, adminA.email, adminA.password);
    const suspend = await gql(
      app,
      /* GraphQL */ `
        mutation Suspend($userId: ID!) {
          suspendUser(userId: $userId) {
            id
            status
          }
        }
      `,
      { userId: user.id },
      { accessToken: admin.accessToken, organizationId: tenantA.organizationId },
    );
    expect(suspend.errors).toBeNull();

    const after = await gql<{ me: unknown }>(
      app,
      '{ me { user { id } } }',
      {},
      {
        accessToken: session.accessToken,
      },
    );
    expect(after.data?.me).toBeNull();
  });

  it('a suspended account cannot sign in again', async () => {
    const user = await createUser({ status: 'SUSPENDED' });

    const result = await gql(
      app,
      /* GraphQL */ `
        mutation Login($input: LoginInput!) {
          login(input: $input) {
            accessToken
          }
        }
      `,
      { input: { email: user.email, password: TEST_PASSWORD, tokenDelivery: 'BODY' } },
    );

    expect(result.errorCode).toBe('UNAUTHENTICATED');
    // Same wording as a wrong password: status must not be discoverable.
    expect(result.errors?.[0]?.message).toBe('Invalid email or password.');
  });
});

describe.skipIf(!available)('11. Unauthenticated GraphQL access', () => {
  it('rejects protected queries outright', async () => {
    for (const query of [
      USERS_QUERY,
      '{ auditLogs(first: 5) { totalCount } }',
      '{ organization { id } }',
    ]) {
      const result = await gql(app, query);
      expect(result.errorCode).toBe('UNAUTHENTICATED');
    }
  });

  it('rejects protected mutations outright', async () => {
    const result = await gql(
      app,
      /* GraphQL */ `
        mutation Suspend($userId: ID!) {
          suspendUser(userId: $userId) {
            id
          }
        }
      `,
      { userId: viewerA.id },
    );

    expect(result.errorCode).toBe('UNAUTHENTICATED');
  });

  it('still serves the public health query', async () => {
    const result = await gql<{ health: string }>(app, '{ health }');
    expect(result.data?.health).toBe('OK');
  });
});

describe.skipIf(!available)('Cross-tenant audit isolation', () => {
  it('tenant A cannot read tenant B audit records', async () => {
    // Generate an event in tenant B.
    await login(app, adminB.email, adminB.password);

    const session = await login(app, adminA.email, adminA.password);
    const result = await gql<{ auditLogs: { nodes: Array<{ organizationId: string | null }> } }>(
      app,
      /* GraphQL */ `
        query Audit {
          auditLogs(first: 100) {
            nodes {
              id
              organizationId
              action
            }
          }
        }
      `,
      {},
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    const organizationIds = result.data?.auditLogs.nodes.map((n) => n.organizationId) ?? [];
    expect(organizationIds.every((id) => id === tenantA.organizationId)).toBe(true);
    expect(organizationIds).not.toContain(tenantB.organizationId);
  });
});

describe.skipIf(!available)('Platform admin scope', () => {
  it('a super admin may act across tenants', async () => {
    const superUser = await createUser();
    await makePlatformAdmin(superUser.id);
    const session = await login(app, superUser.email, superUser.password);

    // No membership in tenant B, yet the header is accepted.
    const result = await gql<{ users: { nodes: Array<{ id: string }> } }>(
      app,
      USERS_QUERY,
      {},
      { accessToken: session.accessToken, organizationId: tenantB.organizationId },
    );

    const ids = result.data?.users.nodes.map((n) => n.id) ?? [];
    expect(ids).toContain(adminB.id);
  });

  it('only a platform admin can create an organisation', async () => {
    const admin = await login(app, adminA.email, adminA.password);
    const denied = await gql(
      app,
      /* GraphQL */ `
        mutation Create($name: String!) {
          createOrganization(name: $name) {
            id
          }
        }
      `,
      { name: 'Rogue Tenant' },
      { accessToken: admin.accessToken, organizationId: tenantA.organizationId },
    );

    expect(denied.errorCode).toBe('FORBIDDEN');
  });
});

describe.skipIf(!available)('Tenant isolation of an unrelated third party', () => {
  it('a user with no membership at all gets no tenant scope', async () => {
    const orphan = await createUser();
    const session = await login(app, orphan.email, orphan.password);

    const result = await gql(
      app,
      USERS_QUERY,
      {},
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.data?.users).toBeUndefined();
    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('a brand-new empty tenant leaks nothing from its neighbours', async () => {
    const fresh = await createTenant();
    const owner = await createUser();
    await addMembership(owner.id, fresh.organizationId, 'CAMPAIGN_ADMIN');

    const session = await login(app, owner.email, owner.password);
    const result = await gql<{ users: { nodes: Array<{ id: string }>; totalCount: number } }>(
      app,
      USERS_QUERY,
      {},
      { accessToken: session.accessToken, organizationId: fresh.organizationId },
    );

    expect(result.data?.users.totalCount).toBe(1);
    expect(result.data?.users.nodes[0]?.id).toBe(owner.id);
  });
});
