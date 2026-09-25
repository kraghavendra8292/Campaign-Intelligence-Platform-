import type { Locale } from '@rk/types';

/**
 * Campaign console UI strings.
 *
 * SEPARATE from the public site's dictionary on purpose, for two reasons.
 *
 * Product: the public site is Kannada-first, the console is bilingual and
 * defaults to English. They are different audiences with different defaults,
 * and sharing one dictionary would make that hard to keep straight.
 *
 * Delivery: the console is lazily routed, so a module only the console imports
 * is a chunk only an administrator downloads. Folding these into the public
 * dictionary would ship every console string to every visitor.
 *
 * This covers CHROME only - labels, buttons, states, messages. Campaign content
 * is translated as separate CMS rows per locale and is never touched by the
 * interface language; see `CmsLocaleContext` for that, which is a different
 * control answering a different question.
 */

const en = {
  /* --- Shell --- */
  'console.title': 'Campaign console',
  'console.signOut': 'Sign out',
  'console.interfaceLanguage': 'Interface language',
  'console.skip': 'Skip to main content',

  /* --- Navigation groups --- */
  'group.overview': 'Overview',
  'group.campaign': 'Campaign',
  'group.content': 'Content',
  'group.media': 'Media',
  'group.engagement': 'Engagement',
  'group.intelligence': 'Intelligence',
  'group.operations': 'Operations',

  /* --- Navigation items --- */
  'nav.label': 'Campaign console',
  'nav.open': 'Open navigation',
  'nav.close': 'Close navigation',
  'nav.dashboard': 'Dashboard',
  'nav.candidate': 'Candidate',
  'nav.vision': 'Vision',
  'nav.priorities': 'Priorities',
  'nav.contact': 'Contact details',
  'nav.projects': 'Projects',
  'nav.achievements': 'Achievements',
  'nav.news': 'News',
  'nav.events': 'Events',
  'nav.verification': 'Verification',
  'nav.gallery': 'Gallery',
  'nav.media': 'Media library',
  'nav.qrCampaigns': 'QR Campaigns',
  'nav.issues': 'Issues & Feedback',
  'nav.opinions': 'Homepage opinions',
  'nav.communications': 'Communication',
  'nav.analytics': 'Campaign Intelligence',
  'nav.qrAnalytics': 'QR Analytics',
  'nav.aiInsights': 'AI Insights',
  'nav.system': 'System',

  /* --- Common actions --- */
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.delete': 'Delete',
  'action.edit': 'Edit',
  'action.view': 'View',
  'action.create': 'Create',
  'action.close': 'Close',
  'action.back': 'Back',
  'action.next': 'Next',
  'action.previous': 'Previous',
  'action.search': 'Search',
  'action.filter': 'Filter',
  'action.clearFilters': 'Clear filters',
  'action.apply': 'Apply',
  'action.reset': 'Reset',
  'action.submit': 'Submit',
  'action.confirm': 'Confirm',
  'action.remove': 'Remove',
  'action.add': 'Add',
  'action.upload': 'Upload',
  'action.download': 'Download',
  'action.retry': 'Try again',
  'action.loadMore': 'Load more',
  'action.publish': 'Publish',
  'action.unpublish': 'Unpublish',
  'action.archive': 'Archive',
  'action.duplicate': 'Duplicate',
  'action.actions': 'Actions',
  'action.submitForReview': 'Submit for review',
  'filter.byStatus': 'Filter by status',
  'filter.allStatuses': 'All statuses',

  /* --- Query states --- */
  'state.loading': 'Loading',
  'state.empty': 'Nothing here yet.',
  'state.errorTitle': 'Could not load',
  'state.forbiddenTitle': 'You do not have access to this content',
  'state.forbiddenBody':
    'Your role does not include permission to view this. Ask a campaign administrator if you need it.',
  'state.saving': 'Saving…',
  'state.forbiddenAreaTitle': 'You do not have access to this area',
  'state.forbiddenAreaBody':
    'Your role does not include the permission required for this page. Ask a campaign administrator if you believe this is wrong.',
  'state.backToConsole': 'Back to the console',
  'filter.dateRange': 'Date range',
  'filter.from': 'From',
  'filter.to': 'To',

  /* --- Tables and lists --- */
  'table.actions': 'Actions',
  'table.name': 'Name',
  'table.title': 'Title',
  'table.status': 'Status',
  'table.category': 'Category',
  'table.created': 'Created',
  'table.updated': 'Updated',
  'table.date': 'Date',
  'table.showing': 'Showing {count} of {total}',
  'table.noResults': 'No results found.',

  /* --- Destructive confirmation --- */
  'confirm.deleteTitle': 'Delete this item?',
  'confirm.deleteMessage': 'This cannot be undone.',

  /* --- Form chrome --- */
  'form.required': 'Required',
  'form.optional': 'Optional',
  'form.searchPlaceholder': 'Search…',
  'form.selectPlaceholder': 'Select…',

  /* --- Validation --- */
  'validation.required': 'This field is required.',
  'validation.email': 'Please enter a valid email address.',
  'validation.tooShort': 'This is too short.',
  'validation.tooLong': 'This is too long.',
  'validation.invalidUrl': 'Please enter a valid web address.',

  /* --- Toasts --- */
  'toast.saved': 'Saved.',
  'toast.deleted': 'Deleted.',
  'toast.published': 'Published.',
  'toast.uploadFailed': 'That file could not be uploaded.',
  'toast.error': 'Something went wrong.',

  /* --- Content workflow status --- */
  'status.DRAFT': 'Draft',
  'status.IN_REVIEW': 'In review',
  'status.PUBLISHED': 'Published',
  'status.ARCHIVED': 'Archived',
  'status.PLANNED': 'Sanctioned',
  'status.IN_PROGRESS': 'In progress',
  'status.COMPLETED': 'Completed',
  'status.ON_HOLD': 'On hold',
  'status.CANCELLED': 'Cancelled',
  'status.ACTIVE': 'Active',
  'status.INACTIVE': 'Inactive',
  'status.PENDING': 'Pending',
  'status.VERIFIED': 'Verified',
  'status.UNVERIFIED': 'Unverified',

  /* --- CMS content locale (a different control from the UI language) --- */
  'cms.editingLanguage': 'Editing language',
  'cms.editingLanguageHint': 'Which language’s content rows you are editing.',

  /* --- Dashboard --- */
  'dashboard.title': 'Campaign dashboard',
  'dashboard.subtitle': 'Citizen submissions, engagement and published content at a glance.',
  'dashboard.refresh': 'Refresh',
  'dashboard.period': 'Period',
  'dashboard.lastUpdated': 'Updated {time}',
  'dashboard.viewAll': 'View all',
  'dashboard.noComparison': 'No comparison available',
  'dashboard.vsPrevious': 'vs previous period',
  'dashboard.kpi.submissions': 'Submissions',
  'dashboard.kpi.open': 'Open',
  'dashboard.kpi.resolved': 'Resolved',
  'dashboard.kpi.resolutionRate': 'Resolution rate',
  'dashboard.kpi.highPriority': 'High priority open',
  'dashboard.kpi.unassigned': 'Unassigned',
  'dashboard.kpi.allTime': '{count} all time',
  'dashboard.kpi.awaitingModeration': '{count} awaiting moderation',
  'dashboard.kpi.medianDays': 'Median {days} days',
  'dashboard.trend.title': 'Submissions over time',
  'dashboard.trend.desc': 'How citizen contact is changing.',
  'dashboard.status.title': 'By status',
  'dashboard.status.desc': 'Where submissions currently stand.',
  'dashboard.category.title': 'By category',
  'dashboard.category.desc': 'What citizens are reporting most.',
  'dashboard.recent.title': 'Recent submissions',
  'dashboard.recent.desc': 'The newest citizen reports.',
  'dashboard.content.title': 'Published content',
  'dashboard.content.desc': 'What is live on the public site.',
  'dashboard.insights.title': 'Campaign intelligence',
  'dashboard.insights.desc': 'Computed from this period’s submissions.',
  'dashboard.oldest.title': 'Longest open',
  'dashboard.oldest.days': 'Open {days} days',
  'dashboard.empty.submissions': 'No submissions in this period yet.',
  'dashboard.empty.insights': 'Insights appear once enough submissions have been collected.',
  'dashboard.empty.content': 'Nothing published yet.',
  'dashboard.empty.widget': 'Unable to load this section.',
  'dashboard.content.projects': 'Projects',
  'dashboard.content.news': 'News',
  'dashboard.content.events': 'Events',
  'range.TODAY': 'Today',
  'range.YESTERDAY': 'Yesterday',
  'range.LAST_7_DAYS': 'Last 7 days',
  'range.LAST_30_DAYS': 'Last 30 days',
  'range.LAST_90_DAYS': 'Last 90 days',
  'range.THIS_MONTH': 'This month',
  'range.PREVIOUS_MONTH': 'Previous month',
} as const;

