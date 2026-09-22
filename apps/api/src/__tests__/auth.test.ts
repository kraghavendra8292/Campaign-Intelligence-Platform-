import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import { createApp } from '../app';
import type { GraphQLContext } from '../graphql/context/index';
import { prisma } from '../database/prisma';
import { passwordService } from '../modules/auth/password.service';
import { tokenService } from '../modules/auth/token.service';
import {
  addMembership,
  cleanupFixtures,
  createTenant,
  createUser,
  databaseAvailable,
  TEST_PASSWORD,
  type TestTenant,
} from './helpers/fixtures';
import { gql, login } from './helpers/graphqlClient';

/** End-to-end authentication behaviour, driven through the real HTTP stack. */

const available = await databaseAvailable();

let app: Express;
let apollo: ApolloServer<GraphQLContext>;
let tenant: TestTenant;

beforeAll(async () => {
  if (!available) return;
  ({ app, apollo } = await createApp());
  tenant = await createTenant();
}, 120_000);

afterAll(async () => {
  if (!available) return;
  await apollo.stop();
  await cleanupFixtures();
  await prisma.$disconnect();
}, 120_000);

const LOGIN = /* GraphQL */ `
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      expiresIn
      viewer {
        user {
          id
          email
          status
        }
        roles
        permissions
      }
    }
  }
`;

describe.skipIf(!available)('login', () => {
  it('authenticates a valid account and returns resolved authority', async () => {
    const user = await createUser();
    await addMembership(user.id, tenant.organizationId, 'ANALYST');

    const result = await gql<{
      login: { accessToken: string; expiresIn: number; viewer: { roles: string[] } };
    }>(app, LOGIN, {
      input: { email: user.email, password: TEST_PASSWORD, tokenDelivery: 'BODY' },
    });

    expect(result.errors).toBeNull();
    expect(result.data?.login.accessToken).toBeTruthy();
    expect(result.data?.login.expiresIn).toBeGreaterThan(0);
    expect(result.data?.login.viewer.roles).toEqual(['ANALYST']);
  });

  it('normalises the email, so case and padding do not matter', async () => {
    const user = await createUser();

    const result = await gql(app, LOGIN, {
      input: {
        email: `  ${user.email.toUpperCase()}  `,
        password: TEST_PASSWORD,
        tokenDelivery: 'BODY',
      },
    });

    expect(result.errors).toBeNull();
  });

  it('rejects a wrong password with the generic message', async () => {
    const user = await createUser();

    const result = await gql(app, LOGIN, {
      input: { email: user.email, password: 'not-the-password', tokenDelivery: 'BODY' },
    });

    expect(result.errorCode).toBe('UNAUTHENTICATED');
    expect(result.errors?.[0]?.message).toBe('Invalid email or password.');
  });

  it('returns the identical message for an unknown account', async () => {
    const result = await gql(app, LOGIN, {
      input: {
        email: 'definitely-not-registered@example.test',
        password: 'irrelevant-password',
        tokenDelivery: 'BODY',
      },
    });

    // Byte-identical to the wrong-password case: no account enumeration.
    expect(result.errorCode).toBe('UNAUTHENTICATED');
    expect(result.errors?.[0]?.message).toBe('Invalid email or password.');
  });

  it('rejects a DISABLED account', async () => {
    const user = await createUser({ status: 'DISABLED' });

    const result = await gql(app, LOGIN, {
      input: { email: user.email, password: TEST_PASSWORD, tokenDelivery: 'BODY' },
    });

    expect(result.errorCode).toBe('UNAUTHENTICATED');
  });

  it('rejects an INVITED account that has no password yet', async () => {
    const invited = await prisma.user.create({
      data: { email: `invited-${Date.now()}@example.test`, fullName: 'Invited', status: 'INVITED' },
      select: { id: true, email: true },
    });

    const result = await gql(app, LOGIN, {
      input: { email: invited.email, password: 'anything-at-all-1234', tokenDelivery: 'BODY' },
    });

    expect(result.errorCode).toBe('UNAUTHENTICATED');
    await prisma.user.delete({ where: { id: invited.id } });
  });

  it('never returns a password hash anywhere in the payload', async () => {
    const user = await createUser();
    const result = await gql(app, LOGIN, {
      input: { email: user.email, password: TEST_PASSWORD, tokenDelivery: 'BODY' },
    });

    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain('$argon2');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain(TEST_PASSWORD);
  });

  it('sets an HttpOnly cookie and withholds the token from the body in COOKIE mode', async () => {
    const user = await createUser();

    const result = await gql<{ login: { refreshToken: string | null } }>(app, LOGIN, {
      input: { email: user.email, password: TEST_PASSWORD, tokenDelivery: 'COOKIE' },
    });

    expect(result.data?.login.refreshToken).toBeNull();

    const cookie = result.setCookie.find((value) => value.startsWith('rk_refresh_token='));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/graphql');
  });
});

