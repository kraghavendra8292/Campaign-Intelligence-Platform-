import { createHmac } from 'node:crypto';
import { type ScanDeviceCategory, type ScanOsCategory, type ScanReferrerCategory } from '@rk/types';

/**
 * Turns a raw HTTP request into the handful of coarse categories a campaign
 * team can actually use - and throws everything else away.
 *
 * THIS MODULE IS THE PRIVACY BOUNDARY. Raw User-Agent strings, referrer URLs
 * and IP addresses enter these functions; only enum members and one salted,
 * daily-rotating hash leave. Nothing downstream ever sees the inputs, so a
 * later change to analytics cannot accidentally start persisting them.
 *
 * The categories are deliberately coarse. "Mobile versus desktop" answers a
 * real question about how people reach the site. A browser build number,
 * screen size or font list answers no campaign question at all and would turn
 * an anonymous row into a fingerprint.
 */

// ---------------------------------------------------------------------------
// Automated traffic
// ---------------------------------------------------------------------------

/**
 * Signatures of traffic that is not a person.
 *
 * QR links get pasted into WhatsApp, Slack and Twitter, each of which fetches
 * the destination to build a link preview. Counting those as scans would
 * inflate every number the campaign team relies on - a single share could look
 * like a dozen citizens.
 *
 * These rows are STORED and flagged rather than dropped, so the totals stay
 * honest and the UI can offer "excluding automated traffic" truthfully.
 */
const AUTOMATED_SIGNATURES = [
  'bot',
  'crawler',
  'crawling',
  'spider',
  'slurp',
  'preview',
  'facebookexternalhit',
  'whatsapp',
  'telegrambot',
  'slackbot',
  'twitterbot',
  'linkedinbot',
  'discordbot',
  'skypeuripreview',
  'embedly',
  'quora link preview',
  'pinterest',
  'redditbot',
  'applebot',
  'google-inspectiontool',
  'headlesschrome',
  'phantomjs',
  'curl/',
  'wget/',
  'python-requests',
  'axios/',
  'node-fetch',
  'go-http-client',
  'okhttp',
  'java/',
  'libwww-perl',
  'monitoring',
  'uptime',
  'pingdom',
] as const;

export function isAutomatedAgent(userAgent: string | null): boolean {
  if (!userAgent) {
    // No User-Agent at all is characteristic of a script, not a phone camera.
    return true;
  }
  const lower = userAgent.toLowerCase();
  return AUTOMATED_SIGNATURES.some((signature) => lower.includes(signature));
}

// ---------------------------------------------------------------------------
// Device and operating system
// ---------------------------------------------------------------------------

/**
 * Classifies the device.
 *
 * Tablet is checked before mobile because an iPad's User-Agent contains
 * "Mobile" as well, and Android tablets identify as Android without "Mobile".
 * Getting that order wrong silently reports every tablet as a phone.
 */
export function classifyDevice(userAgent: string | null): ScanDeviceCategory {
  if (isAutomatedAgent(userAgent)) return 'BOT';
  if (!userAgent) return 'UNKNOWN';

  const ua = userAgent.toLowerCase();

  if (ua.includes('ipad') || ua.includes('tablet') || ua.includes('kindle')) return 'TABLET';
  if (ua.includes('android') && !ua.includes('mobile')) return 'TABLET';

  if (
    ua.includes('iphone') ||
    ua.includes('ipod') ||
    ua.includes('android') ||
    ua.includes('mobile') ||
    ua.includes('windows phone')
  ) {
    return 'MOBILE';
  }

  if (
    ua.includes('windows nt') ||
    ua.includes('macintosh') ||
    ua.includes('x11') ||
    ua.includes('linux') ||
    ua.includes('cros')
  ) {
    return 'DESKTOP';
  }

  return 'UNKNOWN';
}

/** Operating-system family only. Never a version. */
export function classifyOs(userAgent: string | null): ScanOsCategory {
  if (!userAgent) return 'UNKNOWN';
  const ua = userAgent.toLowerCase();

  // Android before Linux: every Android User-Agent also says "Linux".
  if (ua.includes('android')) return 'ANDROID';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod') || ua.includes('ios')) {
    return 'IOS';
  }
  if (ua.includes('windows')) return 'WINDOWS';
  // "Mac OS X" appears in iOS User-Agents too, so this must come after iOS.
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'MACOS';
  if (ua.includes('linux') || ua.includes('x11') || ua.includes('cros')) return 'LINUX';

  return 'OTHER';
}

