import { prisma } from '../../../database/prisma';
import { getLogger } from '../../../logging/logger';
import {
  classifyDevice,
  classifyOs,
  classifyReferrer,
  computeVisitHash,
  isAutomatedAgent,
  timeBuckets,
} from '../shared/scanClassifier';
import type { ResolvedQr } from './qrResolution.service';

/**
 * Records scans.
 *
 * Two rules govern this module, and both exist to protect the citizen standing
 * at the poster:
 *
 * 1. THE REDIRECT NEVER WAITS FOR IT. `record` is started and not awaited by
 *    the route, so the citizen's browser is already navigating while the row is
 *    still being written. Analytics is the campaign's convenience; reaching the
 *    website is the citizen's purpose, and the purpose wins.
 *
 * 2. A FAILURE HERE IS INVISIBLE TO THEM. Every error is caught and logged. A
 *    database hiccup must not turn a working poster into an error page.
 *
 * The cost of (1) is that a scan is not durable at the moment of redirect. For
 * channel analytics - where the question is "roughly what share came from the
 * pamphlets?" - losing a row to a crash is immaterial. It would not be
 * acceptable for billing, and this is not billing.
 */

export interface ScanContext {
  /** Raw client IP. Used to derive a daily hash and then discarded. */
  readonly ipAddress: string | null;
  /** Raw User-Agent. Classified into coarse buckets and then discarded. */
  readonly userAgent: string | null;
  /** Raw referrer. Bucketed by host family and then discarded. */
  readonly referrer: string | null;
  readonly correlationId: string;
}

/**
 * In-flight writes, so tests (and a graceful shutdown) can wait for them.
 *
 * Fire-and-forget work that nothing can observe is untestable, and an
 * untestable analytics pipeline is one that silently stops working. This set is
 * the seam: production never looks at it, `flushPendingScans` drains it.
 */
const pending = new Set<Promise<void>>();

/** Awaits every scan write started so far. Test and shutdown use only. */
export async function flushPendingScans(): Promise<void> {
  await Promise.allSettled([...pending]);
}

export const scanEventService = {
  /**
   * Writes one scan event.
   *
   * Returns a promise the caller is free to ignore. Resolves rather than
   * rejects on failure - there is no caller in a position to do anything about
   * it, and an unhandled rejection would be worse than a logged one.
   */
  record(
    resolved: ResolvedQr,
    context: ScanContext,
    options: { readonly visitSecret: string; readonly uniqueEstimation: boolean },
  ): Promise<void> {
    const task = scanEventService
      .write(resolved, context, options)
      .catch((error: unknown) => {
        getLogger().error(
          { err: error, qrCodeId: resolved.qrCodeId, correlationId: context.correlationId },
          'Failed to record QR scan event',
        );
      })
      .finally(() => {
        pending.delete(task);
      });

    pending.add(task);
    return task;
  },

  /** The actual insert. Separated so `record` can own the error policy. */
  async write(
    resolved: ResolvedQr,
    context: ScanContext,
    options: { readonly visitSecret: string; readonly uniqueEstimation: boolean },
  ): Promise<void> {
    // Only a successful redirect is a scan of a working code. A scan of a
    // paused or unknown code is not attributable to a live channel, and
    // counting it would inflate the campaign's numbers with dead posters.
    if (
      resolved.outcome !== 'REDIRECT' ||
      !resolved.qrCodeId ||
      !resolved.organizationId ||
      !resolved.campaignId ||
      !resolved.destinationPath
    ) {
      return;
    }

    const now = new Date();
    const buckets = timeBuckets(now);

    const visitHash = options.uniqueEstimation
      ? computeVisitHash({
          secret: options.visitSecret,
          qrCodeId: resolved.qrCodeId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          at: now,
        })
      : null;

    await prisma.qrScanEvent.create({
      data: {
        organizationId: resolved.organizationId,
        campaignId: resolved.campaignId,
        qrCodeId: resolved.qrCodeId,
        scannedAt: now,
        scanDate: buckets.scanDate,
        scanHour: buckets.scanHour,
        scanDayOfWeek: buckets.scanDayOfWeek,
        deviceCategory: classifyDevice(context.userAgent),
        osCategory: classifyOs(context.userAgent),
        referrerCategory: classifyReferrer(context.referrer),
        isAutomated: isAutomatedAgent(context.userAgent),
        landingPath: resolved.destinationPath,
        utmSource: resolved.utm?.source ?? null,
        utmMedium: resolved.utm?.medium ?? null,
        utmCampaign: resolved.utm?.campaign ?? null,
        utmContent: resolved.utm?.content ?? null,
        visitHash,
      },
      select: { id: true },
    });
  },
};
