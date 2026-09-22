import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

/**
 * Content placeholder shown while data loads.
 *
 * Preferred over a spinner wherever the SHAPE of the eventual content is known,
 * because it reserves the real layout: the page does not jump when data lands,
 * and the wait reads as "this is filling in" rather than "this is stuck".
 *
 * A skeleton group is announced once by its container, never per shape - a
 * screen reader hearing "loading" forty times is worse than silence. Individual
 * shapes are therefore `aria-hidden` and the container carries the live region.
 */

export interface SkeletonProps {
  /** CSS width. Vary it across lines so text blocks do not look mechanical. */
  width?: string;
  height?: string;
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  radius = 'sm',
  className,
}: SkeletonProps) {
  return (
    <span
      className={cx('rk-skeleton', `rk-skeleton--${radius}`, className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export interface SkeletonTextProps {
  /** Number of lines. The last one is short, the way real paragraphs end. */
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <span className={cx('rk-skeleton-text', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} height="0.875rem" width={index === lines - 1 ? '60%' : '100%'} />
      ))}
    </span>
  );
}

export interface SkeletonGroupProps {
  /**
   * Announced while the placeholder is on screen.
   *
   * Applied as `aria-label`, not as hidden text: `status` does not take its
   * name from its contents, so text inside would compute to no name at all.
   */
  label: string;
  className?: string;
  children: ReactNode;
}

/** Wraps a set of skeletons and owns their single accessible announcement. */
export function SkeletonGroup({ label, className, children }: SkeletonGroupProps) {
  return (
    <div
      className={cx('rk-skeleton-group', className)}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {children}
    </div>
  );
}
