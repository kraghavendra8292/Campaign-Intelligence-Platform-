import sanitizeHtml from 'sanitize-html';
import { AppError } from '../../../errors/AppError';

/**
 * Rich-text sanitisation.
 *
 * CMS content is user-managed and ends up on a public page, so it is treated as
 * untrusted regardless of who wrote it - a compromised editor account would
 * otherwise be a stored-XSS vector against every visitor.
 *
 * Sanitisation happens on WRITE, not on render. Storing the sanitised form
 * means every reader (public site, CMS preview, a future mobile client, an
 * export) gets safe HTML without each having to remember to sanitise. The
 * trade-off is that the original input is not preserved; that is acceptable
 * because the stripped constructs have no legitimate editorial use.
 *
 * The policy is an ALLOW-LIST. A denylist of dangerous tags is unmaintainable:
 * the set of ways to execute script grows, and anything forgotten is a hole.
 */

/** Tags a campaign editor legitimately needs. Everything else is removed. */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'h4',
  'a',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
  'span',
];

/**
 * `h1` is deliberately absent: the page supplies exactly one `h1` (the content
 * title), and letting an editor inject more would break the heading hierarchy
 * that screen readers depend on.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    span: ['class'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
  },
  // No javascript:, data: or vbscript: URLs can survive this list.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  // Every outbound link is untrusted: noopener blocks window.opener hijacking,
  // nofollow avoids lending the campaign's reputation to arbitrary sites.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener noreferrer nofollow',
      target: '_blank',
    }),
    img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }),
  },
  // Style attributes are dropped entirely: they carry no editorial meaning the
  // design system does not already provide, and they are a known injection path.
  allowedStyles: {},
  disallowedTagsMode: 'discard',
};

/** Hard cap on stored rich text. Bounds both storage and render cost. */
const MAX_HTML_LENGTH = 200_000;

/**
 * Sanitises rich text for storage. Returns null for empty input so the column
 * holds NULL rather than an empty string.
 */
export function sanitizeRichText(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;

  if (input.length > MAX_HTML_LENGTH) {
    throw AppError.validation(
      `Content is too long (limit ${MAX_HTML_LENGTH.toLocaleString()} characters).`,
      { details: { limit: MAX_HTML_LENGTH } },
    );
  }

  const cleaned = sanitizeHtml(input, SANITIZE_OPTIONS).trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Strips all markup, for plain-text fields and for generating meta
 * descriptions from rich text.
 */
export function toPlainText(input: string | null | undefined, maxLength = 400): string | null {
  if (!input) return null;

  const text = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length === 0) return null;
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Validates a URL supplied by an editor (social links, map embeds).
 *
 * Only absolute http(s) is accepted. A relative or scheme-less value would be
 * resolved against the visitor's current page, and `javascript:` in an href is
 * script execution.
 */
export function assertSafeUrl(value: string, field: string): string {
  const trimmed = value.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw AppError.validation('Enter a complete URL including https://', {
      details: { field },
    });
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw AppError.validation('Only http and https links are allowed.', { details: { field } });
  }

  return url.toString();
}