describe.skipIf(!available)('logout', () => {
  it('revokes the session so its access token stops working', async () => {
    const user = await createUser();
    const session = await login(app, user.email, user.password);

    const out = await gql(
      app,
      'mutation { logout { success } }',
      {},
      {
        accessToken: session.accessToken,
      },
    );
    expect(out.errors).toBeNull();

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

  it('requires authentication', async () => {
    const result = await gql(app, 'mutation { logout { success } }');
    expect(result.errorCode).toBe('UNAUTHENTICATED');
  });
});

describe.skipIf(!available)('token refresh', () => {
  it('issues a working access token and a new refresh token', async () => {
    const user = await createUser();
    const session = await login(app, user.email, user.password);

    const result = await gql<{
      refreshToken: { accessToken: string; refreshToken: string };
    }>(
      app,
      /* GraphQL */ `
        mutation Refresh($input: RefreshTokenInput) {
          refreshToken(input: $input) {
            accessToken
            refreshToken
          }
        }
      `,
      { input: { refreshToken: session.refreshToken, tokenDelivery: 'BODY' } },
    );

    expect(result.errors).toBeNull();
    expect(result.data?.refreshToken.refreshToken).not.toBe(session.refreshToken);

    const me = await gql<{ me: { user: { id: string } } }>(
      app,
      '{ me { user { id } } }',
      {},
      {
        accessToken: result.data?.refreshToken.accessToken,
      },
    );
    expect(me.data?.me.user.id).toBe(user.id);
  });

  it('rejects an unknown refresh token', async () => {
    const result = await gql(
      app,
      /* GraphQL */ `
        mutation Refresh($input: RefreshTokenInput) {
          refreshToken(input: $input) {
            accessToken
          }
        }
      `,
      { input: { refreshToken: tokenService.generateOpaqueToken(), tokenDelivery: 'BODY' } },
    );

    expect(result.errorCode).toBe('UNAUTHENTICATED');
  });
});

describe.skipIf(!available)('password change', () => {
  const CHANGE = /* GraphQL */ `
    mutation Change($input: ChangePasswordInput!) {
      changePassword(input: $input) {
        success
      }
    }
  `;

  it('changes the password and keeps the current session alive', async () => {
    const user = await createUser();
    const session = await login(app, user.email, user.password);

    const result = await gql(
      app,
      CHANGE,
      {
        input: {
          currentPassword: TEST_PASSWORD,
          newPassword: 'A-Completely-New-Password-9',
          confirmPassword: 'A-Completely-New-Password-9',
        },
      },
      { accessToken: session.accessToken },
    );

    expect(result.errors).toBeNull();

    const old = await gql(app, LOGIN, {
      input: { email: user.email, password: TEST_PASSWORD, tokenDelivery: 'BODY' },
    });
    expect(old.errorCode).toBe('UNAUTHENTICATED');

    const fresh = await gql(app, LOGIN, {
      input: { email: user.email, password: 'A-Completely-New-Password-9', tokenDelivery: 'BODY' },
    });
    expect(fresh.errors).toBeNull();
  });

  it('revokes other sessions but not the one performing the change', async () => {
    const user = await createUser();
    const keep = await login(app, user.email, user.password);
    const other = await login(app, user.email, user.password);

    await gql(
      app,
      CHANGE,
      {
        input: {
          currentPassword: TEST_PASSWORD,
          newPassword: 'Yet-Another-Password-77',
          confirmPassword: 'Yet-Another-Password-77',
        },
      },
      { accessToken: keep.accessToken },
    );

    const stillValid = await gql<{ me: unknown }>(
      app,
      '{ me { user { id } } }',
      {},
      {
        accessToken: keep.accessToken,
      },
    );
    expect(stillValid.data?.me).not.toBeNull();

    const revoked = await gql<{ me: unknown }>(
      app,
      '{ me { user { id } } }',
      {},
      {
        accessToken: other.accessToken,
      },
    );
    expect(revoked.data?.me).toBeNull();
  });

  it('rejects a wrong current password', async () => {
    const user = await createUser();
    const session = await login(app, user.email, user.password);

    const result = await gql(
      app,
      CHANGE,
      {
        input: {
          currentPassword: 'wrong-current-password',
          newPassword: 'Some-New-Password-1234',
          confirmPassword: 'Some-New-Password-1234',
        },
      },
      { accessToken: session.accessToken },
    );

    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects mismatched confirmation', async () => {
    const user = await createUser();
    const session = await login(app, user.email, user.password);

    const result = await gql(
      app,
      CHANGE,
      {
        input: {
          currentPassword: TEST_PASSWORD,
          newPassword: 'Some-New-Password-1234',
          confirmPassword: 'Different-Password-5678',
        },
      },
      { accessToken: session.accessToken },
    );

    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects a password that violates the policy', async () => {
    const user = await createUser();
    const session = await login(app, user.email, user.password);

    const result = await gql(
      app,
      CHANGE,
      { input: { currentPassword: TEST_PASSWORD, newPassword: 'short', confirmPassword: 'short' } },
      { accessToken: session.accessToken },
    );

    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });
});

describe.skipIf(!available)('password reset', () => {
  it('returns success for an unregistered address, revealing nothing', async () => {
    const result = await gql<{ requestPasswordReset: { success: boolean } }>(
      app,
      /* GraphQL */ `
        mutation Request($email: String!) {
          requestPasswordReset(email: $email) {
            success
          }
        }
      `,
      { email: 'nobody-here@example.test' },
    );

    expect(result.errors).toBeNull();
    expect(result.data?.requestPasswordReset.success).toBe(true);
  });

  it('completes a reset, activates the account and revokes every session', async () => {
    const user = await createUser();
    const session = await login(app, user.email, user.password);

    const raw = tokenService.generateOpaqueToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenService.hashOpaqueToken(raw),
        expiresAt: new Date(Date.now() + 600_000),
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
          newPassword: 'Reset-Password-Value-1',
          confirmPassword: 'Reset-Password-Value-1',
        },
      },
    );

    expect(result.errors).toBeNull();

    // Unlike a password change, a reset ends every session including this one.
    const after = await gql<{ me: unknown }>(
      app,
      '{ me { user { id } } }',
      {},
      {
        accessToken: session.accessToken,
      },
    );
    expect(after.data?.me).toBeNull();

    const fresh = await gql(app, LOGIN, {
      input: { email: user.email, password: 'Reset-Password-Value-1', tokenDelivery: 'BODY' },
    });
    expect(fresh.errors).toBeNull();
  });

  it('stores only a digest, never the reset token itself', async () => {
    const user = await createUser();
    const raw = tokenService.generateOpaqueToken();

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenService.hashOpaqueToken(raw),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    const stored = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id },
    });

    expect(stored.tokenHash).not.toBe(raw);
    expect(stored.tokenHash).toHaveLength(64);
  });
});

