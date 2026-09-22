import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '../utils/cx';
import { fieldIds } from './Field';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Required so the control can be wired to its label and messages. */
  id: string;
  invalid?: boolean;
  /** Set when the matching `Field` renders hint text. */
  hasHint?: boolean;
  inputSize?: 'sm' | 'md' | 'lg';
}

/** Single-line text control. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, invalid = false, hasHint = false, inputSize = 'md', className, ...rest },
  ref,
) {
  const { hintId, errorId } = fieldIds(id);
  const describedBy = [invalid ? errorId : null, hasHint && !invalid ? hintId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <input
      {...rest}
      id={id}
      ref={ref}
      className={cx(
        'rk-input',
        `rk-input--${inputSize}`,
        invalid && 'rk-input--invalid',
        className,
      )}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy || undefined}
    />
  );
});
