import { DEFAULT_LOCALE, type Locale } from '@rk/types';

/**
 * UI strings.
 *
 * Externalised so the interface can be translated without touching components.
 * The platform targets English and Kannada; English is complete and Kannada is
 * partially translated - `t()` falls back to English per key, so an untranslated
 * string renders in English rather than as a missing-key placeholder.
 *
 * This covers CHROME only (labels, buttons, empty states). Editorial content is
 * translated in the CMS as separate content rows per locale - see the schema's
 * `(organizationId, slug, locale)` key.
 */

const en = {
  'nav.home': 'Home',
  'nav.work': 'Our Work',
  'nav.vision': 'Vision',
  'nav.achievements': 'Achievements',
  'nav.transparency': 'Transparency',

  // Phase 9. The wording here is load-bearing: 'Verified' must never imply
  // outside endorsement, and 'Proposed' must never read as something built.
  'transparency.title': 'Transparency',
  'transparency.subtitle':
    'What has been done, what is under way and what is proposed - with the records behind each claim.',
  'transparency.verified': 'Verified works',
  'transparency.verifiedHint': 'Checked against supporting evidence by this campaign.',
  'transparency.ongoing': 'Ongoing works',
  'transparency.proposed': 'Proposed works',
  'transparency.areas': 'Areas covered',
  'transparency.coverage': 'Evidence coverage',
  'transparency.coverageNote':
    '{evidenced} of {published} published works have at least one supporting record you can open.',
  'transparency.byCategory': 'Work by category',
  'transparency.recent': 'Recently verified',
  'transparency.verifiedOn': 'Verified',
  'transparency.empty': 'Nothing has been published yet.',
  'transparency.footnote':
    'Verification means this campaign checked the supporting records. It is not an external or government audit.',

  'work.statusCompleted': 'Completed',
  'work.statusOngoing': 'Ongoing',
  'work.statusProposed': 'Proposed',
  'work.filterStatus': 'Filter by status',
  'work.verifiedOnly': 'Verified only',
  'work.searchLabel': 'Search works',
  'work.showing': 'Showing {shown} of {total}',
  'work.area': 'Area',
  'work.location': 'Location',
  'work.started': 'Started',
  'work.completed': 'Completed',
  'work.department': 'Department',
  'work.agency': 'Agency',
  'work.cost': 'Approved budget',
  'work.spent': 'Amount spent',
  'work.beneficiaries': 'People benefiting',
  'work.route': 'Stretch / location',
  'work.verifiedOn': 'Verified on',
  'work.timeline': 'Progress',
  'work.evidence': 'Evidence',
  'work.beforeAfter': 'Before and after',
  'work.noEvidence': 'No supporting records have been published for this work yet.',
  'nav.news': 'News',
  'nav.events': 'Events',
  'nav.about': 'About',
  'nav.gallery': 'Gallery',
  'nav.contact': 'Contact',
  'nav.search': 'Search',
  'nav.menu': 'Menu',
  'nav.close': 'Close menu',
  'nav.primary': 'Primary',
  'hero.slideshow': 'Campaign photographs',
  'hero.previousSlide': 'Previous slide',
  'hero.nextSlide': 'Next slide',
  'hero.goToSlide': 'Go to slide {index}',
  'hero.slideOf': 'Slide {current} of {total}',
  'hero.pauseSlideshow': 'Pause slideshow',
  'hero.playSlideshow': 'Play slideshow',
  'nav.skip': 'Skip to main content',

  'hero.primaryCta': 'See our work',
  'hero.secondaryCta': 'Learn more',

  'quick.title': 'Explore',
  'quick.work': 'Our Work',
  'quick.projects': 'Development Projects',
  'quick.achievements': 'Achievements',
  'quick.news': 'News',
  'quick.events': 'Events',
  'quick.comingSoon': 'Coming soon',

  'section.work': 'Our Work',
  'section.workSubtitle': 'Development projects across the constituency.',
  'section.vision': 'Vision & Priorities',
  'section.visionSubtitle': 'The areas we are focused on.',
  'section.achievements': 'Achievements',
  'section.achievementsSubtitle': 'Completed work and outcomes.',
  'section.news': 'Latest Updates',
  'section.newsSubtitle': 'Announcements and news.',
  'section.events': 'Upcoming Events',
  'section.eventsSubtitle': 'Public events you can attend.',
  'section.viewAllWork': 'View all work',
  'section.viewAllAchievements': 'View all achievements',
  'section.viewAllNews': 'View all updates',
  'section.viewAllEvents': 'View all events',

  'opinion.title': 'Tell us your opinion',
  'opinion.subtitle': 'How do you feel about our work so far?',
  'opinion.reactionsLabel': 'Your reaction',
  'opinion.great': 'Great',
  'opinion.ok': 'Ok',
  'opinion.worst': 'Worst',
  'opinion.greatEn': 'ಉತ್ತಮ',
  'opinion.okEn': 'ಸರಿ',
  'opinion.worstEn': 'ಕೆಟ್ಟದು',
  'opinion.commentLabel': 'Add a comment (optional)',
  'opinion.commentPlaceholder': 'Share a short thought…',
  'opinion.submit': 'Submit feedback',
  'opinion.submitting': 'Sending…',
  'opinion.success': 'Thank you — your feedback was received.',
  'opinion.error': 'Could not send your feedback. Please try again.',

  'home.stats.projects': 'Projects delivered',
  'home.stats.achievements': 'Achievements',
  'home.stats.people': 'Citizens reached',

  'card.viewDetails': 'View details',
  'card.readMore': 'Read more',
  'card.verified': 'Verified',
  'card.featured': 'Featured',

  'label.category': 'Category',
  'label.location': 'Location',
  'label.area': 'Area',
  'label.status': 'Status',
  'label.startDate': 'Start date',
  'label.completionDate': 'Completed',
  'label.cost': 'Cost',
  'label.beneficiaries': 'Beneficiaries',
  'label.date': 'Date',
  'label.organizer': 'Organiser',
  'label.notStated': 'Not stated',
  'label.updates': 'Project updates',
  'label.evidence': 'Supporting evidence',
  'label.beforeAfter': 'Before and after',
  'label.before': 'Before',
  'label.after': 'After',
  'label.gallery': 'Gallery',
  'label.published': 'Published',
  'label.source': 'Source',

  'filter.all': 'All',
  'filter.category': 'Filter by category',
  'filter.search': 'Search',
  'filter.searchPlaceholder': 'Search…',
  'filter.clear': 'Clear filters',
  'filter.upcoming': 'Upcoming only',

  'pagination.loadMore': 'Load more',
  'pagination.showing': 'Showing {count} of {total}',

  'empty.projects': 'No projects published yet.',
  'empty.achievements': 'No achievements published yet.',
  'empty.news': 'No updates available.',
  'empty.events': 'No upcoming events.',
  'empty.gallery': 'No photos published yet.',
  'empty.videos': 'No videos published yet.',
  'empty.priorities': 'No priorities published yet.',
  'empty.search': 'No results found for “{term}”.',
  'empty.generic': 'Nothing to show yet.',
  'empty.hint': 'Please check back soon.',

  // --- Phase 5: citizen feedback and issue reporting -----------------------
  //
  // Written for somebody standing next to the problem they are reporting, on a
  // phone, possibly in a hurry. Plain words, no jargon, and every message says
  // what to do rather than what went wrong.
  'nav.feedback': 'Share Feedback',
  'nav.track': 'Track a submission',

  'feedback.title': 'Share your feedback or report an issue',
  'feedback.intro':
    'Tell us about a problem in your area, or share a suggestion. You do not need an account, and you can submit without giving your name.',
  'feedback.stepType': 'What would you like to share?',
  'feedback.stepDetails': 'Tell us about it',
  'feedback.stepLocation': 'Where is it?',
  'feedback.stepPhoto': 'Add a photo',
  'feedback.stepContact': 'Your contact details',
  'feedback.stepConsent': 'Before you send',

  'feedback.type.FEEDBACK': 'Feedback',
  'feedback.type.FEEDBACK.hint': 'Share a thought about our work',
  'feedback.type.ISSUE': 'Report an issue',
  'feedback.type.ISSUE.hint': 'Something needs fixing in your area',
  'feedback.type.SUGGESTION': 'Suggestion',
  'feedback.type.SUGGESTION.hint': 'An idea for the neighbourhood',
  'feedback.type.COMPLAINT': 'Complaint',
  'feedback.type.COMPLAINT.hint': 'Something has gone wrong',

  'feedback.field.title': 'Short title',
  'feedback.field.titleHint': 'For example: “Street light not working near the school”',
  'feedback.field.description': 'Describe it',
  'feedback.field.descriptionHint':
    'What is happening, since when, and how it affects people nearby.',
  'feedback.field.category': 'What is this about?',
  'feedback.field.categoryHint': 'Choose the closest match.',
  'feedback.field.ward': 'Ward',
  'feedback.field.locality': 'Village or locality',
  'feedback.field.area': 'Area',
  'feedback.field.address': 'Landmark or address',
  'feedback.field.addressHint': 'Anything that helps the team find the place.',
  'feedback.field.name': 'Your name',
  'feedback.field.phone': 'Phone number',
  'feedback.field.email': 'Email address',
  'feedback.field.photo': 'Add a photo or document',
  'feedback.field.photoHint': 'JPG, PNG or WebP up to 5 MB, or a PDF up to 10 MB. Up to 5 files.',

  'feedback.location.optional': 'All location details are optional.',
  'feedback.location.use': 'Use my current location',
  'feedback.location.added': 'Location added',
  'feedback.location.remove': 'Remove location',
  'feedback.location.denied': 'We could not get your location. You can type the details instead.',
  'feedback.location.note':
    'Your location is only used to find the place you are reporting, and only if you choose to add it.',

  'feedback.anonymous.label': 'Submit without giving my details',
  'feedback.anonymous.hint':
    'Choose this and we will not store your name, phone or email. You will still get a reference number.',
  'feedback.contact.hint':
    'Only fill these in if you would like the team to be able to reply to you.',
  'feedback.consent.label':
    'I agree that the campaign team may use these details to respond to this submission.',
  'feedback.consent.note':
    'Your details are used only to reply to you. They are never shown publicly and are never used to work out your political views.',

  'feedback.submit': 'Send',
  'feedback.submitting': 'Sending…',
  'feedback.uploadFailed': 'That file could not be added. You can still send without it.',
  'feedback.failed': 'Your submission could not be completed. Please try again.',
  'feedback.attachmentAdded': 'Attached',
  'feedback.attachmentRemove': 'Remove',

  'feedback.done.title': 'Thank you for sharing this',
  'feedback.done.reference': 'Your reference number',
  'feedback.done.save':
    'Please save this reference number. You can use it to check the status of your submission.',
  'feedback.done.contact': 'The team may contact you using the details you gave.',
  'feedback.done.anonymous':
    'You submitted this without giving your details, so the team cannot reply directly.',
  'feedback.done.track': 'Check a submission',
  'feedback.done.another': 'Send something else',

  'track.title': 'Check a submission',
  'track.intro': 'Enter the reference number you were given when you submitted.',
  'track.field': 'Reference number',
  'track.placeholder': 'For example: ISS-2026-7F3K9XQ2',
  'track.submit': 'Check',
  'track.notFound':
    'We could not find a submission with that reference. Please check the number and try again.',
  'track.result': 'Submission status',
  'track.submittedOn': 'Submitted',
  'track.updatedOn': 'Last updated',
  // Phase 8 - follow-up and communication on the tracking page.
  'track.timeline': 'Progress',
  'track.updates': 'Updates from the team',
  'track.noUpdates': 'There are no updates yet. You will see them here when there are.',
  'track.follow': 'Get updates by email',
  'track.followIntro':
    'We can email you when the status of this submission changes. You will need the tracking code you were given when you submitted.',
  'track.trackingCode': 'Tracking code',
  'track.trackingCodeHint':
    'The long code shown once after you submitted. Without it you can still check the status above.',
  'track.email': 'Your email address',
  'track.consent': 'I agree to receive emails about this submission.',
  'track.consentNote':
    'Used only for updates about this submission. Nothing else is ever sent to this address.',
  'track.followSubmit': 'Turn on email updates',
  'track.following': 'Email updates are on for this submission.',
  'track.stop': 'Stop these emails',
  'track.stopped': 'Email updates have been turned off. Your submission is unaffected.',
  'track.resolvedQuestion': 'Was this resolved?',
  'track.resolvedIntro': 'Your answer goes to the team. It does not change the status by itself.',
  'track.answerYes': 'Yes, it is fixed',
  'track.answerPartly': 'Partly fixed',
  'track.answerNo': 'No, not fixed',
  'track.commentLabel': 'Anything to add? (optional)',
  'track.followUpSubmit': 'Send',
  'track.followUpThanks': 'Thank you. Your answer has been recorded.',
  'track.followUpAlready': 'You have already answered this.',
  'track.privacy':
    'For privacy, only the status is shown here. The details you wrote are not displayed.',

  'issueStatus.SUBMITTED': 'Received',
  'issueStatus.UNDER_REVIEW': 'Being reviewed',
  'issueStatus.ACKNOWLEDGED': 'Acknowledged',
  'issueStatus.IN_PROGRESS': 'Being worked on',
  'issueStatus.RESOLVED': 'Resolved',
  'issueStatus.CLOSED': 'Closed',
  'issueStatus.REJECTED': 'Not taken forward',

  'loading.generic': 'Loading…',
  'error.title': 'Something went wrong',
  'error.body': 'This content could not be loaded. Please try again.',
  'error.retry': 'Try again',
  'error.notFound': 'Page not found',
  'error.notFoundBody': 'The page you requested does not exist or is no longer published.',
  'error.backHome': 'Back to home',

  'search.title': 'Search',
  'search.placeholder': 'Search projects, achievements, news and events',
  'search.submit': 'Search',
  'search.resultsFor': 'Results for “{term}”',
  'search.prompt': 'Enter a search term to begin.',
  'search.minLength': 'Enter at least two characters.',

  'about.title': 'About',
  'about.experience': 'Experience',
  'about.publicService': 'Public service',
  'about.focusAreas': 'Areas of focus',

  'contact.title': 'Contact',
  'contact.office': 'Office',
  'contact.phone': 'Phone',
  'contact.email': 'Email',
  'contact.hours': 'Office hours',
  'contact.follow': 'Follow',
  'contact.unavailable': 'Contact details have not been published yet.',

  'footer.quickLinks': 'Quick links',
  'footer.legal': 'Legal',
  'footer.privacy': 'Privacy Policy',
  'footer.terms': 'Terms of Use',
  'footer.rights': 'All rights reserved.',
  'footer.demoNotice': 'Demonstration content. Not a real campaign.',

  'future.feedback': 'Share Feedback',
  'future.reportIssue': 'Report an Issue',
  'future.notice': 'This feature is not available yet.',

  'status.DRAFT': 'Draft',
  'status.IN_REVIEW': 'In review',
  'status.PUBLISHED': 'Published',
  'status.ARCHIVED': 'Archived',
  'status.PLANNED': 'Planned',
  'status.IN_PROGRESS': 'In progress',
  'status.COMPLETED': 'Completed',
  'status.ON_HOLD': 'On hold',
  'status.CANCELLED': 'Cancelled',
  'status.UPCOMING': 'Upcoming',
  'status.ONGOING': 'Ongoing',
  'status.UNVERIFIED': 'Unverified',
  'status.VERIFIED': 'Verified',

  'category.INFRASTRUCTURE': 'Infrastructure',
  'category.EDUCATION': 'Education',
  'category.HEALTHCARE': 'Healthcare',
  'category.WATER': 'Water',
  'category.AGRICULTURE': 'Agriculture',
  'category.EMPLOYMENT': 'Employment',
  'category.PUBLIC_SERVICES': 'Public services',
  'category.ENVIRONMENT': 'Environment',
  'category.OTHER': 'Other',
} as const;

