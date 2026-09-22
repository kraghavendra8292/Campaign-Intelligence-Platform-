/**
 * Phase 4 - QR campaign platform.
 *
 * Every field here requires authentication, an active tenant and a QR
 * permission. There is no public QR query: a citizen scanning a poster talks to
 * `GET /q/:code` over REST and never touches GraphQL, so none of the
 * administrative shape below is reachable anonymously.
 *
 * Nothing in this schema describes an individual. The analytics types return
 * counts grouped by channel, device class and time bucket - there is no
 * per-visitor type, and the stored visit hash is not exposed by any field.
 */
export const qrTypeDefs = /* GraphQL */ `
  enum QrCampaignType {
    POSTER
    PAMPHLET
    BANNER
    EVENT
    SOCIAL_MEDIA
    OFFICE
    DOOR_TO_DOOR
    OTHER
  }

  enum QrCampaignStatus {
    DRAFT
    ACTIVE
    PAUSED
    COMPLETED
    ARCHIVED
  }

  enum QrCodeStatus {
    ACTIVE
    PAUSED
    ARCHIVED
  }

  "Lifecycle transitions available on a campaign."
  enum QrCampaignAction {
    ACTIVATE
    PAUSE
    COMPLETE
    ARCHIVE
  }

  "Lifecycle transitions available on a single QR code."
  enum QrCodeAction {
    ACTIVATE
    PAUSE
    ARCHIVE
  }

  enum ScanDeviceCategory {
    MOBILE
    TABLET
    DESKTOP
    BOT
    UNKNOWN
  }

  "Named analytics windows. Resolved server-side so every viewer sees the same boundary."
  enum AnalyticsRange {
    TODAY
    YESTERDAY
    LAST_7_DAYS
    LAST_30_DAYS
    LAST_90_DAYS
    THIS_MONTH
    PREVIOUS_MONTH
    CUSTOM
  }

  type QrCampaignAuthor {
    id: ID!
    fullName: String!
  }

  type QrCampaign {
    id: ID!
    slug: String!
    name: String!
    description: String
    campaignType: QrCampaignType!
    status: QrCampaignStatus!
    startDate: DateTime
    endDate: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
    createdBy: QrCampaignAuthor
    "Number of QR codes belonging to this campaign."
    qrCodeCount: Int!
    "All-time scans across this campaign's codes."
    totalScans: Int!
    "Citizen issues attributed to this QR campaign (via rk_qr)."
    issueCount: Int!
    "Attributed issues that are not closed or rejected."
    openIssueCount: Int!
    """
    Issue submissions per scan, as a percentage.

    Null when there are no scans: a rate with an empty denominator is undefined,
    and "0%" would read as failure when the truth is that nobody scanned yet.
    """
    conversionRatePct: Float
  }

  type QrCampaignConnection {
    nodes: [QrCampaign!]!
    totalCount: Int!
  }

  "Campaign summary embedded in a QR code, so a code can be shown without a second query."
  type QrCodeCampaign {
    id: ID!
    name: String!
    slug: String!
    campaignType: QrCampaignType!
    status: QrCampaignStatus!
  }

  """
  The printable asset for one QR code.

  Rendered on the server from configuration, so the encoded URL cannot be
  influenced by the client. Returned as data rather than from an image endpoint
  because the admin access token lives in memory and would not accompany an
  ordinary image request.
  """
  type QrCodeImage {
    "The public URL a scanner opens."
    scanUrl: String!
    "PNG as a data URL, for preview and download."
    pngDataUrl: String!
    "SVG markup, for print at any size."
    svg: String!
  }

  type QrCode {
    id: ID!
    "Public identifier printed under the symbol, e.g. RK-QR-7F3K9XQ2."
    code: String!
    name: String!
    description: String
    "Validated internal path on the public website."
    destinationPath: String!
    status: QrCodeStatus!

    source: String
    placement: String
    area: String
    ward: String
    locality: String
    "Where the printed code is placed - never where a person scanning it is."
    latitude: Float
    longitude: Float

    utmSource: String
    utmMedium: String
    utmCampaign: String
    utmContent: String

    createdAt: DateTime!
    updatedAt: DateTime!
    activatedAt: DateTime
    deactivatedAt: DateTime

    campaign: QrCodeCampaign!
    createdBy: QrCampaignAuthor
    "All-time scans of this code."
    totalScans: Int!
    "Rendered asset. Requires QR_CODE_DOWNLOAD; null when the caller lacks it."
    image: QrCodeImage
  }

  type QrCodeConnection {
    nodes: [QrCode!]!
    totalCount: Int!
  }

  "One labelled bucket of an aggregate rollup."
  type ScanBucket {
    key: String!
    label: String!
    scans: Int!
  }

  type ScanTrendPoint {
    date: DateTime!
    scans: Int!
  }

  type AnalyticsWindow {
    from: DateTime!
    to: DateTime!
    days: Int!
  }

  "One labelled count bucket (issues by status/priority, etc.)."
  type QrCountBucket {
    key: String!
    label: String!
    count: Int!
  }

  """
  Aggregate scan analytics.

  Every figure is a count of SCAN EVENTS. None of them is a count of people: a
  scan cannot be attributed to a person, and the field names say "scans" so a
  reader is never invited to assume otherwise.

  Issue fields join Phase 5 submissions attributed to the same QR campaign or
  code (via rk_qr), so conversion is a statement about a poster channel.
  """
  type QrAnalytics {
    range: AnalyticsWindow!

    totalScans: Int!
    "Scans identified as link-preview crawlers, bots or scripts."
    automatedScans: Int!
    """
    Approximate distinct visits within the window.

    Derived from a salted hash that rotates daily and cannot be linked across
    days, campaigns or to any identity. Null when unavailable - never zero,
    because zero would be a claim this data cannot support.
    """
    estimatedUniqueScans: Int

    scansToday: Int!
    scansLast7Days: Int!
    scansLast30Days: Int!
    averageScansPerDay: Float!

    activeQrCodes: Int!
    totalQrCodes: Int!

    trend: [ScanTrendPoint!]!
    byQrCode: [ScanBucket!]!
    bySource: [ScanBucket!]!
    byArea: [ScanBucket!]!
    byWard: [ScanBucket!]!
    byDevice: [ScanBucket!]!
    byDayOfWeek: [ScanBucket!]!
    byHourBucket: [ScanBucket!]!

    "Id of the highest-scanning code in the window, or null when there are no scans."
    topQrCodeId: ID

    "Citizen issues attributed to this scope within the analytics window."
    issuesFromQr: Int!
    "Attributed issues still open (not closed or rejected)."
    openIssues: Int!
    "Issues per scan in the window. Null when there were no scans."
    conversionRatePct: Float
    issuesByStatus: [QrCountBucket!]!
    issuesByPriority: [QrCountBucket!]!
  }

  type CampaignComparisonRow {
    id: ID!
    name: String!
    campaignType: QrCampaignType!
    status: QrCampaignStatus!
    scans: Int!
  }

  type CampaignComparison {
    range: AnalyticsWindow!
    campaigns: [CampaignComparisonRow!]!
  }

  input QrCampaignInput {
    name: String!
    slug: String
    description: String
    campaignType: QrCampaignType
    startDate: DateTime
    endDate: DateTime
  }

  input QrCodeInput {
    name: String!
    description: String
    "Must be a path on the public website, e.g. \\"/work/road-project\\"."
    destinationPath: String!
    source: String
    placement: String
    area: String
    ward: String
    locality: String
    latitude: Float
    longitude: Float
    utmSource: String
    utmMedium: String
    utmCampaign: String
    utmContent: String
  }

  "Scope and window for an analytics query."
  input AnalyticsFilter {
    range: AnalyticsRange
    "Required when range is CUSTOM."
    from: DateTime
    "Required when range is CUSTOM. Inclusive of the whole day."
    to: DateTime
    campaignId: ID
    qrCodeId: ID
    "Excludes crawlers and scripts from every figure."
    excludeAutomated: Boolean
  }

  extend type Query {
    qrCampaigns(
      first: Int = 25
      status: QrCampaignStatus
      campaignType: QrCampaignType
      search: String
    ): QrCampaignConnection!
    qrCampaign(id: ID!): QrCampaign!

    qrCodes(
      first: Int = 25
      campaignId: ID
      status: QrCodeStatus
      search: String
    ): QrCodeConnection!
    qrCode(id: ID!): QrCode!

    "Aggregate analytics for the tenant, one campaign, or one code."
    qrAnalytics(filter: AnalyticsFilter): QrAnalytics!
    "Scans per campaign, for comparing channels."
    qrCampaignComparison(filter: AnalyticsFilter): CampaignComparison!
    "Aggregate CSV: one row per day per QR code. Contains no personal data."
    qrAnalyticsCsv(filter: AnalyticsFilter): String!

    "Destination paths a QR code may point at, for the admin picker."
    qrDestinationOptions: [String!]!
  }

  extend type Mutation {
    createQrCampaign(input: QrCampaignInput!): QrCampaign!
    updateQrCampaign(id: ID!, input: QrCampaignInput!): QrCampaign!
    transitionQrCampaign(id: ID!, action: QrCampaignAction!): QrCampaign!

    createQrCode(campaignId: ID!, input: QrCodeInput!): QrCode!
    updateQrCode(id: ID!, input: QrCodeInput!): QrCode!
    transitionQrCode(id: ID!, action: QrCodeAction!): QrCode!
  }
`;
