import { Link } from 'react-router-dom';
import { useSite } from '../../features/site/SiteContext';
import { SiteImage } from './SiteImage';
import type { ProjectCard as ProjectCardData } from '../../features/site/types';

/**
 * Compact work tile for the homepage grid: fixed aspect ratio, bottom scrim,
 * title overlay. Distinct from `ProjectCard` which is the full listing card.
 */
export function WorkTileCard({ project }: { project: ProjectCardData }) {
  const { t } = useSite();

  return (
    <article className="work-tile">
      <Link to={`/work/${project.slug}`} className="work-tile__link">
        <SiteImage
          image={project.coverImage}
          fallbackAlt={project.title}
          aspectRatio="1/1"
          className="work-tile__media"
          sizes="(min-width: 768px) 25vw, 50vw"
        />
        <div className="work-tile__scrim" aria-hidden="true" />
        <div className="work-tile__body">
          <h3 className="work-tile__title">{project.title}</h3>
          <span className="work-tile__chevron" aria-hidden="true">
            ›
          </span>
        </div>
        <span className="visually-hidden">{t('card.viewDetails')}</span>
      </Link>
    </article>
  );
}
