import type { IconName } from '@rk/ui';
import { Icon } from '@rk/ui';

/**
 * Maps CMS social `platform` strings to a glyph + accessible short label.
 *
 * Platforms are free-text in the CMS; anything we do not recognise falls back
 * to a generic link mark so a typo never blanks the row.
 */
const SOCIAL_ICONS: Record<
  string,
  { icon: IconName; shortLabel: string; brand: 'facebook' | 'instagram' | 'x' | 'youtube' | 'other' }
> = {
  facebook: { icon: 'facebook', shortLabel: 'Facebook', brand: 'facebook' },
  fb: { icon: 'facebook', shortLabel: 'Facebook', brand: 'facebook' },
  x: { icon: 'x', shortLabel: 'X', brand: 'x' },
  twitter: { icon: 'x', shortLabel: 'X', brand: 'x' },
  youtube: { icon: 'youtube', shortLabel: 'YouTube', brand: 'youtube' },
  yt: { icon: 'youtube', shortLabel: 'YouTube', brand: 'youtube' },
  instagram: { icon: 'instagram', shortLabel: 'Instagram', brand: 'instagram' },
  ig: { icon: 'instagram', shortLabel: 'Instagram', brand: 'instagram' },
};

export function socialPlatformMeta(platform: string): {
  icon: IconName;
  shortLabel: string;
  brand: 'facebook' | 'instagram' | 'x' | 'youtube' | 'other';
} {
  const key = platform.trim().toLowerCase();
  return SOCIAL_ICONS[key] ?? { icon: 'externalLink', shortLabel: platform, brand: 'other' };
}

export function SocialPlatformIcon({
  platform,
  size = 1.1,
}: {
  platform: string;
  size?: number;
}) {
  const { icon } = socialPlatformMeta(platform);
  return <Icon name={icon} size={size} />;
}
