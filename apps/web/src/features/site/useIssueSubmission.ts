import { useCallback, useEffect, useState } from 'react';
import { ApiError, graphqlRequest } from '../auth/authClient';
import { apiBaseUrl } from '../../config/env';

/**
 * Public submission plumbing.
 *
 * Kept out of the form component so the page renders and the logic is testable
 * separately - the architecture rule the whole project follows: React draws,
 * services decide.
 *
 * Two things here are unusual and both are deliberate:
 *
 *  1. The QR code that brought the visitor is remembered in `sessionStorage`,
 *     not in the URL. A citizen lands on `/work/road-project?rk_qr=…`, reads
 *     it, then navigates to the feedback page - by which point the query string
 *     is long gone. Session scope means it is forgotten when the tab closes and
 *     never follows anybody between visits.
 *  2. Attachments upload BEFORE the submission, over REST. A 5 MB photograph
 *     cannot travel through a GraphQL mutation, and the claim token returned by
 *     the upload is what proves the file is the submitter's own.
 */

const QR_STORAGE_KEY = 'rk.qr.referrer';
const QR_PARAM = 'rk_qr';

/**
 * Captures the QR code from the URL, once, and remembers it for this tab.
 *
 * Runs on every public page via the site layout, because the scan lands on a
 * content page rather than on the form.
 */
export function useQrReferrerCapture(): void {
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get(QR_PARAM);
      if (code) window.sessionStorage.setItem(QR_STORAGE_KEY, code);
    } catch {
      // Private browsing or blocked storage: attribution is a nicety, and
      // losing it must never affect anything the citizen is trying to do.
    }
  }, []);
}

export function readQrReferrer(): string | null {
  try {
    return window.sessionStorage.getItem(QR_STORAGE_KEY);
  } catch {
    return null;
  }
}

export interface UploadedAttachment {
  readonly id: string;
  readonly claimToken: string;
  readonly originalName: string;
  readonly sizeBytes: number;
}

/**
 * Uploads one file and returns its claim.
 *
 * Plain `fetch` with `FormData` rather than the GraphQL client: this is a
 * multipart POST to a REST endpoint, and it carries no credential because the
 * submitter has none.
 */
export async function uploadAttachment(
  file: File,
  organizationSlug: string | null,
): Promise<UploadedAttachment> {
  const body = new FormData();
  body.append('file', file);
  if (organizationSlug) body.append('organizationSlug', organizationSlug);

  const response = await fetch(`${apiBaseUrl}/public/issue-attachments`, {
    method: 'POST',
    body,
  });

  const payload = (await response.json()) as {
    attachment?: UploadedAttachment;
    error?: { message?: string };
  };

  if (!response.ok || !payload.attachment) {
    throw new Error(payload.error?.message ?? 'That file could not be added.');
  }

  return payload.attachment;
}

const SUBMIT_ISSUE = /* GraphQL */ `
  mutation SubmitIssue($input: SubmitIssueInput!) {
    submitIssue(input: $input) {
      referenceNumber
      type
      submittedAt
      contactProvided
    }
  }
`;

export interface SubmissionReceipt {
  readonly referenceNumber: string;
  readonly type: string;
  readonly submittedAt: string;
  readonly contactProvided: boolean;
}

export type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'done'; receipt: SubmissionReceipt }
  | { status: 'error'; message: string; field: string | null };

export function useIssueSubmission() {
  const [state, setState] = useState<SubmitState>({ status: 'idle' });

  const submit = useCallback(async (input: Record<string, unknown>): Promise<boolean> => {
    setState({ status: 'submitting' });

    try {
      const result = await graphqlRequest<{ submitIssue: SubmissionReceipt }>(SUBMIT_ISSUE, {
        variables: { input },
        // The public site is anonymous; a 401 here must not trigger the admin
        // token-refresh cycle.
        skipAuthRetry: true,
      });

      setState({ status: 'done', receipt: result.submitIssue });
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        // The API names the offending field, so the message can be shown beside
        // the input rather than as a banner the citizen has to decode.
        const field = typeof error.details?.field === 'string' ? error.details.field : null;
        setState({ status: 'error', message: error.message, field });
        return false;
      }

      setState({
        status: 'error',
        message: 'Your submission could not be sent. Please check your connection and try again.',
        field: null,
      });
      return false;
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, submit, reset };
}
