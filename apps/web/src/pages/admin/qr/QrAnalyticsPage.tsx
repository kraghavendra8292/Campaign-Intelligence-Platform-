import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '@rk/ui';
import { graphqlRequest } from '../../../features/auth/authClient';
import { useAdminQuery } from '../../../features/admin/adminApi';
import {
  QR_ANALYTICS,
  QR_ANALYTICS_CSV,
  QR_CAMPAIGN_COMPARISON,
  type CampaignComparisonRow,
  type QrAnalyticsData,
} from '../../../features/qr/qrQueries';
import { CmsPageHeader, ToastRegion, useToasts } from '../../../components/cms/CmsShell';
import {
  DateRangePicker,
  DEFAULT_RANGE,
  QrBoundary,
  type RangeSelection,
} from '../../../components/qr/QrShell';
import {
  ANALYTICS_FOCUS_OPTIONS,
  AnalyticsPanel,
  type AnalyticsFocusMetric,
} from '../../../components/qr/AnalyticsPanel';
import { ChartCard, RankedBars } from '../../../components/qr/charts';

/**
 * Analytics screens.
 *
 * One component drives three routes - the whole tenant, one campaign and one
 * QR code - because the questions are identical and only the filter changes.
 * Three copies would drift, and the first thing to drift would be the wording
 * that keeps "scans" from becoming "people".
 */

function toFilter(
  range: RangeSelection,
  campaignId: string | null,
  qrCodeId: string | null,
  excludeAutomated: boolean,
) {
  return {
    range: range.range,
    from: range.from ? new Date(range.from).toISOString() : null,
    to: range.to ? new Date(range.to).toISOString() : null,
    campaignId,
    qrCodeId,
    excludeAutomated,
  };
}

