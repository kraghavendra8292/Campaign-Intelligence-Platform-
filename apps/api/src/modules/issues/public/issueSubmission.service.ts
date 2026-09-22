import { ISSUE_LIMITS, isQrCodeIdentifier, type IssueSource, type SubmissionType } from '@rk/types';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { getEnv } from '../../../config/env';
import { auditService } from '../../audit/audit.service';
import { enqueueIssue } from '../../ai/aiQueue';
import { enqueueNotification } from '../../communication/notificationQueue';
import { issueTrackingToken } from '../../communication/shared/trackingToken';
import { getAttemptLimiter } from '../../auth/rateLimiter';
import { publicTenantService } from '../../content/public/publicTenant.service';
import {
  generateReferenceNumber,
  optionalCoordinate,
  optionalEmail,
  optionalPhone,
  optionalText,
  requireDescription,
  requireTitle,
} from '../shared/issueGuards';

/**
 * Public submission.
 *
 * The only write path on this platform open to somebody with no account, which
 * shapes every decision in it:
 *
 *  - The TENANT comes from the public site being viewed, never from a client
 *    field that could name a different organisation.
 *  - Rate limiting happens FIRST, before any validation or database work, so a
 *    flood is shed cheaply.
 *  - Errors are written for a person standing next to a broken drain, and never
 *    reveal anything about the system.
 *  - Nothing about the submitter is stored except what they typed into the
 *    contact fields on purpose.
 *
 * WHAT THIS DOES NOT DO: it does not score, classify, rank or characterise the
 * person submitting. It records what they said and gives them a reference.
 */

export interface SubmitIssueInput {
  readonly organizationSlug?: string | null;
  readonly type: SubmissionType;
  readonly title: string;
  readonly description: string;
  readonly categoryKey?: string | null;

  readonly ward?: string | null;
  readonly locality?: string | null;
  readonly area?: string | null;
  readonly addressDescription?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;

  readonly isAnonymous?: boolean | null;
  readonly contactName?: string | null;
  readonly contactPhone?: string | null;
  readonly contactEmail?: string | null;
  readonly consentGiven?: boolean | null;

  /** Public QR identifier the citizen arrived through, if any. */
  readonly qrCode?: string | null;
  readonly attachments?: ReadonlyArray<{ id: string; claimToken: string }> | null;
}

export interface SubmissionContext {
  readonly ipAddress: string | null;
  readonly headerSlug?: string | undefined;
  readonly host?: string | undefined;
  readonly correlationId: string;
}

export interface SubmissionReceipt {
  readonly referenceNumber: string;
  readonly type: SubmissionType;
  readonly submittedAt: Date;
  readonly contactProvided: boolean;
  /**
   * Phase 8 tracking secret, returned EXACTLY ONCE and never again.
   *
   * Only its digest is stored, so this is not recoverable by us or by anybody
   * who reads the database. A citizen who loses it keeps read-only status
   * lookup by reference; what it unlocks is following the issue and sending
   * follow-up, both of which write.
   */
  readonly trackingToken: string;
}

/**
 * Resolves QR attribution.
 *
 * The citizen's browser carries the code forward from the Phase 4 redirect. It
 * is verified against the SAME tenant before use, so a code from another
 * organisation - or an invented one - simply yields no attribution rather than
 * cross-linking two campaigns' data. Attribution failure is never an error: the
 * submission matters more than knowing which poster it came from.
 */
async function resolveAttribution(
  organizationId: string,
  rawCode: string | null | undefined,
): Promise<{ source: IssueSource; campaignId: string | null; qrCodeId: string | null }> {
  const code = rawCode?.trim().toUpperCase();

  if (!code || !isQrCodeIdentifier(code)) {
    return { source: 'DIRECT_WEBSITE', campaignId: null, qrCodeId: null };
  }

  const qr = await prisma.qrCode.findFirst({
    where: { code, organizationId },
    select: { id: true, campaignId: true },
  });

  if (!qr) {
    return { source: 'DIRECT_WEBSITE', campaignId: null, qrCodeId: null };
  }

  return { source: 'QR', campaignId: qr.campaignId, qrCodeId: qr.id };
}

