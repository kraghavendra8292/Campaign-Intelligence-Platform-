/**
 * Fixtures for public-site and CMS component tests.
 *
 * These are SYNTHETIC values invented to exercise rendering. They are not
 * claims about any real person, project, cost or beneficiary count, and nothing
 * here is seeded into a running database - the names are deliberately generic
 * ("Sample", "Demo") so a fixture can never be mistaken for real reporting if
 * it is copied somewhere else.
 */

export const IMAGE = {
  id: 'img-1',
  altText: 'Sample photograph',
  width: 1200,
  height: 800,
};

export const ORGANIZATION = {
  id: 'org-1',
  slug: 'demo-campaign',
  name: 'Demo Campaign',
};

export const PROJECT_CARD = {
  id: 'prj-1',
  slug: 'sample-road-project',
  title: 'Sample Road Project',
  shortDescription: 'A synthetic project used to exercise card rendering.',
  category: 'INFRASTRUCTURE',
  area: 'Demo Area',
  locationName: 'Demo Location',
  projectStatus: 'IN_PROGRESS',
  startDate: '2025-01-10',
  completionDate: null,
  featured: true,
  publishedAt: '2025-02-01T00:00:00.000Z',
  coverImage: IMAGE,
};

export const ACHIEVEMENT_CARD = {
  id: 'ach-1',
  slug: 'sample-achievement',
  title: 'Sample Achievement',
  summary: 'A synthetic achievement used to exercise card rendering.',
  category: 'EDUCATION',
  area: 'Demo Area',
  achievedOn: '2025-03-05',
  verification: 'VERIFIED',
  featured: true,
  coverImage: IMAGE,
};

export const NEWS_CARD = {
  id: 'news-1',
  slug: 'sample-update',
  title: 'Sample Update',
  summary: 'A synthetic news item used to exercise card rendering.',
  category: 'GOVERNANCE',
  tags: ['sample'],
  authorName: 'Demo Author',
  publishedAt: '2025-04-01T00:00:00.000Z',
  coverImage: IMAGE,
};

export const EVENT_CARD = {
  id: 'evt-1',
  slug: 'sample-event',
  title: 'Sample Event',
  summary: 'A synthetic event used to exercise card rendering.',
  startsAt: '2030-05-01T09:00:00.000Z',
  endsAt: '2030-05-01T11:00:00.000Z',
  locationName: 'Demo Hall',
  eventStatus: 'UPCOMING',
  coverImage: IMAGE,
};

export const PRIORITY = {
  id: 'pri-1',
  slug: 'sample-priority',
  title: 'Sample Priority',
  description: 'A synthetic priority used to exercise card rendering.',
  iconKey: 'water',
  category: 'WATER',
  image: IMAGE,
};

export const HOMEPAGE = {
  publicHomepage: {
    organization: ORGANIZATION,
    profile: {
      fullName: 'Demo Candidate',
      displayName: 'Demo Candidate',
      designation: 'Demo Designation',
      shortBio: 'A synthetic biography used for rendering tests.',
      metaDescription: 'Synthetic meta description.',
      profileImage: IMAGE,
      coverImage: null,
    },
    vision: {
      headline: 'A Demo Vision Headline',
      summary: 'A synthetic vision summary.',
    },
    priorities: [PRIORITY],
    featuredProjects: [PROJECT_CARD],
    featuredAchievements: [ACHIEVEMENT_CARD],
    latestNews: [NEWS_CARD],
    upcomingEvents: [EVENT_CARD],
  },
};

/** A tenant that has published nothing yet - every section must degrade. */
export const EMPTY_HOMEPAGE = {
  publicHomepage: {
    organization: ORGANIZATION,
    profile: null,
    vision: null,
    priorities: [],
    featuredProjects: [],
    featuredAchievements: [],
    latestNews: [],
    upcomingEvents: [],
  },
};

/**
 * Album covers for the hero slideshow.
 *
 * Deliberately mixed orientations: the landscape one should be centred and the
 * portrait one anchored to the top, which is what protects a face from the
 * crop.
 */
export const ALBUM_COVERS = [
  {
    id: 'album-1',
    title: 'Rally',
    coverImage: { id: 'img-2', altText: null, width: 1600, height: 900 },
  },
  {
    id: 'album-2',
    title: 'Ward visit',
    coverImage: { id: 'img-3', altText: 'Candidate at a ward visit', width: 900, height: 1400 },
  },
];

/** A campaign that has published enough photographs for a real slideshow. */
export const HOMEPAGE_WITH_COVERS = {
  ...HOMEPAGE,
  publicPhotoAlbums: ALBUM_COVERS,
};

export const SITE = { publicSite: ORGANIZATION };

export function projectsPage(nodes: unknown[] = [PROJECT_CARD], hasNextPage = false) {
  return {
    publicProjects: {
      nodes,
      pageInfo: { hasNextPage, endCursor: hasNextPage ? 'cursor-1' : null },
      totalCount: nodes.length,
    },
  };
}

/**
 * Phase 9 card. A strict superset of the Phase 3 project card: same content,
 * plus the verification status and the public work status.
 *
 * `verification: 'UNVERIFIED'` is the default on purpose - an unchecked claim
 * is the normal case, and a fixture that verified everything would let a
 * missing badge-gating bug pass unnoticed.
 */
