import type { Request, Response } from 'express';
import type { AuthContext } from '@rk/types';
import { TENANT_HEADER } from '@rk/config';
import type { Logger } from '../../logging/logger';
import { prisma, type AppPrismaClient } from '../../database/prisma';
import { authContextService } from '../../modules/auth/authContext.service';
import type { RequestMetadata } from '../../modules/auth/auth.service';

/** Header carrying an optional campaign sub-scope within the active tenant. */
export const CAMPAIGN_HEADER = 'x-campaign-id';

/**
 * Per-request GraphQL context.
 *
 * Everything a resolver may reach for lives here, which keeps resolvers free of
 * module-level singletons and makes them trivially testable.
 *
 * `auth` is the only sanctioned source of identity and tenancy. A resolver must
 * never read the organisation from its own arguments or from a header: by the
 * time a value reaches `auth.organizationId` it has been checked against the
 * caller's memberships, which a raw argument has not.
 */
export interface GraphQLContext {
  readonly prisma: AppPrismaClient;
  /** Logger bound to this request's correlation id (and user, once known). */
  readonly log: Logger;
  readonly correlationId: string;

  /** The authenticated caller, or null for an anonymous request. */
  readonly auth: AuthContext | null;

  /** Client metadata for audit records and session rows. */
  readonly requestMeta: RequestMetadata;

  /**
   * Raw Express objects, needed only for the refresh cookie. Resolvers must not
   * read identity from these - that is what `auth` is for.
   */
  readonly req: Request;
  readonly res: Response;
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Builds the context for a single GraphQL request.
 *
 * Authentication is resolved once here rather than per resolver, so a query
 * touching several fields performs one credential check - and so no resolver
 * can accidentally skip it.
 */
export async function createGraphQLContext(req: Request, res: Response): Promise<GraphQLContext> {
  const correlationId = req.correlationId;

  const auth = await authContextService.resolve({
    authorizationHeader: headerValue(req, 'authorization'),
    organizationHeader: headerValue(req, TENANT_HEADER),
    campaignHeader: headerValue(req, CAMPAIGN_HEADER),
    correlationId,
  });

  return {
    prisma,
    log: auth ? req.log.child({ userId: auth.userId }) : req.log,
    correlationId,
    auth,
    requestMeta: {
      // `req.ip` honours the configured trust-proxy depth, so it cannot be
      // spoofed through X-Forwarded-For beyond the hops actually deployed.
      ipAddress: req.ip ?? null,
      userAgent: headerValue(req, 'user-agent') ?? null,
      correlationId,
    },
    req,
    res,
  };
}
