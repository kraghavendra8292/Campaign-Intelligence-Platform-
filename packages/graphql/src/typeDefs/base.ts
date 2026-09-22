/**
 * Root schema skeleton.
 *
 * Every feature module extends `Query` / `Mutation` rather than redefining
 * them, so new Phase 2+ modules can be added without touching this file.
 */
export const baseTypeDefs = /* GraphQL */ `
  """
  An RFC 3339 / ISO 8601 timestamp serialised as a string.
  """
  scalar DateTime

  """
  Arbitrary JSON. Used only for sanitised audit metadata, never for input.
  """
  scalar JSON

  type Query {
    """
    Liveness probe. Returns "OK" when the API is able to serve requests.
    """
    health: String!
  }

  type Mutation {
    """
    Placeholder so the Mutation type is valid before any Phase 2 module adds
    its own fields. Always returns true.
    """
    ping: Boolean!
  }
`;
