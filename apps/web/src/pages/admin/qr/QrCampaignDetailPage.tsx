import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@rk/ui';
import { useAdminMutation, useAdminQuery } from '../../../features/admin/adminApi';
import {
  QR_ANALYTICS,
  QR_CAMPAIGN,
  TRANSITION_QR_CAMPAIGN,
  TRANSITION_QR_CODE,
  type QrAnalyticsData,
  type QrCampaignRow,
  type QrCodeRow,
} from '../../../features/qr/qrQueries';
import {
  CmsCard,
  CmsPageHeader,
  DataTable,
  IfPermitted,
  ToastRegion,
  useToasts,
} from '../../../components/cms/CmsShell';
import {
  QrBoundary,
  QrEmptyState,
  QrStatusBadge,
  StatCard,
  StatGrid,
} from '../../../components/qr/QrShell';
import { ChartCard, TrendChart } from '../../../components/qr/charts';
import { formatDate } from '../../../lib/format';

/**
 * Campaign detail.
 *
 * The working screen for a campaign manager: what this campaign is, which codes
 * belong to it, how each is performing, and the controls to act on any of them
 * without leaving the page.
 *
 * The scan figures come from a SECOND query rather than being folded into the
 * campaign row, so a slow analytics aggregation never delays the campaign
 * details and code list from painting.
 */

interface CampaignDetailData {
  qrCampaign: QrCampaignRow;
  qrCodes: { nodes: QrCodeRow[]; totalCount: number };
}

