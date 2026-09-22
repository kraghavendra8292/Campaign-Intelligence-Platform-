import type { ReactNode } from 'react';
import { Button } from './Button';
import { cx } from '../utils/cx';

export interface ErrorStateProps {
  title?: string;
  /**
   * Safe, human-readable description. Callers must pass a client-facing
   * message - never a raw exception, stack trace or driver error.
   */
  description?: ReactNode;
  /** Correlation id shown so a user can quote it to support. */
  correlationId?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/** Block-level error presentation for a failed page or panel. */
export function ErrorState({
  title = 'Something went wrong',
  description = 'The request could not be completed. Please try again.',
  correlationId,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <div className={cx('rk-error-state', className)} role="alert">
      <span className="rk-error-state__icon" aria-hidden="true">
        !
      </span>
      <div className="rk-error-state__content">
        <p className="rk-error-state__title">{title}</p>
        <p className="rk-error-state__description">{description}</p>
        {correlationId ? (
          <p className="rk-error-state__reference">
            Reference: <code>{correlationId}</code>
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
