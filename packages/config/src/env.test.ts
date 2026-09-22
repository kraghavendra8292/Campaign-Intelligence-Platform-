import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EnvValidationError,
  booleanSchema,
  csvSchema,
  httpUrlSchema,
  parseEnv,
  portSchema,
  postgresUrlSchema,
} from './env';

const schema = z.object({
  DATABASE_URL: postgresUrlSchema,
  PORT: portSchema(4000),
  DEBUG: booleanSchema(false),
  CORS_ORIGINS: csvSchema(['http://localhost:5173']),
});

describe('parseEnv', () => {
  it('applies defaults and coerces types', () => {
    const env = parseEnv('test-app', schema, {
      DATABASE_URL: 'postgresql://user:pw@localhost:5432/db',
    });

    expect(env.PORT).toBe(4000);
    expect(env.DEBUG).toBe(false);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('coerces string ports and boolean flags', () => {
    const env = parseEnv('test-app', schema, {
      DATABASE_URL: 'postgres://user:pw@localhost:5432/db',
      PORT: '8080',
      DEBUG: 'yes',
      CORS_ORIGINS: 'http://a.test, http://b.test,',
    });

    expect(env.PORT).toBe(8080);
    expect(env.DEBUG).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('throws a listing of every problem when configuration is invalid', () => {
    expect(() => parseEnv('test-app', schema, { PORT: 'not-a-port' })).toThrow(EnvValidationError);

    try {
      parseEnv('test-app', schema, { DATABASE_URL: 'mysql://nope', PORT: '99999' });
    } catch (error) {
      const envError = error as EnvValidationError;
      // Every offending variable is reported in one pass; a single variable may
      // contribute more than one issue (wrong scheme *and* missing TLS).
      expect(envError.issues.length).toBeGreaterThanOrEqual(2);
      expect(envError.message).toContain('DATABASE_URL');
      expect(envError.message).toContain('PORT');
    }
  });

  it('never echoes the offending value back in the message', () => {
    try {
      parseEnv('test-app', schema, { DATABASE_URL: 'mysql://super-secret-password@host' });
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret-password');
    }
  });
});

describe('postgresUrlSchema', () => {
  it('accepts a local connection string without TLS', () => {
    expect(
      postgresUrlSchema.safeParse('postgresql://rk_app:pw@localhost:55432/rk?schema=public')
        .success,
    ).toBe(true);
    expect(postgresUrlSchema.safeParse('postgres://rk_app:pw@127.0.0.1:5432/rk').success).toBe(
      true,
    );
  });

  it('accepts the docker-compose service host without TLS', () => {
    expect(postgresUrlSchema.safeParse('postgresql://rk_app:pw@postgres:5432/rk').success).toBe(
      true,
    );
  });

  it('accepts a Neon connection string that requires TLS', () => {
    const neon =
      'postgresql://u:p@ep-demo-123456-pooler.us-east-2.aws.neon.tech/rk?sslmode=verify-full&channel_binding=require';
    expect(postgresUrlSchema.safeParse(neon).success).toBe(true);
  });

  it('rejects a remote connection string with no sslmode', () => {
    const result = postgresUrlSchema.safeParse(
      'postgresql://u:p@ep-demo-123456-pooler.us-east-2.aws.neon.tech/rk',
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('sslmode');
  });

  it('rejects a non-PostgreSQL scheme', () => {
    expect(postgresUrlSchema.safeParse('mysql://u:p@host/db').success).toBe(false);
  });

  it('rejects an unparseable connection string', () => {
    expect(postgresUrlSchema.safeParse('postgresql://').success).toBe(false);
  });
});

describe('httpUrlSchema', () => {
  it('accepts absolute http(s) urls only', () => {
    expect(httpUrlSchema.safeParse('http://localhost:5173').success).toBe(true);
    expect(httpUrlSchema.safeParse('https://app.example.com').success).toBe(true);
    expect(httpUrlSchema.safeParse('/relative').success).toBe(false);
    expect(httpUrlSchema.safeParse('ftp://example.com').success).toBe(false);
  });
});
