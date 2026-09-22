import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CONTENT_CATEGORIES, type ContentCategory } from '@rk/types';
import { Button, Input } from '@rk/ui';
import { useSite } from '../../features/site/SiteContext';
import { usePublicQuery } from '../../features/site/usePublicQuery';
import { useSeo } from '../../features/site/useSeo';
import {
  ACHIEVEMENTS_QUERY,
  EVENTS_QUERY,
  NEWS_QUERY,
  PROJECTS_QUERY,
} from '../../features/site/queries';
import type {
  AchievementCard as AchievementCardData,
  Connection,
  EventCard as EventCardData,
  NewsCard as NewsCardData,
  ProjectCard as ProjectCardData,
} from '../../features/site/types';
import { AchievementCard, EventCard, NewsCard, ProjectCard } from '../../components/site/cards';
import {
  LoadMore,
  QueryBoundary,
  SectionHeader,
  SiteEmptyState,
} from '../../components/site/states';
import type { StringKey } from '../../i18n/strings';

/**
 * Listing pages: work, achievements, news and events.
 *
 * They share one shape - filter bar, responsive card grid, "load more" - so
 * they share one implementation. The alternative, four near-identical files,
 * drifts: a fix to the empty state or the pagination announcement lands in one
 * and not the others.
 *
 * Filters live in the URL, so a filtered view is shareable and the browser Back
 * button behaves as a reader expects.
 */

/** "Load more" appends pages client-side; the cursor lives in state. */
function useCursorPagination() {
  const [cursors, setCursors] = useState<string[]>([]);
  const reset = useCallback(() => setCursors([]), []);
  const push = useCallback((cursor: string) => setCursors((all) => [...all, cursor]), []);
  return { cursors, reset, push, pageSize: 12 * (cursors.length + 1) };
}

function CategoryFilter({
  value,
  onChange,
}: {
  value: ContentCategory | null;
  onChange: (next: ContentCategory | null) => void;
}) {
  const { t } = useSite();

  return (
    <div className="filter-bar__chips" role="group" aria-label={t('filter.category')}>
      <button
        type="button"
        className={`filter-chip${value === null ? ' filter-chip--active' : ''}`}
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        {t('filter.all')}
      </button>
      {CONTENT_CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          className={`filter-chip${value === category ? ' filter-chip--active' : ''}`}
          aria-pressed={value === category}
          onClick={() => onChange(category)}
        >
          {t(`category.${category}` as StringKey)}
        </button>
      ))}
    </div>
  );
}

