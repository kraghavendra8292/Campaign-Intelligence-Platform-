import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface FieldProps {
  /** Must match the `id` of the control it labels. */
  htmlFor: string;
  label: ReactNode;
  /** Supporting text rendered below the control, announced via aria-describedby. */
  hint?: ReactNode;
  /** Validation message. Its presence puts the field in the invalid state. */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** Ids derived from a field id, so label/hint/error wiring stays consistent. */
export function fieldIds(id: string) {
  return { hintId: `${id}-hint`, errorId: `${id}-error` };
}

/**
 * Accessible label + hint + error wrapper for form controls.
 *
 * Controls are passed as children and are responsible for wiring
 * `aria-describedby` using `fieldIds()`.
 */
export function Field({
  htmlFor,
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  const { hintId, errorId } = fieldIds(htmlFor);

  return (
    <div className={cx('rk-field', error && 'rk-field--invalid', className)}>
      <label className="rk-field__label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="rk-field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children}

      {hint && !error ? (
        <p className="rk-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p className="rk-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
