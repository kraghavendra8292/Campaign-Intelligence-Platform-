import QRCode from 'qrcode';

/**
 * Renders a QR code as an image.
 *
 * SERVER-SIDE, and delivered through GraphQL as data rather than from an image
 * endpoint. Two reasons:
 *
 *  1. The admin access token lives in memory, not a cookie, so an `<img src>`
 *     would carry no credential - a QR image endpoint would have to be public
 *     or grow its own auth scheme. Returning the asset as a field on an already
 *     authorised query inherits RBAC and tenant scoping for free.
 *  2. One implementation. A second QR library in the browser would eventually
 *     render a slightly different symbol from the one that was printed.
 *
 * The scan URL is built from server configuration, so the encoded URL cannot be
 * influenced by anything a client sends.
 */

/**
 * Error-correction level M, which tolerates ~15% damage.
 *
 * Chosen for print. A poster gets rained on, sun-bleached and torn; L would
 * save a few modules and fail in exactly those conditions. H would survive more
 * but makes the symbol denser, which hurts a phone camera at distance - the
 * far more common failure on a wall.
 */
const ERROR_CORRECTION = 'M' as const;

/** Quiet zone in modules. Four is the spec minimum; less breaks scanners. */
const QUIET_ZONE = 4;

export interface QrImageOptions {
  /** Pixel width of the PNG. Large enough that print does not resample. */
  readonly size?: number;
}

/** The public URL a scanner will open. */
export function buildScanUrl(apiOrigin: string, code: string): string {
  return new URL(`/q/${encodeURIComponent(code)}`, apiOrigin).toString();
}

export const qrImageService = {
  /**
   * PNG as a data URL, for on-screen preview and for download.
   *
   * 1024px by default: at a typical 300 DPI that is a ~8.7cm symbol, comfortably
   * above the size a phone can read from a metre away, and it downsamples
   * cleanly if printed smaller. Smaller sources upsample into blurry edges that
   * scanners struggle with.
   */
  async png(scanUrl: string, options: QrImageOptions = {}): Promise<string> {
    return QRCode.toDataURL(scanUrl, {
      errorCorrectionLevel: ERROR_CORRECTION,
      margin: QUIET_ZONE,
      width: options.size ?? 1024,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
  },

  /**
   * SVG markup.
   *
   * The format to print from: vector output stays sharp at any size, so the
   * same asset works on a pamphlet and on a hoarding. Returned as markup rather
   * than a data URL so the admin console can embed it inline and the browser's
   * own print pipeline can scale it.
   */
  async svg(scanUrl: string): Promise<string> {
    return QRCode.toString(scanUrl, {
      type: 'svg',
      errorCorrectionLevel: ERROR_CORRECTION,
      margin: QUIET_ZONE,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
  },

  /** Both representations plus the URL they encode. */
  async render(scanUrl: string, options: QrImageOptions = {}) {
    const [pngDataUrl, svg] = await Promise.all([
      qrImageService.png(scanUrl, options),
      qrImageService.svg(scanUrl),
    ]);
    return { scanUrl, pngDataUrl, svg };
  },
};
