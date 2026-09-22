/**
 * CMS schema (Phase 3).
 *
 * Admin-facing counterpart to `publicSite.ts`. These types deliberately expose
 * what the public ones cannot - `status`, `locale`, internal evidence notes -
 * because that is exactly what an editor needs to work with, and every field is
 * behind a permission check plus a tenant-scoped query.
 *
 * Publishing is expressed as a `transition` rather than as a settable `status`
 * field, so a client cannot move content to PUBLISHED by editing an attribute
 * that looks like data.
 */
export const cmsTypeDefs = /* GraphQL */ `
  enum ContentStatus {
    DRAFT
    IN_REVIEW
    PUBLISHED
    ARCHIVED
  }

  "Publishing transitions. SUBMIT_FOR_REVIEW is ordinary editing; the rest need the entity's PUBLISH permission."
  enum PublishAction {
    PUBLISH
    UNPUBLISH
    SUBMIT_FOR_REVIEW
    ARCHIVE
  }

  enum MediaKind {
    IMAGE
    DOCUMENT
    VIDEO_LINK
  }

  enum SingletonContent {
    CANDIDATE_PROFILE
    VISION
    CONTACT
  }

  type MediaAsset {
    id: ID!
    kind: MediaKind!
    originalName: String!
    mimeType: String!
    sizeBytes: Int!
    width: Int
    height: Int
    altText: String
    caption: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type MediaConnection {
    nodes: [MediaAsset!]!
    pageInfo: PublicPageInfo!
    totalCount: Int!
  }

  type CmsImageRef {
    id: ID!
    altText: String
    width: Int
    height: Int
  }

  type CmsCandidateProfile {
    id: ID!
    locale: ContentLocale!
    fullName: String!
    displayName: String
    designation: String
    shortBio: String
    fullBioHtml: String
    experienceHtml: String
    publicServiceHtml: String
    focusAreas: [ContentCategory!]!
    profileImage: CmsImageRef
    coverImage: CmsImageRef
    status: ContentStatus!
    publishedAt: DateTime
    metaTitle: String
    metaDescription: String
    updatedAt: DateTime!
  }

  type CmsVision {
    id: ID!
    locale: ContentLocale!
    headline: String!
    summary: String
    statementHtml: String
    status: ContentStatus!
    publishedAt: DateTime
    metaTitle: String
    metaDescription: String
    updatedAt: DateTime!
  }

  type CmsPriority {
    id: ID!
    slug: String!
    locale: ContentLocale!
    title: String!
    description: String
    iconKey: String
    category: ContentCategory!
    displayOrder: Int!
    status: ContentStatus!
    publishedAt: DateTime
    image: CmsImageRef
    updatedAt: DateTime!
  }

  type CmsProjectMedia {
    id: ID!
    role: ProjectMediaRole!
    caption: String
    sortOrder: Int!
    image: CmsImageRef!
  }

  type CmsProjectUpdate {
    id: ID!
    title: String!
    bodyHtml: String
    occurredOn: DateTime!
    sortOrder: Int!
  }

  type CmsProject {
    id: ID!
    slug: String!
    locale: ContentLocale!
    title: String!
    shortDescription: String
    descriptionHtml: String
    category: ContentCategory!
    area: String
    locationName: String
    latitude: Float
    longitude: Float
    startDate: DateTime
    completionDate: DateTime
    projectStatus: ProjectStatus!
    costAmount: Float
    costCurrency: String
    beneficiaryCount: Int
    featured: Boolean!
    displayOrder: Int!
    status: ContentStatus!
    publishedAt: DateTime
    metaTitle: String
    metaDescription: String
    coverImage: CmsImageRef
    media: [CmsProjectMedia!]!
    updates: [CmsProjectUpdate!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  "Evidence as staff see it, including the internal note the public never gets."
  type CmsEvidence {
    id: ID!
    title: String!
    description: String
    sourceNote: String
    internalNote: String
    isPublic: Boolean!
    sortOrder: Int!
    documentId: ID
    documentName: String
  }

  type CmsAchievementMedia {
    id: ID!
    caption: String
    sortOrder: Int!
    image: CmsImageRef!
  }

  type CmsVerifier {
    id: ID!
    fullName: String!
  }

  type CmsAchievement {
    id: ID!
    slug: String!
    locale: ContentLocale!
    title: String!
    summary: String
    descriptionHtml: String
    category: ContentCategory!
    area: String
    achievedOn: DateTime
    verification: VerificationStatus!
    verifiedAt: DateTime
    verifiedBy: CmsVerifier
    featured: Boolean!
    displayOrder: Int!
    status: ContentStatus!
    publishedAt: DateTime
    metaTitle: String
    metaDescription: String
    coverImage: CmsImageRef
    media: [CmsAchievementMedia!]!
    evidence: [CmsEvidence!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type CmsNewsArticle {
    id: ID!
    slug: String!
    locale: ContentLocale!
    title: String!
    summary: String
    contentHtml: String
    category: ContentCategory!
    tags: [String!]!
    authorName: String
    featured: Boolean!
    status: ContentStatus!
    publishedAt: DateTime
    metaTitle: String
    metaDescription: String
    coverImage: CmsImageRef
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type CmsEvent {
    id: ID!
    slug: String!
    locale: ContentLocale!
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
    status: ContentStatus!
    publishedAt: DateTime
    metaTitle: String
    metaDescription: String
    coverImage: CmsImageRef
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type CmsGalleryItem {
    id: ID!
    caption: String
    sortOrder: Int!
    image: CmsImageRef!
  }

  type CmsGalleryAlbum {
    id: ID!
    slug: String!
    locale: ContentLocale!
    title: String!
    description: String
    category: ContentCategory!
    displayOrder: Int!
    status: ContentStatus!
    publishedAt: DateTime
    coverImage: CmsImageRef
    items: [CmsGalleryItem!]!
    updatedAt: DateTime!
  }

  type CmsVideo {
    id: ID!
    slug: String!
    locale: ContentLocale!
    title: String!
    description: String
    videoUrl: String!
    platform: VideoPlatform!
    category: ContentCategory!
    featured: Boolean!
    displayOrder: Int!
    status: ContentStatus!
    publishedAt: DateTime
    thumbnail: CmsImageRef
    updatedAt: DateTime!
  }

  type CmsContactDetails {
    id: ID!
    locale: ContentLocale!
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
    status: ContentStatus!
    publishedAt: DateTime
    updatedAt: DateTime!
  }

  type CmsSocialLink {
    id: ID!
    platform: String!
    label: String
    url: String!
    displayOrder: Int!
    isActive: Boolean!
  }

  type CmsContactInformation {
    contact: CmsContactDetails
    socialLinks: [CmsSocialLink!]!
  }

  type CmsProjectConnection {
    nodes: [CmsProject!]!
    pageInfo: PublicPageInfo!
    totalCount: Int!
  }

  type CmsAchievementConnection {
    nodes: [CmsAchievement!]!
    pageInfo: PublicPageInfo!
    totalCount: Int!
  }

  type CmsNewsConnection {
    nodes: [CmsNewsArticle!]!
    pageInfo: PublicPageInfo!
    totalCount: Int!
  }

  type CmsEventConnection {
    nodes: [CmsEvent!]!
    pageInfo: PublicPageInfo!
    totalCount: Int!
  }

  # --- Inputs ---------------------------------------------------------------

  input CandidateProfileInput {
    locale: ContentLocale = en
    fullName: String!
    displayName: String
    designation: String
    shortBio: String
    fullBioHtml: String
    experienceHtml: String
    publicServiceHtml: String
    focusAreas: [ContentCategory!]
    profileImageId: ID
    coverImageId: ID
    metaTitle: String
    metaDescription: String
  }

  input VisionInput {
    locale: ContentLocale = en
    headline: String!
    summary: String
    statementHtml: String
    metaTitle: String
    metaDescription: String
  }

  input PriorityInput {
    title: String!
    slug: String
    locale: ContentLocale = en
    description: String
    iconKey: String
    category: ContentCategory
    imageId: ID
    displayOrder: Int
  }

  input ProjectInput {
    title: String!
    slug: String
    locale: ContentLocale = en
    shortDescription: String
    descriptionHtml: String
    category: ContentCategory
    area: String
    locationName: String
    latitude: Float
    longitude: Float
    startDate: DateTime
    completionDate: DateTime
    projectStatus: ProjectStatus
    costAmount: Float
    costCurrency: String
    beneficiaryCount: Int
    coverImageId: ID
    featured: Boolean
    displayOrder: Int
    metaTitle: String
    metaDescription: String
  }

  input ProjectMediaInput {
    mediaId: ID!
    role: ProjectMediaRole!
    caption: String
  }

  input AchievementInput {
    title: String!
    slug: String
    locale: ContentLocale = en
    summary: String
    descriptionHtml: String
    category: ContentCategory
    area: String
    achievedOn: DateTime
    coverImageId: ID
    featured: Boolean
    displayOrder: Int
    metaTitle: String
    metaDescription: String
  }

  input EvidenceInput {
    title: String!
    description: String
    sourceNote: String
    "Staff-only. Never returned by the public API."
    internalNote: String
    documentId: ID
    "Defaults to false: evidence is private unless deliberately published."
    isPublic: Boolean
  }

  input MediaRefInput {
    mediaId: ID!
    caption: String
  }

  input NewsInput {
    title: String!
    slug: String
    locale: ContentLocale = en
    summary: String
    contentHtml: String
    category: ContentCategory
    tags: [String!]
    authorName: String
    coverImageId: ID
    featured: Boolean
    metaTitle: String
    metaDescription: String
  }

  input EventInput {
    title: String!
    slug: String
    locale: ContentLocale = en
    summary: String
    descriptionHtml: String
    startsAt: DateTime!
    endsAt: DateTime
    locationName: String
    address: String
    organizer: String
    coverImageId: ID
    featured: Boolean
    metaTitle: String
    metaDescription: String
  }

  input AlbumInput {
    title: String!
    slug: String
    locale: ContentLocale = en
    description: String
    category: ContentCategory
    coverImageId: ID
    displayOrder: Int
  }

  input VideoInput {
    title: String!
    slug: String
    locale: ContentLocale = en
    description: String
    videoUrl: String!
    platform: VideoPlatform
    category: ContentCategory
    thumbnailId: ID
    featured: Boolean
    displayOrder: Int
  }

  input ContactInput {
    locale: ContentLocale = en
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
  }

  input SocialLinkInput {
    platform: String!
    label: String
    url: String!
    displayOrder: Int
    isActive: Boolean
  }

  extend type Query {
    "All statuses. Requires CONTENT_READ_UNPUBLISHED."
    cmsCandidateProfile(locale: ContentLocale = en): CmsCandidateProfile
    cmsVision(locale: ContentLocale = en): CmsVision
    cmsPriorities(locale: ContentLocale, status: ContentStatus): [CmsPriority!]!

    cmsProjects(
      first: Int = 20
      after: String
      status: ContentStatus
      category: ContentCategory
      search: String
      locale: ContentLocale
    ): CmsProjectConnection!
    cmsProject(id: ID!): CmsProject!

    cmsAchievements(
      first: Int = 20
      after: String
      status: ContentStatus
      category: ContentCategory
      search: String
      locale: ContentLocale
    ): CmsAchievementConnection!
    cmsAchievement(id: ID!): CmsAchievement!

    cmsNews(
      first: Int = 20
      after: String
      status: ContentStatus
      search: String
      locale: ContentLocale
    ): CmsNewsConnection!
    cmsNewsArticle(id: ID!): CmsNewsArticle!

    cmsEvents(
      first: Int = 20
      after: String
      status: ContentStatus
      search: String
      locale: ContentLocale
    ): CmsEventConnection!
    cmsEvent(id: ID!): CmsEvent!

    cmsAlbums(locale: ContentLocale, status: ContentStatus): [CmsGalleryAlbum!]!
    cmsVideos(locale: ContentLocale, status: ContentStatus): [CmsVideo!]!
    cmsContactInformation(locale: ContentLocale = en): CmsContactInformation!

    cmsMedia(first: Int = 24, after: String, kind: MediaKind): MediaConnection!
  }

  extend type Mutation {
    updateCandidateProfile(input: CandidateProfileInput!): CmsCandidateProfile!
    updateVision(input: VisionInput!): CmsVision!
    updateContactInformation(input: ContactInput!): CmsContactDetails!
    setSocialLinks(links: [SocialLinkInput!]!): [CmsSocialLink!]!
    "Publishes, unpublishes or archives one of the singleton content types."
    transitionSingleton(
      entity: SingletonContent!
      action: PublishAction!
      locale: ContentLocale = en
    ): Boolean!

    createPriority(input: PriorityInput!): CmsPriority!
    updatePriority(id: ID!, input: PriorityInput!): CmsPriority!
    deletePriority(id: ID!): Boolean!
    reorderPriorities(orderedIds: [ID!]!): [CmsPriority!]!
    transitionPriority(id: ID!, action: PublishAction!): CmsPriority!

    createProject(input: ProjectInput!): CmsProject!
    updateProject(id: ID!, input: ProjectInput!): CmsProject!
    deleteProject(id: ID!): Boolean!
    setProjectMedia(id: ID!, media: [ProjectMediaInput!]!): CmsProject!
    transitionProject(id: ID!, action: PublishAction!): CmsProject!

    createAchievement(input: AchievementInput!): CmsAchievement!
    updateAchievement(id: ID!, input: AchievementInput!): CmsAchievement!
    deleteAchievement(id: ID!): Boolean!
    setAchievementMedia(id: ID!, media: [MediaRefInput!]!): CmsAchievement!
    setAchievementEvidence(id: ID!, evidence: [EvidenceInput!]!): CmsAchievement!
    "Requires ACHIEVEMENT_VERIFY, which is separate from publishing."
    setAchievementVerification(id: ID!, verification: VerificationStatus!): CmsAchievement!
    transitionAchievement(id: ID!, action: PublishAction!): CmsAchievement!

    createNews(input: NewsInput!): CmsNewsArticle!
    updateNews(id: ID!, input: NewsInput!): CmsNewsArticle!
    deleteNews(id: ID!): Boolean!
    transitionNews(id: ID!, action: PublishAction!): CmsNewsArticle!

    createEvent(input: EventInput!): CmsEvent!
    updateEvent(id: ID!, input: EventInput!): CmsEvent!
    deleteEvent(id: ID!): Boolean!
    cancelEvent(id: ID!): CmsEvent!
    transitionEvent(id: ID!, action: PublishAction!): CmsEvent!

    createAlbum(input: AlbumInput!): CmsGalleryAlbum!
    updateAlbum(id: ID!, input: AlbumInput!): CmsGalleryAlbum!
    deleteAlbum(id: ID!): Boolean!
    setAlbumItems(id: ID!, items: [MediaRefInput!]!): CmsGalleryAlbum!
    transitionAlbum(id: ID!, action: PublishAction!): CmsGalleryAlbum!

    createVideo(input: VideoInput!): CmsVideo!
    updateVideo(id: ID!, input: VideoInput!): CmsVideo!
    deleteVideo(id: ID!): Boolean!
    transitionVideo(id: ID!, action: PublishAction!): CmsVideo!

    "Metadata only. Bytes are uploaded through POST /media/upload."
    updateMediaMetadata(id: ID!, altText: String, caption: String): MediaAsset!
    deleteMedia(id: ID!): Boolean!
  }
`;