/** Downloads the aggregate CSV the server generated. */
function saveCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function AnalyticsScreen({
  title,
  description,
  campaignId = null,
  qrCodeId = null,
  backTo,
  backLabel,
  showQrBreakdown = true,
  showComparison = false,
}: {
  title: string;
  description: string;
  /** Scalars rather than an object, so the memo below can depend on them
      honestly - an object prop is a new reference on every render. */
  campaignId?: string | null;
  qrCodeId?: string | null;
  backTo: string;
  backLabel: string;
  showQrBreakdown?: boolean;
  showComparison?: boolean;
}) {
  const [range, setRange] = useState<RangeSelection>(DEFAULT_RANGE);
  const [excludeAutomated, setExcludeAutomated] = useState(false);
  const [focusMetric, setFocusMetric] = useState<AnalyticsFocusMetric>('uniqueVisits');
  const [exporting, setExporting] = useState(false);
  const { toasts, success, failure } = useToasts();
  const lastGood = useRef<{
    qrAnalytics: QrAnalyticsData;
    qrCampaignComparison?: { campaigns: CampaignComparisonRow[] };
  } | null>(null);

  const filter = useMemo(
    () => toFilter(range, campaignId, qrCodeId, excludeAutomated),
    [range, campaignId, qrCodeId, excludeAutomated],
  );

  const { state, refetch } = useAdminQuery<{
    qrAnalytics: QrAnalyticsData;
    qrCampaignComparison?: { campaigns: CampaignComparisonRow[] };
  }>(showComparison ? QR_CAMPAIGN_COMPARISON : QR_ANALYTICS, { filter });

  useEffect(() => {
    lastGood.current = null;
  }, [filter]);

  useEffect(() => {
    if (state.status === 'success') {
      lastGood.current = state.data;
    }
  }, [state]);

  const isRefreshing = state.status === 'loading' && lastGood.current !== null;

  async function exportCsv(): Promise<void> {
    setExporting(true);
    try {
      // Generated server-side so the browser never has to hold the scan rows
      // that would be needed to build it - which is also why no per-scan data
      // can leak into an export.
      const result = await graphqlRequest<{ qrAnalyticsCsv: string }>(QR_ANALYTICS_CSV, {
        variables: { filter },
      });
      saveCsv(result.qrAnalyticsCsv, `qr-scans-${range.range.toLowerCase()}.csv`);
      success('CSV downloaded.');
    } catch {
      failure('Could not export. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="cms-page list-page">
      <CmsPageHeader
        title={title}
        description={description}
        backTo={backTo}
        backLabel={backLabel}
      />

      <div className="list-toolbar">
        <div className="list-toolbar__left">
          <DateRangePicker value={range} onChange={setRange} />
          <label className="list-toolbar__select">
            <span className="visually-hidden">More metrics</span>
            <select
              className="list-toolbar__select-control"
              value={focusMetric}
              onChange={(event) => setFocusMetric(event.target.value as AnalyticsFocusMetric)}
              aria-label="More metrics"
            >
              {ANALYTICS_FOCUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={0.9} className="list-toolbar__select-icon" />
          </label>
          <label className="cms-checkbox">
            <input
              type="checkbox"
              checked={excludeAutomated}
              onChange={(event) => setExcludeAutomated(event.target.checked)}
            />
            <span>Exclude automated traffic</span>
          </label>
          <button
            type="button"
            className={`cms-icon-btn${isRefreshing ? ' cms-icon-btn--busy' : ''}`}
            aria-label="Refresh data"
            title="Refresh"
            disabled={isRefreshing}
            onClick={refetch}
          >
            <Icon name="refresh" size={1.05} />
          </button>
        </div>
        <div className="list-toolbar__right">
          <button
            type="button"
            className={`cms-icon-btn cms-icon-btn--square${isRefreshing ? ' cms-icon-btn--busy' : ''}`}
            aria-label="Refresh list"
            title="Refresh"
            disabled={isRefreshing}
            onClick={refetch}
          >
            <Icon name="refresh" size={1.15} />
          </button>
        </div>
      </div>

      {/* Soft refresh: keep the last good payload on screen while refetching so
          the KPI cards do not flash to a full-page spinner. First load and
          hard errors still go through QrBoundary. */}
      {isRefreshing && lastGood.current ? (
        <div className="analytics analytics--refreshing" aria-busy="true">
          <AnalyticsPanel
            data={lastGood.current.qrAnalytics}
            showQrBreakdown={showQrBreakdown}
            onExportCsv={() => void exportCsv()}
            exporting={exporting}
            focusMetric={focusMetric}
            feedbacksHref={
              campaignId
                ? `/admin/issues?campaignId=${encodeURIComponent(campaignId)}`
                : qrCodeId
                  ? `/admin/issues?qrCodeId=${encodeURIComponent(qrCodeId)}`
                  : '/admin/issues?source=QR'
            }
          />
          {showComparison && lastGood.current.qrCampaignComparison ? (
            <ChartCard
              title="Campaign comparison"
              description="Scans per campaign over the selected range."
            >
              <RankedBars
                buckets={lastGood.current.qrCampaignComparison.campaigns.map((campaign) => ({
                  key: campaign.id,
                  label: campaign.name,
                  scans: campaign.scans,
                }))}
                emptyMessage="No campaigns have recorded scans in this range."
              />
            </ChartCard>
          ) : null}
        </div>
      ) : (
        <QrBoundary state={state} refetch={refetch}>
          {(data) => (
            <>
              <AnalyticsPanel
                data={data.qrAnalytics}
                showQrBreakdown={showQrBreakdown}
                onExportCsv={() => void exportCsv()}
                exporting={exporting}
                focusMetric={focusMetric}
                feedbacksHref={
                  campaignId
                    ? `/admin/issues?campaignId=${encodeURIComponent(campaignId)}`
                    : qrCodeId
                      ? `/admin/issues?qrCodeId=${encodeURIComponent(qrCodeId)}`
                      : '/admin/issues?source=QR'
                }
              />

              {showComparison && data.qrCampaignComparison ? (
                <ChartCard
                  title="Campaign comparison"
                  description="Scans per campaign over the selected range."
                >
                  <RankedBars
                    buckets={data.qrCampaignComparison.campaigns.map((campaign) => ({
                      key: campaign.id,
                      label: campaign.name,
                      scans: campaign.scans,
                    }))}
                    emptyMessage="No campaigns have recorded scans in this range."
                  />
                </ChartCard>
              ) : null}
            </>
          )}
        </QrBoundary>
      )}

      <ToastRegion toasts={toasts} />
    </div>
  );
}

/** Tenant-wide analytics, including the campaign comparison. */
export function QrOverviewAnalyticsPage() {
  return (
    <AnalyticsScreen
      title="QR analytics"
      description="Aggregate scan activity across every QR campaign in this organisation."
      backTo="/admin/qr-campaigns"
      backLabel="Back to campaigns"
      showComparison
    />
  );
}

export function QrCampaignAnalyticsPage() {
  const { campaignId = '' } = useParams();
  return (
    <AnalyticsScreen
      title="Campaign analytics"
      description="Aggregate scan activity for this campaign's QR codes."
      campaignId={campaignId}
      backTo={`/admin/qr-campaigns/${campaignId}`}
      backLabel="Back to campaign"
    />
  );
}

export function QrCodeAnalyticsPage() {
  const { campaignId = '', qrId = '' } = useParams();
  return (
    <AnalyticsScreen
      title="QR code analytics"
      description="Aggregate scan activity for this single QR code."
      qrCodeId={qrId}
      backTo={`/admin/qr-campaigns/${campaignId}/qr/${qrId}`}
      backLabel="Back to QR code"
      // A single code's breakdown "by QR code" would be one bar of 100%.
      showQrBreakdown={false}
    />
  );
}
