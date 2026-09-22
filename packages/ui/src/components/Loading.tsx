import { cx } from '../utils/cx';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Accessible label announced while the spinner is visible. */
  label?: string;
}

/** Indeterminate activity indicator. */
export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  return (
    <span
      className={cx('rk-spinner', `rk-spinner--${size}`, className)}
      role="status"
      aria-label={label}
    />
  );
}

export interface LoadingStateProps {
  title?: string;
  description?: string;
  className?: string;
}

/**
 * Full-block loading placeholder for a page or panel.
 *
 * `aria-live="polite"` lets screen readers announce the transition without
 * interrupting whatever the user is currently doing.
 */
export function LoadingState({ title = 'Loading', description, className }: LoadingStateProps) {
  return (
    <div className={cx('rk-loading-state', className)} aria-live="polite" aria-busy="true">
      <Spinner size="lg" label={title} />
      <p className="rk-loading-state__title">{title}</p>
      {description ? <p className="rk-loading-state__description">{description}</p> : null}
    </div>
  );
}
