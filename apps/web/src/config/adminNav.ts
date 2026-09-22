import type { IconName } from '@rk/ui';
import type { AdminStringKey } from '../i18n/adminStrings';

/**
 * Campaign console navigation.
 *
 * Declared as data so the sidebar renders a structure rather than hand-written
 * markup, and so adding a module means adding a row here.
 *
 * THE GROUPING ANSWERS A QUESTION EACH:
 *
 *   Overview      what is happening?
 *   Campaign      who is the candidate and what do they stand for?
 *   Content       what is published on the public site?
 *   Media         what visual assets exist?
 *   Engagement    how are citizens reaching the campaign?
 *   Intelligence  what do the numbers say?
 *
 * The previous two groups mixed those questions together: "Content" held the
 * candidate's identity, the published content AND the media library, while
 * "Engagement" held citizen contact alongside three analytics modules and a
 * moderation queue. Splitting them is why the list is now scannable without
 * reading every row.
 *
 * Every `to` here is an EXISTING route. Nothing was added, removed or moved -
 * only relabelled and regrouped.
 */

export interface AdminNavItem {
  readonly to: string;
  readonly labelKey: AdminStringKey;
  readonly icon: IconName;
  /** Matches the route exactly, so the dashboard is not active everywhere. */
  readonly end?: boolean;
}

export interface AdminNavGroup {
  readonly titleKey: AdminStringKey;
  readonly items: readonly AdminNavItem[];
}

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    titleKey: 'group.overview',
    items: [{ to: '/admin', labelKey: 'nav.dashboard', icon: 'dashboard', end: true }],
  },
  {
    titleKey: 'group.campaign',
    items: [
      { to: '/admin/content/candidate', labelKey: 'nav.candidate', icon: 'user' },
      { to: '/admin/content/vision', labelKey: 'nav.vision', icon: 'eye' },
      { to: '/admin/content/priorities', labelKey: 'nav.priorities', icon: 'target' },
      { to: '/admin/content/contact', labelKey: 'nav.contact', icon: 'contactCard' },
    ],
  },
  {
    titleKey: 'group.content',
    items: [
      { to: '/admin/content/projects', labelKey: 'nav.projects', icon: 'folder' },
      { to: '/admin/content/achievements', labelKey: 'nav.achievements', icon: 'trophy' },
      { to: '/admin/content/news', labelKey: 'nav.news', icon: 'newspaper' },
      { to: '/admin/content/events', labelKey: 'nav.events', icon: 'calendar' },
      /*
       * Verification sits with Content, not with Engagement where it used to
       * be: it is the queue that decides whether a PUBLISHED work may carry a
       * verified badge, so it belongs beside the things it governs.
       */
      { to: '/admin/verification', labelKey: 'nav.verification', icon: 'shieldCheck' },
    ],
  },
  {
    titleKey: 'group.media',
    items: [
      { to: '/admin/content/gallery', labelKey: 'nav.gallery', icon: 'images' },
      { to: '/admin/content/media', labelKey: 'nav.media', icon: 'media' },
    ],
  },
  {
    titleKey: 'group.engagement',
    items: [
      { to: '/admin/qr-campaigns', labelKey: 'nav.qrCampaigns', icon: 'qrCode' },
      { to: '/admin/issues', labelKey: 'nav.issues', icon: 'message' },
      { to: '/admin/issues/opinions', labelKey: 'nav.opinions', icon: 'message' },
      { to: '/admin/communications', labelKey: 'nav.communications', icon: 'message' },
    ],
  },
  {
    /*
     * The three analytics modules were previously filed under Engagement, which
     * made that group mean two different things at once. Reading numbers is not
     * the same task as receiving citizen contact.
     */
    titleKey: 'group.intelligence',
    items: [
      { to: '/admin/analytics', labelKey: 'nav.analytics', icon: 'barChart' },
      { to: '/admin/qr-analytics', labelKey: 'nav.qrAnalytics', icon: 'barChart' },
      { to: '/admin/ai-insights', labelKey: 'nav.aiInsights', icon: 'sparkles' },
    ],
  },
  {
    /**
     * Phase 10. Its own group, at the bottom, deliberately.
     *
     * Operations is not campaign work - nobody opens it as part of running the
     * campaign, and somebody who opens it is usually trying to find out why
     * something else is broken. Filing it under Intelligence would put "is the
     * database up?" beside "what are citizens reporting?", which are questions
     * for different people on different days.
     */
    titleKey: 'group.operations',
    items: [{ to: '/admin/system', labelKey: 'nav.system', icon: 'dashboard' }],
  },
];
