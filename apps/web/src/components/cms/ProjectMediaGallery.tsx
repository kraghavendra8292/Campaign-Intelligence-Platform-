import { useCallback, useId, useRef, useState } from 'react';
import { Button, Icon } from '@rk/ui';
import { apiBaseUrl } from '../../config/env';
import { useCmsQuery } from '../../features/cms/useCms';
import { CMS_MEDIA } from '../../features/cms/cmsQueries';
import { uploadFile, type MediaAsset } from './MediaPicker';

/**
 * Multi-image editor for a project's gallery / before / after sets.
 *
 * Cover stays on MediaPicker (one hero). These roles are the supporting
 * evidence the public work page shows - so add and remove must be explicit
 * and reversible before save.
 */

export type ProjectMediaRole = 'GALLERY' | 'BEFORE' | 'AFTER';

export interface ProjectMediaItem {
  /** Client-side key; server ids are only used when loading existing rows. */
  key: string;
  mediaId: string;
  role: ProjectMediaRole;
  caption: string;
  altText?: string | null;
}

const ROLE_COPY: Record<ProjectMediaRole, { title: string; hint: string }> = {
  GALLERY: {
    title: 'Gallery',
    hint: 'Extra photos shown on the public project page.',
  },
  BEFORE: {
    title: 'Before photos',
    hint: 'Condition before the work started.',
  },
  AFTER: {
    title: 'After photos',
    hint: 'Condition after the work finished.',
  },
};

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_CLIENT_BYTES = 20 * 1024 * 1024;

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `pm-${keyCounter}`;
}

export function ProjectMediaGallery({
  items,
  onChange,
}: {
  items: ProjectMediaItem[];
  onChange: (next: ProjectMediaItem[]) => void;
}) {
  return (
    <div className="project-media-gallery">
      {(['GALLERY', 'BEFORE', 'AFTER'] as const).map((role) => (
        <MediaRoleSection
          key={role}
          role={role}
          items={items.filter((item) => item.role === role)}
          onAdd={(entry) => onChange([...items, entry])}
          onRemove={(key) => onChange(items.filter((item) => item.key !== key))}
          onCaption={(key, caption) =>
            onChange(items.map((item) => (item.key === key ? { ...item, caption } : item)))
          }
        />
      ))}
    </div>
  );
}

function MediaRoleSection({
  role,
  items,
  onAdd,
  onRemove,
  onCaption,
}: {
  role: ProjectMediaRole;
  items: ProjectMediaItem[];
  onAdd: (item: ProjectMediaItem) => void;
  onRemove: (key: string) => void;
  onCaption: (key: string, caption: string) => void;
}) {
  const copy = ROLE_COPY[role];
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altText, setAltText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const altId = useId();

  const { state, refetch } = useCmsQuery<{ cmsMedia: { nodes: MediaAsset[] } }>(
    CMS_MEDIA,
    { first: 48, kind: 'IMAGE' },
    { skip: !open },
  );

  const attach = useCallback(
    (asset: Pick<MediaAsset, 'id' | 'altText'>) => {
      onAdd({
        key: nextKey(),
        mediaId: asset.id,
        role,
        caption: '',
        altText: asset.altText,
      });
      setOpen(false);
      setAltText('');
      setError(null);
    },
    [onAdd, role],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_CLIENT_BYTES) {
        setError('That file is larger than 20 MB.');
        return;
      }
      if (altText.trim().length === 0) {
        setError('Describe the image first (alt text) so it is accessible.');
        return;
      }

      setUploading(true);
      try {
        const asset = await uploadFile(file, altText.trim());
        attach(asset);
        refetch();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The upload failed.');
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [altText, attach, refetch],
  );

  return (
    <section className="project-media-role">
      <header className="project-media-role__header">
        <div>
          <h3 className="project-media-role__title">{copy.title}</h3>
          <p className="project-media-role__hint">{copy.hint}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close library' : 'Add image'}
        </Button>
      </header>

      {items.length > 0 ? (
        <ul className="project-media-role__list">
          {items.map((item) => (
            <li key={item.key} className="project-media-role__item">
              <img
                className="project-media-role__thumb"
                src={`${apiBaseUrl}/media/${item.mediaId}`}
                alt={item.altText ?? ''}
              />
              <div className="project-media-role__fields">
                <label>
                  <span className="visually-hidden">Caption</span>
                  <input
                    className="rk-input rk-input--sm"
                    type="text"
                    value={item.caption}
                    placeholder="Caption (optional)"
                    maxLength={400}
                    onChange={(event) => onCaption(item.key, event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="project-media-role__remove"
                  aria-label="Remove image"
                  onClick={() => onRemove(item.key)}
                >
                  <Icon name="trash" size={1} />
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="project-media-role__empty">No images yet.</p>
      )}

      {open ? (
        <div className="media-picker__panel">
          <div className="media-picker__upload">
            <label className="cms-field__label" htmlFor={altId}>
              Image description (alt text)
            </label>
            <input
              id={altId}
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
              aria-label={`Upload ${copy.title.toLowerCase()} image`}
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
                    className="media-picker__item"
                    onClick={() => attach(asset)}
                  >
                    <img src={`${apiBaseUrl}/media/${asset.id}`} alt={asset.altText ?? ''} />
                    <span className="media-picker__name">{asset.originalName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : state.status === 'success' ? (
            <p className="media-picker__empty">Nothing in the library yet. Upload an image above.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
