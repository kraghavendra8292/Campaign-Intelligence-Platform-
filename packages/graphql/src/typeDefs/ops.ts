/**
 * Phase 10 - operational status for the admin console.
 *
 * Deliberately coarse. Every field here is something an operator can act on;
 * none of it is infrastructure detail. There is no host name, no connection
 * string, no provider endpoint and no stack trace in this type, because the
 * operations page is the admin screen most likely to end up in a screenshot.
 */
export const opsTypeDefs = /* GraphQL */ `
  "How a component is behaving right now. UNKNOWN is an honest answer."
  enum ComponentStatus {
    HEALTHY
    DEGRADED
    DOWN
    UNKNOWN
  }

  type SystemComponent {
    key: String!
    label: String!
    status: ComponentStatus!
    "One sentence an operator can act on. Never a raw provider error."
    detail: String!
    latencyMs: Int
  }

  type SystemStatus {
    service: String!
    version: String!
    environment: String!
    uptimeSeconds: Int!
    "The worst component decides this, not an average."
    status: ComponentStatus!
    components: [SystemComponent!]!
    checkedAt: DateTime!
  }

  extend type Query {
    "Operational status. Behind AUDIT_READ."
    systemStatus: SystemStatus!
  }
`;
