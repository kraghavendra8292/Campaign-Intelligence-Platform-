import { useEffect } from 'react';
import { useSite } from './SiteContext';

/**
 * Document head management for public pages.
 *
 * Deliberately small and dependency-free. A full head library would add a
 * provider, a render-phase side-effect model and a bundle cost for what is, in
 * a client-rendered app, a handful of DOM writes.
 *
 * HONEST LIMITATION: this runs in the browser, so crawlers that do not execute
 * JavaScript see only the static shell. Facebook and LinkedIn in particular do
 * not run JS, so Open Graph previews will not reflect per-page content until
 * the public site is server-rendered or pre-rendered. The tags are correct for
 * Google (which does execute JS) and the markup is ready for SSR to populate.
 */

export interface SeoInput {
  title: string;
  description?: string | null | undefined;
  /** Absolute or site-relative path used for the canonical URL. */
  path?: string;
  image?: { id: string; altText?: string | null } | null | undefined;
  type?: 'website' | 'article';
  publishedAt?: string | null | undefined;
  /** Excludes a page from indexing (search results, previews). */
  noIndex?: boolean;
}

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);

  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
}

export function useSeo(input: SeoInput, siteName?: string | null): void {
  const { locale } = useSite();

  const { title, description, path, image, type = 'website', publishedAt, noIndex = false } = input;

  useEffect(() => {
    const fullTitle = siteName && title !== siteName ? `${title} — ${siteName}` : title;
    document.title = fullTitle;
    document.documentElement.lang = locale;

    const canonical = path
      ? new URL(path, window.location.origin).toString()
      : window.location.origin + window.location.pathname;

    if (description) {
      setMeta('meta[name="description"]', 'name', 'description', description);
    }

    setLink('canonical', canonical);

    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    setMeta('meta[property="og:type"]', 'property', 'og:type', type);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
    setMeta('meta[property="og:locale"]', 'property', 'og:locale', locale);

    if (siteName) {
      setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', siteName);
    }

    if (description) {
      setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    }

    if (image) {
      // Absolute: a relative og:image is ignored by every social crawler.
      const imageUrl = new URL(
        `/media/${image.id}`,
        import.meta.env.VITE_API_URL ?? window.location.origin,
      ).toString();

      setMeta('meta[property="og:image"]', 'property', 'og:image', imageUrl);
      setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', imageUrl);

      if (image.altText) {
        setMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', image.altText);
      }
    }

    setMeta(
      'meta[name="twitter:card"]',
      'name',
      'twitter:card',
      image ? 'summary_large_image' : 'summary',
    );
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);

    if (description) {
      setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    }

    if (type === 'article' && publishedAt) {
      setMeta(
        'meta[property="article:published_time"]',
        'property',
        'article:published_time',
        publishedAt,
      );
    }

    setMeta('meta[name="robots"]', 'name', 'robots', noIndex ? 'noindex,follow' : 'index,follow');
  }, [title, description, path, image, type, publishedAt, noIndex, siteName, locale]);
}
