import { apiBaseUrl } from '../../config/env';
import type { SiteImage } from './types';

/**
 * Public URL for a CMS image.
 *
 * One place builds this so the media route can move without a search through
 * every component that happens to render a picture.
 */
export function mediaUrl(image: SiteImage): string {
  return `${apiBaseUrl}/media/${image.id}`;
}
