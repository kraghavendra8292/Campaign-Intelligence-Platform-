/**
 * Health module schema.
 *
 * Demonstrates the module extension pattern that every Phase 2+ feature will
 * follow: define module types, then `extend type Query` with module fields.
 *
 * The detailed payload intentionally exposes no host names, connection
 * strings, driver errors or environment variables - it is safe for
 * unauthenticated uptime monitors.
 */
export const healthTypeDefs = /* GraphQL */ `
  enum HealthStatus {
    OK
    DEGRADED
    ERROR
  }

  type DependencyHealth {
    name: String!
    status: HealthStatus!
    latencyMs: Int!
  }

  type ServiceHealth {
    status: HealthStatus!
    service: String!
    version: String!
    environment: String!
    uptimeSeconds: Int!
    timestamp: DateTime!
    dependencies: [DependencyHealth!]!
  }

  extend type Query {
    """
    Detailed readiness report including probed dependencies.
    """
    healthDetails: ServiceHealth!
  }
`;
