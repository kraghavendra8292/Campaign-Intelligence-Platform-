import { isQrCodeIdentifier, type QrResolutionOutcome } from '@rk/types';
import { prisma } from '../../../database/prisma';

/**
 * Resolves a scanned code to a destination.
 *
 * This runs on the only latency-critical path in the platform: a citizen is
 * standing in front of a poster with their camera open. Everything here is
 * therefore one indexed lookup and no more.
 *
 * NO CACHE, deliberately. An in-process cache would shave a few milliseconds
 * and, in exchange, mean that pausing a QR code takes effect "soon" rather than
 * immediately. Pausing exists precisely for the case where a code must stop
 * working now - a wrong destination on ten thousand printed pamphlets - so the
 * trade is not worth making.
 */

export interface ResolvedQr {
  readonly outcome: QrResolutionOutcome;
  readonly qrCodeId: string | null;
  readonly organizationId: string | null;
  readonly campaignId: string | null;
  readonly destinationPath: string | null;
  readonly utm: {
    readonly source: string | null;
    readonly medium: string | null;
    readonly campaign: string | null;
    readonly content: string | null;
  } | null;
}

const NOT_FOUND: ResolvedQr = {
  outcome: 'NOT_FOUND',
  qrCodeId: null,
  organizationId: null,
  campaignId: null,
  destinationPath: null,
  utm: null,
};

export const qrResolutionService = {
  /**
   * Looks up a scanned identifier.
   *
   * The tenant comes from the CODE, never from the request: a public scan
   * carries no session and no tenant header, and trusting either would let
   * anyone attribute scans to an organisation they do not belong to.
   *
   * A code belonging to a suspended organisation returns NOT_FOUND rather than
   * a distinct status, so the endpoint cannot be used to enumerate which
   * identifiers exist or to learn that a tenant was suspended.
   */
  async resolve(code: string): Promise<ResolvedQr> {
    // Shape-check before touching the database, so a flood of malformed
    // identifiers costs a regex each instead of a query each.
    if (!isQrCodeIdentifier(code)) return NOT_FOUND;

    const qr = await prisma.qrCode.findUnique({
      where: { code },
      select: {
        id: true,
        organizationId: true,
        campaignId: true,
        status: true,
        destinationPath: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        organization: { select: { status: true } },
      },
    });

    if (!qr) return NOT_FOUND;
    if (qr.organization.status !== 'ACTIVE') return NOT_FOUND;

    const base = {
      qrCodeId: qr.id,
      organizationId: qr.organizationId,
      campaignId: qr.campaignId,
    };

    if (qr.status === 'PAUSED') {
      return { ...base, outcome: 'PAUSED', destinationPath: null, utm: null };
    }
    if (qr.status === 'ARCHIVED') {
      return { ...base, outcome: 'ARCHIVED', destinationPath: null, utm: null };
    }

    return {
      ...base,
      outcome: 'REDIRECT',
      destinationPath: qr.destinationPath,
      utm: {
        source: qr.utmSource,
        medium: qr.utmMedium,
        campaign: qr.utmCampaign,
        content: qr.utmContent,
      },
    };
  },
};

/**
 * Builds the absolute destination a citizen is sent to.
 *
 * THIS CANNOT PRODUCE AN OPEN REDIRECT. The origin comes from server
 * configuration and the path has already been through
 * `validateDestinationPath`, so no combination of stored data can send a
 * citizen to another host. `URL` does the joining rather than string
 * concatenation, so a stray slash cannot change the origin either.
 */
export function buildRedirectUrl(
  siteOrigin: string,
  destinationPath: string,
  utm: ResolvedQr['utm'],
  code?: string | null,
): string {
  const url = new URL(destinationPath, siteOrigin);

  // Re-assert the origin. Belt and braces: if a malformed path ever slipped
  // past validation, `new URL` could otherwise honour it as absolute.
  const origin = new URL(siteOrigin);
  url.protocol = origin.protocol;
  url.host = origin.host;

  if (utm?.source) url.searchParams.set('utm_source', utm.source);
  if (utm?.medium) url.searchParams.set('utm_medium', utm.medium);
  if (utm?.campaign) url.searchParams.set('utm_campaign', utm.campaign);
  if (utm?.content) url.searchParams.set('utm_content', utm.content);

  /*
   * Phase 5: the public code itself travels with the visitor.
   *
   * The UTM parameters already say which poster this was, but they are free
   * text chosen by an editor - two codes can share a `utm_content`, and none of
   * them resolves back to a row. Carrying the identifier lets a citizen who
   * goes on to report an issue have that submission attributed to the exact
   * printed code, which is the Phase 4 -> Phase 5 link.
   *
   * It is safe to expose: the code is already printed on a public poster, it
   * is validated against the tenant before use, and it says nothing about the
   * person carrying it. The QR SYMBOL is unchanged - this is the destination
   * query string, so codes already in circulation keep working.
   */
  if (code) url.searchParams.set('rk_qr', code);

  return url.toString();
}
