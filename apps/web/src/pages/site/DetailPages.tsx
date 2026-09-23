import { Link, useParams } from 'react-router-dom';
import { Button } from '@rk/ui';
import { apiBaseUrl } from '../../config/env';
import { useSite } from '../../features/site/SiteContext';
import { usePublicQuery } from '../../features/site/usePublicQuery';
import { useSeo } from '../../features/site/useSeo';
import {
  ACHIEVEMENT_QUERY,
  EVENT_QUERY,
  NEWS_ARTICLE_QUERY,
  PROJECT_QUERY,
} from '../../features/site/queries';
import type {
  AchievementDetail,
  EventDetail,
  NewsDetail,
  ProjectDetail,
} from '../../features/site/types';
import { SiteImage } from '../../components/site/SiteImage';
import { SiteBackBar } from '../../components/site/SiteBackBar';
import { CategoryBadge, StatusBadge, VerifiedBadge } from '../../components/site/StatusBadge';
import { QueryBoundary, RichText } from '../../components/site/states';
import { formatCount, formatCurrency, formatDate, formatDateRange } from '../../lib/format';

/**
 * Detail pages for projects, achievements, news and events.
 *
 * A recurring rule across all four: **absent data is stated, not invented.**
 * A project with no recorded cost shows "not stated"; it never shows a zero, a
 * placeholder figure, or an empty section styled to look populated. For a
 * platform publishing claims about public works, a fabricated statistic is the
 * most damaging bug available.
 */

