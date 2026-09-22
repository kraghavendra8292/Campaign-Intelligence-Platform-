import { isQrCodeIdentifier } from '@rk/types';
import { prisma } from '../../../database/prisma';

/**
 * Resolves a public `rk_qr` code to a campaign/code pair within one tenant.
 *
 * Attribution failure is never an error: the submission matters more than
 * knowing which poster it came from. An invented or cross-tenant code simply
 * yields nulls rather than linking two organisations' data.
 */
export async function resolveQrAttribution(
  organizationId: string,
  rawCode: string | null | undefined,
): Promise<{ campaignId: string | null; qrCodeId: string | null }> {
  const code = rawCode?.trim().toUpperCase();

  if (!code || !isQrCodeIdentifier(code)) {
    return { campaignId: null, qrCodeId: null };
  }

  const qr = await prisma.qrCode.findFirst({
    where: { code, organizationId },
    select: { id: true, campaignId: true },
  });

  if (!qr) {
    return { campaignId: null, qrCodeId: null };
  }

  return { campaignId: qr.campaignId, qrCodeId: qr.id };
}