describe.skipIf(!available)('sessions', () => {
  it('lists active sessions and flags the current one', async () => {
    const user = await createUser();
    const first = await login(app, user.email, user.password);
    await login(app, user.email, user.password);

    const result = await gql<{ mySessions: Array<{ id: string; current: boolean }> }>(
      app,
      '{ mySessions { id current ipAddress } }',
      {},
      { accessToken: first.accessToken },
    );

    expect(result.data?.mySessions.length).toBeGreaterThanOrEqual(2);
    expect(result.data?.mySessions.filter((s) => s.current)).toHaveLength(1);
  });

  it('never exposes the refresh token digest', async () => {
    const user = await createUser();
    const session = await login(app, user.email, user.password);

    const result = await gql(
      app,
      '{ mySessions { id } }',
      {},
      {
        accessToken: session.accessToken,
      },
    );

    expect(JSON.stringify(result.data)).not.toContain(session.refreshToken);
  });
});

describe('password hashing', () => {
  it('produces an Argon2id digest that verifies', async () => {
    const digest = await passwordService.hashPassword('a-reasonable-password');

    expect(digest.startsWith('$argon2id$')).toBe(true);
    expect(await passwordService.verifyPassword(digest, 'a-reasonable-password')).toBe(true);
    expect(await passwordService.verifyPassword(digest, 'a-reasonable-passwore')).toBe(false);
  });

  it('salts, so identical passwords yield different digests', async () => {
    const [first, second] = await Promise.all([
      passwordService.hashPassword('identical-password'),
      passwordService.hashPassword('identical-password'),
    ]);

    expect(first).not.toBe(second);
  });

  it('returns false rather than throwing on a malformed digest', async () => {
    expect(await passwordService.verifyPassword('not-a-hash', 'whatever')).toBe(false);
  });
});

describe('opaque tokens', () => {
  it('are unpredictable and stored as a SHA-256 digest', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => tokenService.generateOpaqueToken()));
    expect(tokens.size).toBe(200);

    const token = tokenService.generateOpaqueToken();
    const digest = tokenService.hashOpaqueToken(token);
    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(token);
    expect(tokenService.hashOpaqueToken(token)).toBe(digest);
  });
});
