import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `raised` adds elevation; `flat` relies on the border alone. */
  elevation?: 'flat' | 'raised';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

/** Rounded surface container used throughout the public site and admin shell. */
export function Card({
  elevation = 'raised',
  padding = 'md',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={cx('rk-card', `rk-card--${elevation}`, `rk-card--pad-${padding}`, className)}
    >
      {children}
    </div>
  );
}

// `title` is omitted from the DOM attributes because the card's heading is a
// ReactNode, not the string that the HTML `title` tooltip attribute expects.
export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function CardHeader({ title, description, actions, className, ...rest }: CardHeaderProps) {
  return (
    <div {...rest} className={cx('rk-card__header', className)}>
      <div className="rk-card__heading">
        <h3 className="rk-card__title">{title}</h3>
        {description ? <p className="rk-card__description">{description}</p> : null}
      </div>
      {actions ? <div className="rk-card__actions">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rk-card__body', className)}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rk-card__footer', className)}>
      {children}
    </div>
  );
}
