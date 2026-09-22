/**
 * CMS GraphQL documents.
 *
 * Mirrors the admin half of the schema. Kept separate from the public
 * documents so it is obvious at a glance which queries carry a session and
 * which do not.
 */

const CMS_IMAGE = /* GraphQL */ `
  fragment CmsImage on CmsImageRef {
    id
    altText
    width
    height
  }
`;

export const CMS_PROJECTS = /* GraphQL */ `
  ${CMS_IMAGE}
  query CmsProjects($first: Int, $status: ContentStatus, $search: String, $locale: ContentLocale) {
    cmsProjects(first: $first, status: $status, search: $search, locale: $locale) {
      nodes {
        id
        slug
        title
        category
        area
        projectStatus
        status
        featured
        publishedAt
        updatedAt
        coverImage {
          ...CmsImage
        }
      }
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const CMS_PROJECT = /* GraphQL */ `
  ${CMS_IMAGE}
  query CmsProject($id: ID!) {
    cmsProject(id: $id) {
      id
      slug
      locale
      title
      shortDescription
      descriptionHtml
      category
      area
      locationName
      startDate
      completionDate
      projectStatus
      costAmount
      costCurrency
      beneficiaryCount
      featured
      status
      publishedAt
      metaTitle
      metaDescription
      coverImage {
        ...CmsImage
      }
    }
  }
`;

export const CREATE_PROJECT = /* GraphQL */ `
  mutation CreateProject($input: ProjectInput!) {
    createProject(input: $input) {
      id
      slug
      status
    }
  }
`;

export const UPDATE_PROJECT = /* GraphQL */ `
  mutation UpdateProject($id: ID!, $input: ProjectInput!) {
    updateProject(id: $id, input: $input) {
      id
      slug
      status
    }
  }
`;

export const TRANSITION_PROJECT = /* GraphQL */ `
  mutation TransitionProject($id: ID!, $action: PublishAction!) {
    transitionProject(id: $id, action: $action) {
      id
      status
      publishedAt
    }
  }
`;

export const DELETE_PROJECT = /* GraphQL */ `
  mutation DeleteProject($id: ID!) {
    deleteProject(id: $id)
  }
