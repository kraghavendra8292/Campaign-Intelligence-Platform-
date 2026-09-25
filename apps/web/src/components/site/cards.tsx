import { Link } from 'react-router-dom';
import { useSite } from '../../features/site/SiteContext';
import { formatDate, formatDateRange } from '../../lib/format';
import { SiteImage } from './SiteImage';
import { CategoryBadge, StatusBadge, VerifiedBadge } from './StatusBadge';
import type {
  AchievementCard as AchievementCardData,
  EventCard as EventCardData,
  NewsCard as NewsCardData,
  PriorityCard as PriorityCardData,
  ProjectCard as ProjectCardData,
} from '../../features/site/types';

/**
 * Content cards for the public site.
 *
 * Grouped in one module because they are variations on a single visual object -
 * image, badges, title, meta, action - and keeping them together is what stops
 * them drifting apart into four slightly different cards.
 *
 * Each card is a single link: the whole surface is clickable, but there is one
 * focusable element and one announcement per card rather than a title link and
 * a redundant "view details" link competing in the tab order.
 */

/** Bundled AI photos for priorities when CMS has no `image` yet. */
const PRIORITY_FALLBACK_IMAGES: Record<string, string> = {
  road: '/priorities/road.webp',
  water: '/priorities/water.webp',
  school: '/priorities/school.webp',
  health: '/priorities/health.webp',
  work: '/priorities/work.webp',
  agriculture: '/priorities/work.webp',
  services: '/priorities/road.webp',
  environment: '/priorities/water.webp',
  community: '/priorities/school.webp',
};

/** Icons for priorities, keyed by the allow-listed `iconKey` (emoji fallback only). */
const PRIORITY_ICONS: Record<string, string> = {
  road: '🛣️',
  water: '💧',
  school: '🏫',
  health: '🏥',
  work: '💼',
  agriculture: '🌾',
  services: '🏛️',
  environment: '🌳',
  community: '🤝',
};

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const { t } = useSite();
  const location = project.locationName ?? project.area;

  return (
    <article className="content-card">
      <Link to={`/work/${project.slug}`} className="content-card__link">
        <SiteImage
          image={project.coverImage}
          fallbackAlt={project.title}
          aspectRatio="3/2"
          className="content-card__media"
          sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw"
        />

        <div className="content-card__body">
          <div className="content-card__badges">
            <CategoryBadge category={project.category} />
            <StatusBadge status={project.projectStatus} />
          </div>

          <h3 className="content-card__title">{project.title}</h3>

          {project.shortDescription ? (
            <p className="content-card__excerpt">{project.shortDescription}</p>
          ) : null}

          <dl className="content-card__meta">
            {location ? (
              <div>
                <dt>{t('label.location')}</dt>
                <dd>{location}</dd>
              </div>
            ) : null}
            {(project.completionDate ?? project.startDate) ? (
              <div>
                <dt>{t('label.date')}</dt>
                <dd>{formatDate(project.completionDate ?? project.startDate)}</dd>
              </div>
            ) : null}
          </dl>

          <span className="content-card__action" aria-hidden="true">
            {t('card.viewDetails')} →
          </span>
        </div>
      </Link>
    </article>
  );
}

export function AchievementCard({ achievement }: { achievement: AchievementCardData }) {
  const { t } = useSite();
  const { amount, body } = splitAchievementSummary(achievement.summary);

  return (
    <article className="content-card content-card--achievement">
      <Link to={`/achievements/${achievement.slug}`} className="content-card__link">
        <SiteImage
          image={achievement.coverImage}
          fallbackAlt={achievement.title}
          aspectRatio="3/2"
          className="content-card__media"
          sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw"
        />

        <div className="content-card__body">
          <div className="content-card__badges">
            <CategoryBadge category={achievement.category} />
            <VerifiedBadge verification={achievement.verification} />
          </div>

          {amount ? <p className="content-card__amount">{amount}</p> : null}

          <h3 className="content-card__title">{achievement.title}</h3>

          {body ? <p className="content-card__excerpt">{body}</p> : null}

          <dl className="content-card__meta">
            {achievement.area ? (
              <div>
                <dt>{t('label.area')}</dt>
                <dd>{achievement.area}</dd>
              </div>
            ) : null}
            {achievement.achievedOn ? (
              <div>
                <dt>{t('label.date')}</dt>
                <dd>{formatDate(achievement.achievedOn)}</dd>
              </div>
            ) : null}
          </dl>

          <span className="content-card__action" aria-hidden="true">
            {t('card.viewDetails')} →
          </span>
        </div>
      </Link>
    </article>
  );
}

/** Summary seed format: "₹110 ಕೋಟಿ · short description" (en: "₹110 crore · …"). */
function splitAchievementSummary(summary: string | null): { amount: string | null; body: string | null } {
  if (!summary) return { amount: null, body: null };
  const match = summary.match(/^(₹[\d.,]+\s*(?:ಕೋಟಿ|crore))\s*[·•\-—|]\s*(.+)$/i);
  if (match) return { amount: match[1].trim(), body: match[2].trim() };
  return { amount: null, body: summary };
}