export const issueSubmissionService = {
  /**
   * Accepts one submission.
   *
   * Ordered so the cheapest rejection happens first: rate limit, then shape
   * validation, then the tenant lookup, then the write.
   */
  async submit(input: SubmitIssueInput, context: SubmissionContext): Promise<SubmissionReceipt> {
    const env = getEnv();

    // ---- 1. Shed abuse before doing any work ------------------------------
    //
    // Keyed on IP alone. There is no account to key on, and keying on anything
    // derived from the submission would let an attacker rotate their way around
    // it by varying the text. The budget is per window and deliberately
    // generous enough for a household or an internet cafe behind one NAT.
    const limiter = getAttemptLimiter();
    const key = `issue-submit:${context.ipAddress ?? 'unknown'}`;
    const attempt = await limiter.consume(
      key,
      env.ISSUE_SUBMIT_MAX_PER_WINDOW,
      env.ISSUE_SUBMIT_WINDOW_MS,
    );

    if (!attempt.allowed) {
      throw AppError.rateLimited(
        'You have sent several submissions already. Please try again in a little while.',
      );
    }

    // ---- 2. Validate what the citizen typed -------------------------------
    const title = requireTitle(input.title);
    const description = requireDescription(input.description);

    const isAnonymous = input.isAnonymous ?? true;

    // Contact fields are only READ when the citizen chose not to be anonymous.
    // The server clears them rather than trusting the client to have done so -
    // a form bug that left a phone number in a hidden field would otherwise
    // store personal data the citizen believed they had withheld.
    const contactName = isAnonymous
      ? null
      : optionalText(input.contactName, 'contactName', ISSUE_LIMITS.contactNameMax);
    const contactPhone = isAnonymous ? null : optionalPhone(input.contactPhone);
    const contactEmail = isAnonymous ? null : optionalEmail(input.contactEmail);

    const hasContact = Boolean(contactName ?? contactPhone ?? contactEmail);

    // Consent is required only where there is personal data to consent to.
    // Demanding a tick from an anonymous reporter would be theatre.
    if (hasContact && input.consentGiven !== true) {
      throw AppError.validation(
        'Please confirm the team may use your contact details to reply to you.',
        { details: { field: 'consentGiven' } },
      );
    }

    // ---- 3. Resolve the tenant from the site being viewed -----------------
    const tenant = await publicTenantService.resolve({
      organizationSlug: input.organizationSlug ?? null,
      headerSlug: context.headerSlug,
      host: context.host,
    });

    // ---- 4. Category, scoped to that tenant -------------------------------
    let categoryId: string | null = null;
    if (input.categoryKey) {
      const category = await prisma.issueCategory.findFirst({
        where: { organizationId: tenant.organizationId, key: input.categoryKey, isActive: true },
        select: { id: true },
      });

      if (!category) {
        throw AppError.validation('Please choose a category from the list.', {
          details: { field: 'categoryKey' },
        });
      }
      categoryId = category.id;
    }

    const attribution = await resolveAttribution(tenant.organizationId, input.qrCode);

    // ---- 5. Claim any uploaded attachments --------------------------------
    const attachmentIds = await claimAttachments(tenant.organizationId, input.attachments ?? []);

    // ---- 6. Write -----------------------------------------------------------
    //
    // One transaction, so a submission never exists without its opening history
    // entry - the citizen's own event must be the first line of the timeline.
    const now = new Date();
    const referenceNumber = await allocateReference(input.type, now);

    // Generated here so the plaintext exists only in this function's scope and
    // in the response. Only the digest reaches the database.
    const tracking = issueTrackingToken();

    const issue = await prisma.$transaction(async (tx) => {
      const created = await tx.issue.create({
        data: {
          organizationId: tenant.organizationId,
          referenceNumber,
          trackingTokenHash: tracking.hash,
          trackingTokenIssuedAt: now,
          type: input.type,
          title,
          description,
          categoryId,
          source: attribution.source,
          campaignId: attribution.campaignId,
          qrCodeId: attribution.qrCodeId,
          ward: optionalText(input.ward, 'ward', ISSUE_LIMITS.locationTextMax),
          locality: optionalText(input.locality, 'locality', ISSUE_LIMITS.locationTextMax),
          area: optionalText(input.area, 'area', ISSUE_LIMITS.locationTextMax),
          addressDescription: optionalText(
            input.addressDescription,
            'addressDescription',
            ISSUE_LIMITS.addressMax,
          ),
          latitude: optionalCoordinate(input.latitude, 'latitude', 90),
          longitude: optionalCoordinate(input.longitude, 'longitude', 180),
          isAnonymous: !hasContact,
          contactName,
          contactPhone,
          contactEmail,
          consentGiven: hasContact,
          consentAt: hasContact ? now : null,
          submittedAt: now,
        },
        select: { id: true, referenceNumber: true, type: true, submittedAt: true },
      });

      await tx.issueHistory.create({
        data: {
          organizationId: tenant.organizationId,
          issueId: created.id,
          action: 'SUBMITTED',
          newStatus: 'SUBMITTED',
          // No `performedByUserId`: a member of the public is not a user, and
          // there is deliberately nothing here to attribute this to.
        },
      });

      if (attachmentIds.length > 0) {
        await tx.issueAttachment.updateMany({
          where: { id: { in: attachmentIds }, organizationId: tenant.organizationId },
          // The claim token is cleared once used, so a captured token cannot be
          // replayed to attach the same file to a second submission.
          data: { issueId: created.id, claimToken: null },
        });
      }

      return created;
    });

    // Audited with a NULL actor. The event is worth a durable tenant record;
    // the submitter is not being tracked, and nothing identifying goes in.
    await auditService.record({
      action: 'ISSUE_SUBMITTED',
      organizationId: tenant.organizationId,
      actorUserId: null,
      entityType: 'Issue',
      entityId: issue.id,
      metadata: {
        reference: issue.referenceNumber,
        type: issue.type,
        source: attribution.source,
        contactProvided: hasContact,
      },
      correlationId: context.correlationId,
    });

    /**
     * Phase 6 hand-off. The ONLY line of this phase in the submission path.
     *
     * Read what it does not do. It is not awaited, it returns void, it catches
     * everything internally, and it runs AFTER the transaction has committed
     * and the audit record is written - the citizen's submission is already
     * durable and their reference number already allocated before this is
     * reached. When AI is disabled, unconfigured or saturated it is a no-op.
     *
     * So there is no state of the AI subsystem, including complete absence of
     * it, that can fail, slow or alter a citizen reporting a problem. That is a
     * hard product requirement, and keeping the integration to one
     * fire-and-forget call is what makes it inspectable rather than merely
     * intended.
     */
    enqueueIssue(issue.id, context.correlationId ?? null);

    /**
     * Phase 8: acknowledge receipt to a citizen who asked to be told.
     *
     * Same fire-and-forget contract as the Phase 6 AI hand-off directly above -
     * after the commit, never awaited, no-op when notifications are disabled.
     * In practice this sends nothing at submission time, because a subscription
     * is created afterwards on the tracking page; it is here so the event
     * exists for a deployment that later pre-subscribes from the form.
     */
    enqueueNotification({
      issueId: issue.id,
      event: 'ISSUE_RECEIVED',
      subject: issue.referenceNumber,
      correlationId: context.correlationId,
    });

    return {
      referenceNumber: issue.referenceNumber,
      type: issue.type,
      submittedAt: issue.submittedAt,
      contactProvided: hasContact,
      trackingToken: tracking.token,
    };
  },
};

