import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { GRAPHQL_PATH, MAX_REQUEST_BODY_SIZE } from '@rk/config';
import { getEnv, type ApiEnv } from './config/env';
import { createSchema } from './graphql/schema/index';
import { queryLimitRules } from './graphql/validation/queryLimits';
import { createGraphQLContext, type GraphQLContext } from './graphql/context/index';
import { loggingPlugin } from './graphql/plugins/loggingPlugin';
import { formatGraphQLError } from './errors/formatGraphQLError';
import { httpErrorHandler, notFoundHandler } from './errors/httpErrorHandler';
import { requestContext } from './middleware/requestContext';
import { corsMiddleware, securityHeaders } from './middleware/security';
import { createRateLimiter } from './middleware/rateLimit';
import { createHealthRouter } from './modules/health/index';
import { createMediaRouter } from './modules/content/media/media.routes';
import { createQrRedirectRouter } from './modules/qr/public/qrRedirect.routes';
import { createIssueAttachmentRouter } from './modules/issues/public/issueAttachment.routes';

export interface CreatedApp {
  app: Express;
  apollo: ApolloServer<GraphQLContext>;
}

/**
 * Composes the HTTP application.
 *
 * Split from `server.ts` so tests can exercise the fully wired app over an
 * ephemeral port without booting the production lifecycle (signal handlers,
 * graceful shutdown).
 *
 * Middleware order is deliberate:
 *   1. proxy trust      - so client IPs are correct before anything uses them
 *   2. request context  - so every later log line carries a correlation id
 *   3. security headers - applied even to responses that fail early
 *   4. CORS             - rejects disallowed origins before any work is done
 *   5. rate limit       - sheds load before parsing bodies
 *   6. body parser      - with a hard size cap
 *   7. routes
 *   8. 404 + error handler - always last
 */
export async function createApp(env: ApiEnv = getEnv()): Promise<CreatedApp> {
  const app = express();

  // Only trust as many proxy hops as are actually deployed; trusting blindly
  // would let a client spoof its IP through X-Forwarded-For and evade limits.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');

  // Parses the HttpOnly refresh cookie. Registered before the GraphQL handler
  // because the refresh mutation reads it from `req.cookies`.
  app.use(cookieParser());
  app.use(requestContext);
  app.use(securityHeaders(env));
  app.use(corsMiddleware(env));
  app.use(createRateLimiter(env));

  const apollo = new ApolloServer<GraphQLContext>({
    schema: createSchema(),
    // Introspection is disabled in production so the schema is not enumerable
    // by an unauthenticated caller.
    introspection: env.GRAPHQL_INTROSPECTION,
    formatError: formatGraphQLError,
    includeStacktraceInErrorResponses: false,
    // Phase 10. Rejected during VALIDATION, so an abusive document never
    // reaches a resolver and never touches the database. See queryLimits.ts.
    validationRules: queryLimitRules(env.GRAPHQL_MAX_DEPTH, env.GRAPHQL_MAX_COST),
    plugins: [
      loggingPlugin(),
      env.GRAPHQL_INTROSPECTION
        ? ApolloServerPluginLandingPageLocalDefault({ embed: true })
        : ApolloServerPluginLandingPageDisabled(),
    ],
  });

  await apollo.start();

  app.use(
    GRAPHQL_PATH,
    express.json({ limit: MAX_REQUEST_BODY_SIZE }),
    expressMiddleware(apollo, {
      context: async ({ req, res }) => createGraphQLContext(req, res),
    }),
  );

  // Mounted before the JSON body parser: uploads are multipart, and each of
  // these routers installs its own (size-limited) multipart handler.
  app.use(createMediaRouter());
  app.use(createIssueAttachmentRouter(env));

  app.use(express.json({ limit: MAX_REQUEST_BODY_SIZE }));
  app.use(createHealthRouter());

  // Public QR scan redirect. Anonymous by design and mounted last among the
  // routers so it cannot shadow an application route; it carries its own,
  // deliberately generous rate limit.
  app.use(createQrRedirectRouter(env));

  app.use(notFoundHandler);
  app.use(httpErrorHandler);

  return { app, apollo };
}
