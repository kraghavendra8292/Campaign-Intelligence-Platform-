import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ContentCategory } from '@rk/types';
import '../../styles/work.css';
import { useSite } from '../../features/site/SiteContext';
import { useSeo } from '../../features/site/useSeo';
import { usePublicQuery } from '../../features/site/usePublicQuery';
import { graphqlRequest } from '../../features/auth/authClient';
import {
  PUBLIC_WORK_QUERY,
  PUBLIC_WORKS_QUERY,
  type PublicWorkCard,
  type PublicWorkDetail,
  type PublicWorkStatus,
} from '../../features/work/workQueries';
import {
  QueryBoundary,
  SectionHeader,
  SiteEmptyState,
  SiteErrorState,
  SiteLoadingState,
} from '../../components/site/states';
import { SiteBackBar } from '../../components/site/SiteBackBar';
import {
  CategorySelect,
  FilterInlineRow,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterToggle,
} from '../../components/site/ListingFilters';
import { Fact } from './DetailPages';
import { SiteImage } from '../../components/site/SiteImage';
import { VerificationBadge, WorkStatusBadge } from '../../components/work/VerificationBadge';
import { EvidenceGallery } from '../../components/work/EvidenceGallery';
import type { StringKey } from '../../i18n/strings';
import { formatCurrency, formatDate } from '../../lib/format';

/**
 * The public works listing and detail.
 *
 * Phase 3 already had `/work`, backed by `publicProjects`. Phase 9 points the
 * route at `publicWorks` instead - a strict superset that adds the verification
 * status, the department, the evidence and the proposed/ongoing/completed
 * filter. The Phase 3 query is unchanged and still served, so nothing that used
 * it breaks.
 *
 * ALL FILTERING HAPPENS ON THE SERVER. The alternative would send a citizen on
 * mobile data the campaign's entire project history in order to show them
 * twelve rows of it.
 */

const STATUS_FILTERS: Array<{ value: PublicWorkStatus | null; key: StringKey }> = [
  { value: null, key: 'filter.all' },
  { value: 'COMPLETED', key: 'work.statusCompleted' },
  { value: 'ONGOING', key: 'work.statusOngoing' },
  { value: 'PROPOSED', key: 'work.statusProposed' },
];

