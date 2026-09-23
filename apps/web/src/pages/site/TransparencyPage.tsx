import { Link } from 'react-router-dom';
import type { StringKey } from '../../i18n/strings';
import { useSite } from '../../features/site/SiteContext';
import { useSeo } from '../../features/site/useSeo';
import { usePublicQuery } from '../../features/site/usePublicQuery';
import {
  TRANSPARENCY_QUERY,
  type PublicWorkCard,
  type TransparencySummary,
} from '../../features/work/workQueries';
import { VerificationBadge, WorkStatusBadge } from '../../components/work/VerificationBadge';
import { QueryBoundary } from '../../components/site/states';
import { SiteBackBar } from '../../components/site/SiteBackBar';
import { formatDate } from '../../lib/format';

/**
 * The public transparency page.
 *
 * EVERY NUMBER ON THIS PAGE IS A DATABASE COUNT. None is generated, estimated
 * or rounded up for effect - the API computes them with `count` and `groupBy`
 * and this page renders what it is given. A transparency page whose headline
 * figures came from a language model would be the precise inversion of what it
 * claims to be, which is why the query has no AI field to ask for.
 *
 * The four headline counters are deliberately NOT presented as achievements.
 * "Proposed" sits beside "verified" at the same visual weight, because a page
 * that showed only the flattering number would be a campaign leaflet with a
 * database behind it.
 */
export function TransparencyPage() {
  const { t } = useSite();

  useSeo({
    title: t('transparency.title'),
    description: t('transparency.subtitle'),
    path: '/transparency',
  });

  const { state, refetch } = usePublicQuery<{
    transparencySummary: TransparencySummary;
    transparencyRecentlyVerified: PublicWorkCard[];
  }>(TRANSPARENCY_QUERY);

  return (
    <div className="section">
      <div className="section__inner">
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <header className="section__header">
          <h1>{t('transparency.title')}</h1>
          <p className="section__subtitle">{t('transparency.subtitle')}</p>
        </header>

        <QueryBoundary state={state} refetch={refetch}>
          {(data) => {
            const summary = data.transparencySummary;
            return (
              <>
                <div className="transparency__counters">
                  <Counter
                    label={t('transparency.verified')}
                    value={summary.verifiedWorks}
                    hint={t('transparency.verifiedHint')}
                    tone="verified"
                  />
                  <Counter
                    label={t('transparency.ongoing')}
                    value={summary.ongoingWorks}
                    tone="ongoing"
                  />
                  <Counter
                    label={t('transparency.proposed')}
                    value={summary.proposedWorks}
                    tone="proposed"
                  />
                  <Counter label={t('transparency.areas')} value={summary.areasCovered} />
                </div>

                {/*
                  Evidence coverage. Renders an em dash when null rather than
                  "0%": a percentage with an empty denominator is not zero, it
                  is nothing, and printing 0% would state something false with
                  the confidence of a measurement.
                */}
                <section className="transparency__coverage">
                  <h2>{t('transparency.coverage')}</h2>
                  <p className="transparency__coverage-figure">
                    {summary.evidenceCoveragePct === null ? '—' : `${summary.evidenceCoveragePct}%`}
                  </p>
                  <p className="transparency__coverage-note">
                    {t('transparency.coverageNote')
                      .replace('{evidenced}', String(summary.evidenceBackedWorks))
                      .replace('{published}', String(summary.publishedWorks))}
                  </p>
                </section>

                <section className="transparency__breakdown">
                  <h2>{t('transparency.byCategory')}</h2>
                  {summary.categories.length === 0 ? (
                    <p className="section__empty">{t('transparency.empty')}</p>
                  ) : (
                    <ul className="transparency__bars">
                      {summary.categories.map((row) => {
                        const max = summary.categories[0]?.count || 1;
                        return (
                          <li key={row.category}>
                            <Link to={`/work?category=${row.category}`}>
                              <span className="transparency__bar-label">
                                {t(`category.${row.category}` as StringKey)}
                              </span>
                              <span className="transparency__bar-track" aria-hidden="true">
                                <span
                                  className="transparency__bar-fill"
                                  style={{ width: `${Math.round((row.count / max) * 100)}%` }}
                                />
                              </span>
                              <span className="transparency__bar-count">{row.count}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {data.transparencyRecentlyVerified.length > 0 ? (
                  <section className="transparency__recent">
                    <h2>{t('transparency.recent')}</h2>
                    <div className="card-grid">
                      {data.transparencyRecentlyVerified.map((work) => (
                        <article key={work.id} className="work-card">
                          <div className="work-card__badges">
                            <WorkStatusBadge status={work.workStatus} />
                            <VerificationBadge verification={work.verification} size="small" />
                          </div>
                          <h3>
                            <Link to={`/work/${work.slug}`}>{work.title}</Link>
                          </h3>
                          {work.area ? <p className="work-card__area">{work.area}</p> : null}
                          {work.verifiedAt ? (
                            <p className="work-card__date">
                              {t('transparency.verifiedOn')} {formatDate(work.verifiedAt)}
                            </p>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <p className="transparency__footnote">{t('transparency.footnote')}</p>
              </>
            );
          }}
        </QueryBoundary>
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'verified' | 'ongoing' | 'proposed';
}) {
  return (
    <div className={`transparency__counter${tone ? ` transparency__counter--${tone}` : ''}`}>
      <span className="transparency__counter-value">{value.toLocaleString()}</span>
      <span className="transparency__counter-label">{label}</span>
      {hint ? <span className="transparency__counter-hint">{hint}</span> : null}
    </div>
  );
}