export type AdminStringKey = keyof typeof en;

/**
 * PARITY IS ENFORCED BY A TEST, not by convention - `adminTranslationGaps`
 * below is asserted in the suite, so a key added in English alone fails the
 * build rather than silently rendering English inside a Kannada console.
 */
const kn: Partial<Record<AdminStringKey, string>> = {
  /* --- Shell --- */
  'console.title': 'ಪ್ರಚಾರ ಕನ್ಸೋಲ್',
  'console.signOut': 'ಸೈನ್ ಔಟ್',
  'console.interfaceLanguage': 'ಇಂಟರ್‌ಫೇಸ್ ಭಾಷೆ',
  'console.skip': 'ಮುಖ್ಯ ವಿಷಯಕ್ಕೆ ಹೋಗಿ',

  /* --- Navigation groups --- */
  'group.overview': 'ಅವಲೋಕನ',
  'group.campaign': 'ಪ್ರಚಾರ',
  'group.content': 'ವಿಷಯ',
  'group.media': 'ಮಾಧ್ಯಮ',
  'group.engagement': 'ಜನಸಂಪರ್ಕ',
  'group.intelligence': 'ವಿಶ್ಲೇಷಣೆ',
  'group.operations': 'ಕಾರ್ಯಾಚರಣೆ',

  /* --- Navigation items --- */
  'nav.label': 'ಪ್ರಚಾರ ಕನ್ಸೋಲ್',
  'nav.open': 'ಸಂಚಾರ ತೆರೆಯಿರಿ',
  'nav.close': 'ಸಂಚಾರ ಮುಚ್ಚಿ',
  'nav.dashboard': 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
  'nav.candidate': 'ಅಭ್ಯರ್ಥಿ',
  'nav.vision': 'ದೃಷ್ಟಿಕೋನ',
  'nav.priorities': 'ಆದ್ಯತೆಗಳು',
  'nav.contact': 'ಸಂಪರ್ಕ ವಿವರಗಳು',
  'nav.projects': 'ಯೋಜನೆಗಳು',
  'nav.achievements': 'ಸಾಧನೆಗಳು',
  'nav.news': 'ಸುದ್ದಿಗಳು',
  'nav.events': 'ಕಾರ್ಯಕ್ರಮಗಳು',
  'nav.verification': 'ಪರಿಶೀಲನೆ',
  'nav.gallery': 'ಗ್ಯಾಲರಿ',
  'nav.media': 'ಮಾಧ್ಯಮ ಸಂಗ್ರಹ',
  'nav.qrCampaigns': 'QR ಪ್ರಚಾರಗಳು',
  'nav.issues': 'ಸಮಸ್ಯೆಗಳು ಮತ್ತು ಅಭಿಪ್ರಾಯಗಳು',
  'nav.opinions': 'ಮುಖಪುಟ ಅಭಿಪ್ರಾಯಗಳು',
  'nav.communications': 'ಸಂವಹನ',
  'nav.analytics': 'ಪ್ರಚಾರ ವಿಶ್ಲೇಷಣೆ',
  'nav.qrAnalytics': 'QR ವಿಶ್ಲೇಷಣೆ',
  'nav.aiInsights': 'AI ಒಳನೋಟಗಳು',
  'nav.system': 'ಸಿಸ್ಟಂ',

  /* --- Common actions --- */
  'action.save': 'ಉಳಿಸಿ',
  'action.cancel': 'ರದ್ದುಮಾಡಿ',
  'action.delete': 'ಅಳಿಸಿ',
  'action.edit': 'ಸಂಪಾದಿಸಿ',
  'action.view': 'ವೀಕ್ಷಿಸಿ',
  'action.create': 'ರಚಿಸಿ',
  'action.close': 'ಮುಚ್ಚಿ',
  'action.back': 'ಹಿಂದೆ',
  'action.next': 'ಮುಂದೆ',
  'action.previous': 'ಹಿಂದಿನದು',
  'action.search': 'ಹುಡುಕಿ',
  'action.filter': 'ಫಿಲ್ಟರ್',
  'action.clearFilters': 'ಫಿಲ್ಟರ್ ತೆರವುಗೊಳಿಸಿ',
  'action.apply': 'ಅನ್ವಯಿಸಿ',
  'action.reset': 'ಮರುಹೊಂದಿಸಿ',
  'action.submit': 'ಸಲ್ಲಿಸಿ',
  'action.confirm': 'ಖಚಿತಪಡಿಸಿ',
  'action.remove': 'ತೆಗೆದುಹಾಕಿ',
  'action.add': 'ಸೇರಿಸಿ',
  'action.upload': 'ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',
  'action.download': 'ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ',
  'action.retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
  'action.loadMore': 'ಇನ್ನಷ್ಟು ತೋರಿಸಿ',
  'action.publish': 'ಪ್ರಕಟಿಸಿ',
  'action.unpublish': 'ಪ್ರಕಟಣೆ ಹಿಂಪಡೆಯಿರಿ',
  'action.archive': 'ಆರ್ಕೈವ್ ಮಾಡಿ',
  'action.duplicate': 'ನಕಲು ಮಾಡಿ',
  'action.actions': 'ಕ್ರಿಯೆಗಳು',
  'action.submitForReview': 'ಪರಿಶೀಲನೆಗೆ ಸಲ್ಲಿಸಿ',
  'filter.byStatus': 'ಸ್ಥಿತಿಯ ಪ್ರಕಾರ ಶೋಧಿಸಿ',
  'filter.allStatuses': 'ಎಲ್ಲಾ ಸ್ಥಿತಿಗಳು',

  /* --- Query states --- */
  'state.loading': 'ಲೋಡ್ ಆಗುತ್ತಿದೆ',
  'state.empty': 'ಇಲ್ಲಿ ಇನ್ನೂ ಏನೂ ಇಲ್ಲ.',
  'state.errorTitle': 'ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ',
  'state.forbiddenTitle': 'ಈ ವಿಷಯವನ್ನು ನೋಡಲು ನಿಮಗೆ ಅನುಮತಿ ಇಲ್ಲ',
  'state.forbiddenBody':
    'ಇದನ್ನು ನೋಡುವ ಅನುಮತಿ ನಿಮ್ಮ ಪಾತ್ರದಲ್ಲಿ ಇಲ್ಲ. ಅಗತ್ಯವಿದ್ದರೆ ಪ್ರಚಾರ ನಿರ್ವಾಹಕರನ್ನು ಕೇಳಿ.',
  'state.saving': 'ಉಳಿಸಲಾಗುತ್ತಿದೆ…',
  'state.forbiddenAreaTitle': 'ಈ ವಿಭಾಗಕ್ಕೆ ನಿಮಗೆ ಪ್ರವೇಶ ಇಲ್ಲ',
  'state.forbiddenAreaBody':
    'ಈ ಪುಟಕ್ಕೆ ಅಗತ್ಯವಿರುವ ಅನುಮತಿ ನಿಮ್ಮ ಪಾತ್ರದಲ್ಲಿ ಇಲ್ಲ. ಇದು ತಪ್ಪು ಎಂದು ನಿಮಗೆ ಅನಿಸಿದರೆ ಪ್ರಚಾರ ನಿರ್ವಾಹಕರನ್ನು ಕೇಳಿ.',
  'state.backToConsole': 'ಕನ್ಸೋಲ್‌ಗೆ ಹಿಂತಿರುಗಿ',
  'filter.dateRange': 'ದಿನಾಂಕ ವ್ಯಾಪ್ತಿ',
  'filter.from': 'ಇಂದಿನಿಂದ',
  'filter.to': 'ಇಲ್ಲಿಯವರೆಗೆ',

  /* --- Tables and lists --- */
  'table.actions': 'ಕ್ರಿಯೆಗಳು',
  'table.name': 'ಹೆಸರು',
  'table.title': 'ಶೀರ್ಷಿಕೆ',
  'table.status': 'ಸ್ಥಿತಿ',
  'table.category': 'ವರ್ಗ',
  'table.created': 'ರಚಿಸಿದ ದಿನಾಂಕ',
  'table.updated': 'ನವೀಕರಿಸಿದ ದಿನಾಂಕ',
  'table.date': 'ದಿನಾಂಕ',
  'table.showing': '{total} ರಲ್ಲಿ {count} ತೋರಿಸಲಾಗಿದೆ',
  'table.noResults': 'ಯಾವುದೇ ಫಲಿತಾಂಶ ಕಂಡುಬಂದಿಲ್ಲ.',

  /* --- Destructive confirmation --- */
  'confirm.deleteTitle': 'ಇದನ್ನು ಅಳಿಸುವುದೇ?',
  'confirm.deleteMessage': 'ಇದನ್ನು ಮತ್ತೆ ಹಿಂಪಡೆಯಲು ಸಾಧ್ಯವಿಲ್ಲ.',

  /* --- Form chrome --- */
  'form.required': 'ಅಗತ್ಯ',
  'form.optional': 'ಐಚ್ಛಿಕ',
  'form.searchPlaceholder': 'ಹುಡುಕಿ…',
  'form.selectPlaceholder': 'ಆಯ್ಕೆಮಾಡಿ…',

  /* --- Validation --- */
  'validation.required': 'ಈ ಕ್ಷೇತ್ರವನ್ನು ಭರ್ತಿ ಮಾಡುವುದು ಅಗತ್ಯ.',
  'validation.email': 'ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಇಮೇಲ್ ವಿಳಾಸವನ್ನು ನಮೂದಿಸಿ.',
  'validation.tooShort': 'ಇದು ತುಂಬಾ ಚಿಕ್ಕದಾಗಿದೆ.',
  'validation.tooLong': 'ಇದು ತುಂಬಾ ಉದ್ದವಾಗಿದೆ.',
  'validation.invalidUrl': 'ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ವೆಬ್ ವಿಳಾಸವನ್ನು ನಮೂದಿಸಿ.',

  /* --- Toasts --- */
  'toast.saved': 'ಉಳಿಸಲಾಗಿದೆ.',
  'toast.deleted': 'ಅಳಿಸಲಾಗಿದೆ.',
  'toast.published': 'ಪ್ರಕಟಿಸಲಾಗಿದೆ.',
  'toast.uploadFailed': 'ಆ ಕಡತವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.',
  'toast.error': 'ಏನೋ ತಪ್ಪಾಗಿದೆ.',

  /* --- Content workflow status --- */
  'status.DRAFT': 'ಕರಡು',
  'status.IN_REVIEW': 'ಪರಿಶೀಲನೆಯಲ್ಲಿ',
  'status.PUBLISHED': 'ಪ್ರಕಟಿಸಲಾಗಿದೆ',
  'status.ARCHIVED': 'ಆರ್ಕೈವ್ ಮಾಡಲಾಗಿದೆ',
  'status.PLANNED': 'ಮಂಜೂರಾಗಿದೆ',
  'status.IN_PROGRESS': 'ಪ್ರಗತಿಯಲ್ಲಿದೆ',
  'status.COMPLETED': 'ಪೂರ್ಣಗೊಂಡಿದೆ',
  'status.ON_HOLD': 'ತಡೆಹಿಡಿಯಲಾಗಿದೆ',
  'status.CANCELLED': 'ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ',
  'status.ACTIVE': 'ಸಕ್ರಿಯ',
  'status.INACTIVE': 'ನಿಷ್ಕ್ರಿಯ',
  'status.PENDING': 'ಬಾಕಿಯಿದೆ',
  'status.VERIFIED': 'ಪರಿಶೀಲಿಸಲಾಗಿದೆ',
  'status.UNVERIFIED': 'ಪರಿಶೀಲಿಸಿಲ್ಲ',

  /* --- CMS content locale --- */
  'cms.editingLanguage': 'ಸಂಪಾದನೆ ಭಾಷೆ',
  'cms.editingLanguageHint': 'ನೀವು ಯಾವ ಭಾಷೆಯ ವಿಷಯವನ್ನು ಸಂಪಾದಿಸುತ್ತಿದ್ದೀರಿ.',

  /* --- Dashboard --- */
  'dashboard.title': 'ಪ್ರಚಾರ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
  'dashboard.subtitle': 'ನಾಗರಿಕರ ಸಲ್ಲಿಕೆಗಳು, ಜನಸಂಪರ್ಕ ಮತ್ತು ಪ್ರಕಟಿತ ವಿಷಯದ ಸಂಕ್ಷಿಪ್ತ ನೋಟ.',
  'dashboard.refresh': 'ಮರುಲೋಡ್ ಮಾಡಿ',
  'dashboard.period': 'ಅವಧಿ',
  'dashboard.lastUpdated': '{time} ಕ್ಕೆ ನವೀಕರಿಸಲಾಗಿದೆ',
  'dashboard.viewAll': 'ಎಲ್ಲವನ್ನೂ ನೋಡಿ',
  'dashboard.noComparison': 'ಹೋಲಿಕೆ ಲಭ್ಯವಿಲ್ಲ',
  'dashboard.vsPrevious': 'ಹಿಂದಿನ ಅವಧಿಗೆ ಹೋಲಿಸಿದರೆ',
  'dashboard.kpi.submissions': 'ಸಲ್ಲಿಕೆಗಳು',
  'dashboard.kpi.open': 'ಬಾಕಿ ಇರುವವು',
  'dashboard.kpi.resolved': 'ಪರಿಹರಿಸಲಾಗಿದೆ',
  'dashboard.kpi.resolutionRate': 'ಪರಿಹಾರ ದರ',
  'dashboard.kpi.highPriority': 'ಹೆಚ್ಚಿನ ಆದ್ಯತೆಯ ಬಾಕಿ',
  'dashboard.kpi.unassigned': 'ನಿಯೋಜಿಸದವು',
  'dashboard.kpi.allTime': 'ಒಟ್ಟು {count}',
  'dashboard.kpi.awaitingModeration': '{count} ಪರಿಶೀಲನೆಗೆ ಬಾಕಿ',
  'dashboard.kpi.medianDays': 'ಮಧ್ಯಂತರ {days} ದಿನಗಳು',
  'dashboard.trend.title': 'ಕಾಲಾನುಕ್ರಮದಲ್ಲಿ ಸಲ್ಲಿಕೆಗಳು',
  'dashboard.trend.desc': 'ನಾಗರಿಕರ ಸಂಪರ್ಕ ಹೇಗೆ ಬದಲಾಗುತ್ತಿದೆ.',
  'dashboard.status.title': 'ಸ್ಥಿತಿಯ ಪ್ರಕಾರ',
  'dashboard.status.desc': 'ಸಲ್ಲಿಕೆಗಳು ಈಗ ಯಾವ ಹಂತದಲ್ಲಿವೆ.',
  'dashboard.category.title': 'ವರ್ಗದ ಪ್ರಕಾರ',
  'dashboard.category.desc': 'ನಾಗರಿಕರು ಹೆಚ್ಚಾಗಿ ಏನನ್ನು ವರದಿ ಮಾಡುತ್ತಿದ್ದಾರೆ.',
  'dashboard.recent.title': 'ಇತ್ತೀಚಿನ ಸಲ್ಲಿಕೆಗಳು',
  'dashboard.recent.desc': 'ಅತ್ಯಂತ ಹೊಸ ನಾಗರಿಕ ವರದಿಗಳು.',
  'dashboard.content.title': 'ಪ್ರಕಟಿತ ವಿಷಯ',
  'dashboard.content.desc': 'ಸಾರ್ವಜನಿಕ ತಾಣದಲ್ಲಿ ಏನು ಪ್ರಕಟವಾಗಿದೆ.',
  'dashboard.insights.title': 'ಪ್ರಚಾರ ವಿಶ್ಲೇಷಣೆ',
  'dashboard.insights.desc': 'ಈ ಅವಧಿಯ ಸಲ್ಲಿಕೆಗಳಿಂದ ಲೆಕ್ಕಹಾಕಲಾಗಿದೆ.',
  'dashboard.oldest.title': 'ಅತಿ ಹೆಚ್ಚು ಕಾಲ ಬಾಕಿ',
  'dashboard.oldest.days': '{days} ದಿನಗಳಿಂದ ಬಾಕಿ',
  'dashboard.empty.submissions': 'ಈ ಅವಧಿಯಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ಸಲ್ಲಿಕೆ ಇಲ್ಲ.',
  'dashboard.empty.insights': 'ಸಾಕಷ್ಟು ಸಲ್ಲಿಕೆಗಳು ಸಂಗ್ರಹವಾದ ನಂತರ ಒಳನೋಟಗಳು ಕಾಣಿಸುತ್ತವೆ.',
  'dashboard.empty.content': 'ಇನ್ನೂ ಏನನ್ನೂ ಪ್ರಕಟಿಸಲಾಗಿಲ್ಲ.',
  'dashboard.empty.widget': 'ಈ ವಿಭಾಗವನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.',
  'dashboard.content.projects': 'ಯೋಜನೆಗಳು',
  'dashboard.content.news': 'ಸುದ್ದಿಗಳು',
  'dashboard.content.events': 'ಕಾರ್ಯಕ್ರಮಗಳು',
  'range.TODAY': 'ಇಂದು',
  'range.YESTERDAY': 'ನಿನ್ನೆ',
  'range.LAST_7_DAYS': 'ಕಳೆದ 7 ದಿನಗಳು',
  'range.LAST_30_DAYS': 'ಕಳೆದ 30 ದಿನಗಳು',
  'range.LAST_90_DAYS': 'ಕಳೆದ 90 ದಿನಗಳು',
  'range.THIS_MONTH': 'ಈ ತಿಂಗಳು',
  'range.PREVIOUS_MONTH': 'ಹಿಂದಿನ ತಿಂಗಳು',
};