// ---------------------------------------------------------------------------
// Referrer
// ---------------------------------------------------------------------------

const SEARCH_HOSTS = ['google.', 'bing.', 'duckduckgo.', 'yahoo.', 'baidu.', 'ecosia.', 'yandex.'];
const SOCIAL_HOSTS = [
  'facebook.',
  'instagram.',
  'twitter.',
  'x.com',
  't.co',
  'linkedin.',
  'youtube.',
  'sharechat.',
  'reddit.',
  'pinterest.',
];
const MESSAGING_HOSTS = ['whatsapp.', 'wa.me', 'telegram.', 't.me', 'signal.', 'messenger.'];

/**
 * Buckets the referrer by host family.
 *
 * Only the HOST is ever inspected, and even that is discarded once the bucket
 * is chosen. A full referrer URL routinely contains a search query or a private
 * group link - information about the person, not the channel, and of no use to
 * a campaign.
 *
 * A scan from a printed poster has no referrer at all, which is why DIRECT is
 * both the default and the expected majority.
 */
export function classifyReferrer(referrer: string | null): ScanReferrerCategory {
  if (!referrer || referrer.trim().length === 0) return 'DIRECT';

  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    // An unparseable referrer tells us nothing; it is not evidence of anything.
    return 'OTHER';
  }

  if (SEARCH_HOSTS.some((needle) => host.includes(needle))) return 'SEARCH';
  if (SOCIAL_HOSTS.some((needle) => host.includes(needle))) return 'SOCIAL';
  if (MESSAGING_HOSTS.some((needle) => host.includes(needle))) return 'MESSAGING';

  return 'OTHER';
}

// ---------------------------------------------------------------------------
// Repeat-visit estimation
// ---------------------------------------------------------------------------

/**
 * Computes a short-lived, non-reversible visit hash.
 *
 * PURPOSE. Distinguishing "one person scanned the poster twice" from "two
 * people scanned it" within a single day. That is the whole of it.
 *
 * HOW IT AVOIDS BEING AN IDENTIFIER, in four parts:
 *
 *  1. The salt is derived per UTC DAY, so the same phone at the same poster
 *     produces a completely different value tomorrow. Nothing can be linked
 *     across days, which rules out building a history of anyone.
 *  2. The QR code id is mixed in, so the same phone at two different posters
 *     produces unrelated values. Nothing can be linked across campaigns.
 *  3. It is an HMAC under a server-held key, so possessing the stored value and
 *     guessing an IP does not confirm the guess without the key.
 *  4. The IP address itself is never stored, logged or returned - it exists
 *     only as an argument to this function.
 *
 * The key is derived from the API's signing secret with domain separation, so
 * Phase 4 adds no new mandatory secret to the deployment contract, and this
 * value can never be confused with an authentication token.
 */
export function computeVisitHash(input: {
  readonly secret: string;
  readonly qrCodeId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly at: Date;
}): string | null {
  // With no IP there is nothing to distinguish repeat scans by, and inventing a
  // value would produce a bucket that silently merges unrelated visitors.
  if (!input.ipAddress) return null;

  const day = input.at.toISOString().slice(0, 10);

  const dailyKey = createHmac('sha256', input.secret).update(`qr-visit-salt|${day}`).digest();

  return createHmac('sha256', dailyKey)
    .update(`${input.qrCodeId}|${input.ipAddress}|${input.userAgent ?? ''}`)
    .digest('hex')
    .slice(0, 32);
}

// ---------------------------------------------------------------------------
// Time buckets
// ---------------------------------------------------------------------------

/**
 * UTC date, hour and weekday for a scan.
 *
 * Pre-computed at write time so day-of-week and time-of-day rollups become an
 * indexed GROUP BY rather than a per-row timezone computation across the whole
 * table. UTC throughout: a single campaign spans one region, and a stored
 * local hour would be wrong the moment the deployment moved.
 */
export function timeBuckets(at: Date): {
  scanDate: Date;
  scanHour: number;
  scanDayOfWeek: number;
} {
  return {
    scanDate: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())),
    scanHour: at.getUTCHours(),
    scanDayOfWeek: at.getUTCDay(),
  };
}
