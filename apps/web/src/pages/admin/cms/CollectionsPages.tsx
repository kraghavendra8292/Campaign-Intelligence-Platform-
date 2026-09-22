import { useState } from 'react';
import { CONTENT_CATEGORIES } from '@rk/types';
import { Button } from '@rk/ui';
import { apiBaseUrl } from '../../../config/env';
import { useCmsMutation, useCmsQuery } from '../../../features/cms/useCms';
import { useCmsLocale } from '../../../features/cms/CmsLocaleContext';
import {
  CMS_ALBUMS,
  CMS_MEDIA,
  CMS_PRIORITIES,
  CMS_VIDEOS,
  CREATE_ALBUM,
  CREATE_PRIORITY,
  CREATE_VIDEO,
  DELETE_ALBUM,
  DELETE_MEDIA,
  DELETE_PRIORITY,
  DELETE_VIDEO,
  REORDER_PRIORITIES,
  TRANSITION_ALBUM,
  TRANSITION_PRIORITY,
  TRANSITION_VIDEO,
  UPDATE_MEDIA,
  UPDATE_PRIORITY,
} from '../../../features/cms/cmsQueries';
import {
  CmsBoundary,
  CmsCard,
  CmsPageHeader,
  ConfirmDialog,
  DataTable,
  IfPermitted,
  ToastRegion,
  useToasts,
} from '../../../components/cms/CmsShell';
import { FormError, SelectField, TextAreaField, TextField } from '../../../components/cms/fields';
import { MediaPicker } from '../../../components/cms/MediaPicker';
import { PublishControls, StatusPill } from './shared';
import { formatDate } from '../../../lib/format';

/**
 * Collections: priorities, gallery albums, videos and the media library.
 *
 * These are short ordered lists rather than paginated archives, so each screen
 * combines the list and an inline "add" form - opening a separate page to add a
 * one-line priority would be more clicks than the task deserves.
 */

const ICON_OPTIONS = [
  'road',
  'water',
  'school',
  'health',
  'work',
  'agriculture',
  'services',
  'environment',
  'community',
].map((value) => ({ value, label: value }));

interface PriorityRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconKey: string | null;
  category: string;
  displayOrder: number;
  status: string;
}

