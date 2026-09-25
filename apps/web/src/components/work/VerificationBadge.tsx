import type { VerificationStatus } from '@rk/types';
import type { PublicWorkStatus } from '../../features/work/workQueries';
import { useSite } from '../../features/site/SiteContext';

/**
 * The public verification badge.
 *
 * THE MOST CAREFULLY WORDED COMPONENT IN THE PHASE, because it is the only
 * place where the platform makes an assertion on its own behalf rather than
 * repeating one a staff member typed.
 *
 * What it says: "Verified - checked against supporting evidence by this
 * campaign's review process." What it deliberately does NOT say: "Government
 * verified", "Officially confirmed", "Independently audited". The platform has
 * no standing to make any of those claims. A reviewer here is a member of the
 * campaign's own staff looking at documents the campaign itself supplied, and
 * a badge that implied external authority would be the single most misleading
 * thing this product could print.
 *
 * THERE IS NO BADGE FOR UNVERIFIED. An absent badge is the honest rendering of
 * a claim nobody has checked: adding a grey "Not verified" chip to every such
 * card would make the page look audited, with most of the audit saying "no".
 *
 * REJECTED renders nothing either, and never reaches this component in
 * practice - the public API does not serve rejected claims. The case is handled
 * defensively rather than assumed away.
 */
export function VerificationBadge({
  verification,
  size = 'default',
}: {
  verification: VerificationStatus;
  size?: 'default' | 'small';
}) {
  if (verification !== 'VERIFIED') return null;

  return (
    <span
      className={`verify-badge${size === 'small' ? ' verify-badge--small' : ''}`}
      title="Checked against supporting evidence by this campaign's review process."
    >
      <span aria-hidden="true" className="verify-badge__mark">
        ✓
      </span>
      Verified
    </span>
  );
}

/**
 * The work-status badge: sanctioned, ongoing or completed.
 *
 * Always rendered, and visually distinct from the verification badge, because
 * conflating them is the specific misreading this phase has to prevent. A
 * COMPLETED work with no verification badge is a claim the campaign is making;
 * a COMPLETED work WITH one is a claim somebody checked. Those must not look
 * alike at a glance on a phone.
 *
 * PROPOSED (shown as Sanctioned) carries the strongest treatment for the same
 * reason: a sanction skimmed quickly must never be mistaken for something built.
 */
export function WorkStatusBadge({ status }: { status: PublicWorkStatus | null }) {
  const { t } = useSite();
  if (!status) return null;

  const labels: Record<PublicWorkStatus, string> = {
    PROPOSED: t('work.statusProposed'),
    ONGOING: t('work.statusOngoing'),
    COMPLETED: t('work.statusCompleted'),
  };

  const hints: Record<PublicWorkStatus, string> = {
    PROPOSED: 'Sanctioned. Work has not started yet.',
    ONGOING: 'Work is under way and not yet finished.',
    COMPLETED: 'Work is reported as finished.',
  };

  return (
    <span className={`work-status work-status--${status.toLowerCase()}`} title={hints[status]}>
      {labels[status]}
    </span>
  );
}
