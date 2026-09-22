import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ISSUE_PRIORITIES, ISSUE_STATUSES, MODERATION_STATUSES, SUBMISSION_TYPES } from '@rk/types';
import { Button, Icon } from '@rk/ui';
import { useAdminQuery } from '../../../features/admin/adminApi';
import {
  ISSUES_QUERY,
  ISSUE_ANALYTICS_QUERY,
  ISSUE_CATEGORIES_QUERY,
  type IssueAnalyticsData,
  type IssueCategoryRow,
  type IssueRow,
} from '../../../features/issues/issueQueries';
import { CmsPageHeader, DataTable, ToastRegion, useToasts } from '../../../components/cms/CmsShell';
import {
  LIST_SEARCH_DEBOUNCE_MS,
  ListSelectFilter,
  ListTableCard,
  ListToolbar,
} from '../../../components/cms/ListPro';
import {
  FilterBar,
  QrBoundary,
  QrEmptyState,
  StatCard,
  StatGrid,
} from '../../../components/qr/QrShell';
import {
  IssuePriorityBadge,
  IssueStatusBadge,
  IssueTypeLabel,
  STATUS_LABELS,
  TYPE_LABELS,
  issueSourceLabel,
} from '../../../components/issues/IssueBadges';
import { formatDate } from '../../../lib/format';

/**
 * The submissions inbox.
 *
 * The screen a campaign's issue team lives in, so it leads with the four
 * numbers that decide what to do next - what is open, what is urgent, what has
 * nobody, and what nobody has vetted - rather than with a bare table.
 *
 * Every filter and the search are SERVER-SIDE, and the page is paged. Loading
 * every submission into the browser to filter it there would both be slow and
 * put citizens' reports in memory for no reason.
 */

const PAGE_SIZE = 25;

interface Filters {
  status: string;
  priority: string;
  type: string;
  categoryId: string;
  source: string;
  moderationStatus: string;
  ward: string;
  unassignedOnly: boolean;
  search: string;
  campaignId: string;
  qrCodeId: string;
}

const NO_FILTERS: Filters = {
  status: '',
  priority: '',
  type: '',
  categoryId: '',
  source: '',
  moderationStatus: '',
  ward: '',
  unassignedOnly: false,
  search: '',
  campaignId: '',
  qrCodeId: '',
};

function filtersFromSearch(params: URLSearchParams): Filters {
  return {
    ...NO_FILTERS,
    status: params.get('status') ?? '',
    priority: params.get('priority') ?? '',
    type: params.get('type') ?? '',
    categoryId: params.get('categoryId') ?? '',
    source: params.get('source') ?? '',
    moderationStatus: params.get('moderationStatus') ?? '',
    ward: params.get('ward') ?? '',
    unassignedOnly: params.get('unassignedOnly') === '1',
    search: params.get('search') ?? '',
    campaignId: params.get('campaignId') ?? '',
    qrCodeId: params.get('qrCodeId') ?? '',
  };
}

