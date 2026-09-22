import { describe, expect, it } from 'vitest';
import { AppError, toAppError } from '../errors/AppError';
import { formatGraphQLError } from '../errors/formatGraphQLError';

describe('AppError', () => {
  it('maps codes to HTTP statuses', () => {
    expect(AppError.notFound().status).toBe(404);
    expect(AppError.badRequest('bad').status).toBe(400);
    expect(AppError.rateLimited().status).toBe(429);
    expect(AppError.internal().status).toBe(500);
  });

  it('exposes deliberate 4xx messages', () => {
    const error = AppError.badRequest('Slug is already taken.');
    const payload = error.toPayload('corr-1');

    expect(payload.message).toBe('Slug is already taken.');
    expect(payload.code).toBe('BAD_REQUEST');
    expect(payload.correlationId).toBe('corr-1');
  });

  it('never exposes internal error detail to the client', () => {
    const error = AppError.internal('connect ECONNREFUSED 10.0.0.4:5432 password=secret');
    const payload = error.toPayload();

    expect(payload.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(payload)).not.toContain('10.0.0.4');
    expect(JSON.stringify(payload)).not.toContain('secret');
  });

  it('wraps unknown throwables without leaking their message', () => {
    const wrapped = toAppError(new Error('ENOENT /srv/app/config/secrets.json'));

    expect(wrapped.status).toBe(500);
    expect(wrapped.toPayload().message).toBe('An unexpected error occurred.');
  });

  it('passes an AppError through unchanged', () => {
    const original = AppError.notFound('Organisation not found.');
    expect(toAppError(original)).toBe(original);
  });
});

describe('formatGraphQLError', () => {
  it('replaces an unexpected error with a generic payload', () => {
    const formatted = formatGraphQLError(
      { message: 'Cannot read properties of undefined (reading "id")' },
      new Error('Cannot read properties of undefined (reading "id")'),
    );

    expect(formatted.message).toBe('An unexpected error occurred.');
    expect(formatted.extensions?.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('strips the stacktrace extension Apollo adds outside production', () => {
    const formatted = formatGraphQLError(
      {
        message: 'boom',
        extensions: {
          code: 'INTERNAL_SERVER_ERROR',
          stacktrace: ['Error: boom', '    at /srv/app/src/modules/secret.ts:12:5'],
        },
      },
      new Error('boom'),
    );

    expect(formatted.extensions?.stacktrace).toBeUndefined();
    expect(JSON.stringify(formatted)).not.toContain('/srv/app');
  });

  it('preserves client-safe validation messages', () => {
    const formatted = formatGraphQLError(
      {
        message: 'Cannot query field "nope" on type "Query".',
        extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
      },
      new Error('Cannot query field "nope" on type "Query".'),
    );

    expect(formatted.message).toContain('Cannot query field');
    expect(formatted.extensions?.code).toBe('BAD_REQUEST');
  });

  it('surfaces a deliberate AppError message', () => {
    const appError = AppError.notFound('Organisation not found.');
    const formatted = formatGraphQLError({ message: appError.message }, appError);

    expect(formatted.message).toBe('Organisation not found.');
    expect(formatted.extensions?.code).toBe('NOT_FOUND');
  });
});
