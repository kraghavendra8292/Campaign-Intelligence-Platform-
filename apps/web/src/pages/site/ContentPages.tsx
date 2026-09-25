import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Input } from '@rk/ui';
import { useSite } from '../../features/site/SiteContext';
import { usePublicQuery } from '../../features/site/usePublicQuery';
import { useSeo } from '../../features/site/useSeo';
import {
  ABOUT_QUERY,
  CONTACT_QUERY,
  GALLERY_QUERY,
  SEARCH_QUERY,
  VISION_QUERY,
} from '../../features/site/queries';
import type {
  AchievementCard as AchievementCardData,
  CandidateProfile,
  ContactDetails,
  EventCard as EventCardData,
  GalleryAlbum,
  NewsCard as NewsCardData,
  PriorityCard as PriorityCardData,
  ProjectCard as ProjectCardData,
  SocialLink,
  VideoEntry,
  VisionContent,
} from '../../features/site/types';
import { SiteImage } from '../../components/site/SiteImage';
import { SiteBackBar } from '../../components/site/SiteBackBar';
import { CategoryBadge } from '../../components/site/StatusBadge';
import {
  SocialPlatformIcon,
  socialPlatformMeta,
} from '../../components/site/SocialPlatformIcon';
import {
  AchievementCard,
  EventCard,
  NewsCard,
  PriorityCard,
  ProjectCard,
} from '../../components/site/cards';
import {
  QueryBoundary,
  RichText,
  SectionHeader,
  SiteEmptyState,
} from '../../components/site/states';
import { toEmbedUrl } from '../../lib/format';
import type { StringKey } from '../../i18n/strings';

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

