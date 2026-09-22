import { describe, expect, it } from 'vitest';
import {
  isPooledConnectionString,
  requireDirectDatabaseUrl,
  resolveDirectDatabaseUrl,
  resolveRuntimeDatabaseUrl,
} from '../config/databaseUrl';

const POOLED =
  'postgresql://u:p@ep-demo-123456-pooler.us-east-2.aws.neon.tech/rk?sslmode=verify-full';
const DIRECT = 'postgresql://u:p@ep-demo-123456.us-east-2.aws.neon.tech/rk?sslmode=verify-full';
const LOCAL = 'postgresql://rk_app:pw@localhost:55432/rk_campaign?schema=public';

describe('runtime connection selection', () => {
  it('uses DATABASE_URL for application queries', () => {
    expect(resolveRuntimeDatabaseUrl({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT })).toBe(
      POOLED,
    );
  });
});

describe('migration connection selection', () => {
  it('prefers the direct endpoint so Prisma Migrate does not run through PgBouncer', () => {
    expect(resolveDirectDatabaseUrl({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT })).toBe(
      DIRECT,
    );
  });

  it('falls back to DATABASE_URL when there is no pooled/direct split', () => {
    expect(resolveDirectDatabaseUrl({ DATABASE_URL: LOCAL })).toBe(LOCAL);
  });

  it('treats a blank variable as absent', () => {
    expect(resolveDirectDatabaseUrl({ DATABASE_URL: LOCAL, DATABASE_URL_UNPOOLED: '   ' })).toBe(
      LOCAL,
    );
  });

  it('trims surrounding whitespace from a pasted connection string', () => {
    expect(resolveDirectDatabaseUrl({ DATABASE_URL: `  ${LOCAL}  ` })).toBe(LOCAL);
  });
});

describe('requireDirectDatabaseUrl', () => {
  it('throws actionable guidance when nothing is configured', () => {
    expect(() => requireDirectDatabaseUrl({})).toThrow(/DATABASE_URL is not set/);
    expect(() => requireDirectDatabaseUrl({})).toThrow(/DATABASE_URL_UNPOOLED/);
  });

  it('never echoes the connection string in its error', () => {
    try {
      requireDirectDatabaseUrl({ DATABASE_URL: '' });
    } catch (error) {
      expect((error as Error).message).not.toContain('postgresql://');
    }
  });
});

describe('isPooledConnectionString', () => {
  it('recognises the Neon pooled endpoint', () => {
    expect(isPooledConnectionString(POOLED)).toBe(true);
    expect(isPooledConnectionString(DIRECT)).toBe(false);
    expect(isPooledConnectionString(LOCAL)).toBe(false);
  });

  it('does not throw on an unparseable value', () => {
    expect(isPooledConnectionString('not a url')).toBe(false);
  });
});
