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

/** Icons for priorities, keyed by the allow-listed `iconKey`. */
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

  return (
    <article className="content-card">
      <Link to={`/achievements/${achievement.slug}`} className="content-card__link">
        <SiteImage
          image={achievement.coverImage}
          fallbackAlt={achievement.title}
          aspectRatio="3/2"
          className="content-card__media"
        />

        <div className="content-card__body">
          <div className="content-card__badges">
            <CategoryBadge category={achievement.category} />
            <VerifiedBadge verification={achievement.verification} />
          </div>

          <h3 className="content-card__title">{achievement.title}</h3>

          {achievement.summary ? (
            <p className="content-card__excerpt">{achievement.summary}</p>
          ) : null}

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

export function NewsCard({ article }: { article: NewsCardData }) {
  const { t } = useSite();

  return (
    <article className="content-card content-card--news">
      <Link to={`/news/${article.slug}`} className="content-card__link">
        <SiteImage
          image={article.coverImage}
          fallbackAlt={article.title}
          aspectRatio="16/9"
          className="content-card__media"
        />

        <div className="content-card__body">
          {article.publishedAt ? (
            <time className="content-card__date" dateTime={article.publishedAt}>
              {formatDate(article.publishedAt)}
            </time>
          ) : null}

          <h3 className="content-card__title">{article.title}</h3>

          {article.summary ? <p className="content-card__excerpt">{article.summary}</p> : null}

          <span className="content-card__action" aria-hidden="true">
            {t('card.readMore')} →
          </span>
        </div>
      </Link>
    </article>
  );
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

export function PriorityCard({ priority }: { priority: PriorityCardData }) {
  const icon = priority.iconKey ? PRIORITY_ICONS[priority.iconKey] : null;

  return (
    <article className="priority-card">
      {icon ? (
        <span className="priority-card__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h3 className="priority-card__title">{priority.title}</h3>
      {priority.description ? (
        <p className="priority-card__description">{priority.description}</p>
      ) : null}
    </article>
  );
}
