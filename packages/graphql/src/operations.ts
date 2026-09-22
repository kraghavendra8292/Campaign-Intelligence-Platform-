/**
 * Client operation documents.
 *
 * Kept beside the schema so the web and mobile clients send queries that are
 * guaranteed to exist in the SDL. From Phase 2 these documents become the
 * input to typed codegen; for Phase 1 the matching result types are declared
 * by hand immediately below each document.
 */

export const HEALTH_QUERY = /* GraphQL */ `
  query Health {
    health
  }
`;

export interface HealthQueryResult {
  health: string;
}

export const HEALTH_DETAILS_QUERY = /* GraphQL */ `
  query HealthDetails {
    healthDetails {
      status
      service
      version
      environment
      uptimeSeconds
      timestamp
      dependencies {
        name
        status
        latencyMs
      }
    }
  }
`;

export interface HealthDetailsQueryResult {
  healthDetails: {
    status: 'OK' | 'DEGRADED' | 'ERROR';
    service: string;
    version: string;
    environment: string;
    uptimeSeconds: number;
    timestamp: string;
    dependencies: Array<{
      name: string;
      status: 'OK' | 'DEGRADED' | 'ERROR';
      latencyMs: number;
    }>;
  };
}
