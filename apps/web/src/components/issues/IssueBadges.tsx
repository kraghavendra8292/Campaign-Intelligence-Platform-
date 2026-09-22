import { Badge } from '@rk/ui';
import type { StatusTone } from '@rk/design-tokens';

/**
 * Status, priority and moderation badges.
 *
 * Every one shows WORDS plus a tone, never tone alone: a colour-blind reader,
 * a greyscale print and a screen reader all have to convey the same thing, and
 * "red" is not information.
 *
 * The human labels differ from the enum names on purpose. `IN_PROGRESS` reads
 * as machinery; "Being worked on" reads as somebody doing something. Staff and
 * citizens both deserve the latter.
 */

const STATUS_TONES: Record<string, StatusTone> = {
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  ACKNOWLEDGED: 'info',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  REJECTED: 'neutral',
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Received',
  UNDER_REVIEW: 'Under review',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Not taken forward',
};

export function IssueStatusBadge({ value }: { value: string }) {
  return (
    <Badge tone={STATUS_TONES[value] ?? 'neutral'} withDot>
      {STATUS_LABELS[value] ?? value.replace(/_/g, ' ').toLowerCase()}
    </Badge>
  );
}

const PRIORITY_TONES: Record<string, StatusTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'error',
};

export function IssuePriorityBadge({ value }: { value: string }) {
  return (
    <Badge tone={PRIORITY_TONES[value] ?? 'neutral'}>
      {value.charAt(0) + value.slice(1).toLowerCase()}
    </Badge>
  );
}

const MODERATION_TONES: Record<string, StatusTone> = {
  PENDING_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'neutral',
  SPAM: 'error',
};

const MODERATION_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'Awaiting review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SPAM: 'Spam',
};

export function IssueModerationBadge({ value }: { value: string }) {
  return (
    <Badge tone={MODERATION_TONES[value] ?? 'neutral'}>
      {MODERATION_LABELS[value] ?? value.replace(/_/g, ' ').toLowerCase()}
    </Badge>
  );
}

const TYPE_LABELS: Record<string, string> = {
  FEEDBACK: 'Feedback',
  ISSUE: 'Issue',
  SUGGESTION: 'Suggestion',
  COMPLAINT: 'Complaint',
};

export function IssueTypeLabel({ value }: { value: string }) {
  return <span className="issue-type">{TYPE_LABELS[value] ?? value}</span>;
}

const SOURCE_LABELS: Record<string, string> = {
  DIRECT_WEBSITE: 'Website',
  QR: 'QR code',
  CAMPAIGN_PAGE: 'Campaign page',
  OTHER: 'Other',
};

export function issueSourceLabel(value: string): string {
  return SOURCE_LABELS[value] ?? value;
}

export { STATUS_LABELS, TYPE_LABELS };