export type StringKey = keyof typeof en;

/**
 * Kannada translations.
 *
 * COMPLETE. This is a Kannada-first product: the public site defaults to
 * Kannada, so an untranslated key is not a graceful degradation - it is an
 * English word sitting in the middle of a Kannada sentence.
 *
 * `translate()` still falls back to English per key, which keeps a newly added
 * string renderable before it is translated. That fallback is a safety net for
 * the gap between adding a string and translating it, NOT a licence to leave
 * one untranslated: the parity test in this suite fails on any key that has
 * English text and no Kannada.
 */
const kn: Partial<Record<StringKey, string>> = {
  'nav.home': 'ಮುಖಪುಟ',
  'nav.work': 'ನಮ್ಮ ಕೆಲಸ',
  'nav.vision': 'ದೂರದೃಷ್ಟಿ',
  'nav.achievements': 'ಸಾಧನೆಗಳು',
  'nav.transparency': 'ಪಾರದರ್ಶಕತೆ',

  'transparency.title': 'ಪಾರದರ್ಶಕತೆ',
  'transparency.verified': 'ದೃಢೀಕೃತ ಕಾಮಗಾರಿಗಳು',
  'transparency.ongoing': 'ಪ್ರಗತಿಯಲ್ಲಿರುವ ಕಾಮಗಾರಿಗಳು',
  'transparency.proposed': 'ಪ್ರಸ್ತಾವಿತ ಕಾಮಗಾರಿಗಳು',
  'transparency.areas': 'ಒಳಗೊಂಡ ಪ್ರದೇಶಗಳು',
  'transparency.coverage': 'ದಾಖಲೆ ವ್ಯಾಪ್ತಿ',
  'transparency.byCategory': 'ವಿಭಾಗವಾರು ಕಾಮಗಾರಿ',
  'transparency.recent': 'ಇತ್ತೀಚೆಗೆ ದೃಢೀಕರಿಸಲಾಗಿದೆ',
  'transparency.verifiedOn': 'ದೃಢೀಕರಿಸಲಾಗಿದೆ',

  'work.statusCompleted': 'ಪೂರ್ಣಗೊಂಡಿದೆ',
  'work.statusOngoing': 'ಪ್ರಗತಿಯಲ್ಲಿದೆ',
  'work.statusProposed': 'ಪ್ರಸ್ತಾವಿತ',
  'work.verifiedOnly': 'ದೃಢೀಕೃತ ಮಾತ್ರ',
  'work.area': 'ಪ್ರದೇಶ',
  'work.location': 'ಸ್ಥಳ',
  'work.started': 'ಪ್ರಾರಂಭ',
  'work.completed': 'ಪೂರ್ಣಗೊಂಡಿದೆ',
  'work.department': 'ಇಲಾಖೆ',
  'work.agency': 'ಸಂಸ್ಥೆ',
  'work.cost': 'ಅನುಮೋದಿತ ಬಜೆಟ್',
  'work.spent': 'ಖರ್ಚು ಮೊತ್ತ',
  'work.beneficiaries': 'ಫಲಾನುಭವಿಗಳು',
  'work.route': 'ಮಾರ್ಗ / ಸ್ಥಳ',
  'work.beforeAfter': 'ಮೊದಲು ಮತ್ತು ನಂತರ',
  'work.timeline': 'ಪ್ರಗತಿ',
  'work.evidence': 'ದಾಖಲೆಗಳು',
  'nav.news': 'ಸುದ್ದಿ',
  'nav.events': 'ಕಾರ್ಯಕ್ರಮಗಳು',
  'nav.about': 'ಪರಿಚಯ',
  'nav.gallery': 'ಗ್ಯಾಲರಿ',
  'nav.contact': 'ಸಂಪರ್ಕ',
  'nav.search': 'ಹುಡುಕಿ',
  'nav.menu': 'ಮೆನು',
  'nav.close': 'ಮೆನು ಮುಚ್ಚಿ',
  'nav.primary': 'ಮುಖ್ಯ ಮೆನು',
  'hero.slideshow': 'ಪ್ರಚಾರದ ಛಾಯಾಚಿತ್ರಗಳು',
  'hero.previousSlide': 'ಹಿಂದಿನ ಚಿತ್ರ',
  'hero.nextSlide': 'ಮುಂದಿನ ಚಿತ್ರ',
  'hero.goToSlide': 'ಚಿತ್ರ {index}ಕ್ಕೆ ಹೋಗಿ',
  'hero.slideOf': '{total}ರಲ್ಲಿ {current}ನೇ ಚಿತ್ರ',
  'hero.pauseSlideshow': 'ಛಾಯಾಚಿತ್ರ ಪ್ರದರ್ಶನ ನಿಲ್ಲಿಸಿ',
  'hero.playSlideshow': 'ಛಾಯಾಚಿತ್ರ ಪ್ರದರ್ಶನ ಪ್ರಾರಂಭಿಸಿ',
  'nav.skip': 'ಮುಖ್ಯ ವಿಷಯಕ್ಕೆ ಹೋಗಿ',

  'hero.primaryCta': 'ನಮ್ಮ ಕೆಲಸ ನೋಡಿ',
  'hero.secondaryCta': 'ಇನ್ನಷ್ಟು ತಿಳಿಯಿರಿ',

  'card.viewDetails': 'ವಿವರಗಳನ್ನು ನೋಡಿ',
  'card.readMore': 'ಇನ್ನಷ್ಟು ಓದಿ',
  'card.verified': 'ದೃಢೀಕರಿಸಲಾಗಿದೆ',

  'section.viewAllWork': 'ಎಲ್ಲಾ ಕೆಲಸ ನೋಡಿ',
  'section.viewAllNews': 'ಎಲ್ಲಾ ನವೀಕರಣಗಳು',

  'empty.projects': 'ಇನ್ನೂ ಯಾವುದೇ ಯೋಜನೆಗಳನ್ನು ಪ್ರಕಟಿಸಲಾಗಿಲ್ಲ.',
  'empty.news': 'ಯಾವುದೇ ನವೀಕರಣಗಳು ಲಭ್ಯವಿಲ್ಲ.',
  'empty.events': 'ಮುಂಬರುವ ಕಾರ್ಯಕ್ರಮಗಳಿಲ್ಲ.',

  // --- Phase 5 -------------------------------------------------------------
  'nav.feedback': 'ಅಭಿಪ್ರಾಯ ಹಂಚಿಕೊಳ್ಳಿ',
  'nav.track': 'ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸಿ',

  'feedback.title': 'ನಿಮ್ಮ ಅಭಿಪ್ರಾಯ ಹಂಚಿಕೊಳ್ಳಿ ಅಥವಾ ಸಮಸ್ಯೆ ತಿಳಿಸಿ',
  'feedback.intro':
    'ನಿಮ್ಮ ಪ್ರದೇಶದ ಸಮಸ್ಯೆ ಅಥವಾ ಸಲಹೆಯನ್ನು ತಿಳಿಸಿ. ಖಾತೆ ಅಗತ್ಯವಿಲ್ಲ, ಹೆಸರು ನೀಡದೆಯೂ ಕಳುಹಿಸಬಹುದು.',
  'feedback.stepType': 'ನೀವು ಏನು ಹಂಚಿಕೊಳ್ಳಲು ಬಯಸುತ್ತೀರಿ?',
  'feedback.stepDetails': 'ವಿವರ ತಿಳಿಸಿ',
  'feedback.stepLocation': 'ಎಲ್ಲಿದೆ?',
  'feedback.stepPhoto': 'ಫೋಟೋ ಸೇರಿಸಿ',
  'feedback.stepContact': 'ನಿಮ್ಮ ಸಂಪರ್ಕ ವಿವರ',
  'feedback.stepConsent': 'ಕಳುಹಿಸುವ ಮೊದಲು',

  'feedback.type.FEEDBACK': 'ಅಭಿಪ್ರಾಯ',
  'feedback.type.ISSUE': 'ಸಮಸ್ಯೆ ತಿಳಿಸಿ',
  'feedback.type.SUGGESTION': 'ಸಲಹೆ',
  'feedback.type.COMPLAINT': 'ದೂರು',

  'feedback.field.title': 'ಚಿಕ್ಕ ಶೀರ್ಷಿಕೆ',
  'feedback.field.description': 'ವಿವರಿಸಿ',
  'feedback.field.category': 'ಇದು ಯಾವ ವಿಷಯ?',
  'feedback.field.ward': 'ವಾರ್ಡ್',
  'feedback.field.locality': 'ಗ್ರಾಮ ಅಥವಾ ಪ್ರದೇಶ',
  'feedback.field.area': 'ಪ್ರದೇಶ',
  'feedback.field.address': 'ಗುರುತು ಅಥವಾ ವಿಳಾಸ',
  'feedback.field.name': 'ನಿಮ್ಮ ಹೆಸರು',
  'feedback.field.phone': 'ದೂರವಾಣಿ ಸಂಖ್ಯೆ',
  'feedback.field.email': 'ಇಮೇಲ್ ವಿಳಾಸ',
  'feedback.field.photo': 'ಫೋಟೋ ಅಥವಾ ದಾಖಲೆ ಸೇರಿಸಿ',

  'feedback.anonymous.label': 'ನನ್ನ ವಿವರ ನೀಡದೆ ಕಳುಹಿಸಿ',
  'feedback.submit': 'ಕಳುಹಿಸಿ',
  'feedback.submitting': 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…',
  'feedback.failed': 'ಕಳುಹಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',

  'feedback.done.title': 'ಹಂಚಿಕೊಂಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು',
  'feedback.done.reference': 'ನಿಮ್ಮ ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ',

  'track.title': 'ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸಿ',
  'track.field': 'ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ',
  'track.submit': 'ಪರಿಶೀಲಿಸಿ',

  'issueStatus.SUBMITTED': 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ',
  'issueStatus.UNDER_REVIEW': 'ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ',
  'issueStatus.ACKNOWLEDGED': 'ಒಪ್ಪಿಕೊಳ್ಳಲಾಗಿದೆ',
  'issueStatus.IN_PROGRESS': 'ಕೆಲಸ ನಡೆಯುತ್ತಿದೆ',
  'issueStatus.RESOLVED': 'ಪರಿಹರಿಸಲಾಗಿದೆ',
  'issueStatus.CLOSED': 'ಮುಚ್ಚಲಾಗಿದೆ',
  'issueStatus.REJECTED': 'ಮುಂದುವರಿಸಲಾಗಿಲ್ಲ',

  'loading.generic': 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…',
  'error.title': 'ಏನೋ ತಪ್ಪಾಗಿದೆ',
  'error.retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',

  'contact.title': 'ಸಂಪರ್ಕ',
  'footer.privacy': 'ಗೌಪ್ಯತಾ ನೀತಿ',
  'footer.terms': 'ಬಳಕೆಯ ನಿಯಮಗಳು',

  /* --- SECTION HEADINGS --- */
  'section.work': 'ನಮ್ಮ ಕಾರ್ಯಗಳು',
  'section.workSubtitle': 'ಕ್ಷೇತ್ರದಾದ್ಯಂತ ಅಭಿವೃದ್ಧಿ ಯೋಜನೆಗಳು.',
  'section.vision': 'ದೂರದೃಷ್ಟಿ ಮತ್ತು ಆದ್ಯತೆಗಳು',
  'section.visionSubtitle': 'ನಾವು ಗಮನ ಹರಿಸುತ್ತಿರುವ ಕ್ಷೇತ್ರಗಳು.',
  'section.achievements': 'ಸಾಧನೆಗಳು',
  'section.achievementsSubtitle': 'ಪೂರ್ಣಗೊಂಡ ಕಾರ್ಯಗಳು ಮತ್ತು ಫಲಿತಾಂಶಗಳು.',

  'opinion.title': 'ನಿಮ್ಮ ಅಭಿಪ್ರಾಯ ತಿಳಿಸಿ',
  'opinion.subtitle': 'ನಮ್ಮ ಕೆಲಸದ ಬಗ್ಗೆ ನಿಮಗೆ ಹೇಗೆ ಅನಿಸುತ್ತದೆ?',
  'opinion.reactionsLabel': 'ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆ',
  'opinion.great': 'ಉತ್ತಮ',
  'opinion.ok': 'ಸರಿ',
  'opinion.worst': 'ಕೆಟ್ಟದು',
  'opinion.greatEn': '(Great)',
  'opinion.okEn': '(Ok)',
  'opinion.worstEn': '(Worst)',
  'opinion.commentLabel': 'ಟಿಪ್ಪಣಿ ಸೇರಿಸಿ (ಐಚ್ಛಿಕ)',
  'opinion.commentPlaceholder': 'ಸಂಕ್ಷಿಪ್ತ ಅನಿಸಿಕೆ ಹಂಚಿಕೊಳ್ಳಿ…',
  'opinion.submit': 'ಅಭಿಪ್ರಾಯ ಕಳುಹಿಸಿ',
  'opinion.submitting': 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…',
  'opinion.success': 'ಧನ್ಯವಾದಗಳು — ನಿಮ್ಮ ಅಭಿಪ್ರಾಯ ಸ್ವೀಕರಿಸಲಾಗಿದೆ.',
  'opinion.error': 'ಕಳುಹಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',

  'home.stats.projects': 'ಪೂರೈಸಿದ ಯೋಜನೆಗಳು',
  'home.stats.achievements': 'ಸಾಧನೆಗಳು',
  'home.stats.people': 'ತಲುಪಿದ ನಾಗರಿಕರು',
  'section.news': 'ಇತ್ತೀಚಿನ ಸುದ್ದಿಗಳು',
  'section.newsSubtitle': 'ಪ್ರಕಟಣೆಗಳು ಮತ್ತು ಸುದ್ದಿಗಳು.',
  'section.events': 'ಮುಂಬರುವ ಕಾರ್ಯಕ್ರಮಗಳು',
  'section.eventsSubtitle': 'ನೀವು ಭಾಗವಹಿಸಬಹುದಾದ ಸಾರ್ವಜನಿಕ ಕಾರ್ಯಕ್ರಮಗಳು.',
  'section.viewAllAchievements': 'ಎಲ್ಲಾ ಸಾಧನೆಗಳನ್ನು ನೋಡಿ',
  'section.viewAllEvents': 'ಎಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳನ್ನು ನೋಡಿ',

  /* --- QUICK ACTIONS --- */
  'quick.title': 'ಅನ್ವೇಷಿಸಿ',
  'quick.work': 'ನಮ್ಮ ಕಾರ್ಯಗಳು',
  'quick.projects': 'ಅಭಿವೃದ್ಧಿ ಯೋಜನೆಗಳು',
  'quick.achievements': 'ಸಾಧನೆಗಳು',
  'quick.news': 'ಸುದ್ದಿಗಳು',
  'quick.events': 'ಕಾರ್ಯಕ್ರಮಗಳು',
  'quick.comingSoon': 'ಶೀಘ್ರದಲ್ಲಿ ಬರಲಿದೆ',
  'future.feedback': 'ಅಭಿಪ್ರಾಯ ಹಂಚಿಕೊಳ್ಳಿ',
  'future.reportIssue': 'ಸಮಸ್ಯೆ ವರದಿ ಮಾಡಿ',
  'future.notice': 'ಈ ಸೌಲಭ್ಯ ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ.',

  /* --- ABOUT --- */
  'about.title': 'ಪರಿಚಯ',
  'about.experience': 'ಅನುಭವ',
  'about.publicService': 'ಸಾರ್ವಜನಿಕ ಸೇವೆ',
  'about.focusAreas': 'ಗಮನ ಕೇಂದ್ರೀಕರಿಸಿದ ಕ್ಷೇತ್ರಗಳು',
  'card.featured': 'ವಿಶೇಷ',

  /* --- CATEGORIES --- */
  'category.INFRASTRUCTURE': 'ಮೂಲಸೌಕರ್ಯ',
  'category.EDUCATION': 'ಶಿಕ್ಷಣ',
  'category.HEALTHCARE': 'ಆರೋಗ್ಯ',
  'category.WATER': 'ನೀರು',
  'category.AGRICULTURE': 'ಕೃಷಿ',
  'category.EMPLOYMENT': 'ಉದ್ಯೋಗ',
  'category.PUBLIC_SERVICES': 'ಸಾರ್ವಜನಿಕ ಸೇವೆಗಳು',
  'category.ENVIRONMENT': 'ಪರಿಸರ',
  'category.OTHER': 'ಇತರೆ',

  /* --- CONTACT --- */
  'contact.office': 'ಕಚೇರಿ',
  'contact.phone': 'ದೂರವಾಣಿ',
  'contact.email': 'ಇಮೇಲ್',
  'contact.hours': 'ಕಚೇರಿ ಸಮಯ',
  'contact.follow': 'ಅನುಸರಿಸಿ',
  'contact.unavailable': 'ಸಂಪರ್ಕ ವಿವರಗಳನ್ನು ಇನ್ನೂ ಪ್ರಕಟಿಸಲಾಗಿಲ್ಲ.',

  /* --- EMPTY AND ERROR STATES --- */
  'empty.achievements': 'ಇನ್ನೂ ಯಾವುದೇ ಸಾಧನೆಗಳನ್ನು ಪ್ರಕಟಿಸಲಾಗಿಲ್ಲ.',
  'empty.gallery': 'ಇನ್ನೂ ಯಾವುದೇ ಛಾಯಾಚಿತ್ರಗಳನ್ನು ಪ್ರಕಟಿಸಲಾಗಿಲ್ಲ.',
  'empty.videos': 'ಇನ್ನೂ ಯಾವುದೇ ವೀಡಿಯೊಗಳನ್ನು ಪ್ರಕಟಿಸಲಾಗಿಲ್ಲ.',
  'empty.priorities': 'ಇನ್ನೂ ಯಾವುದೇ ಆದ್ಯತೆಗಳನ್ನು ಪ್ರಕಟಿಸಲಾಗಿಲ್ಲ.',
  'empty.search': '“{term}” ಗಾಗಿ ಯಾವುದೇ ಫಲಿತಾಂಶ ಸಿಗಲಿಲ್ಲ.',
  'empty.generic': 'ತೋರಿಸಲು ಇನ್ನೂ ಏನೂ ಇಲ್ಲ.',
  'empty.hint': 'ದಯವಿಟ್ಟು ಶೀಘ್ರದಲ್ಲೇ ಮತ್ತೆ ಪರಿಶೀಲಿಸಿ.',
  'error.body': 'ಈ ವಿಷಯವನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  'error.notFound': 'ಪುಟ ಸಿಗಲಿಲ್ಲ',
  'error.notFoundBody': 'ನೀವು ಕೇಳಿದ ಪುಟ ಅಸ್ತಿತ್ವದಲ್ಲಿಲ್ಲ ಅಥವಾ ಇನ್ನು ಮುಂದೆ ಪ್ರಕಟವಾಗಿಲ್ಲ.',
  'error.backHome': 'ಮುಖಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ',

  /* --- FILTERS, SEARCH AND PAGINATION --- */
  'filter.all': 'ಎಲ್ಲಾ',
  'filter.category': 'ವರ್ಗದ ಪ್ರಕಾರ ಶೋಧಿಸಿ',
  'filter.search': 'ಹುಡುಕಿ',
  'filter.searchPlaceholder': 'ಹುಡುಕಿ…',
  'filter.clear': 'ಶೋಧಕಗಳನ್ನು ತೆರವುಗೊಳಿಸಿ',
  'filter.upcoming': 'ಮುಂಬರುವವು ಮಾತ್ರ',
  'search.title': 'ಹುಡುಕಿ',
  'search.placeholder': 'ಯೋಜನೆಗಳು, ಸಾಧನೆಗಳು, ಸುದ್ದಿ ಮತ್ತು ಕಾರ್ಯಕ್ರಮಗಳನ್ನು ಹುಡುಕಿ',
  'search.submit': 'ಹುಡುಕಿ',
  'search.resultsFor': '“{term}” ಗಾಗಿ ಫಲಿತಾಂಶಗಳು',
  'search.prompt': 'ಪ್ರಾರಂಭಿಸಲು ಹುಡುಕಾಟ ಪದವನ್ನು ನಮೂದಿಸಿ.',
  'search.minLength': 'ಕನಿಷ್ಠ ಎರಡು ಅಕ್ಷರಗಳನ್ನು ನಮೂದಿಸಿ.',
  'pagination.loadMore': 'ಇನ್ನಷ್ಟು ತೋರಿಸಿ',
  'pagination.showing': '{total} ರಲ್ಲಿ {count} ತೋರಿಸಲಾಗಿದೆ',

  /* --- FOOTER --- */
  'footer.quickLinks': 'ತ್ವರಿತ ಕೊಂಡಿಗಳು',
  'footer.legal': 'ಕಾನೂನು',
  'footer.rights': 'ಎಲ್ಲಾ ಹಕ್ಕುಗಳು ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ.',
  'footer.demoNotice': 'ಪ್ರಾತ್ಯಕ್ಷಿಕೆ ವಿಷಯ. ಇದು ನಿಜವಾದ ಪ್ರಚಾರವಲ್ಲ.',

  /* --- CONTENT LABELS --- */
  'label.category': 'ವರ್ಗ',
  'label.location': 'ಸ್ಥಳ',
  'label.area': 'ಪ್ರದೇಶ',
  'label.status': 'ಸ್ಥಿತಿ',
  'label.startDate': 'ಆರಂಭ ದಿನಾಂಕ',
  'label.completionDate': 'ಪೂರ್ಣಗೊಂಡಿದೆ',
  'label.cost': 'ವೆಚ್ಚ',
  'label.beneficiaries': 'ಫಲಾನುಭವಿಗಳು',
  'label.date': 'ದಿನಾಂಕ',
  'label.organizer': 'ಆಯೋಜಕರು',
  'label.notStated': 'ನಮೂದಿಸಿಲ್ಲ',
  'label.updates': 'ಯೋಜನೆಯ ಪ್ರಗತಿ',
  'label.evidence': 'ಪೂರಕ ದಾಖಲೆಗಳು',
  'label.beforeAfter': 'ಮೊದಲು ಮತ್ತು ನಂತರ',
  'label.before': 'ಮೊದಲು',
  'label.after': 'ನಂತರ',
  'label.gallery': 'ಗ್ಯಾಲರಿ',
  'label.published': 'ಪ್ರಕಟಿಸಲಾಗಿದೆ',
  'label.source': 'ಮೂಲ',

  /* --- STATUS --- */
  'status.DRAFT': 'ಕರಡು',
  'status.IN_REVIEW': 'ಪರಿಶೀಲನೆಯಲ್ಲಿ',
  'status.PUBLISHED': 'ಪ್ರಕಟಿಸಲಾಗಿದೆ',
  'status.ARCHIVED': 'ಸಂಗ್ರಹಿಸಲಾಗಿದೆ',
  'status.PLANNED': 'ಯೋಜಿಸಲಾಗಿದೆ',
  'status.IN_PROGRESS': 'ಪ್ರಗತಿಯಲ್ಲಿದೆ',
  'status.COMPLETED': 'ಪೂರ್ಣಗೊಂಡಿದೆ',
  'status.ON_HOLD': 'ತಡೆಹಿಡಿಯಲಾಗಿದೆ',
  'status.CANCELLED': 'ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ',
  'status.UPCOMING': 'ಮುಂಬರುವ',
  'status.ONGOING': 'ನಡೆಯುತ್ತಿದೆ',
  'status.UNVERIFIED': 'ಪರಿಶೀಲಿಸಿಲ್ಲ',
  'status.VERIFIED': 'ಪರಿಶೀಲಿಸಲಾಗಿದೆ',

  /* --- FEEDBACK FORM --- */
  'feedback.type.FEEDBACK.hint': 'ನಮ್ಮ ಕಾರ್ಯದ ಬಗ್ಗೆ ನಿಮ್ಮ ಅನಿಸಿಕೆ ಹಂಚಿಕೊಳ್ಳಿ',
  'feedback.type.ISSUE.hint': 'ನಿಮ್ಮ ಪ್ರದೇಶದಲ್ಲಿ ಸರಿಪಡಿಸಬೇಕಾದ ಸಮಸ್ಯೆ',
  'feedback.type.SUGGESTION.hint': 'ನೆರೆಹೊರೆಗಾಗಿ ಒಂದು ಸಲಹೆ',
  'feedback.type.COMPLAINT.hint': 'ಏನೋ ತಪ್ಪಾಗಿದೆ',
  'feedback.field.titleHint': 'ಉದಾಹರಣೆಗೆ: “ಶಾಲೆಯ ಬಳಿ ಬೀದಿ ದೀಪ ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ”',
  'feedback.field.descriptionHint':
    'ಏನು ನಡೆಯುತ್ತಿದೆ, ಯಾವಾಗಿನಿಂದ, ಮತ್ತು ಅದು ಸುತ್ತಮುತ್ತಲಿನ ಜನರ ಮೇಲೆ ಹೇಗೆ ಪರಿಣಾಮ ಬೀರುತ್ತಿದೆ.',
  'feedback.field.categoryHint': 'ಹತ್ತಿರದ ವರ್ಗವನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
  'feedback.field.addressHint': 'ಸ್ಥಳವನ್ನು ಹುಡುಕಲು ತಂಡಕ್ಕೆ ಸಹಾಯವಾಗುವ ಯಾವುದೇ ವಿವರ.',
  'feedback.field.photoHint':
    'JPG, PNG ಅಥವಾ WebP 5 MB ವರೆಗೆ, ಅಥವಾ PDF 10 MB ವರೆಗೆ. ಗರಿಷ್ಠ 5 ಕಡತಗಳು.',
  'feedback.location.optional': 'ಎಲ್ಲಾ ಸ್ಥಳ ವಿವರಗಳು ಐಚ್ಛಿಕ.',
  'feedback.location.use': 'ನನ್ನ ಪ್ರಸ್ತುತ ಸ್ಥಳವನ್ನು ಬಳಸಿ',
  'feedback.location.added': 'ಸ್ಥಳ ಸೇರಿಸಲಾಗಿದೆ',
  'feedback.location.remove': 'ಸ್ಥಳ ತೆಗೆದುಹಾಕಿ',
  'feedback.location.denied':
    'ನಿಮ್ಮ ಸ್ಥಳವನ್ನು ಪಡೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಬದಲಿಗೆ ನೀವು ವಿವರಗಳನ್ನು ಬರೆಯಬಹುದು.',
  'feedback.location.note':
    'ನೀವು ವರದಿ ಮಾಡುತ್ತಿರುವ ಸ್ಥಳವನ್ನು ಹುಡುಕಲು ಮಾತ್ರ ನಿಮ್ಮ ಸ್ಥಳವನ್ನು ಬಳಸಲಾಗುತ್ತದೆ, ಮತ್ತು ನೀವು ಸೇರಿಸಲು ಆಯ್ಕೆ ಮಾಡಿದರೆ ಮಾತ್ರ.',
  'feedback.anonymous.hint':
    'ಇದನ್ನು ಆಯ್ಕೆ ಮಾಡಿದರೆ ನಿಮ್ಮ ಹೆಸರು, ದೂರವಾಣಿ ಅಥವಾ ಇಮೇಲ್ ಸಂಗ್ರಹಿಸುವುದಿಲ್ಲ. ನಿಮಗೆ ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ ಸಿಗುತ್ತದೆ.',
  'feedback.contact.hint': 'ತಂಡವು ನಿಮಗೆ ಉತ್ತರಿಸಬೇಕೆಂದು ಬಯಸಿದರೆ ಮಾತ್ರ ಇವುಗಳನ್ನು ಭರ್ತಿ ಮಾಡಿ.',
  'feedback.consent.label':
    'ಈ ಸಲ್ಲಿಕೆಗೆ ಉತ್ತರಿಸಲು ಪ್ರಚಾರ ತಂಡವು ಈ ವಿವರಗಳನ್ನು ಬಳಸಬಹುದು ಎಂದು ನಾನು ಒಪ್ಪುತ್ತೇನೆ.',
  'feedback.consent.note':
    'ನಿಮ್ಮ ವಿವರಗಳನ್ನು ನಿಮಗೆ ಉತ್ತರಿಸಲು ಮಾತ್ರ ಬಳಸಲಾಗುತ್ತದೆ. ಅವುಗಳನ್ನು ಎಂದಿಗೂ ಸಾರ್ವಜನಿಕವಾಗಿ ತೋರಿಸುವುದಿಲ್ಲ ಮತ್ತು ನಿಮ್ಮ ರಾಜಕೀಯ ನಿಲುವು ತಿಳಿಯಲು ಎಂದಿಗೂ ಬಳಸುವುದಿಲ್ಲ.',
  'feedback.uploadFailed': 'ಆ ಕಡತವನ್ನು ಸೇರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಅದಿಲ್ಲದೆಯೂ ನೀವು ಕಳುಹಿಸಬಹುದು.',
  'feedback.attachmentAdded': 'ಲಗತ್ತಿಸಲಾಗಿದೆ',
  'feedback.attachmentRemove': 'ತೆಗೆದುಹಾಕಿ',
  'feedback.done.save':
    'ದಯವಿಟ್ಟು ಈ ಉಲ್ಲೇಖ ಸಂಖ್ಯೆಯನ್ನು ಉಳಿಸಿಕೊಳ್ಳಿ. ನಿಮ್ಮ ಸಲ್ಲಿಕೆಯ ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸಲು ಇದನ್ನು ಬಳಸಬಹುದು.',
  'feedback.done.contact': 'ನೀವು ನೀಡಿದ ವಿವರಗಳನ್ನು ಬಳಸಿ ತಂಡವು ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸಬಹುದು.',
  'feedback.done.anonymous':
    'ನಿಮ್ಮ ವಿವರಗಳನ್ನು ನೀಡದೆ ಸಲ್ಲಿಸಿದ್ದೀರಿ, ಆದ್ದರಿಂದ ತಂಡವು ನೇರವಾಗಿ ಉತ್ತರಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ.',
  'feedback.done.track': 'ಸಲ್ಲಿಕೆ ಪರಿಶೀಲಿಸಿ',
  'feedback.done.another': 'ಇನ್ನೊಂದು ಕಳುಹಿಸಿ',

  /* --- SUBMISSION TRACKING --- */
  'track.intro': 'ಸಲ್ಲಿಸಿದಾಗ ನಿಮಗೆ ನೀಡಲಾದ ಉಲ್ಲೇಖ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.',
  'track.placeholder': 'ಉದಾಹರಣೆಗೆ: ISS-2026-7F3K9XQ2',
  'track.notFound':
    'ಆ ಉಲ್ಲೇಖ ಸಂಖ್ಯೆಯ ಸಲ್ಲಿಕೆ ಸಿಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಸಂಖ್ಯೆಯನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  'track.result': 'ಸಲ್ಲಿಕೆಯ ಸ್ಥಿತಿ',
  'track.submittedOn': 'ಸಲ್ಲಿಸಲಾಗಿದೆ',
  'track.updatedOn': 'ಕೊನೆಯ ನವೀಕರಣ',
  'track.timeline': 'ಪ್ರಗತಿ',
  'track.updates': 'ತಂಡದಿಂದ ನವೀಕರಣಗಳು',
  'track.noUpdates': 'ಇನ್ನೂ ಯಾವುದೇ ನವೀಕರಣಗಳಿಲ್ಲ. ಬಂದಾಗ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.',
  'track.follow': 'ಇಮೇಲ್ ಮೂಲಕ ನವೀಕರಣ ಪಡೆಯಿರಿ',
  'track.followIntro':
    'ಈ ಸಲ್ಲಿಕೆಯ ಸ್ಥಿತಿ ಬದಲಾದಾಗ ನಾವು ನಿಮಗೆ ಇಮೇಲ್ ಕಳುಹಿಸಬಹುದು. ಸಲ್ಲಿಸಿದಾಗ ನಿಮಗೆ ನೀಡಲಾದ ಟ್ರ್ಯಾಕಿಂಗ್ ಕೋಡ್ ಅಗತ್ಯವಿದೆ.',
  'track.trackingCode': 'ಟ್ರ್ಯಾಕಿಂಗ್ ಕೋಡ್',
  'track.trackingCodeHint':
    'ಸಲ್ಲಿಸಿದ ನಂತರ ಒಮ್ಮೆ ಮಾತ್ರ ತೋರಿಸಲಾದ ಉದ್ದದ ಕೋಡ್. ಅದಿಲ್ಲದೆಯೂ ನೀವು ಮೇಲಿನ ಸ್ಥಿತಿಯನ್ನು ಪರಿಶೀಲಿಸಬಹುದು.',
  'track.email': 'ನಿಮ್ಮ ಇಮೇಲ್ ವಿಳಾಸ',
  'track.consent': 'ಈ ಸಲ್ಲಿಕೆಯ ಬಗ್ಗೆ ಇಮೇಲ್ ಸ್ವೀಕರಿಸಲು ನಾನು ಒಪ್ಪುತ್ತೇನೆ.',
  'track.consentNote':
    'ಈ ಸಲ್ಲಿಕೆಯ ನವೀಕರಣಗಳಿಗೆ ಮಾತ್ರ ಬಳಸಲಾಗುತ್ತದೆ. ಈ ವಿಳಾಸಕ್ಕೆ ಬೇರೇನೂ ಕಳುಹಿಸುವುದಿಲ್ಲ.',
  'track.followSubmit': 'ಇಮೇಲ್ ನವೀಕರಣ ಆನ್ ಮಾಡಿ',
  'track.following': 'ಈ ಸಲ್ಲಿಕೆಗೆ ಇಮೇಲ್ ನವೀಕರಣ ಆನ್ ಆಗಿದೆ.',
  'track.stop': 'ಈ ಇಮೇಲ್‌ಗಳನ್ನು ನಿಲ್ಲಿಸಿ',
  'track.stopped': 'ಇಮೇಲ್ ನವೀಕರಣಗಳನ್ನು ಆಫ್ ಮಾಡಲಾಗಿದೆ. ನಿಮ್ಮ ಸಲ್ಲಿಕೆಗೆ ಯಾವುದೇ ಪರಿಣಾಮವಿಲ್ಲ.',
  'track.resolvedQuestion': 'ಇದು ಪರಿಹಾರವಾಯಿತೇ?',
  'track.resolvedIntro':
    'ನಿಮ್ಮ ಉತ್ತರ ತಂಡಕ್ಕೆ ತಲುಪುತ್ತದೆ. ಅದು ತಾನಾಗಿಯೇ ಸ್ಥಿತಿಯನ್ನು ಬದಲಾಯಿಸುವುದಿಲ್ಲ.',
  'track.answerYes': 'ಹೌದು, ಸರಿಪಡಿಸಲಾಗಿದೆ',
  'track.answerPartly': 'ಭಾಗಶಃ ಸರಿಪಡಿಸಲಾಗಿದೆ',
  'track.answerNo': 'ಇಲ್ಲ, ಸರಿಪಡಿಸಿಲ್ಲ',
  'track.commentLabel': 'ಏನಾದರೂ ಸೇರಿಸಬೇಕೇ? (ಐಚ್ಛಿಕ)',
  'track.followUpSubmit': 'ಕಳುಹಿಸಿ',
  'track.followUpThanks': 'ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಉತ್ತರವನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ.',
  'track.followUpAlready': 'ನೀವು ಈಗಾಗಲೇ ಇದಕ್ಕೆ ಉತ್ತರಿಸಿದ್ದೀರಿ.',
  'track.privacy':
    'ಗೌಪ್ಯತೆಗಾಗಿ, ಇಲ್ಲಿ ಸ್ಥಿತಿಯನ್ನು ಮಾತ್ರ ತೋರಿಸಲಾಗಿದೆ. ನೀವು ಬರೆದ ವಿವರಗಳನ್ನು ತೋರಿಸುವುದಿಲ್ಲ.',

  /* --- VERIFIED WORK AND TRANSPARENCY --- */
  'work.filterStatus': 'ಸ್ಥಿತಿಯ ಪ್ರಕಾರ ಶೋಧಿಸಿ',
  'work.searchLabel': 'ಕಾರ್ಯಗಳನ್ನು ಹುಡುಕಿ',
  'work.showing': '{total} ರಲ್ಲಿ {shown} ತೋರಿಸಲಾಗಿದೆ',
  'work.verifiedOn': 'ಪರಿಶೀಲಿಸಿದ ದಿನಾಂಕ',
  'work.noEvidence': 'ಈ ಕಾರ್ಯಕ್ಕೆ ಇನ್ನೂ ಯಾವುದೇ ಪೂರಕ ದಾಖಲೆಗಳನ್ನು ಪ್ರಕಟಿಸಲಾಗಿಲ್ಲ.',
  'transparency.subtitle':
    'ಏನು ಮಾಡಲಾಗಿದೆ, ಏನು ನಡೆಯುತ್ತಿದೆ ಮತ್ತು ಏನು ಪ್ರಸ್ತಾಪಿಸಲಾಗಿದೆ - ಪ್ರತಿ ಹೇಳಿಕೆಯ ಹಿಂದಿನ ದಾಖಲೆಗಳೊಂದಿಗೆ.',
  'transparency.verifiedHint': 'ಈ ಪ್ರಚಾರ ತಂಡವು ಪೂರಕ ದಾಖಲೆಗಳ ಆಧಾರದ ಮೇಲೆ ಪರಿಶೀಲಿಸಿದೆ.',
  'transparency.coverageNote':
    'ಪ್ರಕಟಿಸಲಾದ {published} ಕಾರ್ಯಗಳಲ್ಲಿ {evidenced} ಕಾರ್ಯಗಳಿಗೆ ನೀವು ತೆರೆದು ನೋಡಬಹುದಾದ ಕನಿಷ್ಠ ಒಂದು ಪೂರಕ ದಾಖಲೆ ಇದೆ.',
  'transparency.empty': 'ಇನ್ನೂ ಏನನ್ನೂ ಪ್ರಕಟಿಸಲಾಗಿಲ್ಲ.',
  'transparency.footnote':
    'ಪರಿಶೀಲನೆ ಎಂದರೆ ಈ ಪ್ರಚಾರ ತಂಡವು ಪೂರಕ ದಾಖಲೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿದೆ ಎಂದರ್ಥ. ಇದು ಬಾಹ್ಯ ಅಥವಾ ಸರ್ಕಾರಿ ಲೆಕ್ಕಪರಿಶೋಧನೆ ಅಲ್ಲ.',
};

