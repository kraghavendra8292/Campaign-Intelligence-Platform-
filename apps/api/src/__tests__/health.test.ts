import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import { GRAPHQL_PATH, HEALTH_PATH } from '@rk/config';
import { HEALTH_QUERY } from '@rk/graphql';
import { createApp } from '../app';
import type { GraphQLContext } from '../graphql/context/index';

let app: Express;
let apollo: ApolloServer<GraphQLContext>;

beforeAll(async () => {
  const created = await createApp();
  app = created.app;
  apollo = created.apollo;
});

afterAll(async () => {
  await apollo.stop();
});

describe('REST health endpoint', () => {
  it('GET /health returns 200 OK', async () => {
    const response = await request(app).get(HEALTH_PATH);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'OK' });
  });

  it('echoes a correlation id header', async () => {
    const response = await request(app).get(HEALTH_PATH);
    expect(response.headers['x-correlation-id']).toBeDefined();
  });

  it('reuses a safe client-supplied correlation id', async () => {
    const response = await request(app).get(HEALTH_PATH).set('x-correlation-id', 'trace-abc-123');

    expect(response.headers['x-correlation-id']).toBe('trace-abc-123');
  });

  it('rejects an unsafe client-supplied correlation id', async () => {
    const response = await request(app).get(HEALTH_PATH).set('x-correlation-id', 'a'.repeat(300));

    expect(response.headers['x-correlation-id']).not.toBe('a'.repeat(300));
  });

  it('sets hardening headers', async () => {
    const response = await request(app).get(HEALTH_PATH);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('GraphQL health query', () => {
  it('returns { data: { health: "OK" } }', async () => {
    const response = await request(app)
      .post(GRAPHQL_PATH)
      .set('Content-Type', 'application/json')
      .send({ query: HEALTH_QUERY });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { health: 'OK' } });
  });

  it('answers the bare `query { health }` document', async () => {
    const response = await request(app)
      .post(GRAPHQL_PATH)
      .set('Content-Type', 'application/json')
      .send({ query: '{ health }' });

    expect(response.body.data.health).toBe('OK');
  });
});

describe('404 handling', () => {
  it('returns the standard error envelope for an unknown route', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.correlationId).toBeDefined();
  });
});