export function AboutPage() {
  const { t } = useSite();

  const { state, refetch } = usePublicQuery<{
    publicCandidateProfile: CandidateProfile | null;
    publicContactInformation: { socialLinks: SocialLink[] };
  }>(ABOUT_QUERY);

  const profile = state.status === 'success' ? state.data.publicCandidateProfile : null;

  useSeo({
    title: profile?.metaTitle ?? profile?.fullName ?? t('about.title'),
    description: profile?.metaDescription ?? profile?.shortBio ?? null,
    path: '/about',
    image: profile?.profileImage ?? null,
  });

  return (
    <div className="section">
      <div className="section__inner section__inner--narrow">
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />

        <QueryBoundary
          state={state}
          refetch={refetch}
          isEmpty={(data) => data.publicCandidateProfile === null}
          emptyKey="empty.generic"
        >
          {(data) => {
            const person = data.publicCandidateProfile;
            if (!person) return null;

            return (
              <article className="detail">
                <header className="profile-header">
                  <SiteImage
                    image={person.profileImage}
                    fallbackAlt={person.fullName}
                    aspectRatio="1/1"
                    priority
                    className="profile-header__photo"
                  />
                  <div>
                    <h1 className="detail__title">{person.displayName ?? person.fullName}</h1>
                    {person.designation ? (
                      <p className="profile-header__designation">{person.designation}</p>
                    ) : null}
                    {person.shortBio ? <p className="detail__lead">{person.shortBio}</p> : null}

                    {data.publicContactInformation.socialLinks.length > 0 ? (
                      <ul className="social-list" aria-label={t('contact.follow')}>
                        {data.publicContactInformation.socialLinks.map((link) => {
                          const { shortLabel, brand } = socialPlatformMeta(link.platform);
                          return (
                            <li key={link.id}>
                              <a
                                href={link.url}
                                rel="noopener noreferrer nofollow"
                                target="_blank"
                                aria-label={link.label ?? shortLabel}
                                title={link.label ?? shortLabel}
                                data-platform={brand}
                              >
                                <SocialPlatformIcon platform={link.platform} />
                                <span>{link.label ?? shortLabel}</span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                </header>

                <RichText html={person.fullBioHtml} />

                {person.experienceHtml ? (
                  <section className="detail__section" aria-labelledby="about-experience">
                    <h2 id="about-experience">{t('about.experience')}</h2>
                    <RichText html={person.experienceHtml} />
                  </section>
                ) : null}

                {person.publicServiceHtml ? (
                  <section className="detail__section" aria-labelledby="about-service">
                    <h2 id="about-service">{t('about.publicService')}</h2>
                    <RichText html={person.publicServiceHtml} />
                  </section>
                ) : null}

                {person.focusAreas && person.focusAreas.length > 0 ? (
                  <section className="detail__section" aria-labelledby="about-focus">
                    <h2 id="about-focus">{t('about.focusAreas')}</h2>
                    <div className="badge-row">
                      {person.focusAreas.map((area) => (
                        <CategoryBadge key={area} category={area} />
                      ))}
                    </div>
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
// Vision
// ---------------------------------------------------------------------------

export function VisionPage() {
  const { t } = useSite();

  const { state, refetch } = usePublicQuery<{
    publicVision: VisionContent | null;
    publicPriorities: PriorityCardData[];
  }>(VISION_QUERY);

  const vision = state.status === 'success' ? state.data.publicVision : null;

  useSeo({
    title: vision?.metaTitle ?? vision?.headline ?? t('section.vision'),
    description: vision?.metaDescription ?? vision?.summary ?? null,
    path: '/vision',
  });

  return (
    <QueryBoundary state={state} refetch={refetch}>
      {(data) => {
        const priorities = data.publicPriorities;
        const headline = data.publicVision?.headline ?? t('section.vision');
        const summary = data.publicVision?.summary ?? t('section.visionSubtitle');

        return (
          <>
            <div className="section section--back-only">
              <div className="section__inner">
                <SiteBackBar
                  fallbackTo="/"
                  backLabel={t('nav.backHome')}
                  listTo="/"
                  listLabel={t('nav.home')}
                />
              </div>
            </div>

            <header className="vision-page__intro">
              <div className="section__inner">
                <p className="vision-page__eyebrow">{t('vision.eyebrow')}</p>
                <h1 className="vision-page__title">{headline}</h1>
                {summary ? <p className="vision-page__summary">{summary}</p> : null}
              </div>
            </header>

            <div className="section">
              <div className="section__inner">
                {data.publicVision?.statementHtml ? (
                  <div className="vision-page__statement">
                    <RichText html={data.publicVision.statementHtml} />
                  </div>
                ) : null}

                <SectionHeader
                  title={t('section.priorities')}
                  subtitle={t('section.prioritiesSubtitle')}
                  action={
                    priorities.length > 0 ? (
                      <span className="vision-page__count">
                        {t('vision.prioritiesCount', { count: priorities.length })}
                      </span>
                    ) : undefined
                  }
                />

                {priorities.length > 0 ? (
                  <div className="card-grid card-grid--3">
                    {priorities.map((priority, i) => (
                      <PriorityCard key={priority.id} priority={priority} index={i + 1} />
                    ))}
                  </div>
                ) : (
                  <SiteEmptyState messageKey="empty.priorities" />
                )}
              </div>
            </div>
          </>
        );
      }}
    </QueryBoundary>
  );
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export function GalleryPage() {
  const { t } = useSite();

  const { state, refetch } = usePublicQuery<{
    publicPhotoAlbums: GalleryAlbum[];
    publicVideos: VideoEntry[];
  }>(GALLERY_QUERY);

  useSeo({ title: t('nav.gallery'), path: '/gallery' });

  return (
    <div className="section">
      <div className="section__inner">
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <SectionHeader title={t('nav.gallery')} />

        <QueryBoundary
          state={state}
          refetch={refetch}
          isEmpty={(data) => data.publicPhotoAlbums.length === 0 && data.publicVideos.length === 0}
          emptyKey="empty.gallery"
        >
          {(data) => (
            <>
              {data.publicPhotoAlbums.map((album) => (
                <section key={album.id} className="album" aria-labelledby={`album-${album.id}`}>
                  <h2 id={`album-${album.id}`} className="album__title">
                    {album.title}
                  </h2>
                  {album.description ? (
                    <p className="album__description">{album.description}</p>
                  ) : null}

                  {album.items.length > 0 ? (
                    <div className="photo-grid">
                      {album.items.map((item) => (
                        <figure key={item.id}>
                          <SiteImage
                            image={item.image}
                            fallbackAlt={item.caption ?? album.title}
                            aspectRatio="1/1"
                          />
                          {item.caption ? <figcaption>{item.caption}</figcaption> : null}
                        </figure>
                      ))}
                    </div>
                  ) : (
                    <SiteEmptyState messageKey="empty.gallery" />
                  )}
                </section>
              ))}

              {data.publicVideos.length > 0 ? (
                <section className="album" aria-labelledby="videos">
                  <h2 id="videos" className="album__title">
                    Videos
                  </h2>
                  <div className="card-grid card-grid--2">
                    {data.publicVideos.map((video) => {
                      const embed = toEmbedUrl(video.videoUrl, video.platform);

                      return (
                        <article key={video.id} className="video-card">
                          {embed ? (
                            // Only allow-listed hosts reach an iframe; anything
                            // else is a plain link out.
                            <div className="video-card__frame">
                              <iframe
                                src={embed}
                                title={video.title}
                                loading="lazy"
                                allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                                referrerPolicy="strict-origin-when-cross-origin"
                                allowFullScreen
                              />
                            </div>
                          ) : (
                            <SiteImage
                              image={video.thumbnail}
                              fallbackAlt={video.title}
                              aspectRatio="16/9"
                            />
                          )}

                          <div className="video-card__body">
                            <h3 className="video-card__title">{video.title}</h3>
                            {video.description ? <p>{video.description}</p> : null}
                            {!embed ? (
                              <a
                                href={video.videoUrl}
                                rel="noopener noreferrer nofollow"
                                target="_blank"
                              >
                                {t('card.viewDetails')}
                              </a>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export function ContactPage() {
  const { t } = useSite();

  const { state, refetch } = usePublicQuery<{
    publicContactInformation: { contact: ContactDetails | null; socialLinks: SocialLink[] };
  }>(CONTACT_QUERY);

  useSeo({ title: t('contact.title'), path: '/contact' });

  return (
    <div className="section">
      <div className="section__inner section__inner--narrow">
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <SectionHeader title={t('contact.title')} />

        <QueryBoundary state={state} refetch={refetch}>
          {(data) => {
            const { contact, socialLinks } = data.publicContactInformation;

            if (!contact && socialLinks.length === 0) {
              return <SiteEmptyState message={t('contact.unavailable')} />;
            }

            const address = [
              contact?.addressLine1,
              contact?.addressLine2,
              contact?.city,
              contact?.state,
              contact?.postalCode,
            ]
              .filter(Boolean)
              .join(', ');

            return (
              <div className="contact">
                <dl className="fact-grid">
                  {contact?.officeName || address ? (
                    <div className="fact">
                      <dt className="fact__label">{t('contact.office')}</dt>
                      <dd className="fact__value">
                        {contact?.officeName ? <div>{contact.officeName}</div> : null}
                        {address ? <div>{address}</div> : null}
                      </dd>
                    </div>
                  ) : null}

                  {contact?.phone ? (
                    <div className="fact">
                      <dt className="fact__label">{t('contact.phone')}</dt>
                      <dd className="fact__value">
                        <a href={`tel:${contact.phone.replace(/\s+/g, '')}`}>{contact.phone}</a>
                        {contact.alternatePhone ? <div>{contact.alternatePhone}</div> : null}
                      </dd>
                    </div>
                  ) : null}

                  {contact?.email ? (
                    <div className="fact">
                      <dt className="fact__label">{t('contact.email')}</dt>
                      <dd className="fact__value">
                        <a href={`mailto:${contact.email}`}>{contact.email}</a>
                      </dd>
                    </div>
                  ) : null}

                  {contact?.officeHours ? (
                    <div className="fact">
                      <dt className="fact__label">{t('contact.hours')}</dt>
                      <dd className="fact__value">{contact.officeHours}</dd>
                    </div>
                  ) : null}
                </dl>

                {socialLinks.length > 0 ? (
                  <section className="detail__section" aria-labelledby="contact-social">
                    <h2 id="contact-social">{t('contact.follow')}</h2>
                    <ul className="social-list">
                      {socialLinks.map((link) => {
                        const { shortLabel, brand } = socialPlatformMeta(link.platform);
                        return (
                          <li key={link.id}>
                            <a
                              href={link.url}
                              rel="noopener noreferrer nofollow"
                              target="_blank"
                              aria-label={link.label ?? shortLabel}
                              title={link.label ?? shortLabel}
                              data-platform={brand}
                            >
                              <SocialPlatformIcon platform={link.platform} />
                              <span>{link.label ?? shortLabel}</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}

                {contact?.mapEmbedUrl ? (
                  <section className="detail__section" aria-labelledby="contact-map">
                    <h2 id="contact-map">{t('contact.office')}</h2>
                    <div className="map-frame">
                      <iframe
                        src={contact.mapEmbedUrl}
                        title={t('contact.office')}
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  </section>
                ) : null}

                {/*
                  No contact form. Phase 3 has no submission backend, and a form
                  that silently discarded a citizen's message would be worse
                  than not offering one. Published channels are shown instead.
                */}
              </div>
            );
          }}
        </QueryBoundary>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface SearchData {
  publicSearch: {
    term: string;
    totalCount: number;
    projects: ProjectCardData[];
    achievements: AchievementCardData[];
    news: NewsCardData[];
    events: EventCardData[];
  };
}

export function SearchPage() {
  const { t } = useSite();
  const [params, setParams] = useSearchParams();
  const term = params.get('q')?.trim() ?? '';
  const [draft, setDraft] = useState(term);

  useSeo({
    title: t('search.title'),
    path: '/search',
    // Search results pages have no stable content and should stay out of the
    // index; they would otherwise compete with the real content pages.
    noIndex: true,
  });

  const { state, refetch } = usePublicQuery<SearchData>(
    SEARCH_QUERY,
    { term },
    { skip: term.length < 2 },
  );

  return (
    <div className="section">
      <div className="section__inner">
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <SectionHeader title={t('search.title')} />

        <form
          className="search-form"
          role="search"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            const next = new URLSearchParams(params);
            if (draft.trim()) next.set('q', draft.trim());
            else next.delete('q');
            setParams(next, { replace: true });
          }}
        >
          <Input
            id="site-search"
            type="search"
            value={draft}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="primary">
            {t('search.submit')}
          </Button>
        </form>

        {term.length < 2 ? (
          <SiteEmptyState
            message={term.length === 0 ? t('search.prompt') : t('search.minLength')}
          />
        ) : (
          <QueryBoundary
            state={state}
            refetch={refetch}
            isEmpty={(data) => data.publicSearch.totalCount === 0}
            emptyKey={'empty.search' as StringKey}
          >
            {(data) => {
              const results = data.publicSearch;

              return (
                <div className="search-results">
                  <p className="search-results__count" aria-live="polite">
                    {t('search.resultsFor', { term: results.term })} ({results.totalCount})
                  </p>

                  {results.projects.length > 0 ? (
                    <section aria-labelledby="results-projects">
                      <h2 id="results-projects">{t('section.work')}</h2>
                      <div className="card-grid card-grid--3">
                        {results.projects.map((project) => (
                          <ProjectCard key={project.id} project={project} />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {results.achievements.length > 0 ? (
                    <section aria-labelledby="results-achievements">
                      <h2 id="results-achievements">{t('section.achievements')}</h2>
                      <div className="card-grid card-grid--3">
                        {results.achievements.map((achievement) => (
                          <AchievementCard key={achievement.id} achievement={achievement} />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {results.news.length > 0 ? (
                    <section aria-labelledby="results-news">
                      <h2 id="results-news">{t('section.news')}</h2>
                      <div className="card-grid card-grid--3">
                        {results.news.map((article) => (
                          <NewsCard key={article.id} article={article} />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {results.events.length > 0 ? (
                    <section aria-labelledby="results-events">
                      <h2 id="results-events">{t('section.events')}</h2>
                      <div className="card-grid card-grid--3">
                        {results.events.map((event) => (
                          <EventCard key={event.id} event={event} />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              );
            }}
          </QueryBoundary>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legal
// ---------------------------------------------------------------------------

/**
 * Privacy and terms pages.
 *
 * Deliberately generic and clearly marked as templates. Publishing invented
 * legal text as though a campaign's lawyer had written it would be worse than
 * an obvious placeholder - these say plainly that they must be replaced.
 */
export function PrivacyPage() {
  const { t } = useSite();
  useSeo({ title: t('footer.privacy'), path: '/privacy' });

  return (
    <div className="section">
      <div className="section__inner section__inner--narrow">
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <h1 className="detail__title">{t('footer.privacy')}</h1>

        <div className="rich-text">
          <p>
            <strong>Template notice.</strong> This is placeholder text supplied with the platform.
            It is not legal advice and must be replaced with a policy reviewed for your jurisdiction
            before the site is published.
          </p>

          <h2>Information this website collects</h2>
          <p>
            This website presents published information about the candidate and their work. It does
            not require you to create an account, and it does not ask you to submit personal
            information in order to read any page.
          </p>

          <h2>Analytics and tracking</h2>
          <p>
            No advertising trackers or third-party profiling tools are used by the platform itself.
            Embedded media (for example video players) may set cookies under the policies of those
            providers.
          </p>

          <h2>Your rights</h2>
          <p>
            Contact the campaign office using the details on the contact page for any question about
            information held about you.
          </p>
        </div>
      </div>
    </div>
  );
}

export function TermsPage() {
  const { t } = useSite();
  useSeo({ title: t('footer.terms'), path: '/terms' });

  return (
    <div className="section">
      <div className="section__inner section__inner--narrow">
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <h1 className="detail__title">{t('footer.terms')}</h1>

        <div className="rich-text">
          <p>
            <strong>Template notice.</strong> This is placeholder text supplied with the platform
            and must be replaced with terms reviewed for your jurisdiction.
          </p>

          <h2>Use of this website</h2>
          <p>
            The content on this website is published by the campaign organisation named in the
            footer. It is provided for public information.
          </p>

          <h2>Accuracy of content</h2>
          <p>
            Content is managed by the campaign team. Items marked as verified have been checked
            against supporting material by that team; items without such a marking have not.
          </p>

          <h2>External links</h2>
          <p>
            This website links to external sites that are not under its control and for whose
            content it is not responsible.
          </p>
        </div>
      </div>
    </div>
  );
}
