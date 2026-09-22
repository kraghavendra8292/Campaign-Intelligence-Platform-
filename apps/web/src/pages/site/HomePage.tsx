import { Link } from 'react-router-dom';
import { Button } from '@rk/ui';
import { useSite } from '../../features/site/SiteContext';
import { usePublicQuery } from '../../features/site/usePublicQuery';
import { useSeo } from '../../features/site/useSeo';
import { HOMEPAGE_QUERY } from '../../features/site/queries';
import type { HomepageData } from '../../features/site/types';
import { SiteImage } from '../../components/site/SiteImage';
import { CampaignHeroCarousel } from '../../components/site/CampaignHeroCarousel';
import { buildHeroSlides } from '../../features/site/heroSlides';
import {
  AchievementCard,
  EventCard,
  NewsCard,
  PriorityCard,
  ProjectCard,
} from '../../components/site/cards';
import { QueryBoundary, SectionHeader, SiteEmptyState } from '../../components/site/states';

/**
 * Public homepage.
 *
 * Every section is CMS-driven and every one degrades: a campaign that has
 * published no achievements gets no achievements section rather than an empty
 * heading. That matters for a new tenant, whose site must look deliberate on
 * day one rather than half-built.
 *
 * All content is fetched in a single `publicHomepage` query, so the page paints
 * after one round trip instead of seven.
 */
