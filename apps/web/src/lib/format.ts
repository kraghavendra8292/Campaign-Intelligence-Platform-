/**
 * Display formatting for public content.
 *
 * Uses the browser's locale for dates and numbers rather than a hard-coded
 * format, so a reader sees dates the way their system presents them. Every
 * function tolerates null, because CMS fields are frequently absent and a page
 * must render "not stated" rather than "Invalid Date".
 */

/** A medium-length date, or null when there is nothing to show. */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Date with time, for events. */
export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * A start/end range, collapsing the common case of one day.
 *
 * "12 Mar 2026, 10:00 – 13:00" reads better than repeating the full date twice.
 */
export function formatDateRange(start: string, end: string | null | undefined): string {
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return '';

  const startText = formatDateTime(start) ?? '';
  if (!end) return startText;

  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) return startText;

  const sameDay = startDate.toDateString() === endDate.toDateString();

  if (sameDay) {
    const endTime = endDate.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${startText} – ${endTime}`;
  }

  return `${startText} – ${formatDateTime(end) ?? ''}`;
}

/**
 * Formats a currency amount.
 *
 * Returns null when the amount is absent: a project with no stated cost must
 * show "not stated", never a fabricated zero.
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency ?? 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // An unrecognised currency code should not break the page.
    return `${currency ?? ''} ${amount.toLocaleString()}`.trim();
  }
}

/** Formats a count, or null when it was never stated. */
export function formatCount(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value.toLocaleString();
}

/**
 * Builds an embeddable player URL for a known video host.
 *
 * Returns null for anything it does not recognise, and the UI then links out
 * instead of embedding - an unrecognised URL in an iframe is somebody else's
 * page running inside ours.
 */
export function toEmbedUrl(url: string, platform: string): string | null {
  try {
    const parsed = new URL(url);

    if (platform === 'YOUTUBE') {
      const id =
        parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v');
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }

    if (platform === 'VIMEO') {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : null;
    }
  } catch {
    return null;
  }

  return null;
}