`;

export const CMS_ACHIEVEMENTS = /* GraphQL */ `
  ${CMS_IMAGE}
  query CmsAchievements(
    $first: Int
    $status: ContentStatus
    $search: String
    $locale: ContentLocale
  ) {
    cmsAchievements(first: $first, status: $status, search: $search, locale: $locale) {
      nodes {
        id
        slug
        title
        category
        area
        achievedOn
        verification
        status
        featured
        updatedAt
        coverImage {
          ...CmsImage
        }
      }
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const CMS_ACHIEVEMENT = /* GraphQL */ `
  ${CMS_IMAGE}
  query CmsAchievement($id: ID!) {
    cmsAchievement(id: $id) {
      id
      slug
      locale
      title
      summary
      descriptionHtml
      category
      area
      achievedOn
      verification
      verifiedAt
      featured
      status
      metaTitle
      metaDescription
      coverImage {
        ...CmsImage
      }
      evidence {
        id
        title
        description
        sourceNote
        internalNote
        isPublic
      }
    }
  }
`;

export const CREATE_ACHIEVEMENT = /* GraphQL */ `
  mutation CreateAchievement($input: AchievementInput!) {
    createAchievement(input: $input) {
      id
      slug
    }
  }
`;

export const UPDATE_ACHIEVEMENT = /* GraphQL */ `
  mutation UpdateAchievement($id: ID!, $input: AchievementInput!) {
    updateAchievement(id: $id, input: $input) {
      id
      slug
      verification
    }
  }
`;

export const TRANSITION_ACHIEVEMENT = /* GraphQL */ `
  mutation TransitionAchievement($id: ID!, $action: PublishAction!) {
    transitionAchievement(id: $id, action: $action) {
      id
      status
    }
  }
`;

export const VERIFY_ACHIEVEMENT = /* GraphQL */ `
  mutation VerifyAchievement($id: ID!, $verification: VerificationStatus!) {
    setAchievementVerification(id: $id, verification: $verification) {
      id
      verification
      verifiedAt
    }
  }
`;

export const DELETE_ACHIEVEMENT = /* GraphQL */ `
  mutation DeleteAchievement($id: ID!) {
    deleteAchievement(id: $id)
  }
`;

export const CMS_NEWS = /* GraphQL */ `
  ${CMS_IMAGE}
  query CmsNews($first: Int, $status: ContentStatus, $search: String, $locale: ContentLocale) {
    cmsNews(first: $first, status: $status, search: $search, locale: $locale) {
      nodes {
        id
        slug
        title
        category
        status
        featured
        publishedAt
        updatedAt
        coverImage {
          ...CmsImage
        }
      }
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const CMS_NEWS_ARTICLE = /* GraphQL */ `
  ${CMS_IMAGE}
  query CmsNewsArticle($id: ID!) {
    cmsNewsArticle(id: $id) {
      id
      slug
      locale
      title
      summary
      contentHtml
      category
      tags
      authorName
      featured
      status
      metaTitle
      metaDescription
      coverImage {
        ...CmsImage
      }
    }
  }
`;

export const CREATE_NEWS = /* GraphQL */ `
  mutation CreateNews($input: NewsInput!) {
    createNews(input: $input) {
      id
      slug
    }
  }
`;

export const UPDATE_NEWS = /* GraphQL */ `
  mutation UpdateNews($id: ID!, $input: NewsInput!) {
    updateNews(id: $id, input: $input) {
      id
      slug
    }
  }
`;

export const TRANSITION_NEWS = /* GraphQL */ `
  mutation TransitionNews($id: ID!, $action: PublishAction!) {
    transitionNews(id: $id, action: $action) {
      id
      status
    }
  }
`;

export const DELETE_NEWS = /* GraphQL */ `
  mutation DeleteNews($id: ID!) {
    deleteNews(id: $id)
  }
`;

export const CMS_EVENTS = /* GraphQL */ `
  ${CMS_IMAGE}
  query CmsEvents($first: Int, $status: ContentStatus, $search: String, $locale: ContentLocale) {
    cmsEvents(first: $first, status: $status, search: $search, locale: $locale) {
      nodes {
        id
        slug
        title
        startsAt
        locationName
        eventStatus
        status
        featured
        updatedAt
        coverImage {
          ...CmsImage
        }
      }
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const CMS_EVENT = /* GraphQL */ `
  ${CMS_IMAGE}
  query CmsEvent($id: ID!) {
    cmsEvent(id: $id) {
      id
      slug
      locale
      title
      summary
      descriptionHtml
      startsAt
      endsAt
      locationName
      address
      organizer
      eventStatus
      featured
      status
      metaTitle
      metaDescription
      coverImage {
        ...CmsImage
      }
    }
  }
`;

export const CREATE_EVENT = /* GraphQL */ `
  mutation CreateEvent($input: EventInput!) {
    createEvent(input: $input) {
      id
      slug
    }
  }
`;

export const UPDATE_EVENT = /* GraphQL */ `
  mutation UpdateEvent($id: ID!, $input: EventInput!) {
    updateEvent(id: $id, input: $input) {
      id
      slug
    }
  }
`;

export const TRANSITION_EVENT = /* GraphQL */ `
  mutation TransitionEvent($id: ID!, $action: PublishAction!) {
    transitionEvent(id: $id, action: $action) {
      id
      status
    }
  }
`;

export const CANCEL_EVENT = /* GraphQL */ `
  mutation CancelEvent($id: ID!) {
    cancelEvent(id: $id) {
      id
      eventStatus
    }
  }
`;

export const DELETE_EVENT = /* GraphQL */ `
  mutation DeleteEvent($id: ID!) {
    deleteEvent(id: $id)
  }
`;

export const CMS_PRIORITIES = /* GraphQL */ `
  query CmsPriorities($locale: ContentLocale) {
    cmsPriorities(locale: $locale) {
      id
      slug
      title
      description
      iconKey
      category
      displayOrder
      status
      updatedAt
    }
  }
`;

export const CREATE_PRIORITY = /* GraphQL */ `
  mutation CreatePriority($input: PriorityInput!) {
    createPriority(input: $input) {
      id
    }
  }
`;

export const UPDATE_PRIORITY = /* GraphQL */ `
  mutation UpdatePriority($id: ID!, $input: PriorityInput!) {
    updatePriority(id: $id, input: $input) {
      id
    }
  }
`;

export const TRANSITION_PRIORITY = /* GraphQL */ `
  mutation TransitionPriority($id: ID!, $action: PublishAction!) {
    transitionPriority(id: $id, action: $action) {
      id
      status
    }
  }
`;

export const REORDER_PRIORITIES = /* GraphQL */ `
  mutation ReorderPriorities($orderedIds: [ID!]!) {
    reorderPriorities(orderedIds: $orderedIds) {
      id
      displayOrder
    }
  }
`;

export const DELETE_PRIORITY = /* GraphQL */ `
  mutation DeletePriority($id: ID!) {
    deletePriority(id: $id)
  }
`;

export const CMS_ALBUMS = /* GraphQL */ `
  ${CMS_IMAGE}
  query CmsAlbums($locale: ContentLocale) {
    cmsAlbums(locale: $locale) {
      id
      slug
      title
      description
      category
      status
      displayOrder
      updatedAt
      coverImage {
        ...CmsImage
      }
      items {
        id
        caption
        image {
          ...CmsImage
        }
      }
    }
  }
`;

export const CREATE_ALBUM = /* GraphQL */ `
  mutation CreateAlbum($input: AlbumInput!) {
    createAlbum(input: $input) {
      id
    }
  }
`;

export const UPDATE_ALBUM = /* GraphQL */ `
  mutation UpdateAlbum($id: ID!, $input: AlbumInput!) {
    updateAlbum(id: $id, input: $input) {
      id
    }
  }
`;

export const SET_ALBUM_ITEMS = /* GraphQL */ `
  mutation SetAlbumItems($id: ID!, $items: [MediaRefInput!]!) {
    setAlbumItems(id: $id, items: $items) {
      id
    }
  }
`;

export const TRANSITION_ALBUM = /* GraphQL */ `
  mutation TransitionAlbum($id: ID!, $action: PublishAction!) {
    transitionAlbum(id: $id, action: $action) {
      id
      status
    }
  }
`;

export const DELETE_ALBUM = /* GraphQL */ `
  mutation DeleteAlbum($id: ID!) {
    deleteAlbum(id: $id)
  }
`;

export const CMS_VIDEOS = /* GraphQL */ `
  query CmsVideos($locale: ContentLocale) {
    cmsVideos(locale: $locale) {
      id
      slug
      title
      description
      videoUrl
      platform
      category
      featured
      status
      displayOrder
      updatedAt
    }
  }
`;

export const CREATE_VIDEO = /* GraphQL */ `
  mutation CreateVideo($input: VideoInput!) {
    createVideo(input: $input) {
      id
    }
  }
`;

export const UPDATE_VIDEO = /* GraphQL */ `
  mutation UpdateVideo($id: ID!, $input: VideoInput!) {
    updateVideo(id: $id, input: $input) {
      id
    }
  }
`;

export const TRANSITION_VIDEO = /* GraphQL */ `
  mutation TransitionVideo($id: ID!, $action: PublishAction!) {
    transitionVideo(id: $id, action: $action) {
      id
      status
    }
  }
`;

export const DELETE_VIDEO = /* GraphQL */ `
  mutation DeleteVideo($id: ID!) {
    deleteVideo(id: $id)
  }
`;

export const CMS_MEDIA = /* GraphQL */ `
  query CmsMedia($first: Int, $kind: MediaKind) {
    cmsMedia(first: $first, kind: $kind) {
      nodes {
        id
        kind
        originalName
        mimeType
        sizeBytes
        width
        height
        altText
        caption
        createdAt
      }
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const UPDATE_MEDIA = /* GraphQL */ `
  mutation UpdateMedia($id: ID!, $altText: String, $caption: String) {
    updateMediaMetadata(id: $id, altText: $altText, caption: $caption) {
      id
      altText
      caption
    }
  }
`;

export const DELETE_MEDIA = /* GraphQL */ `
  mutation DeleteMedia($id: ID!) {
    deleteMedia(id: $id)
  }
`;

export const CMS_CANDIDATE_PROFILE = /* GraphQL */ `
  ${CMS_IMAGE}
  query CmsCandidateProfile($locale: ContentLocale) {
    cmsCandidateProfile(locale: $locale) {
      id
      locale
      fullName
      displayName
      designation
      shortBio
      fullBioHtml
      experienceHtml
      publicServiceHtml
      focusAreas
      status
      publishedAt
      metaTitle
      metaDescription
      profileImage {
        ...CmsImage
      }
      coverImage {
        ...CmsImage
      }
    }
  }
`;

export const UPDATE_CANDIDATE_PROFILE = /* GraphQL */ `
  mutation UpdateCandidateProfile($input: CandidateProfileInput!) {
    updateCandidateProfile(input: $input) {
      id
      status
    }
  }
`;

export const CMS_VISION = /* GraphQL */ `
  query CmsVision($locale: ContentLocale) {
    cmsVision(locale: $locale) {
      id
      locale
      headline
      summary
      statementHtml
      status
      publishedAt
      metaTitle
      metaDescription
    }
  }
`;

export const UPDATE_VISION = /* GraphQL */ `
  mutation UpdateVision($input: VisionInput!) {
    updateVision(input: $input) {
      id
      status
    }
  }
`;

export const CMS_CONTACT = /* GraphQL */ `
  query CmsContact($locale: ContentLocale) {
    cmsContactInformation(locale: $locale) {
      contact {
        id
        locale
        officeName
        addressLine1
        addressLine2
        city
        state
        postalCode
        phone
        alternatePhone
        email
        officeHours
        mapEmbedUrl
        status
      }
      socialLinks {
        id
        platform
        label
        url
        displayOrder
        isActive
      }
    }
  }
`;

export const UPDATE_CONTACT = /* GraphQL */ `
  mutation UpdateContact($input: ContactInput!) {
    updateContactInformation(input: $input) {
      id
      status
    }
  }
`;

export const SET_SOCIAL_LINKS = /* GraphQL */ `
  mutation SetSocialLinks($links: [SocialLinkInput!]!) {
    setSocialLinks(links: $links) {
      id
      platform
      url
    }
  }
`;

export const TRANSITION_SINGLETON = /* GraphQL */ `
  mutation TransitionSingleton(
    $entity: SingletonContent!
    $action: PublishAction!
    $locale: ContentLocale
  ) {
    transitionSingleton(entity: $entity, action: $action, locale: $locale)
  }
`;
