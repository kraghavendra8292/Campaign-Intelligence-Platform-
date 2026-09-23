import { Link } from 'react-router-dom';
import { useSite } from '../../features/site/SiteContext';
import type { StringKey } from '../../i18n/strings';
import { SiteImage } from './SiteImage';
import type { ProjectCard as ProjectCardData } from '../../features/site/types';

/**
 * Compact work tile for the homepage grid: cover image, category chip,
 * title, location and status — minimal details only.
 */
export function WorkTileCard({ project }: { project: ProjectCardData }) {
  const { t } = useSite();
  const location = project.locationName ?? project.area;
  const statusKey = statusLabelKey(project.projectStatus);
  const statusTone = statusToneClass(project.projectStatus);

  return (
    <article className="work-tile">
      <Link to={`/work/${project.slug}`} className="work-tile__link">
        <div className="work-tile__media-wrap">
          <SiteImage
            image={project.coverImage}
            fallbackAlt={project.title}
            aspectRatio="3/2"
            className="work-tile__media"
            sizes="(min-width: 768px) 25vw, 50vw"
          />
          <span className="work-tile__category">
            {t(`category.${project.category}` as StringKey)}
          </span>
        </div>

        <div className="work-tile__body">
          <h3 className="work-tile__title">{project.title}</h3>

          {location ? (
            <p className="work-tile__location">
              <span className="work-tile__location-icon" aria-hidden="true">
                📍
              </span>
              <span>{location}</span>
            </p>
          ) : null}

          <span className={`work-tile__status work-tile__status--${statusTone}`}>
            <span aria-hidden="true">{statusTone === 'done' ? '✓' : '◷'}</span>
            {t(statusKey)}
          </span>
        </div>

        <span className="visually-hidden">{t('card.viewDetails')}</span>
      </Link>
    </article>
  );
}

function statusLabelKey(status: string): StringKey {
  if (status === 'COMPLETED') return 'work.statusCompleted';
  if (status === 'IN_PROGRESS' || status === 'ONGOING') return 'work.statusOngoing';
  return 'work.statusProposed';
}

function statusToneClass(status: string): 'done' | 'progress' | 'planned' {
  if (status === 'COMPLETED') return 'done';
  if (status === 'IN_PROGRESS') return 'progress';
  return 'planned';
}
