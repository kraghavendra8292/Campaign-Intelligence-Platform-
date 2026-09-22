/**
 * Public site GraphQL documents.
 *
 * Fragments keep card shapes identical between the homepage, listings and
 * search, so a field added to a card is added once and every surface that shows
 * that card gets it.
 */

const IMAGE_FIELDS = /* GraphQL */ `
  fragment ImageFields on PublicImage {
    id
    altText
    width
    height
  }
`;

const PROJECT_CARD = /* GraphQL */ `
  fragment ProjectCard on PublicProject {
    id
    slug
    title
    shortDescription
    category
    area
    locationName
    projectStatus
    startDate
    completionDate
    featured
    publishedAt
    coverImage {
      ...ImageFields
    }
  }
`;

const ACHIEVEMENT_CARD = /* GraphQL */ `
  fragment AchievementCard on PublicAchievement {
    id
    slug
    title
    summary
    category
    area
    achievedOn
    verification
    featured
    coverImage {
      ...ImageFields
    }
  }
`;

const NEWS_CARD = /* GraphQL */ `
  fragment NewsCard on PublicNewsArticle {
    id
    slug
    title
    summary
    category
    tags
    authorName
    publishedAt
    coverImage {
      ...ImageFields
    }
  }
`;

const EVENT_CARD = /* GraphQL */ `
  fragment EventCard on PublicEvent {
    id
    slug
    title
    summary
    startsAt
    endsAt
    locationName
    eventStatus
    coverImage {
      ...ImageFields
    }
  }
`;

export const HOMEPAGE_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  ${PROJECT_CARD}
  ${ACHIEVEMENT_CARD}
  ${NEWS_CARD}
  ${EVENT_CARD}
  query Homepage($input: PublicSiteInput) {
    # Cover photographs for the hero slideshow.
    #
    # Only the album COVER is selected - never 'items' - so this stays a handful
    # of rows rather than every photograph the campaign has ever published, and
    # the homepage still paints after a single round trip.
    publicPhotoAlbums(input: $input) {
      id
      title
      coverImage {
        ...ImageFields
      }
    }
    publicHomepage(input: $input) {
      organization {
        id
        slug
        name
      }
      profile {
        fullName
        displayName
        designation
        shortBio
        metaDescription
        profileImage {
          ...ImageFields
        }
        coverImage {
          ...ImageFields
        }
      }
      vision {
        headline
        summary
      }
      priorities {
        id
        slug
        title
        description
        iconKey
        category
        image {
          ...ImageFields
        }
      }
      featuredProjects {
        ...ProjectCard
      }
      featuredAchievements {
        ...AchievementCard
      }
      latestNews {
        ...NewsCard
      }
      upcomingEvents {
        ...EventCard
      }
    }
  }
`;

export const SITE_QUERY = /* GraphQL */ `
  query Site($input: PublicSiteInput) {
    publicSite(input: $input) {
      id
      slug
      name
    }
  }
`;

export const ABOUT_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  query About($input: PublicSiteInput) {
    publicCandidateProfile(input: $input) {
      id
      fullName
      displayName
      designation
      shortBio
      fullBioHtml
      experienceHtml
      publicServiceHtml
      focusAreas
      metaTitle
      metaDescription
      profileImage {
        ...ImageFields
      }
      coverImage {
        ...ImageFields
      }
    }
    publicContactInformation(input: $input) {
      socialLinks {
        id
        platform
        label
        url
      }
    }
  }
`;

export const VISION_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  query Vision($input: PublicSiteInput) {
    publicVision(input: $input) {
      id
      headline
      summary
      statementHtml
      metaTitle
      metaDescription
    }
    publicPriorities(input: $input) {
      id
      slug
      title
      description
      iconKey
      category
      image {
        ...ImageFields
      }
    }
  }