const DICTIONARIES: Record<Locale, Partial<Record<AdminStringKey, string>>> = { en, kn };

/**
 * Looks up a console string, falling back to English per key.
 *
 * The fallback is a safety net for the gap between adding a string and
 * translating it - never a licence to leave one untranslated. A missing key
 * returns its own name rather than `undefined`, so a mistake shows up as a
 * visible, searchable token instead of the word "undefined" in the interface.
 */
export function translateAdmin(
  locale: Locale,
  key: AdminStringKey,
  values?: Record<string, string | number>,
): string {
  const template = DICTIONARIES[locale]?.[key] ?? en[key] ?? key;

  if (!values) return template;

  return Object.entries(values).reduce(
    (result, [token, value]) => result.split(`{${token}}`).join(String(value)),
    template,
  );
}

/** Console-side counterpart of the public dictionary's completeness check. */
export function adminTranslationGaps(locale: Locale): {
  missing: AdminStringKey[];
  placeholderMismatch: AdminStringKey[];
} {
  const dictionary = DICTIONARIES[locale] ?? {};
  const keys = Object.keys(en) as AdminStringKey[];
  const tokensOf = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  return {
    missing: keys.filter((key) => dictionary[key] === undefined),
    placeholderMismatch: keys.filter((key) => {
      const translated = dictionary[key];
      if (translated === undefined) return false;
      return tokensOf(translated).join() !== tokensOf(en[key]).join();
    }),
  };
}