export function WorksPage() {
  const { t } = useSite();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [listing, setListing] = useState<{
    nodes: PublicWorkCard[];
    totalCount: number;
    hasMore: boolean;
  } | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  const category = (params.get('category') as ContentCategory | null) ?? null;
  const workStatus = (params.get('status') as PublicWorkStatus | null) ?? null;
  const area = params.get('area');
  const yearParam = params.get('year');
  const verifiedOnly = params.get('verified') === '1';
  const search = params.get('q') ?? '';

  useSeo({ title: t('section.work'), description: t('section.workSubtitle'), path: '/work' });

  const variables = useMemo(() => {
    const filter: Record<string, unknown> = {
      first: 12 * page,
    };
    // Omit null/empty filter fields. Sending explicit nulls for enums (and
    // similar) has tripped intermittent GraphQL validation failures in the
    // public works listing after filter changes.
    if (category) filter.category = category;
    if (workStatus) filter.workStatus = workStatus;
    if (area) filter.area = area;
    if (yearParam) {
      const year = Number(yearParam);
      if (Number.isFinite(year)) filter.year = year;
    }
    if (verifiedOnly) filter.verifiedOnly = true;
    if (search.trim()) filter.search = search.trim();
    return { filter };
  }, [page, category, workStatus, area, yearParam, verifiedOnly, search]);

  const { state, refetch } = usePublicQuery<{
    publicWorks: {
      nodes: PublicWorkCard[];
      totalCount: number;
      hasMore: boolean;
      endCursor: string | null;
    };
  }>(PUBLIC_WORKS_QUERY, variables);

  // Keep the previous page of cards on screen while the next page loads —
  // QueryBoundary would otherwise flash a full-page skeleton on every scroll.
  const successWorks = state.status === 'success' ? state.data.publicWorks : null;
  useEffect(() => {
    if (!successWorks) return;
    setListing({
      nodes: successWorks.nodes,
      totalCount: successWorks.totalCount,
      hasMore: successWorks.hasMore,
    });
    loadingMoreRef.current = false;
  }, [successWorks]);

  useEffect(() => {
    if (state.status === 'error') loadingMoreRef.current = false;
  }, [state.status]);

  const isInitialLoad = page === 1 && state.status === 'loading' && !listing;
  const hasMore = listing?.hasMore ?? false;

  // Infinite scroll: load the next page as soon as the sentinel is visible.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || typeof IntersectionObserver !== 'function') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        if (loadingMoreRef.current || state.status === 'loading') return;
        loadingMoreRef.current = true;
        setPage((current) => current + 1);
      },
      { rootMargin: '0px', threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, state.status, page, listing?.nodes.length]);

  const resetListing = () => {
    setListing(null);
    setPage(1);
  };

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    resetListing();
    // Filters live in the URL, so a narrowed view is a shareable link - the
    // Phase 7 rule, applied to the public site.
    setParams(next, { replace: true });
  };

  return (
    <div className="section">
      <div className="section__inner">
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <SectionHeader title={t('section.work')} subtitle={t('section.workSubtitle')} />

        <FilterPanel
          compact
          showClear={Boolean(category || workStatus || verifiedOnly || search || area || yearParam)}
          onClear={() => {
            resetListing();
            setParams(new URLSearchParams(), { replace: true });
          }}
        >
          <FilterInlineRow>
            <FilterSearch
              id="works-search"
              compact
              initial={search}
              placeholder={t('filter.searchPlaceholder')}
              ariaLabel={t('work.searchLabel')}
              onSubmit={(term) => setFilter('q', term || null)}
            />

            <FilterSelect
              id="works-status"
              label={t('filter.statusLabel')}
              value={workStatus ?? ''}
              onChange={(next) => setFilter('status', next || null)}
              options={STATUS_FILTERS.map((option) => ({
                value: option.value ?? '',
                label:
                  option.value === null
                    ? `${t('filter.statusLabel')}: ${t(option.key)}`
                    : t(option.key),
              }))}
            />

            <CategorySelect
              value={category}
              onChange={(next) => setFilter('category', next)}
            />

            <FilterToggle
              pressed={verifiedOnly}
              onClick={() => setFilter('verified', verifiedOnly ? null : '1')}
            >
              {t('work.verifiedOnly')}
            </FilterToggle>
          </FilterInlineRow>
        </FilterPanel>

        {isInitialLoad ? <SiteLoadingState /> : null}

        {state.status === 'error' && !listing ? (
          <SiteErrorState message={state.message} onRetry={refetch} />
        ) : null}

        {listing && listing.nodes.length === 0 && state.status === 'success' ? (
          <SiteEmptyState messageKey="empty.projects" />
        ) : null}

        {listing && listing.nodes.length > 0 ? (
          <>
            <p className="filter-panel__count">
              {t('work.showing')
                .replace('{shown}', String(listing.nodes.length))
                .replace('{total}', String(listing.totalCount))}
            </p>

            <div className="card-grid card-grid--3">
              {listing.nodes.map((work) => (
                <WorkCard key={work.id} work={work} />
              ))}
            </div>

            {listing.hasMore ? (
              <div ref={sentinelRef} className="works-scroll-sentinel" aria-hidden="true" />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function WorkCard({ work }: { work: PublicWorkCard }) {
  const { t } = useSite();

  return (
    <article className="work-card">
      <Link to={`/work/${work.slug}`} className="work-card__media">
        <SiteImage image={work.coverImage} fallbackAlt={work.title} aspectRatio="3/2" />
      </Link>

      <div className="work-card__badges">
        <WorkStatusBadge status={work.workStatus} />
        <VerificationBadge verification={work.verification} size="small" />
      </div>

      <h3 className="work-card__title">
        <Link to={`/work/${work.slug}`}>{work.title}</Link>
      </h3>

      {work.shortDescription ? <p className="work-card__summary">{work.shortDescription}</p> : null}

      <dl className="work-card__facts">
        {work.area ? (
          <>
            <dt>{t('work.area')}</dt>
            <dd>{work.area}</dd>
          </>
        ) : null}
        {work.completionDate ? (
          <>
            <dt>{t('work.completed')}</dt>
            <dd>{formatDate(work.completionDate)}</dd>
          </>
        ) : null}
      </dl>
    </article>
  );
}

/**
 * One work, with its timeline and evidence — plus a continuous feed of other
 * published works loaded as the citizen scrolls, and a clear back control.
 *
 * The order on the page is deliberate: what it is, what state it is in, budget
 * and stretch, before/after photos, explanation, progress, then evidence.
 */
export function WorkDetailPage() {
  const { slug: routeSlug = '' } = useParams();
  const { t, organizationSlug, locale } = useSite();
  const navigate = useNavigate();

  // Entry slug is the work the user opened. Scroll-driven URL updates must not
  // rebind the primary query (that would flash loading and wipe the feed).
  const [entrySlug, setEntrySlug] = useState(routeSlug);
  const [queue, setQueue] = useState<string[]>([]);
  const [feed, setFeed] = useState<PublicWorkDetail[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedExhausted, setFeedExhausted] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const activeSlugRef = useRef(routeSlug);
  const feedSlugsRef = useRef<Set<string>>(new Set());

  const { state, refetch } = usePublicQuery<{ publicWork: PublicWorkDetail }>(
    PUBLIC_WORK_QUERY,
    { slug: entrySlug },
    { skip: !entrySlug },
  );

  const visibleWork =
    feed.find((item) => item.slug === routeSlug) ??
    feed[0] ??
    (state.status === 'success' ? state.data.publicWork : null);

  useSeo({
    title: visibleWork?.metaTitle ?? visibleWork?.title ?? t('section.work'),
    description: visibleWork?.metaDescription ?? visibleWork?.shortDescription ?? undefined,
    path: `/work/${routeSlug || entrySlug}`,
    image: visibleWork?.coverImage ?? undefined,
  });

  useEffect(() => {
    feedSlugsRef.current = new Set(feed.map((item) => item.slug));
  }, [feed]);

  // Deep-link / list navigation to a work that is not already in the feed.
  useEffect(() => {
    if (!routeSlug) return;
    if (routeSlug === entrySlug) return;
    if (feedSlugsRef.current.has(routeSlug)) {
      activeSlugRef.current = routeSlug;
      return;
    }
    setEntrySlug(routeSlug);
    setFeed([]);
    setQueue([]);
    setFeedExhausted(false);
    activeSlugRef.current = routeSlug;
  }, [routeSlug, entrySlug]);

  // Seed feed from the entry work query.
  useEffect(() => {
    if (state.status !== 'success') return;
    const opened = state.data.publicWork;
    activeSlugRef.current = opened.slug;
    setFeed((current) => {
      if (current.some((item) => item.id === opened.id)) return current;
      return [opened];
    });
  }, [state]);

  // Slug queue for infinite scroll — rebuilt when the entry work changes.
  useEffect(() => {
    if (!entrySlug) return;
    let cancelled = false;

    void graphqlRequest<{
      publicWorks: { nodes: Array<{ slug: string }> };
    }>(PUBLIC_WORKS_QUERY, {
      skipAuthRetry: true,
      variables: {
        input: { organizationSlug, locale },
        filter: { first: 40 },
      },
    })
      .then((data) => {
        if (cancelled) return;
        const rest = data.publicWorks.nodes
          .map((node) => node.slug)
          .filter((item) => item !== entrySlug);
        setQueue(rest);
        setFeedExhausted(rest.length === 0);
      })
      .catch(() => {
        if (!cancelled) {
          setQueue([]);
          setFeedExhausted(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entrySlug, organizationSlug, locale]);

  const loadNext = useCallback(async () => {
    if (loadingRef.current || feedExhausted) return;
    const nextSlug = queue[0];
    if (!nextSlug) {
      setFeedExhausted(true);
      return;
    }

    loadingRef.current = true;
    setLoadingMore(true);

    try {
      const data = await graphqlRequest<{ publicWork: PublicWorkDetail }>(PUBLIC_WORK_QUERY, {
        skipAuthRetry: true,
        variables: {
          input: { organizationSlug, locale },
          slug: nextSlug,
        },
      });
      setFeed((current) =>
        current.some((item) => item.id === data.publicWork.id)
          ? current
          : [...current, data.publicWork],
      );
      setQueue((current) => {
        const remaining = current.slice(1);
        if (remaining.length === 0) setFeedExhausted(true);
        return remaining;
      });
    } catch {
      setQueue((current) => {
        const remaining = current.slice(1);
        if (remaining.length === 0) setFeedExhausted(true);
        return remaining;
      });
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [feedExhausted, queue, organizationSlug, locale]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver !== 'function') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadNext();
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadNext, feed.length]);

  // Keep the address bar in sync with the work in view (shareable URL).
  useEffect(() => {
    if (feed.length === 0 || typeof IntersectionObserver !== 'function') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const nextSlug = visible?.target.getAttribute('data-work-slug');
        if (!nextSlug || nextSlug === activeSlugRef.current) return;
        activeSlugRef.current = nextSlug;
        navigate(`/work/${nextSlug}`, { replace: true, state: { preserveScroll: true } });
      },
      { threshold: [0.45, 0.6, 0.75] },
    );

    for (const article of document.querySelectorAll<HTMLElement>('[data-work-slug]')) {
      observer.observe(article);
    }

    return () => observer.disconnect();
  }, [feed, navigate]);

  return (
    <div className="section section--work-feed">
      <div className="section__inner section__inner--narrow">
        <SiteBackBar
          fallbackTo="/work"
          backLabel={t('work.back')}
          listTo="/work"
          listLabel={t('section.work')}
        />

        <QueryBoundary state={state} refetch={refetch}>
          {() => (
            <div className="work-feed">
              {feed.map((item, index) => (
                <WorkDetailArticle
                  key={item.id}
                  item={item}
                  headingLevel={index === 0 ? 1 : 2}
                />
              ))}

              <div ref={sentinelRef} className="work-feed__sentinel" aria-hidden="true" />

              {loadingMore ? (
                <p className="work-feed__status" role="status">
                  {t('work.loadingMore')}
                </p>
              ) : null}

              {feedExhausted && feed.length > 1 ? (
                <p className="work-feed__status">{t('work.endOfFeed')}</p>
              ) : null}
            </div>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
}

function WorkDetailArticle({
  item,
  headingLevel,
}: {
  item: PublicWorkDetail;
  headingLevel: 1 | 2;
}) {
  const { t } = useSite();
  const before = item.media.filter((entry) => entry.role === 'BEFORE');
  const after = item.media.filter((entry) => entry.role === 'AFTER');
  const gallery = item.media.filter((entry) => entry.role === 'GALLERY');
  const spentAmount = parseSpentAmount(item.descriptionHtml);
  const HeadingTag = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <article className="work-detail" data-work-slug={item.slug} id={`work-${item.slug}`}>
      <header className="work-detail__header">
        <div className="work-card__badges">
          <WorkStatusBadge status={item.workStatus} />
          <VerificationBadge verification={item.verification} />
        </div>
        <HeadingTag className="work-detail__title">{item.title}</HeadingTag>
        {item.shortDescription ? (
          <p className="work-detail__summary">{item.shortDescription}</p>
        ) : null}
      </header>

      <SiteImage
        image={item.coverImage}
        fallbackAlt={item.title}
        aspectRatio="16/9"
        priority={headingLevel === 1}
        className="work-detail__cover"
      />

      <dl className="fact-grid fact-grid--budget">
        <Fact
          label={t('work.cost')}
          value={formatCurrency(
            item.costAmount === null ? null : Number(item.costAmount),
            item.costCurrency,
          )}
        />
        <Fact
          label={t('work.spent')}
          value={
            spentAmount === null
              ? formatCurrency(null, item.costCurrency)
              : formatCurrency(spentAmount, item.costCurrency)
          }
        />
        <Fact label={t('work.route')} value={item.locationName ?? item.area ?? null} />
      </dl>

      <dl className="work-detail__facts">
        {item.area ? (
          <>
            <dt>{t('work.area')}</dt>
            <dd>{item.area}</dd>
          </>
        ) : null}
        {item.startDate ? (
          <>
            <dt>{t('work.started')}</dt>
            <dd>{formatDate(item.startDate)}</dd>
          </>
        ) : null}
        {item.completionDate ? (
          <>
            <dt>{t('work.completed')}</dt>
            <dd>{formatDate(item.completionDate)}</dd>
          </>
        ) : null}
        {item.department ? (
          <>
            <dt>{t('work.department')}</dt>
            <dd>{item.department}</dd>
          </>
        ) : null}
        {item.agency ? (
          <>
            <dt>{t('work.agency')}</dt>
            <dd>{item.agency}</dd>
          </>
        ) : null}
        {item.verifiedAt ? (
          <>
            <dt>{t('work.verifiedOn')}</dt>
            <dd>{formatDate(item.verifiedAt)}</dd>
          </>
        ) : null}
      </dl>

      {before.length > 0 || after.length > 0 ? (
        <section className="work-detail__section" aria-labelledby={`work-before-after-${item.id}`}>
          <h2 id={`work-before-after-${item.id}`}>{t('work.beforeAfter')}</h2>
          <div className="before-after">
            {before[0] ? (
              <figure>
                <SiteImage
                  image={before[0].image}
                  fallbackAlt={`${item.title} — ${t('label.before')}`}
                  aspectRatio="4/3"
                />
                <figcaption>{before[0].caption ?? t('label.before')}</figcaption>
              </figure>
            ) : null}
            {after[0] ? (
              <figure>
                <SiteImage
                  image={after[0].image}
                  fallbackAlt={`${item.title} — ${t('label.after')}`}
                  aspectRatio="4/3"
                />
                <figcaption>{after[0].caption ?? t('label.after')}</figcaption>
              </figure>
            ) : null}
          </div>
        </section>
      ) : null}

      {item.descriptionHtml ? (
        <section className="work-detail__section" aria-labelledby={`work-explanation-${item.id}`}>
          <h2 id={`work-explanation-${item.id}`}>{t('card.viewDetails')}</h2>
          <div className="rich-text" dangerouslySetInnerHTML={{ __html: item.descriptionHtml }} />
        </section>
      ) : null}

      {gallery.length > 0 ? (
        <section className="work-detail__section" aria-labelledby={`work-gallery-${item.id}`}>
          <h2 id={`work-gallery-${item.id}`}>{t('label.gallery')}</h2>
          <div className="photo-grid">
            {gallery.map((entry) => (
              <figure key={entry.id}>
                <SiteImage
                  image={entry.image}
                  fallbackAlt={entry.caption ?? item.title}
                  aspectRatio="4/3"
                />
                {entry.caption ? <figcaption>{entry.caption}</figcaption> : null}
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {item.updates.length > 0 ? (
        <section className="work-detail__timeline">
          <h2>{t('work.timeline')}</h2>
          <ol>
            {item.updates.map((update) => (
              <li key={update.id}>
                <span className="work-detail__timeline-date">{formatDate(update.occurredOn)}</span>
                <span className="work-detail__timeline-title">{update.title}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <EvidenceGallery evidence={item.evidence} heading={t('work.evidence')} />
    </article>
  );
}

/**
 * Spent amount is stored as a machine-readable marker inside descriptionHtml
 * so we can show Budget vs Spent without a schema migration:
 *   <!--spent:4520000-->
 */
function parseSpentAmount(descriptionHtml: string | null): number | null {
  if (!descriptionHtml) return null;
  const match = /<!--\s*spent:([0-9]+(?:\.[0-9]+)?)\s*-->/i.exec(descriptionHtml);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

