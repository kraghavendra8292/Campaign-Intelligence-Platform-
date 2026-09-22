import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { QR_CAMPAIGN_STATUSES } from '@rk/types';
import { Button } from '@rk/ui';
import { useAdminMutation, useAdminQuery } from '../../../features/admin/adminApi';
import {
  QR_CAMPAIGNS,
  TRANSITION_QR_CAMPAIGN,
  type QrCampaignRow,
} from '../../../features/qr/qrQueries';
import {
  CmsPageHeader,
  DataTable,
  IfPermitted,
  ToastRegion,
  useToasts,
} from '../../../components/cms/CmsShell';
import { FilterBar, QrBoundary, QrEmptyState, QrStatusBadge } from '../../../components/qr/QrShell';
import { formatDate } from '../../../lib/format';

/**
 * QR campaigns list.
 *
 * The entry point to the whole Phase 4 feature, so it carries the numbers a
 * campaign manager opens the page to see - code count and total scans per
 * campaign - rather than making them click into each one to find out.
 */

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
};

export function QrCampaignsPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const { toasts, success, failure } = useToasts();

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

  return (
    <div className="cms-page">
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

      <FilterBar>
        <label className="cms-filters__status">
          <span className="visually-hidden">Filter by status</span>
          <select
            className="rk-select__control"
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
        </label>

        <form
          role="search"
          className="cms-filters__search"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setSearch(draftSearch.trim());
          }}
        >
          <input
            className="rk-input rk-input--sm"
            type="search"
            value={draftSearch}
            aria-label="Search campaigns"
            placeholder="Search by name"
            onChange={(event) => setDraftSearch(event.target.value)}
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>

        <Link to="/admin/qr-analytics" className="cms-filters__link">
          View all analytics
        </Link>
      </FilterBar>

      <QrBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.qrCampaigns.nodes.length === 0}
        empty={
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
        }
      >
        {(data) => (
          <DataTable
            caption="QR campaigns"
            rows={data.qrCampaigns.nodes}
            columns={[
              {
                key: 'name',
                header: 'Campaign',
                render: (row) => (
                  <Link className="cms-table__link" to={`/admin/qr-campaigns/${row.id}`}>
                    {row.name}
                  </Link>
                ),
              },
              {
                key: 'type',
                header: 'Type',
                secondary: true,
                render: (row) => row.campaignType.replace(/_/g, ' ').toLowerCase(),
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <QrStatusBadge value={row.status} />,
              },
              {
                key: 'codes',
                header: 'QR codes',
                render: (row) => row.qrCodeCount.toLocaleString(),
              },
              {
                key: 'scans',
                header: 'Total scans',
                render: (row) => row.totalScans.toLocaleString(),
              },
              {
                key: 'feedbacks',
                header: 'Feedbacks',
                render: (row) => row.issueCount.toLocaleString(),
              },
              {
                key: 'open',
                header: 'Open',
                render: (row) => row.openIssueCount.toLocaleString(),
              },
              {
                key: 'conversion',
                header: 'Conversion',
                render: (row) =>
                  row.conversionRatePct === null ? '—' : `${row.conversionRatePct}%`,
              },
              {
                key: 'dates',
                header: 'Runs',
                secondary: true,
                render: (row) =>
                  row.startDate
                    ? `${formatDate(row.startDate) ?? ''}${row.endDate ? ` – ${formatDate(row.endDate) ?? ''}` : ''}`
                    : '—',
              },
            ]}
            actions={(row) => (
              <div className="cms-row-actions">
                <Link className="cms-row-actions__link" to={`/admin/qr-campaigns/${row.id}`}>
                  View
                </Link>
                <IfPermitted permission="QR_ANALYTICS_READ">
                  <Link
                    className="cms-row-actions__link"
                    to={`/admin/qr-campaigns/${row.id}/analytics`}
                  >
                    Analytics
                  </Link>
                </IfPermitted>
                <IfPermitted permission="ISSUE_READ">
                  <Link
                    className="cms-row-actions__link"
                    to={`/admin/issues?campaignId=${encodeURIComponent(row.id)}`}
                  >
                    Feedbacks
                  </Link>
                </IfPermitted>
                <IfPermitted permission="QR_CAMPAIGN_UPDATE">
                  <Link className="cms-row-actions__link" to={`/admin/qr-campaigns/${row.id}/edit`}>
                    Edit
                  </Link>
                </IfPermitted>
                <IfPermitted permission="QR_CAMPAIGN_ARCHIVE">
                  {row.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      className="cms-row-actions__link"
                      disabled={transition.state.submitting}
                      onClick={() => void runTransition(row.id, 'PAUSE')}
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="cms-row-actions__primary"
                      disabled={transition.state.submitting}
                      onClick={() => void runTransition(row.id, 'ACTIVATE')}
                    >
                      Activate
                    </button>
                  )}
                  {row.status !== 'ARCHIVED' ? (
                    <button
                      type="button"
                      className="cms-row-actions__link"
                      disabled={transition.state.submitting}
                      onClick={() => void runTransition(row.id, 'ARCHIVE')}
                    >
                      Archive
                    </button>
                  ) : null}
                </IfPermitted>
              </div>
            )}
          />
        )}
      </QrBoundary>

      <ToastRegion toasts={toasts} />
    </div>
  );
}