export function QrCampaignDetailPage() {
  const { campaignId = '' } = useParams();
  const { toasts, success, failure } = useToasts();

  const { state, refetch } = useAdminQuery<CampaignDetailData>(QR_CAMPAIGN, { id: campaignId });

  // Last 30 days: enough to show a shape without asking the reader to choose a
  // range before seeing anything. The analytics page is where ranges are set.
  const analytics = useAdminQuery<{ qrAnalytics: QrAnalyticsData }>(QR_ANALYTICS, {
    filter: { range: 'LAST_30_DAYS', campaignId },
  });

  const campaignTransition = useAdminMutation<unknown, { id: string; action: string }>(
    TRANSITION_QR_CAMPAIGN,
  );
  const codeTransition = useAdminMutation<unknown, { id: string; action: string }>(
    TRANSITION_QR_CODE,
  );

  const runCampaign = useCallback(
    async (action: string) => {
      const result = await campaignTransition.run({ id: campaignId, action });
      if (result) {
        success('Campaign updated.');
        refetch();
      } else {
        failure(campaignTransition.state.error ?? 'Could not update this campaign.');
      }
    },
    [campaignTransition, campaignId, refetch, success, failure],
  );

  const runCode = useCallback(
    async (id: string, action: string) => {
      const result = await codeTransition.run({ id, action });
      if (result) {
        success(action === 'ACTIVATE' ? 'QR code activated.' : 'QR code updated.');
        refetch();
      } else {
        failure(codeTransition.state.error ?? 'Could not update this QR code.');
      }
    },
    [codeTransition, refetch, success, failure],
  );

  const summary = analytics.state.status === 'success' ? analytics.state.data.qrAnalytics : null;

  return (
    <div className="cms-page">
      <QrBoundary state={state} refetch={refetch}>
        {(data) => {
          const campaign = data.qrCampaign;
          const codes = data.qrCodes.nodes;
          const topCode = summary?.topQrCodeId
            ? codes.find((code) => code.id === summary.topQrCodeId)
            : undefined;

          return (
            <>
              <CmsPageHeader
                title={campaign.name}
                description={campaign.description ?? undefined}
                actions={
                  <>
                    <IfPermitted permission="QR_ANALYTICS_READ">
                      <Link to={`/admin/qr-campaigns/${campaign.id}/analytics`}>
                        <Button variant="secondary">Analytics</Button>
                      </Link>
                    </IfPermitted>
                    <IfPermitted permission="QR_CODE_CREATE">
                      <Link to={`/admin/qr-campaigns/${campaign.id}/qr/new`}>
                        <Button variant="primary">Create QR code</Button>
                      </Link>
                    </IfPermitted>
                  </>
                }
              />

              <CmsCard>
                <dl className="detail-facts">
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <QrStatusBadge value={campaign.status} />
                    </dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{campaign.campaignType.replace(/_/g, ' ').toLowerCase()}</dd>
                  </div>
                  <div>
                    <dt>Runs</dt>
                    <dd>
                      {campaign.startDate
                        ? `${formatDate(campaign.startDate) ?? ''}${
                            campaign.endDate ? ` – ${formatDate(campaign.endDate) ?? ''}` : ''
                          }`
                        : 'Not stated'}
                    </dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(campaign.createdAt) ?? '—'}</dd>
                  </div>
                </dl>

                <div className="cms-form-actions__primary">
                  <IfPermitted permission="QR_CAMPAIGN_UPDATE">
                    <Link to={`/admin/qr-campaigns/${campaign.id}/edit`}>
                      <Button variant="secondary" size="sm">
                        Edit
                      </Button>
                    </Link>
                  </IfPermitted>
                  <IfPermitted permission="QR_CAMPAIGN_ARCHIVE">
                    {campaign.status === 'ACTIVE' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        isLoading={campaignTransition.state.submitting}
                        onClick={() => void runCampaign('PAUSE')}
                      >
                        Pause
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        isLoading={campaignTransition.state.submitting}
                        onClick={() => void runCampaign('ACTIVATE')}
                      >
                        Activate
                      </Button>
                    )}
                    {campaign.status !== 'ARCHIVED' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={campaignTransition.state.submitting}
                        onClick={() => void runCampaign('ARCHIVE')}
                      >
                        Archive
                      </Button>
                    ) : null}
                  </IfPermitted>
                </div>
              </CmsCard>

              {/*
                Analytics is optional on this screen: a user without
                QR_ANALYTICS_READ still gets the campaign and its codes, rather
                than an error page for a panel they were never entitled to.
              */}
              {summary ? (
                <>
                  <StatGrid>
                    <StatCard
                      label="Scans (30 days)"
                      value={summary.totalScans.toLocaleString()}
                      tone="primary"
                    />
                    <StatCard
                      label="Active QR codes"
                      value={summary.activeQrCodes.toLocaleString()}
                      hint={`${summary.totalQrCodes.toLocaleString()} in total`}
                    />
                    <StatCard
                      label="Top performing QR"
                      value={topCode?.name ?? '—'}
                      hint={
                        topCode
                          ? `${topCode.totalScans.toLocaleString()} scans all time`
                          : undefined
                      }
                      tone="accent"
                    />
                    <StatCard
                      label="Average per day"
                      value={summary.averageScansPerDay.toLocaleString()}
                    />
                  </StatGrid>

                  <ChartCard title="Scan trend" description="Scans per day over the last 30 days.">
                    <TrendChart points={summary.trend} />
                  </ChartCard>
                </>
              ) : null}

              <CmsCard title="QR codes">
                {codes.length === 0 ? (
                  <QrEmptyState
                    title="No QR codes have been created for this campaign."
                    message="A QR code is the unit you compare - one poster, one pamphlet, one venue."
                    action={
                      <IfPermitted permission="QR_CODE_CREATE">
                        <Link to={`/admin/qr-campaigns/${campaign.id}/qr/new`}>
                          <Button variant="primary">Create the first QR code</Button>
                        </Link>
                      </IfPermitted>
                    }
                  />
                ) : (
                  <DataTable
                    caption="QR codes in this campaign"
                    rows={codes}
                    columns={[
                      {
                        key: 'name',
                        header: 'QR code',
                        render: (row) => (
                          <Link
                            className="cms-table__link"
                            to={`/admin/qr-campaigns/${campaign.id}/qr/${row.id}`}
                          >
                            {row.name}
                          </Link>
                        ),
                      },
                      {
                        key: 'code',
                        header: 'Identifier',
                        secondary: true,
                        render: (row) => <code className="mono">{row.code}</code>,
                      },
                      {
                        key: 'status',
                        header: 'Status',
                        render: (row) => <QrStatusBadge value={row.status} />,
                      },
                      {
                        key: 'source',
                        header: 'Source',
                        secondary: true,
                        render: (row) => row.source ?? '—',
                      },
                      {
                        key: 'destination',
                        header: 'Destination',
                        secondary: true,
                        render: (row) => row.destinationPath,
                      },
                      {
                        key: 'scans',
                        header: 'Scans',
                        render: (row) => row.totalScans.toLocaleString(),
                      },
                    ]}
                    actions={(row) => (
                      <div className="cms-row-actions">
                        <Link
                          className="cms-row-actions__link"
                          to={`/admin/qr-campaigns/${campaign.id}/qr/${row.id}`}
                        >
                          View
                        </Link>
                        <IfPermitted permission="QR_CODE_ARCHIVE">
                          {row.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              className="cms-row-actions__link"
                              disabled={codeTransition.state.submitting}
                              onClick={() => void runCode(row.id, 'PAUSE')}
                            >
                              Pause
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="cms-row-actions__primary"
                              disabled={codeTransition.state.submitting}
                              onClick={() => void runCode(row.id, 'ACTIVATE')}
                            >
                              Activate
                            </button>
                          )}
                        </IfPermitted>
                      </div>
                    )}
                  />
                )}
              </CmsCard>
            </>
          );
        }}
      </QrBoundary>

      <ToastRegion toasts={toasts} />
    </div>
  );
}