export const WORK_CARD = {
  ...PROJECT_CARD,
  workStatus: 'ONGOING',
  verification: 'UNVERIFIED',
  verifiedAt: null,
  department: null,
  agency: null,
};

export function worksPage(nodes: unknown[] = [WORK_CARD], hasMore = false) {
  return {
    publicWorks: {
      nodes,
      totalCount: nodes.length,
      hasMore,
      endCursor: hasMore ? 'cursor-1' : null,
    },
  };
}

export const WORK_DETAIL = {
  publicWork: {
    ...WORK_CARD,
    descriptionHtml: '<p>Synthetic project description.</p>',
    // Deliberately absent so the "Not stated" path is exercised: the UI must
    // never substitute a zero for a figure the campaign has not published.
    costAmount: null,
    costCurrency: null,
    beneficiaryCount: null,
    metaTitle: null,
    metaDescription: null,
    media: [],
    updates: [
      {
        id: 'upd-1',
        title: 'Sample Update',
        bodyHtml: '<p>Synthetic update body.</p>',
        occurredOn: '2025-02-20',
      },
    ],
    evidence: [],
  },
};

/** Same work, with figures present, to prove they render when published. */
export const WORK_DETAIL_WITH_FIGURES = {
  publicWork: {
    ...WORK_DETAIL.publicWork,
    // A string, matching the schema: Decimal is serialised as a string so no
    // precision is lost in JSON.
    costAmount: '1234567',
    costCurrency: 'INR',
    beneficiaryCount: 4321,
  },
};

/** One published document and one published photograph, for the gallery. */
export const WORK_DETAIL_WITH_EVIDENCE = {
  publicWork: {
    ...WORK_DETAIL.publicWork,
    verification: 'VERIFIED',
    verifiedAt: '2026-03-01T00:00:00.000Z',
    evidence: [
      {
        id: 'ev-1',
        title: 'Municipal completion certificate',
        description: null,
        evidenceType: 'COMPLETION_CERTIFICATE',
        sourceNote: null,
        referenceNumber: 'MC/2026/118',
        issuingAuthority: 'City Municipal Corporation',
        issuedOn: '2026-02-20',
        capturedOn: null,
        capturedLocation: null,
        documentId: 'media-doc-1',
        documentName: 'certificate.pdf',
        documentMimeType: 'application/pdf',
        isImage: false,
      },
      {
        id: 'ev-2',
        title: 'The junction before work began',
        description: null,
        evidenceType: 'BEFORE_PHOTO',
        sourceNote: null,
        referenceNumber: null,
        issuingAuthority: null,
        issuedOn: null,
        capturedOn: '2025-11-02',
        capturedLocation: 'Market junction',
        documentId: 'media-img-1',
        documentName: 'before.jpg',
        documentMimeType: 'image/jpeg',
        isImage: true,
      },
    ],
  },
};

/** The transparency page payload. Counts only; nothing generated. */
export const TRANSPARENCY = {
  transparencySummary: {
    verifiedWorks: 3,
    ongoingWorks: 2,
    proposedWorks: 1,
    completedWorks: 4,
    publishedWorks: 7,
    evidenceBackedWorks: 5,
    evidenceCoveragePct: 71,
    verifiedAchievements: 2,
    categories: [
      { category: 'INFRASTRUCTURE', count: 4 },
      { category: 'WATER', count: 3 },
    ],
    areas: [{ area: 'Demo Area', count: 7 }],
    areasCovered: 1,
    generatedAt: '2026-03-01T00:00:00.000Z',
  },
  transparencyRecentlyVerified: [
    { ...WORK_CARD, verification: 'VERIFIED', verifiedAt: '2026-02-28T00:00:00.000Z' },
  ],
};

/** Nothing published: coverage must render as an em dash, never 0%. */
export const TRANSPARENCY_EMPTY = {
  transparencySummary: {
    ...TRANSPARENCY.transparencySummary,
    verifiedWorks: 0,
    ongoingWorks: 0,
    proposedWorks: 0,
    completedWorks: 0,
    publishedWorks: 0,
    evidenceBackedWorks: 0,
    evidenceCoveragePct: null,
    categories: [],
    areas: [],
    areasCovered: 0,
  },
  transparencyRecentlyVerified: [],
};

export const PROJECT_DETAIL = {
  publicProject: {
    ...PROJECT_CARD,
    descriptionHtml: '<p>Synthetic project description.</p>',
    // Deliberately absent so the "Not stated" path is exercised: the UI must
    // never substitute a zero for a figure the campaign has not published.
    costAmount: null,
    costCurrency: null,
    beneficiaryCount: null,
    metaTitle: null,
    metaDescription: null,
    media: [],
    updates: [
      {
        id: 'upd-1',
        title: 'Sample Update',
        bodyHtml: '<p>Synthetic update body.</p>',
        occurredOn: '2025-02-20',
      },
    ],
  },
};

/** Same project, with figures present, to prove they render when published. */
export const PROJECT_DETAIL_WITH_FIGURES = {
  publicProject: {
    ...PROJECT_DETAIL.publicProject,
    costAmount: 1234567,
    costCurrency: 'INR',
    beneficiaryCount: 4321,
  },
};
