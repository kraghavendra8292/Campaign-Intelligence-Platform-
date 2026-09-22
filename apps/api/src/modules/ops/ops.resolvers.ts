import type { GraphQLContext } from '../../graphql/context/index';
import { systemStatusService } from './systemStatus.service';

/**
 * Operational status resolver.
 *
 * A single field with no arguments. The permission check lives in the service,
 * following the pattern every module here uses: the transport decides nothing.
 */
export const opsResolvers = {
  Query: {
    systemStatus: (_parent: unknown, _args: unknown, context: GraphQLContext) =>
      systemStatusService.get(context.auth),
  },
};
