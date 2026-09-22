import { Badge } from '@rk/ui';
import { useAdminQuery } from '../../../features/admin/adminApi';
import { CmsPageHeader } from '../../../components/cms/CmsShell';
import { QrBoundary, StatCard, StatGrid } from '../../../components/qr/QrShell';
import { ChartCard } from '../../../components/analytics/charts';
import { formatDateTime } from '../../../lib/format';

/**
 * The operations page.
 *
 * WHAT SOMEBODY COMES HERE TO ANSWER: "is it me, or is something broken?" - and
 * they usually arrive while something IS broken, which is why the page leads
 * with a single overall verdict and then says which component caused it.
 *
 * EVERY VALUE ON THIS PAGE IS MEASURED. The server probes the database, asks the
 * AI and notification providers whether they are configured, and reads the real
 * queue counters. Nothing is hard-coded and nothing is inferred from a settings
 * flag alone. A status page that reports "healthy" because nobody looked is
 * worse than no status page at all: it turns "I don't know" into a false
 * reassurance at exactly the moment somebody needs the truth.
 *
 * UNKNOWN is rendered as its own state rather than being rounded to healthy.
 */

const SYSTEM_STATUS_QUERY = /* GraphQL */ `
  query SystemStatus {
    systemStatus {
      service
      version
      environment
      uptimeSeconds
      status
      checkedAt
      components {
        key
        label
        status
        detail
        latencyMs
      }
    }
  }
`;

type ComponentStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

interface SystemStatusData {
  systemStatus: {
    service: string;
    version: string;
    environment: string;
    uptimeSeconds: number;
    status: ComponentStatus;
    checkedAt: string;
    components: Array<{
      key: string;
      label: string;
      status: ComponentStatus;
      detail: string;
      latencyMs: number | null;
    }>;
  };
}

const TONE: Record<ComponentStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  HEALTHY: 'success',
  DEGRADED: 'warning',
  DOWN: 'error',
  UNKNOWN: 'neutral',
};

const HEADLINE: Record<ComponentStatus, string> = {
  HEALTHY: 'Everything is working',
  DEGRADED: 'Running with reduced function',
  DOWN: 'Something is broken',
  UNKNOWN: 'Status could not be determined',
};

/** Whole days and hours. Nobody reading this page cares about the seconds. */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function SystemStatusPage() {
  const status = useAdminQuery<SystemStatusData>(SYSTEM_STATUS_QUERY, {});

  return (
    <div className="cms-page system-page">
      <CmsPageHeader
        title="System"
        description="What this deployment is doing right now. Every value here is measured, not configured."
        backTo="/admin"
        backLabel="Back to dashboard"
      />

      <QrBoundary state={status.state} refetch={status.refetch}>
        {(data) => {
          const system = data.systemStatus;
          return (
            <>
              <div className={`system-headline system-headline--${system.status.toLowerCase()}`}>
                <Badge tone={TONE[system.status]}>{system.status.toLowerCase()}</Badge>
                <h2>{HEADLINE[system.status]}</h2>
                <p className="cms-muted">
                  Checked {formatDateTime(system.checkedAt)}. This page does not refresh on its own
                  — reload to re-run the checks.
                </p>
              </div>

              <StatGrid>
                <StatCard label="Environment" value={system.environment} />
                <StatCard label="Version" value={system.version} />
                <StatCard
                  label="Uptime"
                  value={formatUptime(system.uptimeSeconds)}
                  hint="Since this instance started"
                />
                <StatCard
                  label="Components"
                  value={`${system.components.filter((c) => c.status === 'HEALTHY').length}/${system.components.length}`}
                  hint="Reporting healthy"
                />
              </StatGrid>

              <ChartCard
                title="Components"
                description="A component that is switched off on purpose is healthy, not degraded — otherwise the colour on this page stops meaning anything."
              >
                <ul className="system-components">
                  {system.components.map((component) => (
                    <li
                      key={component.key}
                      className={`system-component system-component--${component.status.toLowerCase()}`}
                    >
                      <div className="system-component__head">
                        <Badge tone={TONE[component.status]}>
                          {component.status.toLowerCase()}
                        </Badge>
                        <strong>{component.label}</strong>
                        {/* Rendered only when the check actually measured one.
                            A dash where no measurement exists is honest; a 0
                            would read as an instantaneous response. */}
                        {component.latencyMs !== null ? (
                          <span className="cms-muted">{component.latencyMs} ms</span>
                        ) : null}
                      </div>
                      <p className="system-component__detail">{component.detail}</p>
                    </li>
                  ))}
                </ul>
              </ChartCard>

              <p className="cms-muted">
                Deeper diagnostics — connection targets, provider endpoints, credentials — are
                deliberately absent from this page and belong in the server logs, which are
                redacted. See <code>docs/OPERATIONS.md</code>.
              </p>
            </>
          );
        }}
      </QrBoundary>
    </div>
  );
}
