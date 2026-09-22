import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import request from 'supertest';
import { buildSchema, parse, validate } from 'graphql';
import { GRAPHQL_PATH, HEALTH_PATH, HEALTH_DB_PATH, READY_PATH } from '@rk/config';
import { SENSITIVE_KEY_PATTERNS, redactSensitive } from '@rk/utils';
import { createApp } from '../app';
import type { GraphQLContext } from '../graphql/context/index';
import { costLimit, depthLimit } from '../graphql/validation/queryLimits';
import { databaseAvailable } from './helpers/fixtures';

/**
 * Phase 10: production hardening.
 *
 * These tests are about the properties an operator relies on when the system is
 * under real load or under attack, rather than about any feature:
 *
 *  - one unauthenticated request must not be able to ask for unbounded work;
 *  - a probe must be able to tell "process alive" from "dependencies ready";
 *  - an error reaching a client must not carry a stack trace, a SQL fragment or
 *    a file path;
 *  - a log line must not carry a credential;
 *  - the schema must not be enumerable when introspection is off.
 */

const available = await databaseAvailable();

let app: Express;
let apollo: ApolloServer<GraphQLContext>;

beforeAll(async () => {
  if (!available) return;
  const created = await createApp();
  app = created.app;
  apollo = created.apollo;
});

afterAll(async () => {
  if (!available) return;
  await apollo?.stop();
});

// ---------------------------------------------------------------------------
// Query limits. Pure validation - no server, no database.
// ---------------------------------------------------------------------------

/**
 * A placeholder schema, built from the SAME `graphql` module this file imports.
 *
 * `validate()` demands a schema, but these rules never consult one - they walk
 * the document's AST and nothing else. Passing the application schema here fails
 * outright: it is constructed by `@graphql-tools`, which resolves its own copy
 * of `graphql`, and graphql refuses a schema instance from another realm.
 *
 * Using a stub keeps the arithmetic under test honest anyway. With only these
 * rules supplied, `validate` runs no field-existence checks, so the field names
 * below are arbitrary and the assertions are about depth and cost alone. The
 * real schema is exercised over HTTP further down, which is where the wiring
 * rather than the arithmetic matters.
 */
const STUB_SCHEMA = buildSchema('type Query { placeholder: String }');

function validateWith(rules: ReturnType<typeof depthLimit>[], document: string): string[] {
  return validate(STUB_SCHEMA, parse(document), rules).map((error) => error.message);
}

/** Builds `a { a { a { ... } } }` to a requested nesting depth. */
function nest(depth: number): string {
  let inner = 'id';
  for (let level = 0; level < depth; level += 1) {
    inner = `evidence { ${inner} }`;
  }
  return `query { publicWork(slug: "x") { ${inner} } }`;
}

describe('GraphQL query limits', () => {
  it('admits an ordinary public query', () => {
    const errors = validateWith(
      [depthLimit(12), costLimit(5000)],
      `query {
        publicWorks(filter: { first: 12 }) {
          nodes { id slug title verification workStatus coverImage { id altText } }
          totalCount
        }
      }`,
    );
    expect(errors).toEqual([]);
  });

  it('rejects a document nested past the depth limit', () => {
    const errors = validateWith([depthLimit(5)], nest(20));
    expect(errors.join(' ')).toMatch(/nested too deeply/i);
  });

  it('counts depth through fragment spreads', () => {
    // The limit is worthless if spreading a fragment launders the nesting.
    const document = `query { publicWork(slug: "x") { ...A } }
       fragment A on PublicWorkDetail { evidence { ...B } }
       fragment B on PublicWorkEvidence { id title description }`;

    // Three levels once the spreads are followed: publicWork > evidence > id.
    // A rule that stopped at the spread would measure one and admit it.
    expect(validateWith([depthLimit(3)], document)).toEqual([]);
    expect(validateWith([depthLimit(2)], document).join(' ')).toMatch(/3 levels/);
  });

  it('does not hang on a cyclic fragment', () => {
    // Invalid per spec and reported by NoFragmentCycles, but every rule sees the
    // same document, so this one must not recurse forever before that runs.
    const errors = validateWith(
      [depthLimit(5)],
      `query { publicWork(slug: "x") { ...A } }
       fragment A on PublicWorkDetail { evidence { ...B } }
       fragment B on PublicWorkEvidence { ...B }`,
    );
    expect(Array.isArray(errors)).toBe(true);
  });

  it('rejects an expensive query even when it is shallow', () => {
    const errors = validateWith(
      [costLimit(50)],
      `query {
        publicWorks(filter: { first: 100 }) {
          nodes { id slug title shortDescription category area verification }
        }
      }`,
    );
    expect(errors.join(' ')).toMatch(/too expensive/i);
  });

  it('charges a variable page size rather than treating it as one row', () => {
    // Otherwise `first: $n` is a trivial way around the cost limit.
    const errors = validateWith(
      [costLimit(10)],
      `query Q($n: Int) {
        publicWorks(filter: { first: $n }) {
          nodes { id slug title shortDescription category area verification department }
        }
      }`,
    );
    expect(errors.join(' ')).toMatch(/too expensive/i);
  });

  it('sums cost across operations in one document', () => {
    // Twenty expensive operations cost twenty times one of them to serve.
    const many = Array.from(
      { length: 20 },
      (_unused, index) =>
        `query Q${index} { publicWorks(filter: { first: 50 }) { nodes { id title area } } }`,
    ).join('\n');
    const errors = validateWith([costLimit(2000)], many);
    expect(errors.join(' ')).toMatch(/too expensive/i);
  });

  it('carries a machine-readable code so a client can tell it apart', () => {
    const errors = validate(STUB_SCHEMA, parse(nest(20)), [depthLimit(5)]);
    expect(errors[0]?.extensions?.code).toBe('GRAPHQL_QUERY_TOO_DEEP');
  });
});