export function IssuesPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = useMemo(() => filtersFromSearch(searchParams), [searchParams]);
  const [filters, setFilters] = useState<Filters>(initial);
  const [draftSearch, setDraftSearch] = useState(initial.search);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { toasts } = useToasts();

  useEffect(() => {
    const next = filtersFromSearch(searchParams);
    setFilters(next);
    setDraftSearch(next.search);
    setOffset(0);
  }, [searchParams]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = draftSearch.trim();
      setFilters((current) => {
        if (current.search === next) return current;
        return { ...current, search: next };
      });
      setOffset(0);
    }, LIST_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [draftSearch]);

  const clearQrFilter = useCallback(() => {
    setFilters(NO_FILTERS);
    setDraftSearch('');
    setOffset(0);
    navigate('/admin/issues', { replace: true });
  }, [navigate]);

  const clearFilters = useCallback(() => {
    setFilters(NO_FILTERS);
    setDraftSearch('');
    setOffset(0);
    navigate('/admin/issues', { replace: true });
  }, [navigate]);

  const variables = useMemo(
    () => ({
      filter: {
        first: PAGE_SIZE,
        offset,
        status: filters.status || null,
        priority: filters.priority || null,
        type: filters.type || null,
        categoryId: filters.categoryId || null,
        source: filters.source || null,
        moderationStatus: filters.moderationStatus || null,
        ward: filters.ward || null,
        unassignedOnly: filters.unassignedOnly || null,
        search: filters.search || null,
        campaignId: filters.campaignId || null,
        qrCodeId: filters.qrCodeId || null,
      },
    }),
    [filters, offset],
  );

  const { state, refetch } = useAdminQuery<{
    issues: { nodes: IssueRow[]; totalCount: number; hasMore: boolean };
  }>(ISSUES_QUERY, variables);

  useEffect(() => {
    if (state.status !== 'loading') setRefreshing(false);
  }, [state.status]);

  // Headline figures come from their own query so a slow aggregate never delays
  // the table, and so the numbers describe the whole inbox rather than the page.
  const analytics = useAdminQuery<{ issueAnalytics: IssueAnalyticsData }>(ISSUE_ANALYTICS_QUERY, {
    filter: { range: 'LAST_30_DAYS' },
  });

  const categories = useAdminQuery<{ issueCategories: IssueCategoryRow[] }>(
    ISSUE_CATEGORIES_QUERY,
    { includeInactive: true },
  );

  // Any filter change resets to the first page: staying on page 4 of a
  // different result set shows an empty table and looks like a bug.
  const update = useCallback((next: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setOffset(0);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
  }, [refetch]);

  const summary = analytics.state.status === 'success' ? analytics.state.data.issueAnalytics : null;
  const categoryOptions =
    categories.state.status === 'success' ? categories.state.data.issueCategories : [];

  const hasFilters = Boolean(
    filters.status ||
      filters.priority ||
      filters.type ||
      filters.categoryId ||
      filters.source ||
      filters.moderationStatus ||
      filters.ward ||
      filters.unassignedOnly ||
      filters.search ||
      filters.campaignId ||
      filters.qrCodeId,
  );

  return (
    <div className="cms-page list-page">
      <CmsPageHeader
        title="Issues & feedback"
        description={
          filters.campaignId
            ? 'Citizen issues attributed to a QR campaign.'
            : filters.qrCodeId
              ? 'Citizen issues attributed to a QR code.'
              : 'What citizens have sent in, and how the team is handling it.'
        }
        backTo="/admin"
        backLabel="Back to dashboard"
        actions={
          <Link to="/admin/issues/analytics">
            <Button variant="secondary">Analytics</Button>
          </Link>
        }
      />

      {filters.campaignId || filters.qrCodeId ? (
        <FilterBar>
          <p className="cms-filters__hint">
            Showing feedbacks filtered by {filters.campaignId ? 'QR campaign' : 'QR code'}.
          </p>
          <Button variant="secondary" size="sm" onClick={clearQrFilter}>
            Clear QR filter
          </Button>
        </FilterBar>
      ) : null}

      {summary ? (
        <StatGrid>
          <StatCard
            label="Open"
            value={summary.openCount.toLocaleString()}
            hint={`${summary.totalAllTime.toLocaleString()} received in total`}
            tone="primary"
          />
          <StatCard
            label="High or urgent"
            value={summary.highPriorityOpen.toLocaleString()}
            hint="Still open"
            tone="accent"
          />
          <StatCard
            label="Unassigned"
            value={summary.unassignedOpen.toLocaleString()}
            hint="Nobody is looking at these"
          />
          <StatCard
            label="Awaiting review"
            value={summary.awaitingModeration.toLocaleString()}
            hint={`${summary.submittedToday.toLocaleString()} arrived today`}
          />
        </StatGrid>
      ) : null}

      <ListToolbar
        search={draftSearch}
        onSearchChange={setDraftSearch}
        searchLabel="Search submissions"
        searchPlaceholder="Reference or title"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        busy={state.status === 'loading'}
        hasFilters={hasFilters}
        onClear={clearFilters}
        filter={
          <>
            <ListSelectFilter
              label="Filter by status"
              value={filters.status}
              onChange={(event) => update({ status: event.target.value })}
            >
              <option value="">All statuses</option>
              {ISSUE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </ListSelectFilter>

            <ListSelectFilter
              label="Filter by priority"
              value={filters.priority}
              onChange={(event) => update({ priority: event.target.value })}
            >
              <option value="">All priorities</option>
              {ISSUE_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.charAt(0) + priority.slice(1).toLowerCase()}
                </option>
              ))}
            </ListSelectFilter>

            <ListSelectFilter
              label="Filter by type"
              value={filters.type}
              onChange={(event) => update({ type: event.target.value })}
            >
              <option value="">All types</option>
              {SUBMISSION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </ListSelectFilter>

            <ListSelectFilter
              label="Filter by category"
              value={filters.categoryId}
              onChange={(event) => update({ categoryId: event.target.value })}
            >
              <option value="">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </ListSelectFilter>

            <ListSelectFilter
              label="Filter by moderation state"
              value={filters.moderationStatus}
              onChange={(event) => update({ moderationStatus: event.target.value })}
            >
              <option value="">Any review state</option>
              {MODERATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </ListSelectFilter>

            <label className="cms-checkbox">
              <input
                type="checkbox"
                checked={filters.unassignedOnly}
                onChange={(event) => update({ unassignedOnly: event.target.checked })}
              />
              <span>Unassigned only</span>
            </label>
          </>
        }
      />

      <QrBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.issues.nodes.length === 0}
        empty={
          <QrEmptyState
            title="No submissions match this view."
            message="Citizens can send feedback from the public website at /feedback. Clear the filters to see everything received."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        }
      >
        {(data) => (
          <>
            <ListTableCard
              title="Submissions"
              count={data.issues.totalCount}
              countLabel="submissions"
            >
              <DataTable
                caption="Citizen submissions"
                rows={data.issues.nodes}
                columns={[
                  {
                    key: 'reference',
                    header: 'Reference',
                    render: (row) => (
                      <Link className="cms-table__link mono" to={`/admin/issues/${row.id}`}>
                        {row.referenceNumber}
                      </Link>
                    ),
                  },
                  {
                    key: 'title',
                    header: 'Title',
                    render: (row) => (
                      <Link className="cms-table__link" to={`/admin/issues/${row.id}`}>
                        {row.title}
                      </Link>
                    ),
                  },
                  {
                    key: 'type',
                    header: 'Type',
                    secondary: true,
                    render: (row) => <IssueTypeLabel value={row.type} />,
                  },
                  {
                    key: 'category',
                    header: 'Category',
                    secondary: true,
                    render: (row) => row.category?.label ?? '—',
                  },
                  {
                    key: 'priority',
                    header: 'Priority',
                    render: (row) => <IssuePriorityBadge value={row.priority} />,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (row) => <IssueStatusBadge value={row.status} />,
                  },
                  {
                    key: 'location',
                    header: 'Location',
                    secondary: true,
                    render: (row) => row.ward ?? row.locality ?? '—',
                  },
                  {
                    key: 'source',
                    header: 'Source',
                    secondary: true,
                    render: (row) => issueSourceLabel(row.source),
                  },
                  {
                    key: 'submitted',
                    header: 'Received',
                    render: (row) => formatDate(row.submittedAt) ?? '—',
                  },
                  {
                    key: 'assigned',
                    header: 'Assigned',
                    secondary: true,
                    // "Unassigned" rather than a dash: an empty cell reads as
                    // missing data, and this is a state somebody must act on.
                    render: (row) => row.assignedTo?.fullName ?? 'Unassigned',
                  },
                ]}
                actions={(row) => (
                  <div className="list-row-actions">
                    <Link
                      className="list-action-btn list-action-btn--view"
                      to={`/admin/issues/${row.id}`}
                      aria-label={`View ${row.referenceNumber}`}
                      title="View"
                    >
                      <Icon name="eye" size={1} />
                    </Link>
                  </div>
                )}
              />
            </ListTableCard>

            <div className="issue-pagination">
              <p className="issue-pagination__count" aria-live="polite">
                Showing {offset + 1}–{offset + data.issues.nodes.length} of{' '}
                {data.issues.totalCount.toLocaleString()}
              </p>
              <div className="issue-pagination__controls">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!data.issues.hasMore}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </QrBoundary>

      <ToastRegion toasts={toasts} />
    </div>
  );
}
