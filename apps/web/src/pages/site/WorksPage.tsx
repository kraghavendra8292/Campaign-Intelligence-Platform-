import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CONTENT_CATEGORIES, type ContentCategory } from '@rk/types';
import { Button, Input } from '@rk/ui';
import { useSite } from '../../features/site/SiteContext';
import { useSeo } from '../../features/site/useSeo';
import { usePublicQuery } from '../../features/site/usePublicQuery';
import {
  PUBLIC_WORK_QUERY,
  PUBLIC_WORKS_QUERY,
  type PublicWorkCard,
  type PublicWorkDetail,
  type PublicWorkStatus,
} from '../../features/work/workQueries';
import { QueryBoundary, SectionHeader } from '../../components/site/states';
import { Fact } from './DetailPages';
import { SiteImage } from '../../components/site/SiteImage';
import { VerificationBadge, WorkStatusBadge } from '../../components/work/VerificationBadge';
import { EvidenceGallery } from '../../components/work/EvidenceGallery';
import type { StringKey } from '../../i18n/strings';
import { formatCount, formatCurrency, formatDate } from '../../lib/format';

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
  const [cursors, setCursors] = useState<string[]>([]);

  const category = (params.get('category') as ContentCategory | null) ?? null;
  const workStatus = (params.get('status') as PublicWorkStatus | null) ?? null;
  const area = params.get('area');
  const yearParam = params.get('year');
  const verifiedOnly = params.get('verified') === '1';
  const search = params.get('q') ?? '';

  useSeo({ title: t('section.work'), description: t('section.workSubtitle'), path: '/work' });

  const variables = useMemo(
    () => ({
      filter: {
        first: 12 * (cursors.length + 1),
        category,
        workStatus,
        area: area || null,
        year: yearParam ? Number(yearParam) : null,
        verifiedOnly: verifiedOnly || null,
        search: search || null,
      },
    }),
    [cursors.length, category, workStatus, area, yearParam, verifiedOnly, search],
  );

  const { state, refetch } = usePublicQuery<{
    publicWorks: {
      nodes: PublicWorkCard[];
      totalCount: number;
      hasMore: boolean;
      endCursor: string | null;
    };
  }>(PUBLIC_WORKS_QUERY, variables);

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setCursors([]);
    // Filters live in the URL, so a narrowed view is a shareable link - the
    // Phase 7 rule, applied to the public site.
    setParams(next, { replace: true });
  };

  return (
    <div className="section">
      <div className="section__inner">
        <SectionHeader title={t('section.work')} subtitle={t('section.workSubtitle')} />

        <div className="filter-bar">
          <div className="filter-bar__chips" role="group" aria-label={t('work.filterStatus')}>
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value ?? 'all'}
                type="button"
                className={`filter-chip${workStatus === option.value ? ' filter-chip--active' : ''}`}
                aria-pressed={workStatus === option.value}
                onClick={() => setFilter('status', option.value)}
              >
                {t(option.key)}
              </button>
            ))}
          </div>

          <div className="filter-bar__chips" role="group" aria-label={t('filter.category')}>
            <button
              type="button"
              className={`filter-chip${category === null ? ' filter-chip--active' : ''}`}
              aria-pressed={category === null}
              onClick={() => setFilter('category', null)}
            >
              {t('filter.all')}
            </button>
            {CONTENT_CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                className={`filter-chip${category === item ? ' filter-chip--active' : ''}`}
                aria-pressed={category === item}
                onClick={() => setFilter('category', item)}
              >
                {t(`category.${item}` as StringKey)}
              </button>
            ))}
          </div>

          <label className="filter-bar__toggle">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(event) => setFilter('verified', event.target.checked ? '1' : null)}
            />
            {t('work.verifiedOnly')}
          </label>

          <WorkSearch initial={search} onSubmit={(term) => setFilter('q', term || null)} />
        </div>

        <QueryBoundary
          state={state}
          refetch={refetch}
          isEmpty={(data) => data.publicWorks.nodes.length === 0}
          emptyKey="empty.projects"
        >
          {(data) => (
            <>
              <p className="filter-bar__count">
                {t('work.showing')
                  .replace('{shown}', String(data.publicWorks.nodes.length))
                  .replace('{total}', String(data.publicWorks.totalCount))}
              </p>

              <div className="card-grid card-grid--3">
                {data.publicWorks.nodes.map((work) => (
                  <WorkCard key={work.id} work={work} />
                ))}
              </div>

              {data.publicWorks.hasMore ? (
                <div className="load-more">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setCursors((all) => [...all, data.publicWorks.endCursor ?? ''])}
                  >
                    {t('pagination.loadMore')}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
}

function WorkSearch({ initial, onSubmit }: { initial: string; onSubmit: (term: string) => void }) {
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
        id="works-search"
        type="search"
        value={value}
        placeholder={t('filter.searchPlaceholder')}
        aria-label={t('work.searchLabel')}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" variant="secondary">
        {t('filter.search')}
      </Button>
    </form>
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
 * One work, with its timeline and evidence.
 *
 * The order on the page is deliberate: what it is, what state it is in, budget
 * and stretch, before/after photos, explanation, progress, then evidence.
 */
export function WorkDetailPage() {
  const { slug = '' } = useParams();
  const { t } = useSite();

  const { state, refetch } = usePublicQuery<{ publicWork: PublicWorkDetail }>(
    PUBLIC_WORK_QUERY,
    { slug },
    { skip: !slug },
  );

  const work = state.status === 'success' ? state.data.publicWork : null;

  useSeo({
    title: work?.metaTitle ?? work?.title ?? t('section.work'),
    description: work?.metaDescription ?? work?.shortDescription ?? undefined,
    path: `/work/${slug}`,
    image: work?.coverImage ?? undefined,
  });

  return (
    <div className="section">
      <div className="section__inner section__inner--narrow">
        <p className="work-detail__back">
          <Link to="/work">{t('section.work')}</Link>
        </p>

        <QueryBoundary state={state} refetch={refetch}>
          {(data) => {
            const item = data.publicWork;
            const before = item.media.filter((entry) => entry.role === 'BEFORE');
            const after = item.media.filter((entry) => entry.role === 'AFTER');
            const gallery = item.media.filter((entry) => entry.role === 'GALLERY');
            const spentAmount = parseSpentAmount(item.descriptionHtml);

            return (
              <article className="work-detail">
                <header className="work-detail__header">
                  <div className="work-card__badges">
                    <WorkStatusBadge status={item.workStatus} />
                    <VerificationBadge verification={item.verification} />
                  </div>
                  <h1>{item.title}</h1>
                  {item.shortDescription ? (
                    <p className="work-detail__summary">{item.shortDescription}</p>
                  ) : null}
                </header>

                <SiteImage
                  image={item.coverImage}
                  fallbackAlt={item.title}
                  aspectRatio="16/9"
                  priority
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
                  <Fact
                    label={t('work.route')}
                    value={item.locationName ?? item.area ?? null}
                  />
                  <Fact
                    label={t('work.beneficiaries')}
                    value={formatCount(item.beneficiaryCount)}
                  />
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
                  <section className="work-detail__section" aria-labelledby="work-before-after">
                    <h2 id="work-before-after">{t('work.beforeAfter')}</h2>
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
                  <section className="work-detail__section" aria-labelledby="work-explanation">
                    <h2 id="work-explanation">{t('card.viewDetails')}</h2>
                    <div
                      className="rich-text"
                      dangerouslySetInnerHTML={{ __html: item.descriptionHtml }}
                    />
                  </section>
                ) : null}

                {gallery.length > 0 ? (
                  <section className="work-detail__section" aria-labelledby="work-gallery">
                    <h2 id="work-gallery">{t('label.gallery')}</h2>
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
                          <span className="work-detail__timeline-date">
                            {formatDate(update.occurredOn)}
                          </span>
                          <span className="work-detail__timeline-title">{update.title}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}

                <EvidenceGallery evidence={item.evidence} heading={t('work.evidence')} />

                {item.evidence.length === 0 ? (
                  <p className="work-detail__no-evidence">{t('work.noEvidence')}</p>
                ) : null}
              </article>
            );
          }}
        </QueryBoundary>
      </div>
    </div>
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
