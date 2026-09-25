import type { IconName } from '@rk/ui';
import { Icon } from '@rk/ui';

/**
 * Maps CMS social `platform` strings to a glyph + accessible short label.
 *
 * Platforms are free-text in the CMS; anything we do not recognise falls back
 * to a generic link mark so a typo never blanks the row.
 */
const SOCIAL_ICONS: Record<string, { icon: IconName; shortLabel: string }> = {
  facebook: { icon: 'facebook', shortLabel: 'Facebook' },
  fb: { icon: 'facebook', shortLabel: 'Facebook' },
  x: { icon: 'x', shortLabel: 'X' },
  twitter: { icon: 'x', shortLabel: 'X' },
  youtube: { icon: 'youtube', shortLabel: 'YouTube' },
  yt: { icon: 'youtube', shortLabel: 'YouTube' },
  instagram: { icon: 'instagram', shortLabel: 'Instagram' },
  ig: { icon: 'instagram', shortLabel: 'Instagram' },
};

export function socialPlatformMeta(platform: string): { icon: IconName; shortLabel: string } {
  const key = platform.trim().toLowerCase();
  return SOCIAL_ICONS[key] ?? { icon: 'externalLink', shortLabel: platform };
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
