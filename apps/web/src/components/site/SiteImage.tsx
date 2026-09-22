import { useState } from 'react';
import { mediaUrl } from '../../features/site/media';
import type { SiteImage as SiteImageData } from '../../features/site/types';

export interface SiteImageProps {
  image: SiteImageData | null | undefined;
  /** Used when the image has no alt text of its own. */
  fallbackAlt: string;
  /** Reserves space before the image loads, preventing layout shift. */
  aspectRatio?: '16/9' | '4/3' | '1/1' | '3/2';
  className?: string;
  /** The hero image is above the fold and must not be lazy-loaded. */
  priority?: boolean;
  sizes?: string;
}

/**
 * Public-site image.
 *
 * Three things this handles that a bare `<img>` does not:
 *
 *  - **No layout shift.** The wrapper owns the aspect ratio, so the box exists
 *    before the bytes arrive and text below never jumps.
 *  - **A real fallback.** Content may legitimately have no image; a broken icon
 *    is worse than a deliberate placeholder.
 *  - **Alt text discipline.** Decorative placeholders are `alt=""`; real images
 *    use CMS alt text and fall back to the content title rather than a filename.
 */
export function SiteImage({
  image,
  fallbackAlt,
  aspectRatio = '16/9',
  className,
  priority = false,
  sizes,
}: SiteImageProps) {
  const [failed, setFailed] = useState(false);

  const classes = ['site-image', `site-image--${aspectRatio.replace('/', '-')}`, className]
    .filter(Boolean)
    .join(' ');

  if (!image || failed) {
    return (
      <div className={`${classes} site-image--placeholder`} aria-hidden="true">
        <span className="site-image__placeholder-mark" />
      </div>
    );
  }

  return (
    <div className={classes}>
      <img
        src={mediaUrl(image)}
        alt={image.altText ?? fallbackAlt}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        {...(priority ? { fetchPriority: 'high' as const } : {})}
        {...(sizes ? { sizes } : {})}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
