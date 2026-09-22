import type { ContentCategory, EventStatus, ProjectStatus, VerificationStatus } from '@rk/types';

/**
 * Result shapes for the public queries.
 *
 * Hand-written to match `queries.ts`. Phase 3 does not run GraphQL codegen; the
 * schema is the source of truth and these mirror it, which is checked by the
 * tests that exercise each page against a stubbed response.
 */

export interface SiteImage {
  id: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface PublicOrganization {
  id: string;
  slug: string;
  name: string;
}

export interface ProjectCard {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  category: ContentCategory;
  area: string | null;
  locationName: string | null;
  projectStatus: ProjectStatus;
  startDate: string | null;
  completionDate: string | null;
  featured: boolean;
  publishedAt: string | null;
  coverImage: SiteImage | null;
}

export interface ProjectDetail extends ProjectCard {
  descriptionHtml: string | null;
  costAmount: number | null;
  costCurrency: string | null;
  beneficiaryCount: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  media: Array<{
    id: string;
    role: 'GALLERY' | 'BEFORE' | 'AFTER';
    caption: string | null;
    image: SiteImage;
  }>;
  updates: Array<{ id: string; title: string; bodyHtml: string | null; occurredOn: string }>;
}

export interface AchievementCard {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: ContentCategory;
  area: string | null;
  achievedOn: string | null;
  verification: VerificationStatus;
  featured: boolean;
  coverImage: SiteImage | null;
}

export interface AchievementDetail extends AchievementCard {
  descriptionHtml: string | null;
  verifiedAt: string | null;
  publishedAt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  media: Array<{ id: string; caption: string | null; image: SiteImage }>;
  evidence: Array<{
    id: string;
    title: string;
    description: string | null;
    sourceNote: string | null;
    documentId: string | null;
    documentName: string | null;
  }>;
}

export interface NewsCard {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: ContentCategory;
  tags: string[];
  authorName: string | null;
  publishedAt: string | null;
  coverImage: SiteImage | null;
}

export interface NewsDetail extends NewsCard {
  contentHtml: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface EventCard {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  startsAt: string;
  endsAt: string | null;
  locationName: string | null;
  eventStatus: EventStatus;
  coverImage: SiteImage | null;
}

export interface EventDetail extends EventCard {
  descriptionHtml: string | null;
  address: string | null;
  organizer: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface PriorityCard {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconKey: string | null;
  category: ContentCategory;
  image: SiteImage | null;
}

export interface CandidateProfile {
  id: string;
  fullName: string;
  displayName: string | null;
  designation: string | null;
  shortBio: string | null;
  fullBioHtml?: string | null;
  experienceHtml?: string | null;
  publicServiceHtml?: string | null;
  focusAreas?: ContentCategory[];
  metaTitle?: string | null;
  metaDescription: string | null;
  profileImage: SiteImage | null;
  coverImage: SiteImage | null;
}

export interface VisionContent {
  id?: string;
  headline: string;
  summary: string | null;
  statementHtml?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

export interface SocialLink {
  id: string;
  platform: string;
  label: string | null;
  url: string;
}

export interface ContactDetails {
  id: string;
  officeName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  officeHours: string | null;
  mapEmbedUrl: string | null;
}

export interface GalleryAlbum {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: ContentCategory;
  coverImage: SiteImage | null;
  items: Array<{ id: string; caption: string | null; image: SiteImage }>;
}

export interface VideoEntry {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  videoUrl: string;
  platform: 'YOUTUBE' | 'VIMEO' | 'OTHER';
  featured: boolean;
  thumbnail: SiteImage | null;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface Connection<T> {
  nodes: T[];
  pageInfo: PageInfo;
  totalCount: number;
}

/** An album reduced to what the hero slideshow needs. */
export interface HeroAlbumCover {
  id: string;
  title: string;
  coverImage: SiteImage | null;
}

export interface HomepageData {
  /**
   * Optional on purpose: a tenant with no albums simply has no extra slides,
   * and a stubbed response that omits the field must not crash the homepage.
   */
  publicPhotoAlbums?: HeroAlbumCover[] | null;
  publicHomepage: {
    organization: PublicOrganization;
    profile: CandidateProfile | null;
    vision: VisionContent | null;
    priorities: PriorityCard[];
    featuredProjects: ProjectCard[];
    featuredAchievements: AchievementCard[];
    latestNews: NewsCard[];
    upcomingEvents: EventCard[];
  };
}
