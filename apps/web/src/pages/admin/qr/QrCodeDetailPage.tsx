import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@rk/ui';
import { useAdminMutation, useAdminQuery } from '../../../features/admin/adminApi';
import {
  QR_ANALYTICS,
  QR_CODE_DETAIL,
  TRANSITION_QR_CODE,
  type QrAnalyticsData,
  type QrCodeRow,
} from '../../../features/qr/qrQueries';
import {
  CmsCard,
  CmsPageHeader,
  IfPermitted,
  ToastRegion,
  useToasts,
} from '../../../components/cms/CmsShell';
import { QrBoundary, QrStatusBadge, StatCard, StatGrid } from '../../../components/qr/QrShell';
import { QrPreview } from '../../../components/qr/QrPreview';
import { ChartCard, TrendChart } from '../../../components/qr/charts';
import { formatDate } from '../../../lib/format';

/**
 * QR code detail.
 *
 * Everything about one printed code in one place: the symbol to download, where
 * it points, where it is, how it is performing, and the controls to pause or
 * retire it.
 *
 * `image` is null when the caller lacks QR_CODE_DOWNLOAD, so the preview block
 * is simply absent for those users rather than the whole page failing over an
 * optional field.
 */
export function QrCodeDetailPage() {
  const { campaignId = '', qrId = '' } = useParams();
  const { toasts, success, failure } = useToasts();

  const { state, refetch } = useAdminQuery<{ qrCode: QrCodeRow }>(QR_CODE_DETAIL, { id: qrId });

  const analytics = useAdminQuery<{ qrAnalytics: QrAnalyticsData }>(QR_ANALYTICS, {
    filter: { range: 'LAST_30_DAYS', qrCodeId: qrId },
  });

  const transition = useAdminMutation<unknown, { id: string; action: string }>(TRANSITION_QR_CODE);

  const run = useCallback(
    async (action: string) => {
      const result = await transition.run({ id: qrId, action });
      if (result) {
        success(action === 'ACTIVATE' ? 'QR code activated.' : 'QR code updated.');
        refetch();
      } else {
        failure(transition.state.error ?? 'Could not update this QR code.');
      }
    },
    [transition, qrId, refetch, success, failure],
  );

  const summary = analytics.state.status === 'success' ? analytics.state.data.qrAnalytics : null;

  return (
    <div className="cms-page">
      <QrBoundary state={state} refetch={refetch}>
        {(data) => {
          const code = data.qrCode;

          return (
            <>
              <CmsPageHeader
                title={code.name}
                description={code.description ?? undefined}
                backTo={`/admin/qr-campaigns/${campaignId}`}
                backLabel="Back to campaign"
                actions={
                  <>
                    <IfPermitted permission="QR_ANALYTICS_READ">
                      <Link to={`/admin/qr-campaigns/${campaignId}/qr/${code.id}/analytics`}>
                        <Button variant="secondary">Analytics</Button>
                      </Link>
                    </IfPermitted>
                    <IfPermitted permission="QR_CODE_DOWNLOAD">
                      <Link to={`/admin/qr-campaigns/${campaignId}/qr/${code.id}/print`}>
                        <Button variant="secondary">Print sheet</Button>
                      </Link>
                    </IfPermitted>
                    <IfPermitted permission="QR_CODE_UPDATE">
                      <Link to={`/admin/qr-campaigns/${campaignId}/qr/${code.id}/edit`}>
                        <Button variant="primary">Edit</Button>
                      </Link>
                    </IfPermitted>
                  </>
                }
              />

              <div className="qr-detail">
                <CmsCard title="QR code">
                  {code.image ? (
                    <QrPreview image={code.image} code={code.code} name={code.name} />
                  ) : (
                    <p className="cms-field__hint">
                      You do not have permission to download QR assets. Ask a campaign administrator
                      if you need to print this code.
                    </p>
                  )}
                </CmsCard>

                <CmsCard title="Details">
                  <dl className="detail-facts">
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <QrStatusBadge value={code.status} />
                      </dd>
                    </div>
                    <div>
                      <dt>Campaign</dt>
                      <dd>
                        <Link className="cms-table__link" to={`/admin/qr-campaigns/${campaignId}`}>
                          {code.campaign.name}
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt>Destination</dt>
                      <dd>
                        <code className="mono">{code.destinationPath}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>{code.source ?? 'Not stated'}</dd>
                    </div>
                    <div>
                      <dt>Placement</dt>
                      <dd>{code.placement ?? 'Not stated'}</dd>
                    </div>
                    <div>
                      <dt>Ward</dt>
                      <dd>{code.ward ?? 'Not stated'}</dd>
                    </div>
                    <div>
                      <dt>Area</dt>
                      <dd>{code.area ?? 'Not stated'}</dd>
                    </div>
                    <div>
                      <dt>Locality</dt>
                      <dd>{code.locality ?? 'Not stated'}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{formatDate(code.createdAt) ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Activated</dt>
                      <dd>{formatDate(code.activatedAt) ?? 'Not activated'}</dd>
                    </div>
                  </dl>

                  <IfPermitted permission="QR_CODE_ARCHIVE">
                    <div className="cms-form-actions__primary">
                      {code.status === 'ACTIVE' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          isLoading={transition.state.submitting}
                          onClick={() => void run('PAUSE')}
                        >
                          Pause
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          isLoading={transition.state.submitting}
                          onClick={() => void run('ACTIVATE')}
                        >
                          Activate
                        </Button>
                      )}
                      {code.status !== 'ARCHIVED' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          isLoading={transition.state.submitting}
                          onClick={() => void run('ARCHIVE')}
                        >
                          Archive
                        </Button>
                      ) : null}
                    </div>
                  </IfPermitted>
                </CmsCard>
              </div>

              <StatGrid>
                <StatCard
                  label="Scans (all time)"
                  value={code.totalScans.toLocaleString()}
                  tone="primary"
                />
                <StatCard
                  label="Scans (30 days)"
                  value={summary ? summary.totalScans.toLocaleString() : '—'}
                />
                <StatCard
                  label="Estimated unique visits"
                  value={
                    summary?.estimatedUniqueScans === null || summary === null
                      ? '—'
                      : summary.estimatedUniqueScans.toLocaleString()
                  }
                  hint="Approximate, same-day only"
                />
                <StatCard
                  label="Average per day"
                  value={summary ? summary.averageScansPerDay.toLocaleString() : '—'}
                />
              </StatGrid>

              {summary ? (
                <ChartCard title="Recent scan trend" description="Scans per day over 30 days.">
                  <TrendChart points={summary.trend} />
                </ChartCard>
              ) : null}
            </>
          );
        }}
      </QrBoundary>

      <ToastRegion toasts={toasts} />
    </div>
  );
}
