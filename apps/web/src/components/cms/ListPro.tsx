import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { Icon } from '@rk/ui';

/**
 * Shared list-pro chrome used across CMS, QR, Issues and related admin lists.
 *
 * One composition everywhere: KPI cards → toolbar (search / filter / refresh)
 * → sectioned table card. Pages supply the data and row actions; this file
 * only owns the layout primitives so every sidepanel list feels like one product.
 */

export function ListKpiGrid({
  children,
  label = 'Summary',
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="list-kpi-grid" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function ListKpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="list-kpi-card">
      <p className="list-kpi-card__label">{label}</p>
      <p className="list-kpi-card__value">{value}</p>
      <p className="list-kpi-card__hint">{hint}</p>
    </article>
  );
}

export function ListToolbar({
  search,
  onSearchChange,
  searchLabel = 'Search',
  searchPlaceholder = 'Search',
  filter,
  onRefresh,
  refreshing,
  busy,
  trailing,
  onClear,
  hasFilters,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  filter?: ReactNode;
  onRefresh: () => void;
  refreshing?: boolean;
  busy?: boolean;
  trailing?: ReactNode;
  onClear?: () => void;
  hasFilters?: boolean;
}) {
  return (
    <div className="list-toolbar">
      <div className="list-toolbar__left">
        <label className="cms-search-field cms-search-field--toolbar">
          <Icon name="search" size={1} className="cms-search-field__icon" />
          <span className="visually-hidden">{searchLabel}</span>
          <input
            className="cms-search-field__input"
            type="search"
            value={search}
            placeholder={searchPlaceholder}
            autoComplete="off"
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {search ? (
            <button
              type="button"
              className="cms-search-field__clear"
              aria-label="Clear search"
              onClick={() => onSearchChange('')}
            >
              <Icon name="close" size={0.9} />
            </button>
          ) : null}
        </label>

        {filter}

        <button
          type="button"
          className={`cms-icon-btn${refreshing ? ' cms-icon-btn--busy' : ''}`}
          aria-label="Refresh"
          title="Refresh"
          disabled={busy}
          onClick={onRefresh}
        >
          <Icon name="refresh" size={1.05} />
        </button>

        {hasFilters && onClear ? (
          <button type="button" className="list-toolbar__clear" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      <div className="list-toolbar__right">
        {trailing}
        <button
          type="button"
          className={`cms-icon-btn cms-icon-btn--square${refreshing ? ' cms-icon-btn--busy' : ''}`}
          aria-label="Refresh list"
          title="Refresh"
          disabled={busy}
          onClick={onRefresh}
        >
          <Icon name="refresh" size={1.15} />
        </button>
      </div>
    </div>
  );
}

export function ListSelectFilter({
  label,
  ...props
}: { label: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="list-toolbar__select">
      <span className="visually-hidden">{label}</span>
      <select className="list-toolbar__select-control" {...props} />
      <Icon name="chevronDown" size={0.9} className="list-toolbar__select-icon" />
    </label>
  );
}

export function ListTableCard({
  title,
  count,
  countLabel = 'rows',
  columns,
  columnOptions,
  visibleColumns,
  onToggleColumn,
  children,
}: {
  title: string;
  count: number;
  countLabel?: string;
  columns?: boolean;
  columnOptions?: Array<{ key: string; label: string }>;
  visibleColumns?: Record<string, boolean>;
  onToggleColumn?: (key: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && ref.current && !ref.current.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <section className="list-table-card">
      <header className="list-table-card__header">
        <h2 className="list-table-card__title">
          {title}
          <span className="list-table-card__count">
            ({count.toLocaleString()} {count === 1 ? countLabel.replace(/s$/, '') : countLabel})
          </span>
        </h2>

        {columns && columnOptions && visibleColumns && onToggleColumn ? (
          <div className="list-table-card__tools" ref={ref}>
            <button
              type="button"
              className="list-columns-btn"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <Icon name="columns" size={1} />
              Columns
            </button>
            {open ? (
              <div className="list-columns-menu" role="menu">
                {columnOptions.map((column) => (
                  <label key={column.key} className="list-columns-menu__item">
                    <input
                      type="checkbox"
                      checked={visibleColumns[column.key] ?? false}
                      onChange={() => onToggleColumn(column.key)}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>
      <div className="list-table-scroll">{children}</div>
    </section>
  );
}

/** Debounced search helper — 300ms, same cadence as QR / Projects lists. */
export const LIST_SEARCH_DEBOUNCE_MS = 300;
