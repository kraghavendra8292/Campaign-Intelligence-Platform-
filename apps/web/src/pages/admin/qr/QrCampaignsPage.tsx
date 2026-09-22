import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { QR_CAMPAIGN_STATUSES } from '@rk/types';
import { Button, Icon } from '@rk/ui';
import { useAdminMutation, useAdminQuery } from '../../../features/admin/adminApi';
import {
  QR_CAMPAIGNS,
  TRANSITION_QR_CAMPAIGN,
  type QrCampaignRow,
} from '../../../features/qr/qrQueries';
import {
  CmsPageHeader,
  IfPermitted,
  ToastRegion,
  useToasts,
} from '../../../components/cms/CmsShell';
import { QrBoundary, QrEmptyState, QrStatusBadge } from '../../../components/qr/QrShell';
import { formatDate } from '../../../lib/format';

/**
 * QR campaigns list.
 *
 * Layout follows the console list pattern used in modern ops tools: summary
 * cards, a single filter toolbar, then a sectioned data table with icon
 * actions - so a campaign manager can scan totals and act without hunting.
 */

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

const SEARCH_DEBOUNCE_MS = 300;

type ColumnKey =
  | 'status'
  | 'codes'
  | 'scans'
  | 'feedbacks'
  | 'open'
  | 'conversion'
  | 'dates';

const COLUMN_OPTIONS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'codes', label: 'QR codes' },
  { key: 'scans', label: 'Total scans' },
  { key: 'feedbacks', label: 'Feedbacks' },
  { key: 'open', label: 'Open issues' },
  { key: 'conversion', label: 'Conversion' },
  { key: 'dates', label: 'Runs' },
];

const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  status: true,
  codes: true,
  scans: true,
  feedbacks: true,
  open: true,
  conversion: true,
  dates: true,
};

