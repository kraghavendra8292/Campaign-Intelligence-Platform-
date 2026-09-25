import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ContentCategory } from '@rk/types';
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
import { SiteBackBar } from '../../components/site/SiteBackBar';
import {
  CategoryChips,
  FilterChip,
  FilterPanel,
  FilterSearch,
  FilterSegment,
} from '../../components/site/ListingFilters';
import {
  LoadMore,
  QueryBoundary,
  SectionHeader,
  SiteEmptyState,
} from '../../components/site/states';

/**
 * Listing pages: work, achievements, news and events.
 *
 * They share one shape - filter panel, responsive card grid, "load more" - so
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

// ---------------------------------------------------------------------------
// Work (legacy Phase 3 listing — routes use WorksPage)
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
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <SectionHeader title={t('section.work')} subtitle={t('section.workSubtitle')} />

        <FilterPanel
          showClear={Boolean(category || search)}
          onClear={() => updateFilter(new URLSearchParams())}
        >
          <FilterSearch
            id="legacy-work-search"
            initial={search}
            placeholder={t('filter.searchPlaceholder')}
            ariaLabel={t('filter.search')}
            onSubmit={(term) => {
              const updated = new URLSearchParams(params);
              if (term) updated.set('q', term);
              else updated.delete('q');
              updateFilter(updated);
            }}
          />
          <CategoryChips
            value={category}
            onChange={(next) => {
              const updated = new URLSearchParams(params);
              if (next) updated.set('category', next);
              else updated.delete('category');
              updateFilter(updated);
            }}
          />
        </FilterPanel>

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
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <SectionHeader
          title={t('section.achievements')}
          subtitle={t('section.achievementsSubtitle')}
        />
        <p className="achievements-highlights-label">{t('section.achievementsHighlights')}</p>

        <FilterPanel
          showClear={Boolean(category || search)}
          onClear={() => {
            reset();
            setParams(new URLSearchParams(), { replace: true });
          }}
        >
          <FilterSearch
            id="achievements-search"
            initial={search}
            placeholder={t('filter.searchPlaceholder')}
            ariaLabel={t('filter.search')}
            onSubmit={(term) => {
              const updated = new URLSearchParams(params);
              if (term) updated.set('q', term);
              else updated.delete('q');
              reset();
              setParams(updated, { replace: true });
            }}
          />
          <CategoryChips
            value={category}
            onChange={(next) => {
              const updated = new URLSearchParams(params);
              if (next) updated.set('category', next);
              else updated.delete('category');
              reset();
              setParams(updated, { replace: true });
            }}
          />
        </FilterPanel>

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
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <SectionHeader title={t('section.news')} subtitle={t('section.newsSubtitle')} />

        <FilterPanel
          showClear={Boolean(search)}
          onClear={() => {
            reset();
            setParams(new URLSearchParams(), { replace: true });
          }}
        >
          <FilterSearch
            id="news-search"
            initial={search}
            placeholder={t('filter.searchPlaceholder')}
            ariaLabel={t('filter.search')}
            onSubmit={(term) => {
              const updated = new URLSearchParams(params);
              if (term) updated.set('q', term);
              else updated.delete('q');
              reset();
              setParams(updated, { replace: true });
            }}
          />
        </FilterPanel>

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
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <SectionHeader title={t('section.events')} subtitle={t('section.eventsSubtitle')} />

        <FilterPanel
          showClear={!upcomingOnly}
          onClear={() => {
            reset();
            setParams(new URLSearchParams(), { replace: true });
          }}
        >
          <FilterSegment label={t('filter.timingLabel')}>
            <FilterChip
              active={upcomingOnly}
              onClick={() => {
                const updated = new URLSearchParams(params);
                updated.delete('past');
                reset();
                setParams(updated, { replace: true });
              }}
            >
              {t('status.UPCOMING')}
            </FilterChip>
            <FilterChip
              active={!upcomingOnly}
              onClick={() => {
                const updated = new URLSearchParams(params);
                updated.set('past', '1');
                reset();
                setParams(updated, { replace: true });
              }}
            >
              {t('filter.all')}
            </FilterChip>
          </FilterSegment>
        </FilterPanel>

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
