import type { ReactNode } from 'react';
import { Badge } from '@rk/ui';
import type {
  AiConfidenceBand,
  AiProcessingStatus,
  AiReviewStatus,
} from '../../features/ai/aiQueries';

/**
 * Labelling for AI-derived output.
 *
 * THE LABEL IS A SAFETY CONTROL, NOT DECORATION. An administrator reading a
 * summary has to be able to tell, without thinking about it, whether they are
 * looking at something a machine wrote and nobody has checked, or something a
 * colleague read and approved. Those are very different bases for acting, and
 * the difference is invisible in the text itself - a fluent wrong summary looks
 * exactly like a fluent right one.
 *
 * So every surface that renders AI output renders one of these beside it, and
 * the wording is deliberately plain: "AI-generated, not reviewed" rather than a
 * neutral status pill that a tired reader could skim past.
 *
 * All AI text is rendered as TEXT. Nothing in this module or its callers uses
 * `dangerouslySetInnerHTML`: model output is untrusted input, and a summary is
 * not a document.
 */

export const AI_REVIEW_LABELS: Record<AiReviewStatus, string> = {
  GENERATED: 'AI-generated, not reviewed',
  PENDING_REVIEW: 'Needs review',
  APPROVED: 'Reviewed and approved',
  REJECTED: 'Rejected by staff',
  STALE: 'May be out of date',
};

const AI_REVIEW_TONE: Record<AiReviewStatus, 'neutral' | 'success' | 'warning' | 'error'> = {
  GENERATED: 'warning',
  PENDING_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  STALE: 'warning',
};

export function AiReviewBadge({ status }: { status: AiReviewStatus }) {
  return <Badge tone={AI_REVIEW_TONE[status]}>{AI_REVIEW_LABELS[status]}</Badge>;
}

export const AI_PROCESSING_LABELS: Record<AiProcessingStatus, string> = {
  NOT_PROCESSED: 'Not processed',
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  REQUIRES_REVIEW: 'Needs a closer look',
};

const AI_PROCESSING_TONE: Record<AiProcessingStatus, 'neutral' | 'success' | 'warning' | 'error'> =
  {
    NOT_PROCESSED: 'neutral',
    QUEUED: 'neutral',
    PROCESSING: 'neutral',
    COMPLETED: 'success',
    FAILED: 'error',
    REQUIRES_REVIEW: 'warning',
  };

export function AiProcessingBadge({ status }: { status: AiProcessingStatus }) {
  return <Badge tone={AI_PROCESSING_TONE[status]}>{AI_PROCESSING_LABELS[status]}</Badge>;
}

/**
 * Confidence as a BAND, never the raw number.
 *
 * The float is available on the row and is deliberately not shown: a model's
 * self-reported probability is not calibrated against whether it was right, and
 * "0.87" reads as a measurement. A band communicates the only thing the value
 * genuinely supports - roughly how much to trust it - without implying
 * precision that does not exist.
 */
const BAND_LABELS: Record<AiConfidenceBand, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
};

const BAND_TONE: Record<AiConfidenceBand, 'neutral' | 'success' | 'warning'> = {
  HIGH: 'success',
  MEDIUM: 'neutral',
  LOW: 'warning',
};

export function AiConfidenceBadge({ band }: { band: AiConfidenceBand }) {
  return <Badge tone={BAND_TONE[band]}>{BAND_LABELS[band]}</Badge>;
}

/**
 * The standing notice that sits above any block of AI text.
 *
 * Present on every AI surface rather than shown once per page: somebody who
 * scrolled straight to a summary must still meet it.
 */
export function AiDisclaimer({ children }: { children?: ReactNode }) {
  return (
    <p className="ai-disclaimer" role="note">
      <strong>AI-generated.</strong>{' '}
      {children ??
        'Produced by a language model from what the citizen wrote. It may be wrong or incomplete. The original submission is the record.'}
    </p>
  );
}
