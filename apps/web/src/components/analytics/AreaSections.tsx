import { Link } from 'react-router-dom';
import { Button } from '@rk/ui';
import { useAdminQuery } from '../../features/admin/adminApi';
import {
  ANALYTICS_AREA_DETAIL_QUERY,
  type AreaDetailData,
  type AreaRow,
} from '../../features/analytics/analyticsQueries';
import { QrBoundary } from '../qr/QrShell';
import { ChartCard } from './charts';
import { formatDate } from '../../lib/format';

/**
 * Geographic sections.
 *
 * THIS IS THE MAP. There is no tile layer, no marker cluster and no polygon
 * overlay, and that is a deliberate architectural decision rather than a
 * shortfall:
 *
 *  - The platform stores NO boundary data. There are no ward polygons, no
 *    constituency shapes and no geocoding anywhere in Phases 1-6. Drawing a
 *    choropleth would mean sourcing and shipping boundary files for one
 *    constituency, and every ward whose name did not match would silently
 *    vanish from the picture rather than appear as an unmatched row.
 *  - A POINT MAP WOULD BE THE WRONG ANSWER. `Issue` does hold coordinates when
 *    a citizen shared them, and plotting those is plotting where individual
 *    people were standing - sometimes their doorstep. The administrative
 *    question is "where are the drainage problems", which the ward answers.
 *  - A ranked table with density bars carries more decision-relevant
 *    information per pixel than a choropleth anyway: exact counts, the
 *    open/resolved split, and the resolution rate are all readable at once,
 *    and all of them survive a screen reader.
 *
 * If boundary data is ever licensed, this is the component a choropleth would
 * replace, and the query feeding it would not change.
 */

export function AreaTable({
  rows,
  selected,
  onSelect,
}: {
  rows: AreaRow[];
  selected: string | null;
  onSelect: (area: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <ChartCard title="Areas" description="Submissions grouped by area.">
        <p className="chart-empty">
          No submissions match these filters, or no area was recorded on them.
        </p>
      </ChartCard>
    );
  }

  const max = Math.max(...rows.map((row) => row.count), 1);

  return (
    <ChartCard
      title="Areas by submission volume"
      description="Select an area to see its detail. The bar shows relative density."
    >
      <div className="table-scroll">
        <table className="cms-table area-table">
          <thead>
            <tr>
              <th scope="col">Area</th>
              <th scope="col">Density</th>
              <th scope="col">Submissions</th>
              <th scope="col">Open</th>
              <th scope="col">Resolved</th>
              <th scope="col">Resolution rate</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={selected === row.key ? 'area-table__row--active' : ''}>
                <td>
                  <button type="button" className="linklike" onClick={() => onSelect(row.key)}>
                    {row.label}
                  </button>
                </td>
                <td className="area-table__density">
                  {/* Geometry is decorative; the exact count is in the next */}
                  {/* column, so a failed paint loses nothing. */}
                  <span className="area-bar" aria-hidden="true">
                    <span
                      className="area-bar__fill"
                      style={{ width: `${(row.count / max) * 100}%` }}
                    />
                  </span>
                </td>
                <td>{row.count.toLocaleString()}</td>
                <td>{row.openCount.toLocaleString()}</td>
                <td>{row.resolvedCount.toLocaleString()}</td>
                <td>
                  {row.resolutionRatePct === null ? (
                    <span title="Too few submissions to report a meaningful rate">—</span>
                  ) : (
                    `${row.resolutionRatePct}%`
                  )}
                </td>
                <td>
                  {row.changePct === null
                    ? '—'
                    : `${row.changePct > 0 ? '+' : ''}${row.changePct}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

/**
 * One area in depth.
 *
 * `recentIssues` deliberately carries reference, title, category, status and
 * date only. No contact details, no description, no coordinates - this is a
 * navigational list, and everything sensitive stays on the Phase 5 issue page
 * where reading it is permissioned and, for contact details, audited.
 */
export function AreaDetailPanel({
  area,
  variables,
  onClose,
}: {
  area: string;
  variables: { filter: Record<string, unknown> };
  onClose: () => void;
}) {
  const { state, refetch } = useAdminQuery<AreaDetailData>(ANALYTICS_AREA_DETAIL_QUERY, {
    area,
    ...variables,
  });

  return (
    <div className="area-detail">
      <div className="area-detail__head">
        <h3 className="analytics-section__title">Area detail</h3>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>

      <QrBoundary state={state} refetch={refetch}>
        {(data) => {
          const detail = data.analyticsAreaDetail;
          return (
            <>
              <h4 className="area-detail__name">{detail.label}</h4>

              <dl className="ai-stats">
                <Stat label="Submissions" value={detail.totalInRange.toLocaleString()} />
                <Stat label="Open" value={detail.openCount.toLocaleString()} />
                <Stat label="Resolved" value={detail.resolvedCount.toLocaleString()} />
                <Stat
                  label="Resolution rate"
                  value={detail.resolutionRatePct === null ? '—' : `${detail.resolutionRatePct}%`}
                />
                <Stat
                  label="Average resolution"
                  value={
                    detail.averageResolutionDays === null
                      ? '—'
                      : `${detail.averageResolutionDays} days`
                  }
                />
                <Stat
                  label="Change"
                  value={
                    detail.changePct === null
                      ? '—'
                      : `${detail.changePct > 0 ? '+' : ''}${detail.changePct}%`
                  }
                />
              </dl>

              {detail.topCategories.length > 0 ? (
                <>
                  <h5 className="ai-panel__heading">Top categories</h5>
                  <ul className="ai-panel__topic-list">
                    {detail.topCategories.map((category) => (
                      <li key={category.key}>
                        {category.label} ({category.count})
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {detail.recentIssues.length > 0 ? (
                <>
                  <h5 className="ai-panel__heading">Recent submissions</h5>
                  <div className="table-scroll">
                    <table className="cms-table">
                      <thead>
                        <tr>
                          <th scope="col">Reference</th>
                          <th scope="col">Title</th>
                          <th scope="col">Category</th>
                          <th scope="col">Status</th>
                          <th scope="col">Received</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.recentIssues.map((issue) => (
                          <tr key={issue.id}>
                            <td>
                              <Link to={`/admin/issues/${issue.id}`}>{issue.referenceNumber}</Link>
                            </td>
                            <td>{issue.title}</td>
                            <td>{issue.category?.label ?? 'Not categorised'}</td>
                            <td>{issue.status.replace(/_/g, ' ').toLowerCase()}</td>
                            <td>{formatDate(issue.submittedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="chart-empty">No submissions in this area for the selected period.</p>
              )}
            </>
          );
        }}
      </QrBoundary>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ai-stats__item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
