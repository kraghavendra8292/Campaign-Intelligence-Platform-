import type { HeroAlbumCover, SiteImage } from './types';

/**
 * Builds the homepage hero slideshow from whatever the campaign has published.
 *
 * Pure and data-driven: the carousel renders a list, and this decides what is
 * in it. Keeping the two apart means the ordering and focal-point rules below
 * can be tested without mounting a component or faking a timer.
 */

/** How a slide is anchored when `object-fit: cover` has to crop it. */
export type SlideFocus = 'center' | 'top';

export interface HeroSlide {
  image: SiteImage;
  /** Falls back to the source's own title when the CMS has no alt text. */
  alt: string;
  focus: SlideFocus;
}

/**
 * More than this and the later slides are never seen before a visitor scrolls
 * on, so they would be bytes spent on nothing. On Save-Data / 2G we keep only
 * the cover photograph.
 */
const MAX_SLIDES = 5;
const MAX_SLIDES_SLOW = 1;

function maxSlidesForConnection(): number {
  if (typeof navigator === 'undefined') return MAX_SLIDES;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (connection?.saveData) return MAX_SLIDES_SLOW;
  if (connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
    return MAX_SLIDES_SLOW;
  }
  return MAX_SLIDES;
}

/**
 * Portraits are anchored to the top of the frame.
 *
 * A hero is wide and a portrait is tall, so `cover` has to discard most of the
 * height. Taking it off the BOTTOM keeps the head; centring the crop is what
 * decapitates people in campaign photographs.
 *
 * Anything squarer than this is centred, which is right for a landscape or a
 * group shot where the subject sits in the middle.
 */
const PORTRAIT_RATIO = 0.9;

function focusFor(image: SiteImage): SlideFocus {
  const { width, height } = image;
  if (!width || !height) return 'center';
  return width / height < PORTRAIT_RATIO ? 'top' : 'center';
}

export interface HeroSlideSources {
  coverImage?: SiteImage | null;
  profileImage?: SiteImage | null;
  albums?: HeroAlbumCover[] | null;
  /** Names the candidate or campaign, for slides with no alt text of their own. */
  fallbackAlt: string;
}

/**
 * Ordering is editorial, not arbitrary.
 *
 * The designated cover photo leads because it is the one image the campaign
 * chose to represent itself. Album covers follow in their published order.
 * The portrait is last: it is a profile picture, and it earns a hero slot only
 * when nothing better exists.
 */
export function buildHeroSlides({
  coverImage,
  profileImage,
  albums,
  fallbackAlt,
}: HeroSlideSources): HeroSlide[] {
  const candidates: { image: SiteImage | null | undefined; alt: string }[] = [
    { image: coverImage, alt: fallbackAlt },
    ...(albums ?? []).map((album) => ({ image: album.coverImage, alt: album.title })),
    { image: profileImage, alt: fallbackAlt },
  ];

  const slides: HeroSlide[] = [];
  const seen = new Set<string>();

  const limit = maxSlidesForConnection();

  for (const candidate of candidates) {
    const { image } = candidate;
    // The same asset is often both the cover and an album cover; showing it
    // twice would look like the slideshow had stalled.
    if (!image || seen.has(image.id)) continue;

    seen.add(image.id);
    slides.push({
      image,
      alt: image.altText ?? candidate.alt,
      focus: focusFor(image),
    });

    if (slides.length === limit) break;
  }

  return slides;
}
