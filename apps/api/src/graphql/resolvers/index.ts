import { GraphQLScalarType, Kind } from 'graphql';
import { healthResolvers } from '../../modules/health/index';
import { authResolvers } from '../../modules/auth/auth.resolvers';
import { identityResolvers } from '../../modules/identity/identity.resolvers';
import { publicSiteResolvers } from '../../modules/content/public/public.resolvers';
import { cmsResolvers } from '../../modules/content/cms/cms.resolvers';
import { qrResolvers } from '../../modules/qr/cms/qr.resolvers';
import { issueResolvers } from '../../modules/issues/issues.resolvers';
import { aiResolvers } from '../../modules/ai/ai.resolvers';
import { analyticsResolvers } from '../../modules/analytics/analytics.resolvers';
import { communicationResolvers } from '../../modules/communication/communication.resolvers';
import { workResolvers } from '../../modules/work/work.resolvers';
import { opsResolvers } from '../../modules/ops/index';
import { siteFeedbackResolvers } from '../../modules/content/siteFeedback/siteFeedback.resolvers';

/**
 * ISO 8601 date-time scalar.
 *
 * Serialises to a string on the wire; rejects malformed input rather than
 * silently producing an Invalid Date.
 */
const DateTimeScalar = new GraphQLScalarType<Date | string, string>({
  name: 'DateTime',
  description: 'An RFC 3339 / ISO 8601 timestamp serialised as a string.',

  serialize(value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return new Date(value).toISOString();
    throw new TypeError('DateTime must serialise a Date or an ISO string.');
  },

  parseValue(value) {
    if (typeof value !== 'string') {
      throw new TypeError('DateTime must be provided as an ISO string.');
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError('DateTime is not a valid ISO timestamp.');
    }
    return parsed;
  },

  parseLiteral(node) {
    if (node.kind !== Kind.STRING) {
      throw new TypeError('DateTime must be provided as a string literal.');
    }
    const parsed = new Date(node.value);
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError('DateTime is not a valid ISO timestamp.');
    }
    return parsed;
  },
});

/**
 * Root resolver map.
 *
 * Each feature module contributes its own resolver object; they are merged
 * here so adding a Phase 2 module is a two-line change (import + spread).
 */
/**
 * Opaque JSON, used only for sanitised audit metadata on the way out.
 *
 * `parseValue`/`parseLiteral` reject input: nothing in the schema accepts JSON
 * as an argument, and an unconstrained input scalar is an easy way to smuggle
 * unvalidated structures into a resolver.
 */
const JsonScalar = new GraphQLScalarType<unknown, unknown>({
  name: 'JSON',
  description: 'Arbitrary JSON. Output only.',
  serialize: (value) => value ?? null,
  parseValue() {
    throw new TypeError('JSON is an output-only scalar.');
  },
  parseLiteral() {
    throw new TypeError('JSON is an output-only scalar.');
  },
});

export const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JsonScalar,

  // Field resolvers. `QrCode.image` renders the printable asset lazily, so a
  // list query does not pay to rasterise every symbol it returns.
  QrCode: qrResolvers.QrCode,

  Query: {
    ...healthResolvers.Query,
    ...authResolvers.Query,
    ...identityResolvers.Query,
    ...publicSiteResolvers.Query,
    ...cmsResolvers.Query,
    ...qrResolvers.Query,
    ...issueResolvers.Query,
    ...aiResolvers.Query,
    ...analyticsResolvers.Query,
    ...communicationResolvers.Query,
    ...workResolvers.Query,
    ...opsResolvers.Query,
    ...siteFeedbackResolvers.Query,
  },

  Mutation: {
    /** Placeholder keeping the Mutation type valid for clients that ping. */
    ping: (): boolean => true,
    ...authResolvers.Mutation,
    ...identityResolvers.Mutation,
    ...cmsResolvers.Mutation,
    ...qrResolvers.Mutation,
    ...issueResolvers.Mutation,
    ...aiResolvers.Mutation,
    ...communicationResolvers.Mutation,
    ...workResolvers.Mutation,
    ...siteFeedbackResolvers.Mutation,
  },
};
