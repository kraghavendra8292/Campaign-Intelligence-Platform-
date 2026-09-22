import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Card, ErrorState, LoadingState } from '@rk/ui';
import { LOCALES, type Locale, type Permission } from '@rk/types';
import { useAuth } from '../../features/auth/AuthProvider';
import { useCmsLocale } from '../../features/cms/CmsLocaleContext';
import { useAdminI18n } from '../../features/admin/AdminI18nContext';
import type { CmsQueryState } from '../../features/cms/useCms';

/**
 * Shared CMS chrome: page headers, tables, dialogs and toasts.
 *
 * Kept together because every CMS screen is assembled from the same handful of
 * pieces. One implementation means the empty state, the destructive-action
 * confirmation and the keyboard behaviour are identical everywhere - which is
 * what makes an admin tool feel predictable.
 */

export function CmsPageHeader({
  title,
  description,
  actions,
  localized,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /**
   * Whether this screen edits translatable content. Set on every screen whose
   * rows are keyed by locale; left off for the media library, which holds one
   * set of files shared by all languages.
   */
  localized?: boolean;
}) {
  return (
    <header className="cms-page-header">
      <div>
        <h1 className="cms-page-header__title">{title}</h1>
        {description ? <p className="cms-page-header__description">{description}</p> : null}
      </div>
      <div className="cms-page-header__actions">
        {localized ? <CmsLocaleSwitcher /> : null}
        {actions}
      </div>
    </header>
  );
}

/**
 * Switches which language the CMS is editing.
 *
 * Placed in the page header rather than buried in a form, because it changes
 * WHICH RECORDS are on screen - the English and Kannada versions of a project
 * are separate rows with separate publishing states, so this is closer to
 * switching folders than to changing a setting.
 */
export function CmsLocaleSwitcher() {
  const { locale, setLocale } = useCmsLocale();
  const { t } = useAdminI18n();

  return (
    <label className="cms-locale-switch">
      {/*
        Named "editing language" rather than just "language", because the
        console now has two: this one changes WHICH ROWS are on screen, and the
        one in the topbar changes the words around them.
      */}
      <span className="cms-locale-switch__label">{t('cms.editingLanguage')}</span>
      <select
        className="rk-select__control"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {LOCALES.map((value) => (
          <option key={value} value={value}>
            {value === 'en' ? 'English' : 'ಕನ್ನಡ (Kannada)'}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Renders a CMS query's states.
 *
 * A 403 is given its own message: "you cannot see this" is actionable
 * (ask an administrator), whereas the generic error tells the user nothing.
 */
export function CmsBoundary<T>({
  state,
  refetch,
  isEmpty,
  emptyMessage,
  emptyAction,
  children,
}: {
  state: CmsQueryState<T>;
  refetch?: () => void;
  isEmpty?: (data: T) => boolean;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const { t } = useAdminI18n();

  if (state.status === 'loading') return <LoadingState title={t('state.loading')} />;

  if (state.status === 'error') {
    if (state.code === 'FORBIDDEN') {
      return (
        <ErrorState title={t('state.forbiddenTitle')} description={t('state.forbiddenBody')} />
      );
    }

    return (
      <ErrorState
        title={t('state.errorTitle')}
        description={state.message}
        retryLabel={t('action.retry')}
        {...(refetch ? { onRetry: refetch } : {})}
      />
    );
  }

  if (isEmpty?.(state.data)) {
    return (
      <div className="cms-empty">
        <p className="cms-empty__title">{emptyMessage ?? t('state.empty')}</p>
        {emptyAction}
      </div>
    );
  }

  return <>{children(state.data)}</>;
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Hidden below the medium breakpoint to keep tables readable on phones. */
  secondary?: boolean;
}

/**
 * Data table.
 *
 * A real `<table>` with a `<caption>` rather than a grid of divs: screen
 * readers announce row and column relationships from the semantics, which a
 * div layout has to reconstruct with ARIA and usually gets wrong.
 */
export function DataTable<T extends { id: string }>({
  caption,
  columns,
  rows,
  actions,
}: {
  caption: string;
  columns: Array<Column<T>>;
  rows: T[];
  actions?: (row: T) => ReactNode;
}) {
  const { t } = useAdminI18n();

  return (
    <div className="cms-table-wrapper">
      <table className="cms-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.secondary ? 'cms-table__secondary' : undefined}
              >
                {column.header}
              </th>
            ))}
            {actions ? (
              <th scope="col">
                <span className="visually-hidden">{t('table.actions')}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.secondary ? 'cms-table__secondary' : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
              {actions ? <td className="cms-table__actions">{actions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Confirmation for destructive actions.
 *
 * A real modal dialog: focus moves in on open, Escape closes, and the
 * confirming button is styled as dangerous. Deleting content is not undoable
 * here, so it should require a deliberate second action.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  message: string;
  /** Defaults to the translated "Delete", since that is the usual case. */
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const { t } = useAdminI18n();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    confirmRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="cms-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="cms-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="cms-dialog__title">
          {title}
        </h2>
        <p id="confirm-message" className="cms-dialog__message">
          {message}
        </p>
        <div className="cms-dialog__actions">
          <Button variant="secondary" onClick={onCancel}>
            {t('action.cancel')}
          </Button>
          <Button ref={confirmRef} variant="danger" onClick={onConfirm} isLoading={busy ?? false}>
            {confirmLabel ?? t('action.delete')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface ToastMessage {
  id: number;
  tone: 'success' | 'error';
  text: string;
}

/** Transient confirmation of a completed action. */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const push = (tone: ToastMessage['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { id, tone, text }]);
    // Auto-dismiss; the live region has already announced it by then.
    window.setTimeout(() => setToasts((all) => all.filter((item) => item.id !== id)), 5000);
  };

  return {
    toasts,
    success: (text: string) => push('success', text),
    failure: (text: string) => push('error', text),
  };
}

export function ToastRegion({ toasts }: { toasts: ToastMessage[] }) {
  return (
    // Polite: a save confirmation should not interrupt what the user is typing.
    <div className="cms-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`cms-toast cms-toast--${toast.tone}`}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}

/**
 * Renders children only when the signed-in user holds a permission.
 *
 * Presentation only. The API enforces the same permission independently, so
 * this hides a button the user cannot use rather than protecting the action.
 */
export function IfPermitted({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useAuth();
  return <>{can(permission) ? children : fallback}</>;
}

export function CmsCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Card>
      {title ? <h2 className="cms-card__title">{title}</h2> : null}
      {children}
    </Card>
  );
}
