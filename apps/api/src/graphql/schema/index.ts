import { makeExecutableSchema } from '@graphql-tools/schema';
import type { GraphQLSchema } from 'graphql';
import { typeDefs } from '@rk/graphql';
import { resolvers } from '../resolvers/index';

/**
 * Builds the executable schema.
 *
 * The SDL lives in the shared `@rk/graphql` package so the API and its clients
 * read from one source of truth; the resolvers that implement it stay here in
 * the backend. Phase 2 schema directives are applied at this seam.
 */
export function createSchema(): GraphQLSchema {
  return makeExecutableSchema({
    typeDefs: [...typeDefs],
    resolvers,
  });
}
