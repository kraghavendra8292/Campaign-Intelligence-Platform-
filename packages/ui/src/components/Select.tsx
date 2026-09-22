import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cx } from '../utils/cx';
import { fieldIds } from './Field';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Required so the control can be wired to its label and messages. */
  id: string;
  options: readonly SelectOption[];
  /** Rendered as a disabled first option when the control has no value yet. */
  placeholder?: string;
  invalid?: boolean;
  hasHint?: boolean;
  selectSize?: 'sm' | 'md' | 'lg';
}

/** Native select, styled to match `Input`, with a custom chevron affordance. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id,
    options,
    placeholder,
    invalid = false,
    hasHint = false,
    selectSize = 'md',
    className,
    defaultValue,
    value,
    ...rest
  },
  ref,
) {
  const { hintId, errorId } = fieldIds(id);
  const describedBy = [invalid ? errorId : null, hasHint && !invalid ? hintId : null]
    .filter(Boolean)
    .join(' ');

  // Only supply the empty placeholder default when the caller is uncontrolled
  // and has not chosen its own initial value.
  const uncontrolledDefault =
    value === undefined && defaultValue === undefined && placeholder ? '' : defaultValue;

  return (
    <div className={cx('rk-select', `rk-select--${selectSize}`, className)}>
      <select
        {...rest}
        id={id}
        ref={ref}
        value={value}
        defaultValue={uncontrolledDefault}
        className={cx('rk-select__control', invalid && 'rk-select__control--invalid')}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy || undefined}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="rk-select__chevron" aria-hidden="true" />
    </div>
  );
});