export function CmsPrioritiesPage() {
  const { toasts, success, failure } = useToasts();
  const [pendingDelete, setPendingDelete] = useState<PriorityRow | null>(null);
  // A single form serves both adding and editing: `editingId` decides which
  // mutation runs, so there is one set of inputs to keep correct.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    iconKey: 'road',
    category: 'INFRASTRUCTURE',
  });

  const resetDraft = () => {
    setEditingId(null);
    setDraft({ title: '', description: '', iconKey: 'road', category: 'INFRASTRUCTURE' });
  };

  const { locale } = useCmsLocale();
  const { state, refetch } = useCmsQuery<{ cmsPriorities: PriorityRow[] }>(CMS_PRIORITIES, {
    locale,
  });

  const create = useCmsMutation<unknown, Record<string, unknown>>(CREATE_PRIORITY);
  const update = useCmsMutation<unknown, Record<string, unknown>>(UPDATE_PRIORITY);
  const transition = useCmsMutation<unknown, { id: string; action: string }>(TRANSITION_PRIORITY);
  const reorder = useCmsMutation<unknown, { orderedIds: string[] }>(REORDER_PRIORITIES);
  const remove = useCmsMutation<unknown, { id: string }>(DELETE_PRIORITY);

  /** Moves one item and submits the whole new order in a single call. */
  const move = async (rows: PriorityRow[], index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;

    const next = [...rows];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);

    const result = await reorder.run({ orderedIds: next.map((row) => row.id) });
    if (result) {
      success('Order updated.');
      refetch();
    } else {
      failure(reorder.state.error ?? 'Could not reorder.');
    }
  };

  return (
    <div className="cms-page">
      <CmsPageHeader
        title="Priorities"
        description="Priority areas shown on the vision page and the homepage."
        localized
      />

      <IfPermitted permission="PRIORITY_CREATE">
        <CmsCard title={editingId ? 'Edit priority' : 'Add a priority'}>
          <FormError message={editingId ? update.state.error : create.state.error} />
          <div className="cms-inline-form">
            <TextField
              id="title"
              label="Title"
              required
              value={draft.title}
              errors={create.state.fieldErrors}
              onChange={(value) => setDraft((d) => ({ ...d, title: value }))}
            />
            <TextAreaField
              id="description"
              label="Description"
              maxLength={1000}
              value={draft.description}
              onChange={(value) => setDraft((d) => ({ ...d, description: value }))}
            />
            <SelectField
              id="iconKey"
              label="Icon"
              value={draft.iconKey}
              options={ICON_OPTIONS}
              onChange={(value) => setDraft((d) => ({ ...d, iconKey: value }))}
            />
            <SelectField
              id="category"
              label="Category"
              value={draft.category}
              options={CONTENT_CATEGORIES.map((value) => ({
                value,
                label: value.replace('_', ' ').toLowerCase(),
              }))}
              onChange={(value) => setDraft((d) => ({ ...d, category: value }))}
            />
            <div className="cms-form-actions__primary">
              <Button
                type="button"
                variant="primary"
                isLoading={create.state.submitting || update.state.submitting}
                onClick={async () => {
                  const input = {
                    // A translation is a sibling row: create it in the
                    // language currently being edited.
                    locale,
                    title: draft.title,
                    description: draft.description || null,
                    iconKey: draft.iconKey,
                    category: draft.category,
                  };

                  const result = editingId
                    ? await update.run({ id: editingId, input })
                    : await create.run({ input });

                  if (result) {
                    resetDraft();
                    success(editingId ? 'Priority updated.' : 'Priority created as a draft.');
                    refetch();
                  } else {
                    failure(
                      (editingId ? update.state.error : create.state.error) ?? 'Could not save.',
                    );
                  }
                }}
              >
                {editingId ? 'Save changes' : 'Add priority'}
              </Button>

              {editingId ? (
                <Button type="button" variant="secondary" onClick={resetDraft}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </CmsCard>
      </IfPermitted>

      <CmsBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.cmsPriorities.length === 0}
        emptyMessage="No priorities yet."
      >
        {(data) => (
          <DataTable
            caption="Priorities"
            rows={data.cmsPriorities}
            columns={[
              { key: 'title', header: 'Title', render: (row) => row.title },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusPill value={row.status} />,
              },
              {
                key: 'order',
                header: 'Order',
                secondary: true,
                render: (row) => String(row.displayOrder),
              },
            ]}
            actions={(row) => {
              const index = data.cmsPriorities.findIndex((item) => item.id === row.id);

              return (
                <div className="cms-row-actions">
                  <IfPermitted permission="PRIORITY_UPDATE">
                    <button
                      type="button"
                      className="cms-row-actions__link"
                      onClick={() => {
                        setEditingId(row.id);
                        setDraft({
                          title: row.title,
                          description: row.description ?? '',
                          iconKey: row.iconKey ?? 'road',
                          category: row.category,
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="cms-row-actions__link"
                      aria-label={`Move ${row.title} up`}
                      disabled={index === 0}
                      onClick={() => void move(data.cmsPriorities, index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="cms-row-actions__link"
                      aria-label={`Move ${row.title} down`}
                      disabled={index === data.cmsPriorities.length - 1}
                      onClick={() => void move(data.cmsPriorities, index, 1)}
                    >
                      ↓
                    </button>
                  </IfPermitted>

                  <PublishControls
                    status={row.status}
                    publishPermission="PRIORITY_PUBLISH"
                    busy={transition.state.submitting}
                    onTransition={async (action) => {
                      const result = await transition.run({ id: row.id, action });
                      if (result) {
                        success('Updated.');
                        refetch();
                      } else {
                        failure(transition.state.error ?? 'Could not update.');
                      }
                    }}
                  />

                  <IfPermitted permission="PRIORITY_DELETE">
                    <button
                      type="button"
                      className="cms-row-actions__danger"
                      onClick={() => setPendingDelete(row)}
                    >
                      Delete
                    </button>
                  </IfPermitted>
                </div>
              );
            }}
          />
        )}
      </CmsBoundary>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this priority?"
        message={`“${pendingDelete?.title ?? ''}” will be permanently removed.`}
        busy={remove.state.submitting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const result = await remove.run({ id: pendingDelete.id });
          setPendingDelete(null);
          if (result) {
            success('Deleted.');
            refetch();
          } else {
            failure(remove.state.error ?? 'Could not delete.');
          }
        }}
      />

      <ToastRegion toasts={toasts} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gallery: albums and videos
// ---------------------------------------------------------------------------

interface AlbumRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  items: Array<{ id: string; image: { id: string } }>;
}

interface VideoRow {
  id: string;
  slug: string;
  title: string;
  videoUrl: string;
  platform: string;
  status: string;
}

export function CmsGalleryPage() {
  const { toasts, success, failure } = useToasts();
  const [albumTitle, setAlbumTitle] = useState('');
  const [video, setVideo] = useState({ title: '', videoUrl: '', platform: 'YOUTUBE' });

  const { locale } = useCmsLocale();
  const albums = useCmsQuery<{ cmsAlbums: AlbumRow[] }>(CMS_ALBUMS, { locale });
  const videos = useCmsQuery<{ cmsVideos: VideoRow[] }>(CMS_VIDEOS, { locale });

  const createAlbum = useCmsMutation<unknown, Record<string, unknown>>(CREATE_ALBUM);
  const createVideo = useCmsMutation<unknown, Record<string, unknown>>(CREATE_VIDEO);
  const transitionAlbum = useCmsMutation<unknown, { id: string; action: string }>(TRANSITION_ALBUM);
  const transitionVideo = useCmsMutation<unknown, { id: string; action: string }>(TRANSITION_VIDEO);
  const deleteAlbum = useCmsMutation<unknown, { id: string }>(DELETE_ALBUM);
  const deleteVideo = useCmsMutation<unknown, { id: string }>(DELETE_VIDEO);

  return (
    <div className="cms-page">
      <CmsPageHeader
        title="Gallery"
        description="Photo albums and video links shown on the public gallery."
        localized
      />

      <IfPermitted permission="GALLERY_CREATE">
        <CmsCard title="Add a photo album">
          <FormError message={createAlbum.state.error} />
          <div className="cms-inline-form">
            <TextField
              id="albumTitle"
              label="Album title"
              required
              value={albumTitle}
              errors={createAlbum.state.fieldErrors}
              onChange={setAlbumTitle}
            />
            <Button
              type="button"
              variant="primary"
              isLoading={createAlbum.state.submitting}
              onClick={async () => {
                const result = await createAlbum.run({ input: { locale, title: albumTitle } });
                if (result) {
                  setAlbumTitle('');
                  success('Album created as a draft.');
                  albums.refetch();
                } else {
                  failure(createAlbum.state.error ?? 'Could not create.');
                }
              }}
            >
              Add album
            </Button>
          </div>
        </CmsCard>
      </IfPermitted>

      <CmsBoundary
        state={albums.state}
        refetch={albums.refetch}
        isEmpty={(data) => data.cmsAlbums.length === 0}
        emptyMessage="No albums yet."
      >
        {(data) => (
          <DataTable
            caption="Photo albums"
            rows={data.cmsAlbums}
            columns={[
              { key: 'title', header: 'Album', render: (row) => row.title },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusPill value={row.status} />,
              },
              {
                key: 'photos',
                header: 'Photos',
                secondary: true,
                render: (row) => String(row.items.length),
              },
            ]}
            actions={(row) => (
              <div className="cms-row-actions">
                <PublishControls
                  status={row.status}
                  publishPermission="GALLERY_PUBLISH"
                  busy={transitionAlbum.state.submitting}
                  onTransition={async (action) => {
                    const result = await transitionAlbum.run({ id: row.id, action });
                    if (result) {
                      success('Updated.');
                      albums.refetch();
                    } else {
                      failure(transitionAlbum.state.error ?? 'Could not update.');
                    }
                  }}
                />
                <IfPermitted permission="GALLERY_DELETE">
                  <button
                    type="button"
                    className="cms-row-actions__danger"
                    onClick={async () => {
                      const result = await deleteAlbum.run({ id: row.id });
                      if (result) {
                        success('Album deleted.');
                        albums.refetch();
                      } else {
                        failure(deleteAlbum.state.error ?? 'Could not delete.');
                      }
                    }}
                  >
                    Delete
                  </button>
                </IfPermitted>
              </div>
            )}
          />
        )}
      </CmsBoundary>

      <IfPermitted permission="GALLERY_CREATE">
        <CmsCard title="Add a video">
          <FormError message={createVideo.state.error} />
          <div className="cms-inline-form">
            <TextField
              id="videoTitle"
              label="Title"
              required
              value={video.title}
              errors={createVideo.state.fieldErrors}
              onChange={(value) => setVideo((v) => ({ ...v, title: value }))}
            />
            <TextField
              id="videoUrl"
              label="Video URL"
              required
              hint="YouTube or Vimeo links only."
              value={video.videoUrl}
              errors={createVideo.state.fieldErrors}
              onChange={(value) => setVideo((v) => ({ ...v, videoUrl: value }))}
            />
            <SelectField
              id="platform"
              label="Platform"
              value={video.platform}
              options={[
                { value: 'YOUTUBE', label: 'YouTube' },
                { value: 'VIMEO', label: 'Vimeo' },
              ]}
              onChange={(value) => setVideo((v) => ({ ...v, platform: value }))}
            />
            <Button
              type="button"
              variant="primary"
              isLoading={createVideo.state.submitting}
              onClick={async () => {
                const result = await createVideo.run({ input: { locale, ...video } });
                if (result) {
                  setVideo({ title: '', videoUrl: '', platform: 'YOUTUBE' });
                  success('Video added as a draft.');
                  videos.refetch();
                } else {
                  failure(createVideo.state.error ?? 'Could not add the video.');
                }
              }}
            >
              Add video
            </Button>
          </div>
        </CmsCard>
      </IfPermitted>

      <CmsBoundary
        state={videos.state}
        refetch={videos.refetch}
        isEmpty={(data) => data.cmsVideos.length === 0}
        emptyMessage="No videos yet."
      >
        {(data) => (
          <DataTable
            caption="Videos"
            rows={data.cmsVideos}
            columns={[
              { key: 'title', header: 'Title', render: (row) => row.title },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusPill value={row.status} />,
              },
              {
                key: 'platform',
                header: 'Platform',
                secondary: true,
                render: (row) => row.platform,
              },
            ]}
            actions={(row) => (
              <div className="cms-row-actions">
                <PublishControls
                  status={row.status}
                  publishPermission="GALLERY_PUBLISH"
                  busy={transitionVideo.state.submitting}
                  onTransition={async (action) => {
                    const result = await transitionVideo.run({ id: row.id, action });
                    if (result) {
                      success('Updated.');
                      videos.refetch();
                    } else {
                      failure(transitionVideo.state.error ?? 'Could not update.');
                    }
                  }}
                />
                <IfPermitted permission="GALLERY_DELETE">
                  <button
                    type="button"
                    className="cms-row-actions__danger"
                    onClick={async () => {
                      const result = await deleteVideo.run({ id: row.id });
                      if (result) {
                        success('Video removed.');
                        videos.refetch();
                      } else {
                        failure(deleteVideo.state.error ?? 'Could not remove.');
                      }
                    }}
                  >
                    Delete
                  </button>
                </IfPermitted>
              </div>
            )}
          />
        )}
      </CmsBoundary>

      <ToastRegion toasts={toasts} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media library
// ---------------------------------------------------------------------------

interface MediaRow {
  id: string;
  kind: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
  createdAt: string;
}

export function CmsMediaPage() {
  const { toasts, success, failure } = useToasts();
  const [pendingDelete, setPendingDelete] = useState<MediaRow | null>(null);
  const [editing, setEditing] = useState<{ id: string; altText: string } | null>(null);

  const { state, refetch } = useCmsQuery<{ cmsMedia: { nodes: MediaRow[]; totalCount: number } }>(
    CMS_MEDIA,
    { first: 48 },
  );

  const update = useCmsMutation<unknown, { id: string; altText: string }>(UPDATE_MEDIA);
  const remove = useCmsMutation<unknown, { id: string }>(DELETE_MEDIA);

  return (
    <div className="cms-page">
      <CmsPageHeader
        title="Media library"
        description="Images and documents used across the site. Uploads are validated by content, not by file name."
      />

      <CmsCard title="Upload">
        {/* Reuses the picker purely as an uploader; selection is discarded. */}
        <MediaPicker label="Add a file" selectedId={null} onSelect={() => refetch()} />
      </CmsCard>

      <CmsBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.cmsMedia.nodes.length === 0}
        emptyMessage="Nothing in the library yet."
      >
        {(data) => (
          <DataTable
            caption="Media"
            rows={data.cmsMedia.nodes}
            columns={[
              {
                key: 'preview',
                header: 'File',
                render: (row) =>
                  row.kind === 'IMAGE' ? (
                    <img
                      className="cms-media-thumb"
                      src={`${apiBaseUrl}/media/${row.id}`}
                      alt={row.altText ?? ''}
                    />
                  ) : (
                    <span>{row.originalName}</span>
                  ),
              },
              { key: 'name', header: 'Name', render: (row) => row.originalName },
              {
                key: 'alt',
                header: 'Alt text',
                render: (row) => row.altText ?? <span className="cms-media-missing">Missing</span>,
              },
              {
                key: 'size',
                header: 'Size',
                secondary: true,
                render: (row) => `${Math.round(row.sizeBytes / 1024)} KB`,
              },
              {
                key: 'created',
                header: 'Added',
                secondary: true,
                render: (row) => formatDate(row.createdAt) ?? '—',
              },
            ]}
            actions={(row) => (
              <div className="cms-row-actions">
                <IfPermitted permission="MEDIA_UPDATE">
                  <button
                    type="button"
                    className="cms-row-actions__link"
                    onClick={() => setEditing({ id: row.id, altText: row.altText ?? '' })}
                  >
                    Edit alt text
                  </button>
                </IfPermitted>
                <IfPermitted permission="MEDIA_DELETE">
                  <button
                    type="button"
                    className="cms-row-actions__danger"
                    onClick={() => setPendingDelete(row)}
                  >
                    Delete
                  </button>
                </IfPermitted>
              </div>
            )}
          />
        )}
      </CmsBoundary>

      {editing ? (
        <CmsCard title="Edit alt text">
          <div className="cms-inline-form">
            <TextField
              id="altText"
              label="Alt text"
              hint="Describe what the image shows, for readers using a screen reader."
              value={editing.altText}
              onChange={(value) => setEditing({ ...editing, altText: value })}
            />
            <Button
              type="button"
              variant="primary"
              isLoading={update.state.submitting}
              onClick={async () => {
                const result = await update.run(editing);
                if (result) {
                  setEditing(null);
                  success('Alt text saved.');
                  refetch();
                } else {
                  failure(update.state.error ?? 'Could not save.');
                }
              }}
            >
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </CmsCard>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this file?"
        message="If the file is still used by any content, the deletion will be refused."
        busy={remove.state.submitting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const result = await remove.run({ id: pendingDelete.id });
          setPendingDelete(null);
          if (result) {
            success('File deleted.');
            refetch();
          } else {
            failure(remove.state.error ?? 'Could not delete.');
          }
        }}
      />

      <ToastRegion toasts={toasts} />
    </div>
  );
}
