/**
 * Dashboard data layer.
 *
 * There is almost nothing here on purpose. Every figure the dashboard shows is
 * already computed by an existing server-side aggregation, so this feature
 * REUSES those documents - `ANALYTICS_OVERVIEW_QUERY`, `ANALYTICS_TREND_QUERY`,
 * `ANALYTICS_BREAKDOWN_QUERY` and `ISSUES_QUERY` - rather than adding a second
 * way to count the same rows. Two aggregations of one number eventually
 * disagree, and then neither can be trusted.
 *
 * The one document defined here composes EXISTING root fields that had no
 * single caller: three content counts that would otherwise be three separate
 * round trips. It adds no resolver, no business logic and no new permission
 * surface - the server authorises each field exactly as it already does.
 */

/**
 * Published-content snapshot.
 *
 * `first` is the whole point: the dashboard needs the COUNT and the few most
 * recent rows, never the table. `totalCount` is computed by the database over
 * the full set, so a campaign with ten thousand projects still transfers three.
 */
export const DASHBOARD_CONTENT_QUERY = /* GraphQL */ `
  query DashboardContent($first: Int!) {
    cmsProjects(first: $first) {
      totalCount
      nodes {
        id
        title
        status
        projectStatus
        area
        updatedAt
      }
    }
    cmsNews(first: $first) {
      totalCount
      nodes {
        id
        title
        status
        publishedAt
        updatedAt
      }
    }
    cmsEvents(first: $first) {
      totalCount
      nodes {
        id
        title
        status
        startAt
        updatedAt
      }
    }
  }
`;

interface ContentRow {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

export interface DashboardProjectRow extends ContentRow {
  projectStatus: string | null;
  area: string | null;
}

export interface DashboardNewsRow extends ContentRow {
  publishedAt: string | null;
}

export interface DashboardEventRow extends ContentRow {
  startAt: string | null;
}

export interface DashboardContentData {
  cmsProjects: { totalCount: number; nodes: DashboardProjectRow[] };
  cmsNews: { totalCount: number; nodes: DashboardNewsRow[] };
  cmsEvents: { totalCount: number; nodes: DashboardEventRow[] };
}
