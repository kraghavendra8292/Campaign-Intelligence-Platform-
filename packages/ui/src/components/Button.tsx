import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { ButtonSize, ButtonVariant } from '@rk/design-tokens';
import { cx } from '../utils/cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches the button to the full width of its container. */
  fullWidth?: boolean;
  /**
   * Renders a busy state. The button stays focusable but is not activatable,
   * and `aria-busy` announces the state to assistive technology.
   */
  isLoading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/**
 * The primary interactive control of the design system.
 *
 * Presentation only - it holds no business logic and performs no data access.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    isLoading = false,
    leadingIcon,
    trailingIcon,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cx(
        'rk-button',
        `rk-button--${variant}`,
        `rk-button--${size}`,
        fullWidth && 'rk-button--full',
        isLoading && 'rk-button--loading',
        className,
      )}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? <span className="rk-button__spinner" aria-hidden="true" /> : leadingIcon}
      <span className="rk-button__label">{children}</span>
      {!isLoading && trailingIcon}
    </button>
  );
});
