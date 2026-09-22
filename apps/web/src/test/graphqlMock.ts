import { vi } from 'vitest';

/**
 * Operation-aware GraphQL stub for component tests.
 *
 * The earlier tests replied with one fixed payload to every request, which made
 * a page render against data that did not match the query it had actually sent.
 * That hides real breakage and, worse, invents it: a component crashing on a
 * field the stub forgot looks identical to a component with a genuine bug.
 *
 * So this dispatches on the operation name in the document, and an operation
 * with no handler is answered with an explicit GraphQL error naming it - never
 * with empty or borrowed data. A test that forgets a stub fails loudly and says
 * which one is missing.
 */

export interface GraphQLCall {
  operation: string;
  variables: Record<string, unknown>;
  headers: Record<string, string>;
}

const ERROR_MARKER = '__graphqlMockError';

interface ErrorResponder {
  [ERROR_MARKER]: true;
  code: string;
  message: string;
}

/** What an operation resolves to: the `data` object, or `graphqlError(...)`. */
export type ResponderValue = Record<string, unknown> | ErrorResponder;

/**
 * A handler: a fixed result, or a function of the request variables.
 *
 * Deliberately NOT written with `unknown` in the union - `unknown | T` collapses
 * to `unknown`, which would erase the function branch and leave every handler's
 * `variables` parameter implicitly `any`.
 */
export type Responder =
  | ResponderValue
  | ((variables: Record<string, unknown>) => ResponderValue | Promise<ResponderValue>);

/** Declares that an operation should fail with a specific API error code. */
export function graphqlError(code: string, message: string): ErrorResponder {
  return { [ERROR_MARKER]: true, code, message };
}

function isError(value: unknown): value is ErrorResponder {
  return typeof value === 'object' && value !== null && ERROR_MARKER in value;
}

/** Pulls the operation name out of a document, ignoring leading fragments. */
export function operationNameOf(document: string): string {
  const match = /\b(?:query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(document);
  return match?.[1] ?? 'Anonymous';
}

export interface GraphQLMock {
  /** Every request made, in order, for assertions about what a page asked for. */
  readonly calls: GraphQLCall[];
  /** Operation names in call order. */
  operations: () => string[];
  /** The most recent variables sent for an operation, or undefined. */
  variablesFor: (operation: string) => Record<string, unknown> | undefined;
}

/**
 * Installs a `fetch` stub for the duration of a test.
 *
 * `src/test/setup.ts` calls `vi.restoreAllMocks()` after each test, so no
 * teardown is needed at the call site.
 */
export function installGraphQLMock(handlers: Record<string, Responder>): GraphQLMock {
  const calls: GraphQLCall[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        query?: string;
        variables?: Record<string, unknown>;
      };

      const operation = operationNameOf(body.query ?? '');
      const variables = body.variables ?? {};
      calls.push({
        operation,
        variables,
        headers: (init?.headers as Record<string, string> | undefined) ?? {},
      });

      if (!url.includes('/graphql')) {
        return json({ errors: [{ message: `Unexpected non-GraphQL request to ${url}` }] }, 404);
      }

      if (!(operation in handlers)) {
        return json({
          errors: [
            {
              message: `No mock registered for operation "${operation}".`,
              extensions: { code: 'INTERNAL_SERVER_ERROR' },
            },
          ],
        });
      }

      const handler = handlers[operation];
      // Awaited, so a handler may return a promise - including one that never
      // settles, which is how a test holds a screen in its loading state.
      const result = await (typeof handler === 'function' ? handler(variables) : handler);

      if (isError(result)) {
        return json({
          errors: [{ message: result.message, extensions: { code: result.code } }],
        });
      }

      return json({ data: result });
    }),
  );

  return {
    calls,
    operations: () => calls.map((call) => call.operation),
    variablesFor: (operation) =>
      [...calls].reverse().find((call) => call.operation === operation)?.variables,
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