/**
 * Allocates an unused reference.
 *
 * Retries on collision rather than trusting the odds. Thirty-two to the eighth
 * is a large space, but "large" is not "unique", and the unique index is the
 * real guarantee - this loop only avoids surfacing it to a citizen as a failed
 * submission.
 */
async function allocateReference(type: SubmissionType, now: Date): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateReferenceNumber(type, now);
    const clash = await prisma.issue.findUnique({
      where: { referenceNumber: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }

  throw AppError.internal('Your submission could not be completed. Please try again.');
}

/**
 * Attaches pending uploads to the submission being created.
 *
 * Each requires BOTH its id and the claim token handed only to whoever uploaded
 * it. Without the token, one anonymous visitor could guess an id and staple
 * another visitor's photograph - possibly of their home - to their own report.
 *
 * An attachment that does not verify is dropped silently rather than failing
 * the submission: the words the citizen wrote are worth more than the picture,
 * and a stale token after a slow form fill should not lose their report.
 */
async function claimAttachments(
  organizationId: string,
  requested: ReadonlyArray<{ id: string; claimToken: string }>,
): Promise<string[]> {
  if (requested.length === 0) return [];

  if (requested.length > ISSUE_LIMITS.maxAttachments) {
    throw AppError.validation(`Please attach no more than ${ISSUE_LIMITS.maxAttachments} files.`, {
      details: { field: 'attachments', limit: ISSUE_LIMITS.maxAttachments },
    });
  }

  const claimed: string[] = [];

  for (const candidate of requested) {
    const row = await prisma.issueAttachment.findFirst({
      where: {
        id: candidate.id,
        organizationId,
        issueId: null,
        claimToken: candidate.claimToken,
      },
      select: { id: true },
    });

    if (row) claimed.push(row.id);
  }

  return claimed;
}