function SearchField({ initial, onSubmit }: { initial: string; onSubmit: (term: string) => void }) {
  const { t } = useSite();
  const [value, setValue] = useState(initial);

  return (
    <form
      className="filter-bar__search"
      role="search"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <Input
        id="listing-search"
        type="search"
        value={value}
        placeholder={t('filter.searchPlaceholder')}
        aria-label={t('filter.search')}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" variant="secondary">
        {t('filter.search')}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

export function WorkPage() {
  const { t } = useSite();
  const [params, setParams] = useSearchParams();
  const { reset, push, pageSize } = useCursorPagination();

  const category = (params.get('category') as ContentCategory | null) ?? null;
  const search = params.get('q') ?? '';

  useSeo({ title: t('section.work'), description: t('section.workSubtitle'), path: '/work' });

  const variables = useMemo(
    () => ({ first: pageSize, category, search: search || null }),
    [pageSize, category, search],
  );

  const { state, refetch } = usePublicQuery<{ publicProjects: Connection<ProjectCardData> }>(
    PROJECTS_QUERY,
    variables,
  );

  const updateFilter = (next: URLSearchParams) => {
    reset();
    setParams(next, { replace: true });
  };

  return (
    <div className="section">
      <div className="section__inner">
        <SectionHeader title={t('section.work')} subtitle={t('section.workSubtitle')} />

        <div className="filter-bar">
          <CategoryFilter
            value={category}
            onChange={(next) => {
              const updated = new URLSearchParams(params);
              if (next) updated.set('category', next);
              else updated.delete('category');
              updateFilter(updated);
            }}
          />
          <SearchField
            initial={search}
            onSubmit={(term) => {
              const updated = new URLSearchParams(params);
              if (term) updated.set('q', term);
              else updated.delete('q');
              updateFilter(updated);
            }}
          />
        </div>

        <QueryBoundary
          state={state}
          refetch={refetch}
          isEmpty={(data) => data.publicProjects.nodes.length === 0}
          emptyKey="empty.projects"
        >
          {(data) => (
            <>
              <div className="card-grid card-grid--3">
                {data.publicProjects.nodes.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
              <LoadMore
                hasNextPage={data.publicProjects.pageInfo.hasNextPage}
                shown={data.publicProjects.nodes.length}
                total={data.publicProjects.totalCount}
                onLoadMore={() => push(data.publicProjects.pageInfo.endCursor ?? '')}
              />
            </>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export function AchievementsPage() {
  const { t } = useSite();
  const [params, setParams] = useSearchParams();
  const { reset, push, pageSize } = useCursorPagination();

  const category = (params.get('category') as ContentCategory | null) ?? null;
  const search = params.get('q') ?? '';

  useSeo({
    title: t('section.achievements'),
    description: t('section.achievementsSubtitle'),
    path: '/achievements',
  });

  const variables = useMemo(
    () => ({ first: pageSize, category, search: search || null }),
    [pageSize, category, search],
  );

  const { state, refetch } = usePublicQuery<{
    publicAchievements: Connection<AchievementCardData>;
  }>(ACHIEVEMENTS_QUERY, variables);

  return (
    <div className="section">
      <div className="section__inner">
        <SectionHeader
          title={t('section.achievements')}
          subtitle={t('section.achievementsSubtitle')}
        />

        <div className="filter-bar">
          <CategoryFilter
            value={category}
            onChange={(next) => {
              const updated = new URLSearchParams(params);
              if (next) updated.set('category', next);
              else updated.delete('category');
              reset();
              setParams(updated, { replace: true });
            }}
          />
          <SearchField
            initial={search}
            onSubmit={(term) => {
              const updated = new URLSearchParams(params);
              if (term) updated.set('q', term);
              else updated.delete('q');
              reset();
              setParams(updated, { replace: true });
            }}
          />
        </div>

        <QueryBoundary
          state={state}
          refetch={refetch}
          isEmpty={(data) => data.publicAchievements.nodes.length === 0}
          emptyKey="empty.achievements"
        >
          {(data) => (
            <>
              <div className="card-grid card-grid--3">
                {data.publicAchievements.nodes.map((achievement) => (
                  <AchievementCard key={achievement.id} achievement={achievement} />
                ))}
              </div>
              <LoadMore
                hasNextPage={data.publicAchievements.pageInfo.hasNextPage}
                shown={data.publicAchievements.nodes.length}
                total={data.publicAchievements.totalCount}
                onLoadMore={() => push(data.publicAchievements.pageInfo.endCursor ?? '')}
              />
            </>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

export function NewsPage() {
  const { t } = useSite();
  const [params, setParams] = useSearchParams();
  const { reset, push, pageSize } = useCursorPagination();
  const search = params.get('q') ?? '';

  useSeo({ title: t('section.news'), description: t('section.newsSubtitle'), path: '/news' });

  const variables = useMemo(
    () => ({ first: pageSize, search: search || null }),
    [pageSize, search],
  );

  const { state, refetch } = usePublicQuery<{ publicNews: Connection<NewsCardData> }>(
    NEWS_QUERY,
    variables,
  );

  return (
    <div className="section">
      <div className="section__inner">
        <SectionHeader title={t('section.news')} subtitle={t('section.newsSubtitle')} />

        <div className="filter-bar">
          <SearchField
            initial={search}
            onSubmit={(term) => {
              const updated = new URLSearchParams(params);
              if (term) updated.set('q', term);
              else updated.delete('q');
              reset();
              setParams(updated, { replace: true });
            }}
          />
        </div>

        <QueryBoundary
          state={state}
          refetch={refetch}
          isEmpty={(data) => data.publicNews.nodes.length === 0}
          emptyKey="empty.news"
        >
          {(data) => (
            <>
              <div className="card-grid card-grid--3">
                {data.publicNews.nodes.map((article) => (
                  <NewsCard key={article.id} article={article} />
                ))}
              </div>
              <LoadMore
                hasNextPage={data.publicNews.pageInfo.hasNextPage}
                shown={data.publicNews.nodes.length}
                total={data.publicNews.totalCount}
                onLoadMore={() => push(data.publicNews.pageInfo.endCursor ?? '')}
              />
            </>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function EventsPage() {
  const { t } = useSite();
  const [params, setParams] = useSearchParams();
  const { reset, push, pageSize } = useCursorPagination();

  // Defaults to upcoming: a visitor opening "Events" wants what is next, not
  // an archive.
  const upcomingOnly = params.get('past') !== '1';

  useSeo({ title: t('section.events'), description: t('section.eventsSubtitle'), path: '/events' });

  const variables = useMemo(() => ({ first: pageSize, upcomingOnly }), [pageSize, upcomingOnly]);

  const { state, refetch } = usePublicQuery<{ publicEvents: Connection<EventCardData> }>(
    EVENTS_QUERY,
    variables,
  );

  return (
    <div className="section">
      <div className="section__inner">
        <SectionHeader title={t('section.events')} subtitle={t('section.eventsSubtitle')} />

        <div className="filter-bar">
          <div className="filter-bar__chips" role="group" aria-label={t('filter.upcoming')}>
            <button
              type="button"
              className={`filter-chip${upcomingOnly ? ' filter-chip--active' : ''}`}
              aria-pressed={upcomingOnly}
              onClick={() => {
                const updated = new URLSearchParams(params);
                updated.delete('past');
                reset();
                setParams(updated, { replace: true });
              }}
            >
              {t('status.UPCOMING')}
            </button>
            <button
              type="button"
              className={`filter-chip${!upcomingOnly ? ' filter-chip--active' : ''}`}
              aria-pressed={!upcomingOnly}
              onClick={() => {
                const updated = new URLSearchParams(params);
                updated.set('past', '1');
                reset();
                setParams(updated, { replace: true });
              }}
            >
              {t('filter.all')}
            </button>
          </div>
        </div>

        <QueryBoundary
          state={state}
          refetch={refetch}
          isEmpty={(data) => data.publicEvents.nodes.length === 0}
          emptyKey="empty.events"
        >
          {(data) => (
            <>
              <div className="card-grid card-grid--3">
                {data.publicEvents.nodes.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
              <LoadMore
                hasNextPage={data.publicEvents.pageInfo.hasNextPage}
                shown={data.publicEvents.nodes.length}
                total={data.publicEvents.totalCount}
                onLoadMore={() => push(data.publicEvents.pageInfo.endCursor ?? '')}
              />
            </>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
}

export { SiteEmptyState };
