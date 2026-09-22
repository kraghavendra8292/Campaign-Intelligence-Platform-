/**
 * Public website schema (Phase 3).
 *
 * Every field here is readable without authentication, so the types themselves
 * are the last line of defence: a type that cannot name `status`,
 * `internalNote` or `storageKey` cannot leak them however the resolver is
 * written.
 *
 * There are no mutations in this file. The public API is strictly read-only.
 */
export const publicSiteTypeDefs = /* GraphQL */ `
  enum ContentCategory {
    INFRASTRUCTURE
    EDUCATION
    HEALTHCARE
    WATER
    AGRICULTURE
    EMPLOYMENT
    PUBLIC_SERVICES
    ENVIRONMENT
    OTHER
  }

  enum ProjectStatus {
    PLANNED
    IN_PROGRESS
    COMPLETED
    ON_HOLD
    CANCELLED
  }

  enum EventLifecycle {
    UPCOMING
    ONGOING
    COMPLETED
    CANCELLED
  }

  enum VerificationStatus {
    UNVERIFIED
    IN_REVIEW
    VERIFIED
    "Phase 9. A reviewer found the evidence insufficient and said why, internally."
    REJECTED
  }

  enum ContentLocale {
    en
    kn
  }

  enum ProjectMediaRole {
    GALLERY
    BEFORE
    AFTER
  }

  enum VideoPlatform {
    YOUTUBE
    VIMEO
    OTHER
  }

  """
  An image as the public site sees it. Carries no storage key and no uploader:
  the id is resolved to bytes by the media route.
  """
  type PublicImage {
    id: ID!
    altText: String
    caption: String
    width: Int
    height: Int
  }

  type PublicOrganization {
    id: ID!
    slug: String!
    name: String!
  }

  type PublicCandidateProfile {
    id: ID!
    fullName: String!
    displayName: String
    designation: String
    shortBio: String
    "Sanitised HTML. Safe to render."
    fullBioHtml: String
    experienceHtml: String
    publicServiceHtml: String
    focusAreas: [ContentCategory!]!
    profileImage: PublicImage
    coverImage: PublicImage
    metaTitle: String
    metaDescription: String
  }

  type PublicVision {
    id: ID!
    headline: String!
    summary: String
    statementHtml: String
    metaTitle: String
    metaDescription: String
  }

  type PublicPriority {
    id: ID!
    slug: String!
    title: String!
    description: String
    "Key for a bundled icon. Never raw markup."
    iconKey: String
    category: ContentCategory!
    displayOrder: Int!
    image: PublicImage
  }

  type PublicProjectMedia {
    id: ID!
    role: ProjectMediaRole!
    caption: String
    image: PublicImage!
  }

  type PublicProjectUpdate {
    id: ID!
    title: String!
    bodyHtml: String
    occurredOn: DateTime!
  }

  type PublicProject {
    id: ID!
    slug: String!
    title: String!
    shortDescription: String
    descriptionHtml: String
    category: ContentCategory!
    area: String
    locationName: String
    latitude: Float
    longitude: Float
    projectStatus: ProjectStatus!
    startDate: DateTime
    completionDate: DateTime
    "Null when not stated. Never inferred or defaulted to zero."
    costAmount: Float
    costCurrency: String
    beneficiaryCount: Int
    featured: Boolean!
    publishedAt: DateTime
    coverImage: PublicImage
    media: [PublicProjectMedia!]!
    updates: [PublicProjectUpdate!]!
    metaTitle: String
    metaDescription: String
  }

  "Public evidence only. Internal verification notes are not exposed."
  type PublicEvidence {
    id: ID!
    title: String!
    description: String
    sourceNote: String
    documentId: ID
    documentName: String
  }

  type PublicAchievementMedia {
    id: ID!
    caption: String
    image: PublicImage!
  }

  type PublicAchievement {
    id: ID!
    slug: String!
    title: String!
    summary: String
    descriptionHtml: String
    category: ContentCategory!
    area: String
    achievedOn: DateTime
    verification: VerificationStatus!
    verifiedAt: DateTime
    featured: Boolean!
    publishedAt: DateTime
    coverImage: PublicImage
    media: [PublicAchievementMedia!]!
    evidence: [PublicEvidence!]!
    metaTitle: String
    metaDescription: String
  }

  type PublicNewsArticle {
    id: ID!
    slug: String!
    title: String!
    summary: String
    contentHtml: String
    category: ContentCategory!
    tags: [String!]!
    authorName: String
    featured: Boolean!
    publishedAt: DateTime
    coverImage: PublicImage
    metaTitle: String
    metaDescription: String
  }

  type PublicEvent {
    id: ID!
    slug: String!
    title: String!
    summary: String
    descriptionHtml: String
    startsAt: DateTime!
    endsAt: DateTime
    locationName: String
    address: String
    organizer: String
    eventStatus: EventLifecycle!
    featured: Boolean!
    publishedAt: DateTime
    coverImage: PublicImage
    metaTitle: String
    metaDescription: String
  }

  type PublicGalleryItem {
    id: ID!
    caption: String
    image: PublicImage!
  }

  type PublicGalleryAlbum {
    id: ID!
    slug: String!
    title: String!
    description: String
    category: ContentCategory!
    coverImage: PublicImage
    items: [PublicGalleryItem!]!
  }

  type PublicVideo {
    id: ID!
    slug: String!
    title: String!
    description: String
    "Validated against a host allow-list before storage."
    videoUrl: String!
    platform: VideoPlatform!
    category: ContentCategory!
    featured: Boolean!
    publishedAt: DateTime
    thumbnail: PublicImage
  }

  type PublicSocialLink {
    id: ID!
    platform: String!
    label: String
    url: String!
  }

  type PublicContactDetails {
    id: ID!
    officeName: String
    addressLine1: String
    addressLine2: String
    city: String
    state: String
    postalCode: String
    phone: String
    alternatePhone: String
    email: String
    officeHours: String
    mapEmbedUrl: String
    latitude: Float
    longitude: Float
  }

  type PublicContactInformation {
    contact: PublicContactDetails
    socialLinks: [PublicSocialLink!]!
  }

  type PublicPageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type PublicProjectConnection {
    nodes: [PublicProject!]!
    pageInfo: PublicPageInfo!
    totalCount: Int!
  }

  type PublicAchievementConnection {
    nodes: [PublicAchievement!]!
    pageInfo: PublicPageInfo!
    totalCount: Int!
  }

  type PublicNewsConnection {
    nodes: [PublicNewsArticle!]!
    pageInfo: PublicPageInfo!
    totalCount: Int!
  }

  type PublicEventConnection {
    nodes: [PublicEvent!]!
    pageInfo: PublicPageInfo!
    totalCount: Int!
  }

  "Cross-content search results, grouped so each keeps its own type."
  type PublicSearchResults {
    term: String!
    projects: [PublicProject!]!
    achievements: [PublicAchievement!]!
    news: [PublicNewsArticle!]!
    events: [PublicEvent!]!
    totalCount: Int!
  }

  "Everything the homepage needs, in one round trip."
  type PublicHomepage {
    organization: PublicOrganization!
    profile: PublicCandidateProfile
    vision: PublicVision
    priorities: [PublicPriority!]!
    featuredProjects: [PublicProject!]!
    featuredAchievements: [PublicAchievement!]!
    latestNews: [PublicNewsArticle!]!
    upcomingEvents: [PublicEvent!]!
  }

  """
  Identifies which candidate site to render.

  The slug is a public address, not a secret, and naming it grants no authority:
  the server still returns only PUBLISHED content belonging to that one tenant.
  May be omitted when the request arrives on a site subdomain or carries the
  x-organization-slug header.
  """
  input PublicSiteInput {
    organizationSlug: String
    locale: ContentLocale = en
  }

  extend type Query {
    "The organisation whose public site is being rendered."
    publicSite(input: PublicSiteInput): PublicOrganization!

    publicHomepage(input: PublicSiteInput): PublicHomepage!
    publicCandidateProfile(input: PublicSiteInput): PublicCandidateProfile
    publicVision(input: PublicSiteInput): PublicVision
    publicPriorities(input: PublicSiteInput): [PublicPriority!]!

    publicProjects(
      input: PublicSiteInput
      first: Int = 12
      after: String
      category: ContentCategory
      search: String
      featuredOnly: Boolean
    ): PublicProjectConnection!
    publicProject(input: PublicSiteInput, slug: String!): PublicProject!

    publicAchievements(
      input: PublicSiteInput
      first: Int = 12
      after: String
      category: ContentCategory
      search: String
      featuredOnly: Boolean
    ): PublicAchievementConnection!
    publicAchievement(input: PublicSiteInput, slug: String!): PublicAchievement!

    publicNews(
      input: PublicSiteInput
      first: Int = 12
      after: String
      category: ContentCategory
      search: String
    ): PublicNewsConnection!
    publicNewsArticle(input: PublicSiteInput, slug: String!): PublicNewsArticle!

    publicEvents(
      input: PublicSiteInput
      first: Int = 12
      after: String
      upcomingOnly: Boolean
      search: String
    ): PublicEventConnection!
    publicEvent(input: PublicSiteInput, slug: String!): PublicEvent!

    publicPhotoAlbums(input: PublicSiteInput): [PublicGalleryAlbum!]!
    publicVideos(input: PublicSiteInput): [PublicVideo!]!
    publicContactInformation(input: PublicSiteInput): PublicContactInformation!

    "Searches published content only, within one tenant."
    publicSearch(input: PublicSiteInput, term: String!, limitPerType: Int = 5): PublicSearchResults!
  }
`;