// ---------------------------------------------------------------------------
// Log redaction. Pure function.
// ---------------------------------------------------------------------------

describe('log redaction', () => {
  it('redacts every secret-shaped key, at any nesting depth', () => {
    const redacted = redactSensitive({
      email: 'someone@example.test',
      password: 'hunter2',
      nested: { accessToken: 'abc', databaseUrl: 'postgresql://u:p@host/db' },
      headers: { authorization: 'Bearer xyz', cookie: 'sid=1' },
    }) as Record<string, unknown>;

    const serialised = JSON.stringify(redacted);
    expect(serialised).not.toContain('hunter2');
    expect(serialised).not.toContain('postgresql://');
    expect(serialised).not.toContain('Bearer xyz');
    expect(serialised).not.toContain('sid=1');
  });

  it('covers the credential shapes this platform actually holds', () => {
    for (const key of ['password', 'token', 'apikey', 'databaseurl', 'secret', 'cookie']) {
      expect(SENSITIVE_KEY_PATTERNS).toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// HTTP surface.
// ---------------------------------------------------------------------------

describe.skipIf(!available)('health and readiness', () => {
  it('reports liveness without probing a dependency', async () => {
    const response = await request(app).get(HEALTH_PATH);
    // Liveness must not fail on a database blip: an orchestrator would restart
    // every otherwise-healthy instance instead of draining traffic.
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
  });

  it('exposes readiness at the conventional path', async () => {
    const response = await request(app).get(READY_PATH);
    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty('dependencies');
  });

  it('keeps the Phase 1 database path working', async () => {
    // Any uptime monitor already pointed at it must not break.
    const response = await request(app).get(HEALTH_DB_PATH);
    expect([200, 503]).toContain(response.status);
  });

  it('exposes no secret or infrastructure detail', async () => {
    const response = await request(app).get(READY_PATH);
    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/postgres(ql)?:\/\//);
    expect(body).not.toMatch(/password/i);
    expect(body).not.toMatch(/neon\.tech/i);
    expect(body).not.toMatch(/[A-Za-z]:\\\\/);
  });
});

describe.skipIf(!available)('security headers', () => {
  it('sets the headers a browser acts on', async () => {
    const response = await request(app).get(HEALTH_PATH);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toMatch(/default-src 'none'/);
  });

  it('does not advertise the framework', async () => {
    const response = await request(app).get(HEALTH_PATH);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('refuses an origin outside the allow-list', async () => {
    const response = await request(app)
      .get(HEALTH_PATH)
      .set('Origin', 'https://not-allowed.example');
    // Never reflect an unknown origin: a page on it could then read
    // authenticated responses.
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe.skipIf(!available)('error disclosure', () => {
  it('returns no stack trace, SQL or file path to a client', async () => {
    const response = await request(app)
      .post(GRAPHQL_PATH)
      .send({ query: 'query { publicWork(slug: "definitely-not-a-real-slug") { id } }' });

    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/\bat .+\(.+:\d+:\d+\)/); // stack frame
    expect(body).not.toMatch(/SELECT .* FROM/i);
    expect(body).not.toMatch(/node_modules/);
    expect(body).not.toMatch(/prisma\./i);
    expect(body).not.toMatch(/[A-Za-z]:\\\\/); // Windows path
  });

  it('rejects a malformed document without leaking internals', async () => {
    const response = await request(app).post(GRAPHQL_PATH).send({ query: '{ this is not valid' });
    expect(JSON.stringify(response.body)).not.toMatch(/node_modules/);
  });

  it('applies the depth limit over HTTP, not only in the unit test', async () => {
    const response = await request(app)
      .post(GRAPHQL_PATH)
      .send({ query: nest(40) });
    expect(JSON.stringify(response.body)).toMatch(/nested too deeply|too expensive/i);
  });
});

describe.skipIf(!available)('schema exposure', () => {
  it('keeps introspection under configuration control', async () => {
    const response = await request(app)
      .post(GRAPHQL_PATH)
      .send({ query: 'query { __schema { types { name } } }' });

    const introspectionEnabled = process.env.GRAPHQL_INTROSPECTION !== 'false';
    if (!introspectionEnabled) {
      expect(JSON.stringify(response.body)).toMatch(/introspection/i);
    } else {
      // Tests run outside production, where the IDE is deliberately available.
      expect(response.status).toBe(200);
    }
  });
});
