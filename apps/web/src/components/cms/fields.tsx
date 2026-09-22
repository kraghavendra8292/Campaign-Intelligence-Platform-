import type { ReactNode } from 'react';
import { Button, Field, Input, Select } from '@rk/ui';
import { useAdminI18n } from '../../features/admin/AdminI18nContext';

/**
 * CMS form fields.
 *
 * Thin wrappers over the Phase 1 primitives that add the things every CMS form
 * needs and that are easy to forget individually: a required marker, a hint
 * wired to `aria-describedby`, and a field-level error fed from the API's
 * `details.field`.
 */

export interface FieldErrors {
  [field: string]: string | undefined;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  errors,
  required,
  hint,
  type = 'text',
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors?: FieldErrors;
  required?: boolean;
  hint?: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const error = errors?.[id];

  return (
    <Field
      htmlFor={id}
      label={label}
      required={required ?? false}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
    >
      <Input
        id={id}
        type={type}
        value={value}
        invalid={Boolean(error)}
        hasHint={Boolean(hint)}
        required={required ?? false}
        disabled={disabled ?? false}
        {...(placeholder ? { placeholder } : {})}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  errors,
  hint,
  rows = 4,
  maxLength,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors?: FieldErrors;
  hint?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
}) {
  const error = errors?.[id];

  return (
    <Field htmlFor={id} label={label} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <textarea
        id={id}
        className="cms-textarea"
        value={value}
        rows={rows}
        disabled={disabled ?? false}
        aria-invalid={error ? true : undefined}
        {...(maxLength ? { maxLength } : {})}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  errors,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  errors?: FieldErrors;
  hint?: string;
  disabled?: boolean;
}) {
  const error = errors?.[id];

  return (
    <Field htmlFor={id} label={label} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <Select
        id={id}
        options={options}
        value={value}
        invalid={Boolean(error)}
        hasHint={Boolean(hint)}
        disabled={disabled ?? false}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="cms-checkbox">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled ?? false}
        {...(hint ? { 'aria-describedby': `${id}-hint` } : {})}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p className="cms-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Groups related inputs under a legend, which screen readers announce. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="cms-form-section">
      <legend className="cms-form-section__legend">{title}</legend>
      <div className="cms-form-section__body">{children}</div>
    </fieldset>
  );
}

/**
 * Form footer.
 *
 * "Save" never publishes. Publishing is a separate, separately-permitted
 * action, so the two are visually distinct and cannot be confused.
 */
export function FormActions({
  submitting,
  onCancel,
  saveLabel,
  extra,
}: {
  submitting: boolean;
  onCancel: () => void;
  /** Defaults to the translated "Save". */
  saveLabel?: string;
  extra?: ReactNode;
}) {
  const { t } = useAdminI18n();

  return (
    <div className="cms-form-actions">
      <div className="cms-form-actions__primary">
        <Button type="submit" variant="primary" isLoading={submitting}>
          {saveLabel ?? t('action.save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          {t('action.cancel')}
        </Button>
      </div>
      {extra ? <div className="cms-form-actions__extra">{extra}</div> : null}
    </div>
  );
}

/** Banner for an error that is not attached to a single field. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p className="cms-form-error" role="alert">
      {message}
    </p>
  );
}