const DICTIONARIES: Record<Locale, Partial<Record<StringKey, string>>> = { en, kn };

/**
 * Looks up a string, falling back to English per key.
 *
 * `{placeholder}` tokens are substituted from `values`, which keeps the
 * sentence structure inside the translation rather than concatenated in the
 * component - word order differs between English and Kannada.
 */
export function translate(
  locale: Locale,
  key: StringKey,
  values?: Record<string, string | number>,
): string {
  const template = DICTIONARIES[locale]?.[key] ?? en[key];

  if (!values) return template;

  return Object.entries(values).reduce(
    (result, [token, value]) => result.split(`{${token}}`).join(String(value)),
    template,
  );
}

/**
 * Where a locale's dictionary falls short of the English one.
 *
 * Exists so the completeness of a translation is asserted by the test suite
 * rather than trusted. `translate()` falls back per key, so a missing string is
 * INVISIBLE in code review - it surfaces only as an English word inside a
 * Kannada sentence on a live page, which is exactly the failure this product
 * cannot afford.
 *
 * `placeholderMismatch` matters just as much: a translation that drops `{term}`
 * or renames it silently renders a sentence with a hole in it.
 */
export function translationGaps(locale: Locale): {
  missing: StringKey[];
  placeholderMismatch: StringKey[];
} {
  const dictionary = DICTIONARIES[locale] ?? {};
  const keys = Object.keys(en) as StringKey[];
  const tokensOf = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  const missing = keys.filter((key) => dictionary[key] === undefined);

  const placeholderMismatch = keys.filter((key) => {
    const translated = dictionary[key];
    if (translated === undefined) return false;
    return tokensOf(translated).join() !== tokensOf(en[key]).join();
  });

  return { missing, placeholderMismatch };
}

export { DEFAULT_LOCALE };
