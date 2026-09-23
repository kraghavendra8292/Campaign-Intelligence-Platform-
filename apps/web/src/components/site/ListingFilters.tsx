import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '@rk/ui';
import { CONTENT_CATEGORIES, type ContentCategory } from '@rk/types';
import { useSite } from '../../features/site/SiteContext';
import type { StringKey } from '../../i18n/strings';

/**
 * Shared public listing filters — search, selects, chip groups, and toggles.
 *
 * Works listing uses a single compact row (search + dropdowns). Other listings
 * may still use chip rows where equal-weight options help comparison.
 */

export function FilterPanel({
  children,
  onClear,
  showClear,
  compact,
}: {
  children: ReactNode;
  onClear?: () => void;
  showClear?: boolean;
  /** Single-row toolbar layout (search + dropdowns). */
  compact?: boolean;
}) {
  const { t } = useSite();

  return (
    <div className={`filter-panel${compact ? ' filter-panel--compact' : ''}`}>
      {showClear && onClear ? (
        <div className="filter-panel__toolbar">
          <button type="button" className="filter-panel__clear" onClick={onClear}>
            {t('filter.clear')}
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function FilterInlineRow({ children }: { children: ReactNode }) {
  return <div className="filter-panel__inline">{children}</div>;
}

export function FilterSearch({
  id,
  initial,
  placeholder,
  ariaLabel,
  onSubmit,
  compact,
}: {
  id: string;
  initial: string;
  placeholder: string;
  ariaLabel: string;
  onSubmit: (term: string) => void;
  /** Icon + short field; submit is icon-only (label stays for assistive tech). */
  compact?: boolean;
}) {
  const { t } = useSite();
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  return (
    <form
      className={`filter-panel__search${compact ? ' filter-panel__search--compact' : ''}`}
      role="search"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <button type="submit" className="filter-panel__search-icon-btn" aria-label={t('filter.search')}>
        <Icon name="search" size={1.05} />
      </button>
      <input
        id={id}
        className="filter-panel__search-input"
        type="search"
        value={value}
        placeholder={compact ? '' : placeholder}
        aria-label={ariaLabel}
        onChange={(event) => setValue(event.target.value)}
      />
      {compact ? null : (
        <button type="submit" className="filter-panel__search-submit">
          {t('filter.search')}
        </button>
      )}
    </form>
  );
}

export function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="filter-panel__select" htmlFor={id}>
      <span className="visually-hidden">{label}</span>
      <select
        id={id}
        className="filter-panel__select-control"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value || 'all'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={0.9} className="filter-panel__select-icon" />
    </label>
  );
}

export function FilterGroup({
  label,
  children,
  scroll = true,
}: {
  label: string;
  children: ReactNode;
  /** Horizontal scroll on small screens; wrap on larger. */
  scroll?: boolean;
}) {
  return (
    <div className="filter-panel__group">
      <p className="filter-panel__label">{label}</p>
      <div className={scroll ? 'filter-panel__scroller' : undefined}>
        <div
          className={scroll ? 'filter-panel__chips filter-panel__chips--scroll' : 'filter-panel__chips'}
          role="group"
          aria-label={label}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`filter-chip${active ? ' filter-chip--active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Equal-weight status options as a compact horizontal segmented control. */
export function FilterSegment({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="filter-panel__group">
      <p className="filter-panel__label">{label}</p>
      <div className="filter-panel__scroller">
        <div className="filter-panel__segment" role="group" aria-label={label}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function FilterToggle({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`filter-toggle${pressed ? ' filter-toggle--on' : ''}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span className="filter-toggle__mark" aria-hidden="true">
        {pressed ? '✓' : ''}
      </span>
      <span>{children}</span>
    </button>
  );
}

export function CategoryChips({
  value,
  onChange,
}: {
  value: ContentCategory | null;
  onChange: (next: ContentCategory | null) => void;
}) {
  const { t } = useSite();

  return (
    <FilterGroup label={t('filter.categoryLabel')}>
      <FilterChip active={value === null} onClick={() => onChange(null)}>
        {t('filter.all')}
      </FilterChip>
      {CONTENT_CATEGORIES.map((category) => (
        <FilterChip
          key={category}
          active={value === category}
          onClick={() => onChange(category)}
        >
          {t(`category.${category}` as StringKey)}
        </FilterChip>
      ))}
    </FilterGroup>
  );
}

export function CategorySelect({
  value,
  onChange,
}: {
  value: ContentCategory | null;
  onChange: (next: ContentCategory | null) => void;
}) {
  const { t } = useSite();

  return (
    <FilterSelect
      id="filter-category"
      label={t('filter.categoryLabel')}
      value={value ?? ''}
      onChange={(next) => onChange(next ? (next as ContentCategory) : null)}
      options={[
        { value: '', label: `${t('filter.categoryLabel')}: ${t('filter.all')}` },
        ...CONTENT_CATEGORIES.map((category) => ({
          value: category,
          label: t(`category.${category}` as StringKey),
        })),
      ]}
    />
  );
}
