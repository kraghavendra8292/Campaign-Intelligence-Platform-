import type { ApolloServerPlugin } from '@apollo/server';
import type { GraphQLContext } from '../context/index';

/**
 * Logs one structured line per GraphQL operation.
 *
 * Only the operation name and type are recorded. Variables are deliberately
 * never logged: from Phase 5 they will carry citizen-submitted content, and
 * from Phase 2 they may carry credentials.
 */
export function loggingPlugin(): ApolloServerPlugin<GraphQLContext> {
  return {
    async requestDidStart(requestContext) {
      const startedAt = performance.now();
      const log = requestContext.contextValue.log;

      return {
        async willSendResponse(responseContext) {
          const durationMs = Math.round(performance.now() - startedAt);
          const operationName = responseContext.operationName ?? 'anonymous';
          const operationType = responseContext.operation?.operation ?? 'unknown';
          const errorCount = responseContext.errors?.length ?? 0;

          const payload = { operationName, operationType, durationMs, errorCount };

          if (errorCount > 0) {
            log.warn(payload, 'GraphQL operation completed with errors');
          } else {
            log.info(payload, 'GraphQL operation completed');
          }
        },
      };
    },
  };
}
