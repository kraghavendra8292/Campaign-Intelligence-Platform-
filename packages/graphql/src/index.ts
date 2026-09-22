import { baseTypeDefs } from './typeDefs/base';
import { healthTypeDefs } from './typeDefs/health';
import { authTypeDefs } from './typeDefs/auth';
import { publicSiteTypeDefs } from './typeDefs/publicSite';
import { cmsTypeDefs } from './typeDefs/cms';
import { qrTypeDefs } from './typeDefs/qr';
import { issueTypeDefs } from './typeDefs/issues';
import { aiTypeDefs } from './typeDefs/ai';
import { analyticsTypeDefs } from './typeDefs/analytics';
import { communicationTypeDefs } from './typeDefs/communication';
import { workTypeDefs } from './typeDefs/work';
import { opsTypeDefs } from './typeDefs/ops';
import { siteFeedbackTypeDefs } from './typeDefs/siteFeedback';

export { baseTypeDefs } from './typeDefs/base';
export { healthTypeDefs } from './typeDefs/health';
export { authTypeDefs } from './typeDefs/auth';
export { publicSiteTypeDefs } from './typeDefs/publicSite';
export { cmsTypeDefs } from './typeDefs/cms';
export { qrTypeDefs } from './typeDefs/qr';
export { issueTypeDefs } from './typeDefs/issues';
export { aiTypeDefs } from './typeDefs/ai';
export { analyticsTypeDefs } from './typeDefs/analytics';
export { communicationTypeDefs } from './typeDefs/communication';
export { workTypeDefs } from './typeDefs/work';
export { opsTypeDefs } from './typeDefs/ops';
export { siteFeedbackTypeDefs } from './typeDefs/siteFeedback';
export * from './operations';

/**
 * Ordered list of every SDL fragment in the schema.
 *
 * `baseTypeDefs` must come first because feature modules `extend` the root
 * types it declares. Phase 2+ modules append their fragment here.
 */
export const typeDefs = [
  baseTypeDefs,
  healthTypeDefs,
  authTypeDefs,
  // publicSite declares the shared content enums and PublicPageInfo that cms
  // reuses, so it must come first.
  publicSiteTypeDefs,
  cmsTypeDefs,
  // qr declares AnalyticsRange and AnalyticsWindow, which the issue analytics
  // reuse, so it must come first.
  qrTypeDefs,
  issueTypeDefs,
  // ai reuses AdminIssue and IssueCategory from the issue fragment, so it must
  // come after it.
  aiTypeDefs,
  // analytics reuses IssueCategory, IssueStaffUser and the issue enums from the
  // issue fragment, AnalyticsRange from qr, and AiReviewStatus from ai, so it
  // comes last.
  analyticsTypeDefs,
  // communication reuses IssueStatus from the issue fragment, so it comes after.
  communicationTypeDefs,
  // work reuses ContentCategory, VerificationStatus, PublicImage,
  // PublicProjectMedia and PublicSiteInput from publicSite, and ContentStatus
  // from cms, so it comes after both.
  workTypeDefs,
  // ops declares only its own types and depends on nothing but the DateTime
  // scalar from base, so its position is not load-bearing.
  opsTypeDefs,
  // siteFeedback reuses PublicPageInfo from publicSite and IssueStaffUser from
  // issues, so it comes after both.
  siteFeedbackTypeDefs,
] as const;

/** The complete schema as a single SDL document, for tooling and codegen. */
export const schemaSdl = typeDefs.join('\n');
