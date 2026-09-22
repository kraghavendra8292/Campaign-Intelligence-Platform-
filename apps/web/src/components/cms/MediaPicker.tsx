import { useCallback, useRef, useState } from 'react';
import { Button } from '@rk/ui';
import { apiBaseUrl } from '../../config/env';
import { tokenStore, organizationStore } from '../../features/auth/authClient';
import { TENANT_HEADER } from '@rk/config';
import { useCmsQuery } from '../../features/cms/useCms';
import { CMS_MEDIA } from '../../features/cms/cmsQueries';

/**
 * Media library picker and uploader.
 *
 * Upload goes over REST (`POST /media/upload`) rather than GraphQL because
 * multipart through GraphQL needs a protocol extension, while `FormData` works
 * natively in every browser.
 *
 * Client-side type and size checks exist for fast feedback only. The server
 * re-validates by inspecting magic bytes, so a user bypassing this dialog gains
 * nothing.
 */

export interface MediaAsset {
  id: string;
  kind: 'IMAGE' | 'DOCUMENT' | 'VIDEO_LINK';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  caption: string | null;
  createdAt: string;
}

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';
const MAX_CLIENT_BYTES = 20 * 1024 * 1024;

async function uploadFile(file: File, altText: string): Promise<MediaAsset> {
  const body = new FormData();
  body.append('file', file);
  if (altText) body.append('altText', altText);

  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  const organizationId = organizationStore.get();

  if (token) headers.Authorization = `Bearer ${token}`;
  if (organizationId) headers[TENANT_HEADER] = organizationId;

  const response = await fetch(`${apiBaseUrl}/media/upload`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body,
  });

  const payload = (await response.json()) as {
    media?: MediaAsset;
    error?: { message: string };
  };

  if (!response.ok || !payload.media) {
    throw new Error(payload.error?.message ?? 'The upload failed.');
  }

  return payload.media;
}

export function MediaPicker({
  label,
  selectedId,
  onSelect,
  kind = 'IMAGE',
}: {
  label: string;
  selectedId: string | null;
  onSelect: (mediaId: string | null) => void;
  kind?: 'IMAGE' | 'DOCUMENT';
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altText, setAltText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const { state, refetch } = useCmsQuery<{ cmsMedia: { nodes: MediaAsset[] } }>(
    CMS_MEDIA,
    { first: 48, kind },
    { skip: !open },
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);

      if (file.size > MAX_CLIENT_BYTES) {
        setError('That file is larger than 20 MB.');
        return;
      }

      // Alt text is required for images at the point of use: an image without
      // it is invisible to a screen reader, and asking later never happens.
      if (kind === 'IMAGE' && altText.trim().length === 0) {
        setError('Describe the image first (alt text) so it is accessible.');
        return;
      }

      setUploading(true);
      try {
        const asset = await uploadFile(file, altText.trim());
        onSelect(asset.id);
        setAltText('');
        setOpen(false);
        refetch();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The upload failed.');
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [altText, kind, onSelect, refetch],
  );

  return (
    <div className="media-picker">
      <span className="cms-field__label">{label}</span>

      <div className="media-picker__current">
        {selectedId ? (
          <>
            <img className="media-picker__thumb" src={`${apiBaseUrl}/media/${selectedId}`} alt="" />
            <Button variant="secondary" size="sm" onClick={() => onSelect(null)}>
              Remove
            </Button>
          </>
        ) : (
          <p className="media-picker__empty">No image selected.</p>
        )}

        <Button variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}>
          {open ? 'Close library' : 'Choose or upload'}
        </Button>
      </div>

      {open ? (
        <div className="media-picker__panel">
          <div className="media-picker__upload">
            <label className="cms-field__label" htmlFor="media-alt">
              Image description (alt text)
            </label>
            <input
              id="media-alt"
              className="rk-input rk-input--md"
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              placeholder="Describe what the image shows"
            />

            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED}
              disabled={uploading}
              aria-label="Choose a file to upload"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />

            {uploading ? <p className="media-picker__status">Uploading…</p> : null}
            {error ? (
              <p className="media-picker__error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          {state.status === 'success' && state.data.cmsMedia.nodes.length > 0 ? (
            <ul className="media-picker__grid">
              {state.data.cmsMedia.nodes.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className={`media-picker__item${
                      asset.id === selectedId ? ' media-picker__item--selected' : ''
                    }`}
                    onClick={() => {
                      onSelect(asset.id);
                      setOpen(false);
                    }}
                  >
                    <img src={`${apiBaseUrl}/media/${asset.id}`} alt={asset.altText ?? ''} />
                    <span className="media-picker__name">{asset.originalName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : state.status === 'success' ? (
            <p className="media-picker__empty">
              Nothing in the library yet. Upload an image above.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { uploadFile };
