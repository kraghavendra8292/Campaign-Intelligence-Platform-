import { Link } from 'react-router-dom';
import { Button, Icon, type IconName } from '@rk/ui';
import { useSite } from '../../features/site/SiteContext';
import { usePublicQuery } from '../../features/site/usePublicQuery';
import { useSeo } from '../../features/site/useSeo';
import { HOMEPAGE_QUERY } from '../../features/site/queries';
import type { HomepageData, ProjectCard } from '../../features/site/types';
import { SiteImage } from '../../components/site/SiteImage';
import { CampaignHeroCarousel } from '../../components/site/CampaignHeroCarousel';
import { buildHeroSlides } from '../../features/site/heroSlides';
import {
  AchievementCard,
  EventCard,
  NewsCard,
  PriorityCard,
} from '../../components/site/cards';
import { WorkTileCard } from '../../components/site/WorkTileCard';
import { HomeOpinionSection } from '../../components/site/HomeOpinionSection';
import { QueryBoundary, SectionHeader, SiteEmptyState } from '../../components/site/states';

const QUICK_ACTIONS = [
  {
    to: '/work',
    labelKey: 'quick.projects' as const,
    image: '/categories/category-development.webp',
  },
  {
    to: '/achievements',
    labelKey: 'quick.achievements' as const,
    image: '/categories/category-achievements.webp',
  },
  {
    to: '/news',
    labelKey: 'quick.news' as const,
    image: '/categories/category-news.webp',
  },
  {
    to: '/events',
    labelKey: 'quick.events' as const,
    image: '/categories/category-events.webp',
  },
  {
    to: '/feedback',
    labelKey: 'future.reportIssue' as const,
    image: '/categories/category-feedback.webp',
  },
  {
    to: '/track',
    labelKey: 'nav.track' as const,
    image: '/categories/category-track.webp',
  },
] as const;

/**
 * Public homepage — Pro Max card layout.
 *
 * CMS-driven via a single `publicHomepage` query. Sections omit themselves when
 * empty so a new tenant never shows hollow headings.
 *
 * Order: Identity → Hero → Works → Feedback → Quick actions → …
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
    <>
      <QueryBoundary state={state} refetch={refetch}>
      {(result) => {
        const page = result.publicHomepage;

        const heroSlides = buildHeroSlides({
          coverImage: page.profile?.coverImage,
          profileImage: page.profile?.profileImage,
          albums: result.publicPhotoAlbums,
          fallbackAlt: page.profile?.fullName ?? page.organization.name,
        });

        const achievementCount = page.featuredAchievements.length;

        const heroContent = (
          <div className="hero__content">
            <p className="hero__tagline">{t('hero.campaignTagline')}</p>

            <h1 className="hero__title" id="hero-title">
              {t('hero.campaignTitle')}
            </h1>

            <p className="hero__subtitle">{t('hero.campaignSubtitle')}</p>

            <div className="hero__actions">
              <Link to="/feedback">
                <Button variant="primary" size="lg">
                  {t('opinion.title')}
                </Button>
              </Link>
              <Link to="/work">
                <Button variant="secondary" size="lg">
                  {t('section.work')}
                </Button>
              </Link>
            </div>
          </div>
        );

        return (
          <>
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

            {page.featuredProjects.length > 0 ? (
              <HomeWorksBlock
                projects={page.featuredProjects}
                achievementCount={achievementCount}
              />
            ) : null}

            <HomeOpinionSection />

            <section className="quick-actions" aria-label={t('quick.title')}>
              <div className="quick-actions__inner">
                {QUICK_ACTIONS.map((action) => (
                  <Link key={action.to} className="quick-action quick-action--visual" to={action.to}>
                    <span className="quick-action__media">
                      <img src={action.image} alt="" loading="lazy" decoding="async" />
                    </span>
                    <span className="quick-action__label">{t(action.labelKey)}</span>
                  </Link>
                ))}
              </div>
            </section>

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
    </>
  );
}

const WORK_STAT_ITEMS: Array<{
  key: 'completed' | 'ongoing' | 'projects' | 'achievements';
  icon: IconName;
  labelKey: 'home.stats.completed' | 'home.stats.ongoing' | 'home.stats.projects' | 'home.stats.achievements';
}> = [
  { key: 'completed', icon: 'checkCircle', labelKey: 'home.stats.completed' },
  { key: 'ongoing', icon: 'clock', labelKey: 'home.stats.ongoing' },
  { key: 'projects', icon: 'building', labelKey: 'home.stats.projects' },
  { key: 'achievements', icon: 'trophy', labelKey: 'home.stats.achievements' },
];

function HomeWorksBlock({
  projects,
  achievementCount,
}: {
  projects: ProjectCard[];
  achievementCount: number;
}) {
  const { t } = useSite();
  const workStats = summarizeWorkStats(projects);
  const projectCount = projects.length;

  return (
    <section className="section section--works" aria-labelledby="home-work">
      <div className="section__inner">
        <header className="works-header">
          <div className="works-header__title-row">
            <span className="works-header__icon" aria-hidden="true">
              <Icon name="building" size={1.15} />
            </span>
            <h2 className="works-header__title" id="home-work">
              {t('section.work')}
            </h2>
          </div>
          <Link to="/work" className="works-header__link">
            {t('section.viewAllWork')}
            <span aria-hidden="true"> →</span>
          </Link>
        </header>

        <div className="work-tile-grid">
          {projects.slice(0, 4).map((project) => (
            <WorkTileCard key={project.id} project={project} />
          ))}
        </div>

        <div className="works-stats" aria-label={t('section.work')}>
          {WORK_STAT_ITEMS.map((item) => {
            const value =
              item.key === 'completed'
                ? workStats.completed
                : item.key === 'ongoing'
                  ? workStats.ongoing
                  : item.key === 'projects'
                    ? projectCount
                    : achievementCount;

            return (
              <div key={item.key} className="works-stats__item">
                <span className={`works-stats__icon works-stats__icon--${item.key}`} aria-hidden="true">
                  <Icon name={item.icon} size={1.35} />
                </span>
                <span className="works-stats__copy">
                  <span className="works-stats__value">{value}</span>
                  <span className="works-stats__label">{t(item.labelKey)}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function summarizeWorkStats(projects: ProjectCard[]) {
  let completed = 0;
  let ongoing = 0;
  for (const project of projects) {
    if (project.projectStatus === 'COMPLETED') completed += 1;
    else if (project.projectStatus === 'IN_PROGRESS') ongoing += 1;
  }
  return { completed, ongoing };
}