export function SiteHomePage() {
  const { t } = useSite();
  const { state, refetch } = usePublicQuery<HomepageData>(HOMEPAGE_QUERY);

  const data = state.status === 'success' ? state.data.publicHomepage : null;
  const profile = data?.profile ?? null;
  const siteName = data?.organization.name ?? '';

  useSeo(
    {
      title: profile?.displayName ?? profile?.fullName ?? (siteName || 'Home'),
      description: profile?.metaDescription ?? profile?.shortBio ?? null,
      path: '/',
      image: profile?.coverImage ?? profile?.profileImage ?? null,
    },
    siteName,
  );

  return (
    <QueryBoundary state={state} refetch={refetch}>
      {(result) => {
        const page = result.publicHomepage;
        const headline = page.vision?.headline ?? page.profile?.fullName ?? page.organization.name;

        const heroSlides = buildHeroSlides({
          coverImage: page.profile?.coverImage,
          profileImage: page.profile?.profileImage,
          albums: result.publicPhotoAlbums,
          fallbackAlt: page.profile?.fullName ?? page.organization.name,
        });

        /*
         * The headline and calls to action are the same content either way -
         * only the frame around them changes. With photographs published they
         * sit over the cover slideshow; with none they keep the original split
         * hero, so a campaign that has uploaded nothing still gets a finished
         * page rather than an empty band where a picture should be.
         */
        const heroContent = (
          <div className="hero__content">
            {page.profile?.designation ? (
              <p className="hero__eyebrow">{page.profile.designation}</p>
            ) : null}

            <h1 className="hero__title" id="hero-title">
              {headline}
            </h1>

            {(page.vision?.summary ?? page.profile?.shortBio) ? (
              <p className="hero__subtitle">{page.vision?.summary ?? page.profile?.shortBio}</p>
            ) : null}

            <div className="hero__actions">
              <Link to="/work">
                <Button variant="primary" size="lg">
                  {t('hero.primaryCta')}
                </Button>
              </Link>
              <Link to="/about">
                <Button variant="secondary" size="lg">
                  {t('hero.secondaryCta')}
                </Button>
              </Link>
            </div>
          </div>
        );

        return (
          <>
            {/* --- Hero ------------------------------------------------ */}
            {heroSlides.length > 0 ? (
              <CampaignHeroCarousel slides={heroSlides}>{heroContent}</CampaignHeroCarousel>
            ) : (
              <section className="hero" aria-labelledby="hero-title">
                <div className="hero__inner">
                  {heroContent}

                  <div className="hero__portrait">
                    <SiteImage
                      image={null}
                      fallbackAlt={page.profile?.fullName ?? page.organization.name}
                      aspectRatio="4/3"
                      priority
                    />
                  </div>
                </div>
              </section>
            )}

            {/* --- Quick actions --------------------------------------- */}
            <section className="quick-actions" aria-label={t('quick.title')}>
              <div className="quick-actions__inner">
                <Link className="quick-action" to="/work">
                  <span className="quick-action__icon" aria-hidden="true">
                    🏗️
                  </span>
                  <span className="quick-action__label">{t('quick.projects')}</span>
                </Link>
                <Link className="quick-action" to="/achievements">
                  <span className="quick-action__icon" aria-hidden="true">
                    🏅
                  </span>
                  <span className="quick-action__label">{t('quick.achievements')}</span>
                </Link>
                <Link className="quick-action" to="/news">
                  <span className="quick-action__icon" aria-hidden="true">
                    📰
                  </span>
                  <span className="quick-action__label">{t('quick.news')}</span>
                </Link>
                <Link className="quick-action" to="/events">
                  <span className="quick-action__icon" aria-hidden="true">
                    📅
                  </span>
                  <span className="quick-action__label">{t('quick.events')}</span>
                </Link>

                {/*
                  Phase 5 made these real. They were inert placeholders through
                  Phases 3 and 4 so the information architecture was visible
                  without anything pretending to work; now they lead somewhere,
                  so the `aria-disabled` spans become ordinary links.
                */}
                <Link className="quick-action" to="/feedback">
                  <span className="quick-action__icon" aria-hidden="true">
                    💬
                  </span>
                  <span className="quick-action__label">{t('future.feedback')}</span>
                </Link>
                <Link className="quick-action" to="/track">
                  <span className="quick-action__icon" aria-hidden="true">
                    📍
                  </span>
                  <span className="quick-action__label">{t('nav.track')}</span>
                </Link>
              </div>
            </section>

            {/* --- Our work -------------------------------------------- */}
            {page.featuredProjects.length > 0 ? (
              <section className="section" aria-labelledby="home-work">
                <div className="section__inner">
                  <SectionHeader
                    id="home-work"
                    title={t('section.work')}
                    subtitle={t('section.workSubtitle')}
                    action={
                      <Link to="/work">
                        <Button variant="ghost">{t('section.viewAllWork')}</Button>
                      </Link>
                    }
                  />
                  <div className="card-grid card-grid--3">
                    {page.featuredProjects.map((project) => (
                      <ProjectCard key={project.id} project={project} />
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {/* --- Vision ---------------------------------------------- */}
            {page.priorities.length > 0 || page.vision ? (
              <section className="section section--tinted" aria-labelledby="home-vision">
                <div className="section__inner">
                  <SectionHeader
                    id="home-vision"
                    title={t('section.vision')}
                    subtitle={page.vision?.summary ?? t('section.visionSubtitle')}
                    action={
                      <Link to="/vision">
                        <Button variant="ghost">{t('nav.vision')}</Button>
                      </Link>
                    }
                  />
                  {page.priorities.length > 0 ? (
                    <div className="card-grid card-grid--3">
                      {page.priorities.slice(0, 6).map((priority) => (
                        <PriorityCard key={priority.id} priority={priority} />
                      ))}
                    </div>
                  ) : (
                    <SiteEmptyState messageKey="empty.priorities" />
                  )}
                </div>
              </section>
            ) : null}

            {/* --- Achievements ---------------------------------------- */}
            {page.featuredAchievements.length > 0 ? (
              <section className="section" aria-labelledby="home-achievements">
                <div className="section__inner">
                  <SectionHeader
                    id="home-achievements"
                    title={t('section.achievements')}
                    subtitle={t('section.achievementsSubtitle')}
                    action={
                      <Link to="/achievements">
                        <Button variant="ghost">{t('section.viewAllAchievements')}</Button>
                      </Link>
                    }
                  />
                  <div className="card-grid card-grid--3">
                    {page.featuredAchievements.map((achievement) => (
                      <AchievementCard key={achievement.id} achievement={achievement} />
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {/* --- Latest updates -------------------------------------- */}
            {page.latestNews.length > 0 ? (
              <section className="section section--tinted" aria-labelledby="home-news">
                <div className="section__inner">
                  <SectionHeader
                    id="home-news"
                    title={t('section.news')}
                    subtitle={t('section.newsSubtitle')}
                    action={
                      <Link to="/news">
                        <Button variant="ghost">{t('section.viewAllNews')}</Button>
                      </Link>
                    }
                  />
                  <div className="card-grid card-grid--3">
                    {page.latestNews.map((article) => (
                      <NewsCard key={article.id} article={article} />
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {/* --- Upcoming events ------------------------------------- */}
            {page.upcomingEvents.length > 0 ? (
              <section className="section" aria-labelledby="home-events">
                <div className="section__inner">
                  <SectionHeader
                    id="home-events"
                    title={t('section.events')}
                    subtitle={t('section.eventsSubtitle')}
                    action={
                      <Link to="/events">
                        <Button variant="ghost">{t('section.viewAllEvents')}</Button>
                      </Link>
                    }
                  />
                  <div className="card-grid card-grid--3">
                    {page.upcomingEvents.map((event) => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
          </>
        );
      }}
    </QueryBoundary>
  );
}
