import type { ServiceHealth } from '@rk/types';
import type { GraphQLContext } from '../../graphql/context/index';
import { healthService } from './health.service';

/**
 * Health resolvers.
 *
 * Resolvers stay thin by design: they translate between GraphQL and the
 * service layer and contain no business logic or data access of their own.
 */
export const healthResolvers = {
  Query: {
    health: (): string => healthService.getLiveness(),

    healthDetails: async (
      _parent: unknown,
      _args: Record<string, never>,
      context: GraphQLContext,
    ): Promise<ServiceHealth> => {
      context.log.debug('Resolving healthDetails');
      return healthService.getReadiness();
    },
  },
};