`;

export const PROJECTS_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  ${PROJECT_CARD}
  query Projects(
    $input: PublicSiteInput
    $first: Int
    $after: String
    $category: ContentCategory
    $search: String
  ) {
    publicProjects(
      input: $input
      first: $first
      after: $after
      category: $category
      search: $search
    ) {
      nodes {
        ...ProjectCard
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

export const PROJECT_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  query Project($input: PublicSiteInput, $slug: String!) {
    publicProject(input: $input, slug: $slug) {
      id
      slug
      title
      shortDescription
      descriptionHtml
      category
      area
      locationName
      projectStatus
      startDate
      completionDate
      costAmount
      costCurrency
      beneficiaryCount
      publishedAt
      metaTitle
      metaDescription
      coverImage {
        ...ImageFields
      }
      media {
        id
        role
        caption
        image {
          ...ImageFields
        }
      }
      updates {
        id
        title
        bodyHtml
        occurredOn
      }
    }
  }
`;

export const ACHIEVEMENTS_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  ${ACHIEVEMENT_CARD}
  query Achievements(
    $input: PublicSiteInput
    $first: Int
    $after: String
    $category: ContentCategory
    $search: String
  ) {
    publicAchievements(
      input: $input
      first: $first
      after: $after
      category: $category
      search: $search
    ) {
      nodes {
        ...AchievementCard
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

export const ACHIEVEMENT_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  query Achievement($input: PublicSiteInput, $slug: String!) {
    publicAchievement(input: $input, slug: $slug) {
      id
      slug
      title
      summary
      descriptionHtml
      category
      area
      achievedOn
      verification
      verifiedAt
      publishedAt
      metaTitle
      metaDescription
      coverImage {
        ...ImageFields
      }
      media {
        id
        caption
        image {
          ...ImageFields
        }
      }
      evidence {
        id
        title
        description
        sourceNote
        documentId
        documentName
      }
    }
  }
`;

export const NEWS_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  ${NEWS_CARD}
  query News($input: PublicSiteInput, $first: Int, $after: String, $search: String) {
    publicNews(input: $input, first: $first, after: $after, search: $search) {
      nodes {
        ...NewsCard
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

export const NEWS_ARTICLE_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  query NewsArticle($input: PublicSiteInput, $slug: String!) {
    publicNewsArticle(input: $input, slug: $slug) {
      id
      slug
      title
      summary
      contentHtml
      category
      tags
      authorName
      publishedAt
      metaTitle
      metaDescription
      coverImage {
        ...ImageFields
      }
    }
  }
`;

export const EVENTS_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  ${EVENT_CARD}
  query Events($input: PublicSiteInput, $first: Int, $after: String, $upcomingOnly: Boolean) {
    publicEvents(input: $input, first: $first, after: $after, upcomingOnly: $upcomingOnly) {
      nodes {
        ...EventCard
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

export const EVENT_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  query Event($input: PublicSiteInput, $slug: String!) {
    publicEvent(input: $input, slug: $slug) {
      id
      slug
      title
      summary
      descriptionHtml
      startsAt
      endsAt
      locationName
      address
      organizer
      eventStatus
      metaTitle
      metaDescription
      coverImage {
        ...ImageFields
      }
    }
  }
`;

export const GALLERY_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  query Gallery($input: PublicSiteInput) {
    publicPhotoAlbums(input: $input) {
      id
      slug
      title
      description
      category
      coverImage {
        ...ImageFields
      }
      items {
        id
        caption
        image {
          ...ImageFields
        }
      }
    }
    publicVideos(input: $input) {
      id
      slug
      title
      description
      videoUrl
      platform
      featured
      thumbnail {
        ...ImageFields
      }
    }
  }
`;

export const CONTACT_QUERY = /* GraphQL */ `
  query Contact($input: PublicSiteInput) {
    publicContactInformation(input: $input) {
      contact {
        id
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
      }
      socialLinks {
        id
        platform
        label
        url
      }
    }
  }
`;

export const SEARCH_QUERY = /* GraphQL */ `
  ${IMAGE_FIELDS}
  ${PROJECT_CARD}
  ${ACHIEVEMENT_CARD}
  ${NEWS_CARD}
  ${EVENT_CARD}
  query Search($input: PublicSiteInput, $term: String!) {
    publicSearch(input: $input, term: $term, limitPerType: 8) {
      term
      totalCount
      projects {
        ...ProjectCard
      }
      achievements {
        ...AchievementCard
      }
      news {
        ...NewsCard
      }
      events {
        ...EventCard
      }
    }
  }
`;