export function NewsCard({ article }: { article: NewsCardData }) {
  const { t } = useSite();
  const fallbackSrc = newsFallbackSrc(article.slug);

  return (
    <article className="content-card content-card--news">
      <Link to={`/news/${article.slug}`} className="content-card__link">
        <div className="news-card__media-wrap">
          {article.coverImage ? (
            <SiteImage
              image={article.coverImage}
              fallbackAlt={article.title}
              aspectRatio="16/9"
              className="content-card__media news-card__media"
              sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw"
            />
          ) : (
            <div className="site-image site-image--16-9 content-card__media news-card__media">
              <img
                src={fallbackSrc}
                alt=""
                width={1280}
                height={720}
                loading="lazy"
                decoding="async"
              />
            </div>
          )}

          <div className="news-card__meta">
            <CategoryBadge category={article.category} />
            {article.publishedAt ? (
              <time className="news-card__date" dateTime={article.publishedAt}>
                {formatDate(article.publishedAt)}
              </time>
            ) : null}
          </div>
        </div>

        <div className="content-card__body news-card__body">
          <h3 className="content-card__title">{article.title}</h3>

          {article.summary ? <p className="content-card__excerpt">{article.summary}</p> : null}

          {article.authorName ? (
            <p className="news-card__author">{article.authorName}</p>
          ) : null}

          <span className="content-card__action" aria-hidden="true">
            {t('card.readMore')} →
          </span>
        </div>
      </Link>
    </article>
  );
}

/** Stable decorative cover when CMS has not attached a photo yet. */
function newsFallbackSrc(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash + slug.charCodeAt(i) * (i + 1)) % 2;
  }
  return hash === 0 ? '/news/cover.webp' : '/news/cover-2.webp';
}

export function EventCard({ event }: { event: EventCardData }) {
  const { t } = useSite();
  const start = new Date(event.startsAt);

  return (
    <article className="content-card content-card--event">
      <Link to={`/events/${event.slug}`} className="content-card__link">
        <div className="event-card__date" aria-hidden="true">
          <span className="event-card__day">{start.getDate()}</span>
          <span className="event-card__month">
            {start.toLocaleString(undefined, { month: 'short' })}
          </span>
        </div>

        <div className="content-card__body">
          <div className="content-card__badges">
            <StatusBadge status={event.eventStatus} />
          </div>

          <h3 className="content-card__title">{event.title}</h3>

          <p className="content-card__excerpt">
            {/* Visible text repeats the date so it is not conveyed by the
                decorative block alone. */}
            <time dateTime={event.startsAt}>{formatDateRange(event.startsAt, event.endsAt)}</time>
          </p>

          {event.locationName ? (
            <p className="content-card__location">{event.locationName}</p>
          ) : null}

          <span className="content-card__action" aria-hidden="true">
            {t('card.viewDetails')} →
          </span>
        </div>
      </Link>
    </article>
  );
}

export function PriorityCard({
  priority,
  index,
}: {
  priority: PriorityCardData;
  /** 1-based display order for a numbered priority list. */
  index?: number;
}) {
  const { t } = useSite();
  const iconKey = priority.iconKey;
  const fallbackSrc = iconKey ? PRIORITY_FALLBACK_IMAGES[iconKey] : null;
  const emoji = iconKey ? PRIORITY_ICONS[iconKey] : null;
  const worksHref = `/work?category=${encodeURIComponent(priority.category)}`;
  const orderLabel =
    typeof index === 'number' ? String(index).padStart(2, '0') : null;

  return (
    <article className="priority-card">
      <Link to={worksHref} className="priority-card__link">
        <div className="priority-card__media-wrap">
          {priority.image ? (
            <SiteImage
              image={priority.image}
              fallbackAlt={priority.title}
              aspectRatio="4/3"
              className="priority-card__media"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : fallbackSrc ? (
            <div className="site-image site-image--4-3 priority-card__media">
              <img
                src={fallbackSrc}
                alt=""
                width={960}
                height={720}
                loading="lazy"
                decoding="async"
              />
            </div>
          ) : (
            <div
              className="site-image site-image--4-3 priority-card__media site-image--placeholder"
              aria-hidden="true"
            >
              <span className="priority-card__emoji">{emoji ?? '◎'}</span>
            </div>
          )}

          {orderLabel ? (
            <span className="priority-card__index" aria-hidden="true">
              {orderLabel}
            </span>
          ) : null}

          <span className="priority-card__category">
            <CategoryBadge category={priority.category} />
          </span>
        </div>

        <div className="priority-card__body">
          <h3 className="priority-card__title">{priority.title}</h3>
          {priority.description ? (
            <p className="priority-card__description">{priority.description}</p>
          ) : null}
          <span className="priority-card__action" aria-hidden="true">
            {t('priority.relatedWork')} →
          </span>
        </div>
      </Link>
    </article>
  );
}
