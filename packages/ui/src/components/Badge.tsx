import type { HTMLAttributes } from 'react';
import type { StatusTone } from '@rk/design-tokens';
import { cx } from '../utils/cx';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  /** Renders a leading dot, useful for workflow status lists. */
  withDot?: boolean;
}

/**
 * Compact status indicator.
 *
 * Colour alone never carries the meaning - the label text is always present,
 * which keeps the status readable for colour-blind users.
 */
export function Badge({
  tone = 'neutral',
  withDot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span {...rest} className={cx('rk-badge', `rk-badge--${tone}`, className)}>
      {withDot ? <span className="rk-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
