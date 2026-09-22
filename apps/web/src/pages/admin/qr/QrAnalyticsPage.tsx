import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@rk/ui';
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
  FilterBar,
  QrBoundary,
  type RangeSelection,
} from '../../../components/qr/QrShell';
import { AnalyticsPanel } from '../../../components/qr/AnalyticsPanel';
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
  const [exporting, setExporting] = useState(false);
  const { toasts, success, failure } = useToasts();

  const filter = useMemo(
    () => toFilter(range, campaignId, qrCodeId, excludeAutomated),
    [range, campaignId, qrCodeId, excludeAutomated],
  );

  const { state, refetch } = useAdminQuery<{
    qrAnalytics: QrAnalyticsData;
    qrCampaignComparison?: { campaigns: CampaignComparisonRow[] };
  }>(showComparison ? QR_CAMPAIGN_COMPARISON : QR_ANALYTICS, { filter });

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
    <div className="cms-page">
      <CmsPageHeader
        title={title}
        description={description}
        actions={
          <Link to={backTo}>
            <Button variant="secondary">{backLabel}</Button>
          </Link>
        }
      />

      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
        <label className="cms-checkbox">
          <input
            type="checkbox"
            checked={excludeAutomated}
            onChange={(event) => setExcludeAutomated(event.target.checked)}
          />
          <span>Exclude automated traffic</span>
        </label>
      </FilterBar>

      <QrBoundary state={state} refetch={refetch}>
        {(data) => (
          <>
            <AnalyticsPanel
              data={data.qrAnalytics}
              showQrBreakdown={showQrBreakdown}
              onExportCsv={() => void exportCsv()}
              exporting={exporting}
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
      backLabel="All campaigns"
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
