import { Badge } from '@rk/ui';
import type { StatusTone } from '@rk/design-tokens';
import { useSite } from '../../features/site/SiteContext';
import type { StringKey } from '../../i18n/strings';

/**
 * Status indicator for content and project lifecycle.
 *
 * Colour is never the only signal: every badge carries a translated text label,
 * and the "verified" badge adds a check glyph. A reader who cannot distinguish
 * green from amber still gets the status from the words.
 */

type KnownStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'CANCELLED'
  | 'UPCOMING'
  | 'ONGOING'
  | 'UNVERIFIED'
  | 'VERIFIED';

/** Tone conveys emphasis; the label conveys meaning. */
const TONES: Record<KnownStatus, StatusTone> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
  PLANNED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  ON_HOLD: 'neutral',
  CANCELLED: 'error',
  UPCOMING: 'info',
  ONGOING: 'warning',
  UNVERIFIED: 'neutral',
  VERIFIED: 'success',
};

export interface StatusBadgeProps {
  status: KnownStatus;
  withDot?: boolean;
}

export function StatusBadge({ status, withDot = true }: StatusBadgeProps) {
  const { t } = useSite();
  return (
    <Badge tone={TONES[status]} withDot={withDot}>
      {t(`status.${status}` as StringKey)}
    </Badge>
  );
}

/**
 * Verification marker for achievements.
 *
 * Rendered only when a claim is actually VERIFIED - an "unverified" badge on
 * every other item would imply a judgement that has not been made.
 */
export function VerifiedBadge({ verification }: { verification: string }) {
  const { t } = useSite();
  if (verification !== 'VERIFIED') return null;

  return (
    <Badge tone="success">
      <span aria-hidden="true">✓</span> {t('card.verified')}
    </Badge>
  );
}

/** Category chip. Uses the translated label, never the raw enum. */
export function CategoryBadge({ category }: { category: string }) {
  const { t } = useSite();
  return <Badge tone="neutral">{t(`category.${category}` as StringKey)}</Badge>;
}
