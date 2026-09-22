import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CONTENT_CATEGORIES, type Permission } from '@rk/types';
import { Button, Icon } from '@rk/ui';
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
  IfPermitted,
  ToastRegion,
  useToasts,
} from '../../../components/cms/CmsShell';
import {
  ListKpiCard,
  ListKpiGrid,
  ListTableCard,
  ListToolbar,
} from '../../../components/cms/ListPro';
import { FormError, SelectField, TextAreaField, TextField } from '../../../components/cms/fields';
import { MediaPicker } from '../../../components/cms/MediaPicker';
import { useAdminI18n } from '../../../features/admin/AdminI18nContext';
import { StatusPill } from './shared';
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

function matchesSearch(haystack: string, query: string) {
  if (!query.trim()) return true;
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

export function CmsPrioritiesPage() {
  const { toasts, success, failure } = useToasts();
  const [pendingDelete, setPendingDelete] = useState<PriorityRow | null>(null);
  const [search, setSearch] = useState('');
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

  const allRows = state.status === 'success' ? state.data.cmsPriorities : [];
  const filteredRows = allRows.filter((row) =>
    matchesSearch(`${row.title} ${row.category} ${row.status}`, search),
  );
  const publishedCount = allRows.filter((row) => row.status === 'PUBLISHED').length;
  const refreshing = state.status === 'loading';

  return (
    <div className="cms-page list-page">
      <CmsPageHeader
        title="Priorities"
        description="Priority areas shown on the vision page and the homepage."
        localized
        backTo="/admin"
        backLabel="Back to dashboard"
      />

      {state.status === 'success' && allRows.length > 0 ? (
        <ListKpiGrid label="Priorities summary">
          <ListKpiCard
            label="Total priorities"
            value={allRows.length.toLocaleString()}
            hint="In this editing language"
          />
          <ListKpiCard
            label="Published"
            value={publishedCount.toLocaleString()}
            hint="Visible on the public site"
          />
        </ListKpiGrid>
      ) : null}

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

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchLabel="Search priorities"
        searchPlaceholder="Search priorities"
        onRefresh={() => void refetch()}
        refreshing={refreshing}
        busy={refreshing}
        hasFilters={Boolean(search.trim())}
        onClear={() => setSearch('')}
      />

      <CmsBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.cmsPriorities.length === 0}
        emptyMessage="No priorities yet."
      >
        {() => (
          <ListTableCard title="Priorities" count={filteredRows.length} countLabel="rows">
            <table className="list-table">
              <caption className="visually-hidden">Priorities</caption>
              <thead>
                <tr>
                  <th scope="col" className="list-table__actions-col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="list-table__secondary">
                    Order
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No priorities match this search.</td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const index = allRows.findIndex((item) => item.id === row.id);

                    return (
                      <tr key={row.id}>
                        <td className="list-table__actions-col">
                          <PriorityRowActions
                            row={row}
                            index={index}
                            total={allRows.length}
                            busy={transition.state.submitting || reorder.state.submitting}
                            onEdit={() => {
                              setEditingId(row.id);
                              setDraft({
                                title: row.title,
                                description: row.description ?? '',
                                iconKey: row.iconKey ?? 'road',
                                category: row.category,
                              });
                            }}
                            onMove={(direction) => void move(allRows, index, direction)}
                            onTransition={async (action) => {
                              const result = await transition.run({ id: row.id, action });
                              if (result) {
                                success('Updated.');
                                refetch();
                              } else {
                                failure(transition.state.error ?? 'Could not update.');
                              }
                            }}
                            onDelete={() => setPendingDelete(row)}
                          />
                        </td>
                        <td>{row.title}</td>
                        <td>
                          <StatusPill value={row.status} />
                        </td>
                        <td className="list-table__secondary">{row.displayOrder}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </ListTableCard>
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

function PriorityRowActions({
  row,
  index,
  total,
  busy,
  onEdit,
  onMove,
  onTransition,
  onDelete,
}: {
  row: PriorityRow;
  index: number;
  total: number;
  busy: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onTransition: (action: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="list-row-actions">
      <IfPermitted permission="PRIORITY_UPDATE">
        <button
          type="button"
          className="list-action-btn list-action-btn--edit"
          aria-label={`Edit ${row.title}`}
          title="Edit"
          onClick={onEdit}
        >
          <Icon name="pencil" size={1} />
        </button>
        <button
          type="button"
          className="list-action-btn"
          aria-label={`Move ${row.title} up`}
          title="Move up"
          disabled={busy || index === 0}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="list-action-btn"
          aria-label={`Move ${row.title} down`}
          title="Move down"
          disabled={busy || index === total - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
      </IfPermitted>

      <PublishIconActions
        status={row.status}
        publishPermission="PRIORITY_PUBLISH"
        busy={busy}
        onTransition={onTransition}
      />

      <IfPermitted permission="PRIORITY_DELETE">
        <button
          type="button"
          className="list-action-btn list-action-btn--danger"
          aria-label={`Delete ${row.title}`}
          title="Delete"
          onClick={onDelete}
        >
          <Icon name="trash" size={1} />
        </button>
      </IfPermitted>
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
  const [search, setSearch] = useState('');
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

  const allAlbums = albums.state.status === 'success' ? albums.state.data.cmsAlbums : [];
  const allVideos = videos.state.status === 'success' ? videos.state.data.cmsVideos : [];
  const filteredAlbums = allAlbums.filter((row) =>
    matchesSearch(`${row.title} ${row.status}`, search),
  );
  const filteredVideos = allVideos.filter((row) =>
    matchesSearch(`${row.title} ${row.platform} ${row.status}`, search),
  );
  const photoCount = allAlbums.reduce((sum, row) => sum + row.items.length, 0);
  const refreshing = albums.state.status === 'loading' || videos.state.status === 'loading';

  const refreshAll = () => {
    void albums.refetch();
    void videos.refetch();
  };

  return (
    <div className="cms-page list-page">
      <CmsPageHeader
        title="Gallery"
        description="Photo albums and video links shown on the public gallery."
        localized
        backTo="/admin"
        backLabel="Back to dashboard"
      />

      {(allAlbums.length > 0 || allVideos.length > 0) &&
      albums.state.status === 'success' &&
      videos.state.status === 'success' ? (
        <ListKpiGrid label="Gallery summary">
          <ListKpiCard
            label="Total albums"
            value={allAlbums.length.toLocaleString()}
            hint={`${photoCount.toLocaleString()} photos across albums`}
          />
          <ListKpiCard
            label="Total videos"
            value={allVideos.length.toLocaleString()}
            hint="YouTube and Vimeo links"
          />
        </ListKpiGrid>
      ) : null}

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

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchLabel="Search gallery"
        searchPlaceholder="Search albums and videos"
        onRefresh={refreshAll}
        refreshing={refreshing}
        busy={refreshing}
        hasFilters={Boolean(search.trim())}
        onClear={() => setSearch('')}
      />

      <CmsBoundary
        state={albums.state}
        refetch={albums.refetch}
        isEmpty={(data) => data.cmsAlbums.length === 0}
        emptyMessage="No albums yet."
      >
        {() => (
          <ListTableCard title="Photo albums" count={filteredAlbums.length} countLabel="albums">
            <table className="list-table">
              <caption className="visually-hidden">Photo albums</caption>
              <thead>
                <tr>
                  <th scope="col" className="list-table__actions-col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                  <th scope="col">Album</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="list-table__secondary">
                    Photos
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAlbums.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No albums match this search.</td>
                  </tr>
                ) : (
                  filteredAlbums.map((row) => (
                    <tr key={row.id}>
                      <td className="list-table__actions-col">
                        <div className="list-row-actions">
                          <PublishIconActions
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
                              className="list-action-btn list-action-btn--danger"
                              aria-label={`Delete ${row.title}`}
                              title="Delete"
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
                              <Icon name="trash" size={1} />
                            </button>
                          </IfPermitted>
                        </div>
                      </td>
                      <td>{row.title}</td>
                      <td>
                        <StatusPill value={row.status} />
                      </td>
                      <td className="list-table__secondary">{row.items.length}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ListTableCard>
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
        {() => (
          <ListTableCard title="Videos" count={filteredVideos.length} countLabel="videos">
            <table className="list-table">
              <caption className="visually-hidden">Videos</caption>
              <thead>
                <tr>
                  <th scope="col" className="list-table__actions-col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="list-table__secondary">
                    Platform
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredVideos.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No videos match this search.</td>
                  </tr>
                ) : (
                  filteredVideos.map((row) => (
                    <tr key={row.id}>
                      <td className="list-table__actions-col">
                        <div className="list-row-actions">
                          <PublishIconActions
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
                              className="list-action-btn list-action-btn--danger"
                              aria-label={`Delete ${row.title}`}
                              title="Delete"
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
                              <Icon name="trash" size={1} />
                            </button>
                          </IfPermitted>
                        </div>
                      </td>
                      <td>{row.title}</td>
                      <td>
                        <StatusPill value={row.status} />
                      </td>
                      <td className="list-table__secondary">{row.platform}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ListTableCard>
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
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MediaRow | null>(null);
  const [editing, setEditing] = useState<{ id: string; altText: string } | null>(null);

  const { state, refetch } = useCmsQuery<{ cmsMedia: { nodes: MediaRow[]; totalCount: number } }>(
    CMS_MEDIA,
    { first: 48 },
  );

  const update = useCmsMutation<unknown, { id: string; altText: string }>(UPDATE_MEDIA);
  const remove = useCmsMutation<unknown, { id: string }>(DELETE_MEDIA);

  const allRows = state.status === 'success' ? state.data.cmsMedia.nodes : [];
  const totalCount = state.status === 'success' ? state.data.cmsMedia.totalCount : 0;
  const filteredRows = allRows.filter((row) =>
    matchesSearch(`${row.originalName} ${row.altText ?? ''} ${row.kind}`, search),
  );
  const imageCount = allRows.filter((row) => row.kind === 'IMAGE').length;
  const missingAltCount = allRows.filter(
    (row) => row.kind === 'IMAGE' && !row.altText?.trim(),
  ).length;
  const refreshing = state.status === 'loading';

  return (
    <div className="cms-page list-page">
      <CmsPageHeader
        title="Media library"
        description="Images and documents used across the site. Uploads are validated by content, not by file name."
        backTo="/admin"
        backLabel="Back to dashboard"
      />

      {state.status === 'success' && allRows.length > 0 ? (
        <ListKpiGrid label="Media summary">
          <ListKpiCard
            label="Total media assets"
            value={totalCount.toLocaleString()}
            hint="In the media library"
          />
          <ListKpiCard
            label="Images"
            value={imageCount.toLocaleString()}
            hint={
              missingAltCount > 0
                ? `${missingAltCount.toLocaleString()} missing alt text`
                : 'All images have alt text'
            }
          />
        </ListKpiGrid>
      ) : null}

      <CmsCard title="Upload">
        {/* Reuses the picker purely as an uploader; selection is discarded. */}
        <MediaPicker label="Add a file" selectedId={null} onSelect={() => refetch()} />
      </CmsCard>

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

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchLabel="Search media"
        searchPlaceholder="Search media"
        onRefresh={() => void refetch()}
        refreshing={refreshing}
        busy={refreshing}
        hasFilters={Boolean(search.trim())}
        onClear={() => setSearch('')}
      />

      <CmsBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.cmsMedia.nodes.length === 0}
        emptyMessage="Nothing in the library yet."
      >
        {() => (
          <ListTableCard title="Media" count={filteredRows.length} countLabel="files">
            <table className="list-table">
              <caption className="visually-hidden">Media</caption>
              <thead>
                <tr>
                  <th scope="col" className="list-table__actions-col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                  <th scope="col">File</th>
                  <th scope="col">Name</th>
                  <th scope="col">Alt text</th>
                  <th scope="col" className="list-table__secondary">
                    Size
                  </th>
                  <th scope="col" className="list-table__secondary">
                    Added
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No files match this search.</td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td className="list-table__actions-col">
                        <div className="list-row-actions">
                          <IfPermitted permission="MEDIA_UPDATE">
                            <button
                              type="button"
                              className="list-action-btn list-action-btn--edit"
                              aria-label={`Edit alt text for ${row.originalName}`}
                              title="Edit alt text"
                              onClick={() => setEditing({ id: row.id, altText: row.altText ?? '' })}
                            >
                              <Icon name="pencil" size={1} />
                            </button>
                          </IfPermitted>
                          <IfPermitted permission="MEDIA_DELETE">
                            <button
                              type="button"
                              className="list-action-btn list-action-btn--danger"
                              aria-label={`Delete ${row.originalName}`}
                              title="Delete"
                              onClick={() => setPendingDelete(row)}
                            >
                              <Icon name="trash" size={1} />
                            </button>
                          </IfPermitted>
                        </div>
                      </td>
                      <td>
                        {row.kind === 'IMAGE' ? (
                          <img
                            className="cms-media-thumb"
                            src={`${apiBaseUrl}/media/${row.id}`}
                            alt={row.altText ?? ''}
                          />
                        ) : (
                          <span>{row.originalName}</span>
                        )}
                      </td>
                      <td>{row.originalName}</td>
                      <td>
                        {row.altText ?? <span className="cms-media-missing">Missing</span>}
                      </td>
                      <td className="list-table__secondary">
                        {`${Math.round(row.sizeBytes / 1024)} KB`}
                      </td>
                      <td className="list-table__secondary">
                        {formatDate(row.createdAt) ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ListTableCard>
        )}
      </CmsBoundary>

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

// ---------------------------------------------------------------------------
// Shared publish / archive icon actions (list-pro)
// ---------------------------------------------------------------------------

function PublishIconActions({
  status,
  publishPermission,
  onTransition,
  busy,
}: {
  status: string;
  publishPermission: Permission;
  onTransition: (action: string) => void;
  busy?: boolean;
}) {
  const { t } = useAdminI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <IfPermitted permission={publishPermission}>
        {status !== 'PUBLISHED' && status !== 'ARCHIVED' ? (
          <button
            type="button"
            className="list-action-btn list-action-btn--activate"
            aria-label="Publish"
            title="Publish"
            disabled={busy ?? false}
            onClick={() => onTransition('PUBLISH')}
          >
            <Icon name="play" size={1} />
          </button>
        ) : null}
        {status === 'PUBLISHED' ? (
          <button
            type="button"
            className="list-action-btn list-action-btn--pause"
            aria-label="Unpublish"
            title="Unpublish"
            disabled={busy ?? false}
            onClick={() => onTransition('UNPUBLISH')}
          >
            <Icon name="pause" size={1} />
          </button>
        ) : null}
      </IfPermitted>

      <div className={`cms-actions-menu${open ? ' cms-actions-menu--open' : ''}`} ref={menuRef}>
        <button
          type="button"
          className="list-action-btn list-action-btn--more"
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={open}
          title="More"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="moreVertical" size={1.05} />
        </button>
        {open ? (
          <div className="cms-actions-menu__panel" role="menu">
            {status === 'DRAFT' ? (
              <MenuButton
                disabled={busy ?? false}
                onClick={() => {
                  setOpen(false);
                  onTransition('SUBMIT_FOR_REVIEW');
                }}
              >
                {t('action.submitForReview')}
              </MenuButton>
            ) : null}
            <IfPermitted permission={publishPermission}>
              {status !== 'ARCHIVED' ? (
                <MenuButton
                  disabled={busy ?? false}
                  onClick={() => {
                    setOpen(false);
                    onTransition('ARCHIVE');
                  }}
                >
                  {t('action.archive')}
                </MenuButton>
              ) : null}
            </IfPermitted>
          </div>
        ) : null}
      </div>
    </>
  );
}

function MenuButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
