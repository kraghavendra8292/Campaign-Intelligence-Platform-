/**
 * QR console GraphQL documents.
 *
 * The heavy `image` field is requested ONLY by the detail and print screens.
 * A list of fifty codes would otherwise make the server rasterise fifty PNGs
 * to render fifty rows of text, which is why it is a separate field rather than
 * part of the code fragment.
 */

const CAMPAIGN_FIELDS = /* GraphQL */ `
  fragment CampaignFields on QrCampaign {
    id
    slug
    name
    description
    campaignType
    status
    startDate
    endDate
    createdAt
    updatedAt
    qrCodeCount
    totalScans
  }
`;

const CODE_FIELDS = /* GraphQL */ `
  fragment CodeFields on QrCode {
    id
    code
    name
    description
    destinationPath
    status
    source
    placement
    area
    ward
    locality
    latitude
    longitude
    utmSource
    utmMedium
    utmCampaign
    utmContent
    createdAt
    activatedAt
    deactivatedAt
    totalScans
    campaign {
      id
      name
      slug
      campaignType
      status
    }
  }
`;

const ANALYTICS_FIELDS = /* GraphQL */ `
  fragment AnalyticsFields on QrAnalytics {
    range {
      from
      to
      days
    }
    totalScans
    automatedScans
    estimatedUniqueScans
    scansToday
    scansLast7Days
    scansLast30Days
    averageScansPerDay
    activeQrCodes
    totalQrCodes
    topQrCodeId
    trend {
      date
      scans
    }
    byQrCode {
      key
      label
      scans
    }
    bySource {
      key
      label
      scans
    }
    byArea {
      key
      label
      scans
    }
    byWard {
      key
      label
      scans
    }
    byDevice {
      key
      label
      scans
    }
    byDayOfWeek {
      key
      label
      scans
    }
    byHourBucket {
      key
      label
      scans
    }
  }
`;

export const QR_CAMPAIGNS = /* GraphQL */ `
  ${CAMPAIGN_FIELDS}
  query QrCampaigns($first: Int, $status: QrCampaignStatus, $search: String) {
    qrCampaigns(first: $first, status: $status, search: $search) {
      nodes {
        ...CampaignFields
      }
      totalCount
    }
  }
`;

export const QR_CAMPAIGN = /* GraphQL */ `
  ${CAMPAIGN_FIELDS}
  ${CODE_FIELDS}
  query QrCampaignDetail($id: ID!) {
    qrCampaign(id: $id) {
      ...CampaignFields
    }
    qrCodes(campaignId: $id, first: 100) {
      nodes {
        ...CodeFields
      }
      totalCount
    }
  }
`;

export const QR_CODE_DETAIL = /* GraphQL */ `
  ${CODE_FIELDS}
  query QrCodeDetail($id: ID!) {
    qrCode(id: $id) {
      ...CodeFields
      image {
        scanUrl
        pngDataUrl
        svg
      }
    }
  }
`;

export const QR_DESTINATIONS = /* GraphQL */ `
  query QrDestinations {
    qrDestinationOptions
  }
`;

export const QR_ANALYTICS = /* GraphQL */ `
  ${ANALYTICS_FIELDS}
  query QrAnalytics($filter: AnalyticsFilter) {
    qrAnalytics(filter: $filter) {
      ...AnalyticsFields
    }
  }
`;

export const QR_CAMPAIGN_COMPARISON = /* GraphQL */ `
  ${ANALYTICS_FIELDS}
  query QrOverview($filter: AnalyticsFilter) {
    qrAnalytics(filter: $filter) {
      ...AnalyticsFields
    }
    qrCampaignComparison(filter: $filter) {
      range {
        from
        to
        days
      }
      campaigns {
        id
        name
        campaignType
        status
        scans
      }
    }
  }
`;

export const QR_ANALYTICS_CSV = /* GraphQL */ `
  query QrAnalyticsCsv($filter: AnalyticsFilter) {
    qrAnalyticsCsv(filter: $filter)
  }
`;

export const CREATE_QR_CAMPAIGN = /* GraphQL */ `
  mutation CreateQrCampaign($input: QrCampaignInput!) {
    createQrCampaign(input: $input) {
      id
      slug
    }
  }
`;

export const UPDATE_QR_CAMPAIGN = /* GraphQL */ `
  mutation UpdateQrCampaign($id: ID!, $input: QrCampaignInput!) {
    updateQrCampaign(id: $id, input: $input) {
      id
    }
  }
`;

export const TRANSITION_QR_CAMPAIGN = /* GraphQL */ `
  mutation TransitionQrCampaign($id: ID!, $action: QrCampaignAction!) {
    transitionQrCampaign(id: $id, action: $action) {
      id
      status
    }
  }
`;

export const CREATE_QR_CODE = /* GraphQL */ `
  mutation CreateQrCode($campaignId: ID!, $input: QrCodeInput!) {
    createQrCode(campaignId: $campaignId, input: $input) {
      id
      code
    }
  }
`;

export const UPDATE_QR_CODE = /* GraphQL */ `
  mutation UpdateQrCode($id: ID!, $input: QrCodeInput!) {
    updateQrCode(id: $id, input: $input) {
      id
    }
  }
`;

export const TRANSITION_QR_CODE = /* GraphQL */ `
  mutation TransitionQrCode($id: ID!, $action: QrCodeAction!) {
    transitionQrCode(id: $id, action: $action) {
      id
      status
    }
  }
`;

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface QrCampaignRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  campaignType: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  qrCodeCount: number;
  totalScans: number;
}

export interface QrCodeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  destinationPath: string;
  status: string;
  source: string | null;
  placement: string | null;
  area: string | null;
  ward: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  createdAt: string;
  activatedAt: string | null;
  deactivatedAt: string | null;
  totalScans: number;
  campaign: { id: string; name: string; slug: string; campaignType: string; status: string };
  image?: { scanUrl: string; pngDataUrl: string; svg: string } | null;
}

export interface ScanBucket {
  key: string;
  label: string;
  scans: number;
}

export interface QrAnalyticsData {
  range: { from: string; to: string; days: number };
  totalScans: number;
  automatedScans: number;
  estimatedUniqueScans: number | null;
  scansToday: number;
  scansLast7Days: number;
  scansLast30Days: number;
  averageScansPerDay: number;
  activeQrCodes: number;
  totalQrCodes: number;
  topQrCodeId: string | null;
  trend: Array<{ date: string; scans: number }>;
  byQrCode: ScanBucket[];
  bySource: ScanBucket[];
  byArea: ScanBucket[];
  byWard: ScanBucket[];
  byDevice: ScanBucket[];
  byDayOfWeek: ScanBucket[];
  byHourBucket: ScanBucket[];
}

export interface CampaignComparisonRow {
  id: string;
  name: string;
  campaignType: string;
  status: string;
  scans: number;
}