export function QrCampaignsPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_COLUMNS);
  const { toasts, success, failure } = useToasts();
  const columnsRef = useRef<HTMLDivElement>(null);

  const variables = useMemo(
    () => ({ first: 50, status: status || null, search: search || null }),
    [status, search],
  );

  const { state, refetch } = useAdminQuery<{
    qrCampaigns: { nodes: QrCampaignRow[]; totalCount: number };
  }>(QR_CAMPAIGNS, variables);

  const transition = useAdminMutation<unknown, { id: string; action: string }>(
    TRANSITION_QR_CAMPAIGN,
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(draftSearch.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [draftSearch]);

  useEffect(() => {
    if (state.status !== 'loading') setRefreshing(false);
  }, [state.status]);

  useEffect(() => {
    if (!columnsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && columnsRef.current && !columnsRef.current.contains(target)) {
        setColumnsOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [columnsOpen]);

  const runTransition = useCallback(
    async (id: string, action: string) => {
      const result = await transition.run({ id, action });
      if (result) {
        success(action === 'ACTIVATE' ? 'Campaign activated.' : 'Campaign updated.');
        refetch();
      } else {
        failure(transition.state.error ?? 'Could not update this campaign.');
      }
    },
    [transition, refetch, success, failure],
  );

  const hasFilters = Boolean(status || search);

  const clearFilters = useCallback(() => {
    setStatus('');
    setSearch('');
    setDraftSearch('');
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
  }, [refetch]);

  const filtersBusy = state.status === 'loading';

  const summary =
    state.status === 'success'
      ? {
          campaigns: state.data.qrCampaigns.totalCount,
          scans: state.data.qrCampaigns.nodes.reduce((sum, row) => sum + row.totalScans, 0),
          feedbacks: state.data.qrCampaigns.nodes.reduce(
            (sum, row) => sum + row.siteFeedbackCount,
            0,
          ),
          active: state.data.qrCampaigns.nodes.filter((row) => row.status === 'ACTIVE').length,
        }
      : null;

  return (
    <div className="cms-page list-page">
      <CmsPageHeader
        title="QR campaigns"
        description="Measurable outreach channels. Each campaign holds the QR codes printed for it."
        actions={
          <IfPermitted permission="QR_CAMPAIGN_CREATE">
            <Link to="/admin/qr-campaigns/new">
              <Button variant="primary">New campaign</Button>
            </Link>
          </IfPermitted>
        }
      />

      {summary && state.status === 'success' && state.data.qrCampaigns.nodes.length > 0 ? (
        <div className="list-kpi-grid" role="group" aria-label="Campaign summary">
          <ListKpiCard
            label="Total campaigns"
            value={summary.campaigns.toLocaleString()}
            hint={hasFilters ? 'Matching current filters' : 'Across this organisation'}
          />
          <ListKpiCard
            label="Total scans"
            value={summary.scans.toLocaleString()}
            hint={`${summary.active.toLocaleString()} active in this view`}
          />
          <ListKpiCard
            label="Feedbacks"
            value={summary.feedbacks.toLocaleString()}
            hint="From campaigns in this view"
          />
        </div>
      ) : null}

      <div className="list-toolbar">
        <div className="list-toolbar__left">
          <label className="cms-search-field cms-search-field--toolbar">
            <Icon name="search" size={1} className="cms-search-field__icon" />
            <span className="visually-hidden">Search campaigns</span>
            <input
              className="cms-search-field__input"
              type="search"
              value={draftSearch}
              placeholder="Search"
              autoComplete="off"
              onChange={(event) => setDraftSearch(event.target.value)}
            />
            {draftSearch ? (
              <button
                type="button"
                className="cms-search-field__clear"
                aria-label="Clear search"
                onClick={() => {
                  setDraftSearch('');
                  setSearch('');
                }}
              >
                <Icon name="close" size={0.9} />
              </button>
            ) : null}
          </label>

          <label className="list-toolbar__select">
            <span className="visually-hidden">Filter by status</span>
            <select
              className="list-toolbar__select-control"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {QR_CAMPAIGN_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={0.9} className="list-toolbar__select-icon" />
          </label>

          <button
            type="button"
            className={`cms-icon-btn${refreshing ? ' cms-icon-btn--busy' : ''}`}
            aria-label="Refresh campaigns"
            title="Refresh"
            disabled={filtersBusy}
            onClick={handleRefresh}
          >
            <Icon name="refresh" size={1.05} />
          </button>

          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </div>

        <div className="list-toolbar__right">
          <Link to="/admin/qr-analytics" className="cms-filters__link">
            View all analytics
          </Link>
          <button
            type="button"
            className={`cms-icon-btn cms-icon-btn--square${refreshing ? ' cms-icon-btn--busy' : ''}`}
            aria-label="Refresh list"
            title="Refresh"
            disabled={filtersBusy}
            onClick={handleRefresh}
          >
            <Icon name="refresh" size={1.15} />
          </button>
        </div>
      </div>

      <QrBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.qrCampaigns.nodes.length === 0}
        empty={
          hasFilters ? (
            <QrEmptyState
              title="No campaigns match these filters."
              message="Try a different status, adjust the search, or clear filters to see every campaign."
              action={
                <Button type="button" variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <QrEmptyState
              title="No QR campaigns have been created yet."
              message="A campaign groups the QR codes printed for one outreach push, so their performance can be compared."
              action={
                <IfPermitted permission="QR_CAMPAIGN_CREATE">
                  <Link to="/admin/qr-campaigns/new">
                    <Button variant="primary">Create the first campaign</Button>
                  </Link>
                </IfPermitted>
              }
            />
          )
        }
      >
        {(data) => (
          <section className="list-table-card">
            <header className="list-table-card__header">
              <h2 className="list-table-card__title">
                Campaigns
                <span className="list-table-card__count">
                  ({data.qrCampaigns.totalCount.toLocaleString()}{' '}
                  {data.qrCampaigns.totalCount === 1 ? 'row' : 'rows'})
                </span>
              </h2>

              <div className="list-table-card__tools" ref={columnsRef}>
                <button
                  type="button"
                  className="list-columns-btn"
                  aria-haspopup="menu"
                  aria-expanded={columnsOpen}
                  onClick={() => setColumnsOpen((value) => !value)}
                >
                  <Icon name="columns" size={1} />
                  Columns
                </button>
                {columnsOpen ? (
                  <div className="list-columns-menu" role="menu">
                    {COLUMN_OPTIONS.map((column) => (
                      <label key={column.key} className="list-columns-menu__item">
                        <input
                          type="checkbox"
                          checked={visibleColumns[column.key]}
                          onChange={() =>
                            setVisibleColumns((current) => ({
                              ...current,
                              [column.key]: !current[column.key],
                            }))
                          }
                        />
                        {column.label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </header>

            <div className="list-table-scroll">
              <table className="list-table">
                <caption className="visually-hidden">QR campaigns</caption>
                <thead>
                  <tr>
                    <th scope="col" className="list-table__actions-col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                    <th scope="col">Campaign</th>
                    {visibleColumns.status ? <th scope="col">Status</th> : null}
                    {visibleColumns.codes ? (
                      <th scope="col" className="list-table__metric-head">
                        QR codes
                      </th>
                    ) : null}
                    {visibleColumns.scans ? (
                      <th scope="col" className="list-table__metric-head">
                        Total scans
                      </th>
                    ) : null}
                    {visibleColumns.feedbacks ? (
                      <th scope="col" className="list-table__metric-head">
                        Feedbacks
                      </th>
                    ) : null}
                    {visibleColumns.open ? (
                      <th scope="col" className="list-table__metric-head">
                        Open
                      </th>
                    ) : null}
                    {visibleColumns.conversion ? (
                      <th scope="col" className="list-table__metric-head">
                        Conversion
                      </th>
                    ) : null}
                    {visibleColumns.dates ? (
                      <th scope="col" className="list-table__secondary">
                        Runs
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {data.qrCampaigns.nodes.map((row) => (
                    <tr key={row.id}>
                      <td className="list-table__actions-col">
                        <CampaignRowActions
                          row={row}
                          busy={transition.state.submitting}
                          onTransition={runTransition}
                        />
                      </td>
                      <td>
                        <div className="cms-table__primary-cell">
                          <Link className="cms-table__link" to={`/admin/qr-campaigns/${row.id}`}>
                            {row.name}
                          </Link>
                          <span className="cms-table__subtle">
                            {row.campaignType.replace(/_/g, ' ').toLowerCase()}
                          </span>
                        </div>
                      </td>
                      {visibleColumns.status ? (
                        <td>
                          <QrStatusBadge value={row.status} />
                        </td>
                      ) : null}
                      {visibleColumns.codes ? (
                        <td className="list-table__metric">{row.qrCodeCount.toLocaleString()}</td>
                      ) : null}
                      {visibleColumns.scans ? (
                        <td className="list-table__metric">{row.totalScans.toLocaleString()}</td>
                      ) : null}
                      {visibleColumns.feedbacks ? (
                        <td className="list-table__metric">
                          {row.siteFeedbackCount.toLocaleString()}
                        </td>
                      ) : null}
                      {visibleColumns.open ? (
                        <td className="list-table__metric">
                          {row.openIssueCount.toLocaleString()}
                        </td>
                      ) : null}
                      {visibleColumns.conversion ? (
                        <td className="list-table__metric">
                          {row.conversionRatePct === null ? '—' : `${row.conversionRatePct}%`}
                        </td>
                      ) : null}
                      {visibleColumns.dates ? (
                        <td className="list-table__secondary">
                          {row.startDate ? (
                            <span className="list-table__runs">
                              <span>{formatDate(row.startDate)}</span>
                              {row.endDate ? <span>{formatDate(row.endDate)}</span> : null}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </QrBoundary>

      <ToastRegion toasts={toasts} />
    </div>
  );
}

function ListKpiCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="list-kpi-card">
      <p className="list-kpi-card__label">{label}</p>
      <p className="list-kpi-card__value">{value}</p>
      <p className="list-kpi-card__hint">{hint}</p>
    </article>
  );
}

function CampaignRowActions({
  row,
  busy,
  onTransition,
}: {
  row: QrCampaignRow;
  busy: boolean;
  onTransition: (id: string, action: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="list-row-actions" ref={menuRef}>
      <Link
        className="list-action-btn list-action-btn--view"
        to={`/admin/qr-campaigns/${row.id}`}
        aria-label={`View ${row.name}`}
        title="View"
      >
        <Icon name="eye" size={1} />
      </Link>

      <IfPermitted permission="QR_CAMPAIGN_UPDATE">
        <Link
          className="list-action-btn list-action-btn--edit"
          to={`/admin/qr-campaigns/${row.id}/edit`}
          aria-label={`Edit ${row.name}`}
          title="Edit"
        >
          <Icon name="pencil" size={1} />
        </Link>
      </IfPermitted>

      <IfPermitted permission="QR_ANALYTICS_READ">
        <Link
          className="list-action-btn list-action-btn--analytics"
          to={`/admin/qr-campaigns/${row.id}/analytics`}
          aria-label={`Analytics for ${row.name}`}
          title="Analytics"
        >
          <Icon name="barChart" size={1} />
        </Link>
      </IfPermitted>

      <IfPermitted permission="QR_CAMPAIGN_ARCHIVE">
        {row.status === 'ACTIVE' ? (
          <button
            type="button"
            className="list-action-btn list-action-btn--pause"
            aria-label="Pause"
            title="Pause"
            disabled={busy}
            onClick={() => onTransition(row.id, 'PAUSE')}
          >
            <Icon name="pause" size={1} />
          </button>
        ) : (
          <button
            type="button"
            className="list-action-btn list-action-btn--activate"
            aria-label="Activate"
            title="Activate"
            disabled={busy}
            onClick={() => onTransition(row.id, 'ACTIVATE')}
          >
            <Icon name="play" size={1} />
          </button>
        )}
      </IfPermitted>

      <div className={`cms-actions-menu${open ? ' cms-actions-menu--open' : ''}`}>
        <button
          type="button"
          className="list-action-btn list-action-btn--more"
          aria-label={`Actions for ${row.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          title="More"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="moreVertical" size={1.05} />
        </button>
        {open ? (
          <div className="cms-actions-menu__panel" role="menu">
            <IfPermitted permission="ISSUE_READ">
              <MenuLink
                to={`/admin/issues?campaignId=${encodeURIComponent(row.id)}`}
                onNavigate={() => setOpen(false)}
              >
                Feedbacks
              </MenuLink>
            </IfPermitted>
            <IfPermitted permission="QR_CAMPAIGN_ARCHIVE">
              {row.status !== 'ARCHIVED' ? (
                <MenuButton
                  disabled={busy}
                  onClick={() => {
                    setOpen(false);
                    onTransition(row.id, 'ARCHIVE');
                  }}
                >
                  Archive
                </MenuButton>
              ) : null}
            </IfPermitted>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MenuLink({
  to,
  children,
  onNavigate,
}: {
  to: string;
  children: ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link className="cms-actions-menu__item" role="menuitem" to={to} onClick={onNavigate}>
      {children}
    </Link>
  );
}

function MenuButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="cms-actions-menu__item"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