/** One labelled fact. Renders nothing when there is no value. */
export function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  const { t } = useSite();

  return (
    <div className="fact">
      <dt className="fact__label">{label}</dt>
      <dd className="fact__value">
        {value ?? <span className="fact__absent">{t('label.notStated')}</span>}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export function ProjectDetailPage() {
  const { slug = '' } = useParams();
  const { t } = useSite();

  const { state, refetch } = usePublicQuery<{ publicProject: ProjectDetail }>(PROJECT_QUERY, {
    slug,
  });

  const project = state.status === 'success' ? state.data.publicProject : null;

  useSeo({
    title: project?.metaTitle ?? project?.title ?? t('nav.work'),
    description: project?.metaDescription ?? project?.shortDescription ?? null,
    path: `/work/${slug}`,
    image: project?.coverImage ?? null,
    type: 'article',
    publishedAt: project?.publishedAt ?? null,
  });

  return (
    <div className="section">
      <div className="section__inner section__inner--narrow">
        <SiteBackBar
          fallbackTo="/work"
          backLabel={t('work.back')}
          listTo="/work"
          listLabel={t('section.work')}
        />

        <QueryBoundary state={state} refetch={refetch} loadingVariant="detail">
          {(data) => {
            const item = data.publicProject;
            const gallery = item.media.filter((m) => m.role === 'GALLERY');
            const before = item.media.filter((m) => m.role === 'BEFORE');
            const after = item.media.filter((m) => m.role === 'AFTER');

            return (
              <article className="detail">
                <header className="detail__header">
                  <div className="detail__badges">
                    <CategoryBadge category={item.category} />
                    <StatusBadge status={item.projectStatus} />
                  </div>
                  <h1 className="detail__title">{item.title}</h1>
                  {item.shortDescription ? (
                    <p className="detail__lead">{item.shortDescription}</p>
                  ) : null}
                </header>

                <SiteImage
                  image={item.coverImage}
                  fallbackAlt={item.title}
                  aspectRatio="16/9"
                  priority
                  className="detail__cover"
                />

                <dl className="fact-grid">
                  <Fact label={t('label.location')} value={item.locationName ?? item.area} />
                  <Fact label={t('label.startDate')} value={formatDate(item.startDate)} />
                  <Fact label={t('label.completionDate')} value={formatDate(item.completionDate)} />
                  {/* Cost and beneficiaries are optional CMS fields. When the
                      campaign has not stated them, that is what the page says. */}
                  <Fact
                    label={t('label.cost')}
                    value={formatCurrency(item.costAmount, item.costCurrency)}
                  />
                  <Fact
                    label={t('label.beneficiaries')}
                    value={formatCount(item.beneficiaryCount)}
                  />
                </dl>

                <RichText html={item.descriptionHtml} />

                {before.length > 0 || after.length > 0 ? (
                  <section className="detail__section" aria-labelledby="before-after">
                    <h2 id="before-after">{t('label.beforeAfter')}</h2>
                    <div className="before-after">
                      {before.length > 0 ? (
                        <figure>
                          <SiteImage
                            image={before[0]?.image ?? null}
                            fallbackAlt={`${item.title} — ${t('label.before')}`}
                            aspectRatio="4/3"
                          />
                          <figcaption>{t('label.before')}</figcaption>
                        </figure>
                      ) : null}
                      {after.length > 0 ? (
                        <figure>
                          <SiteImage
                            image={after[0]?.image ?? null}
                            fallbackAlt={`${item.title} — ${t('label.after')}`}
                            aspectRatio="4/3"
                          />
                          <figcaption>{t('label.after')}</figcaption>
                        </figure>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {gallery.length > 0 ? (
                  <section className="detail__section" aria-labelledby="project-gallery">
                    <h2 id="project-gallery">{t('label.gallery')}</h2>
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
                  <section className="detail__section" aria-labelledby="project-updates">
                    <h2 id="project-updates">{t('label.updates')}</h2>
                    <ol className="timeline">
                      {item.updates.map((update) => (
                        <li key={update.id} className="timeline__item">
                          <time className="timeline__date" dateTime={update.occurredOn}>
                            {formatDate(update.occurredOn)}
                          </time>
                          <h3 className="timeline__title">{update.title}</h3>
                          <RichText html={update.bodyHtml} />
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
              </article>
            );
          }}
        </QueryBoundary>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Achievement
// ---------------------------------------------------------------------------

export function AchievementDetailPage() {
  const { slug = '' } = useParams();
  const { t } = useSite();

  const { state, refetch } = usePublicQuery<{ publicAchievement: AchievementDetail }>(
    ACHIEVEMENT_QUERY,
    { slug },
  );

  const achievement = state.status === 'success' ? state.data.publicAchievement : null;

  useSeo({
    title: achievement?.metaTitle ?? achievement?.title ?? t('section.achievements'),
    description: achievement?.metaDescription ?? achievement?.summary ?? null,
    path: `/achievements/${slug}`,
    image: achievement?.coverImage ?? null,
    type: 'article',
    publishedAt: achievement?.publishedAt ?? null,
  });

  return (
    <div className="section">
      <div className="section__inner section__inner--narrow">
        <SiteBackBar
          fallbackTo="/achievements"
          backLabel={t('achievement.back')}
          listTo="/achievements"
          listLabel={t('section.achievements')}
        />

        <QueryBoundary state={state} refetch={refetch} loadingVariant="detail">
          {(data) => {
            const item = data.publicAchievement;

            return (
              <article className="detail">
                <header className="detail__header">
                  <div className="detail__badges">
                    <CategoryBadge category={item.category} />
                    <VerifiedBadge verification={item.verification} />
                  </div>
                  <h1 className="detail__title">{item.title}</h1>
                  {item.summary ? <p className="detail__lead">{item.summary}</p> : null}
                </header>

                <SiteImage
                  image={item.coverImage}
                  fallbackAlt={item.title}
                  aspectRatio="16/9"
                  priority
                  className="detail__cover"
                />

                <dl className="fact-grid">
                  <Fact label={t('label.area')} value={item.area} />
                  <Fact label={t('label.date')} value={formatDate(item.achievedOn)} />
                </dl>

                <RichText html={item.descriptionHtml} />

                {item.media.length > 0 ? (
                  <section className="detail__section" aria-labelledby="achievement-gallery">
                    <h2 id="achievement-gallery">{t('label.gallery')}</h2>
                    <div className="photo-grid">
                      {item.media.map((entry) => (
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

                {/*
                  Evidence renders only when the campaign has published some.
                  An empty "supporting evidence" heading would imply evidence
                  exists and is merely missing, which is worse than silence.
                */}
                {item.evidence.length > 0 ? (
                  <section className="detail__section" aria-labelledby="achievement-evidence">
                    <h2 id="achievement-evidence">{t('label.evidence')}</h2>
                    <ul className="evidence-list">
                      {item.evidence.map((entry) => (
                        <li key={entry.id} className="evidence-item">
                          <h3 className="evidence-item__title">{entry.title}</h3>
                          {entry.description ? <p>{entry.description}</p> : null}
                          {entry.sourceNote ? (
                            <p className="evidence-item__source">
                              {t('label.source')}: {entry.sourceNote}
                            </p>
                          ) : null}
                          {entry.documentId ? (
                            <a
                              className="evidence-item__link"
                              href={`${apiBaseUrl}/media/${entry.documentId}`}
                              rel="noopener noreferrer"
                            >
                              {entry.documentName ?? 'Document'}
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </article>
            );
          }}
        </QueryBoundary>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

export function NewsDetailPage() {
  const { slug = '' } = useParams();
  const { t } = useSite();

  const { state, refetch } = usePublicQuery<{ publicNewsArticle: NewsDetail }>(NEWS_ARTICLE_QUERY, {
    slug,
  });

  const article = state.status === 'success' ? state.data.publicNewsArticle : null;

  useSeo({
    title: article?.metaTitle ?? article?.title ?? t('section.news'),
    description: article?.metaDescription ?? article?.summary ?? null,
    path: `/news/${slug}`,
    image: article?.coverImage ?? null,
    type: 'article',
    publishedAt: article?.publishedAt ?? null,
  });

  return (
    <div className="section">
      <div className="section__inner section__inner--narrow">
        <SiteBackBar
          fallbackTo="/news"
          backLabel={t('news.back')}
          listTo="/news"
          listLabel={t('section.news')}
        />

        <QueryBoundary state={state} refetch={refetch} loadingVariant="detail">
          {(data) => {
            const item = data.publicNewsArticle;

            return (
              <article className="detail">
                <header className="detail__header">
                  {item.publishedAt ? (
                    <time className="detail__date" dateTime={item.publishedAt}>
                      {formatDate(item.publishedAt)}
                    </time>
                  ) : null}
                  <h1 className="detail__title">{item.title}</h1>
                  {item.authorName ? <p className="detail__byline">{item.authorName}</p> : null}
                  {item.summary ? <p className="detail__lead">{item.summary}</p> : null}
                </header>

                <SiteImage
                  image={item.coverImage}
                  fallbackAlt={item.title}
                  aspectRatio="16/9"
                  priority
                  className="detail__cover"
                />

                <RichText html={item.contentHtml} />

                {item.tags.length > 0 ? (
                  <ul className="tag-list" aria-label="Tags">
                    {item.tags.map((tag) => (
                      <li key={tag} className="tag">
                        {tag}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          }}
        </QueryBoundary>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export function EventDetailPage() {
  const { slug = '' } = useParams();
  const { t } = useSite();

  const { state, refetch } = usePublicQuery<{ publicEvent: EventDetail }>(EVENT_QUERY, { slug });
  const event = state.status === 'success' ? state.data.publicEvent : null;

  useSeo({
    title: event?.metaTitle ?? event?.title ?? t('section.events'),
    description: event?.metaDescription ?? event?.summary ?? null,
    path: `/events/${slug}`,
    image: event?.coverImage ?? null,
    type: 'article',
  });

  return (
    <div className="section">
      <div className="section__inner section__inner--narrow">
        <SiteBackBar
          fallbackTo="/events"
          backLabel={t('event.back')}
          listTo="/events"
          listLabel={t('section.events')}
        />

        <QueryBoundary state={state} refetch={refetch} loadingVariant="detail">
          {(data) => {
            const item = data.publicEvent;

            return (
              <article className="detail">
                <header className="detail__header">
                  <div className="detail__badges">
                    <StatusBadge status={item.eventStatus} />
                  </div>
                  <h1 className="detail__title">{item.title}</h1>
                  {item.summary ? <p className="detail__lead">{item.summary}</p> : null}
                </header>

                <SiteImage
                  image={item.coverImage}
                  fallbackAlt={item.title}
                  aspectRatio="16/9"
                  priority
                  className="detail__cover"
                />

                <dl className="fact-grid">
                  <Fact
                    label={t('label.date')}
                    value={formatDateRange(item.startsAt, item.endsAt)}
                  />
                  <Fact label={t('label.location')} value={item.locationName ?? item.address} />
                  <Fact label={t('label.organizer')} value={item.organizer} />
                </dl>

                <RichText html={item.descriptionHtml} />

                {/* No RSVP or attendance: that is Phase 5+ functionality and
                    is deliberately absent rather than stubbed. */}
                <div className="detail__actions">
                  <Link to="/events">
                    <Button variant="secondary">{t('section.viewAllEvents')}</Button>
                  </Link>
                </div>
              </article>
            );
          }}
        </QueryBoundary>
      </div>
    </div>
  );
}
