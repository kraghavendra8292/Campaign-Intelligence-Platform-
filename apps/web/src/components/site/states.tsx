import type { ReactNode } from 'react';
import { Button, ErrorState, Skeleton, SkeletonGroup, SkeletonText } from '@rk/ui';
import { useSite } from '../../features/site/SiteContext';
import type { StringKey } from '../../i18n/strings';
import type { QueryState } from '../../features/site/usePublicQuery';

/**
 * Loading, empty and error presentation.
 *
 * Centralised so every data-driven page handles all four states identically and
 * none of them can render a blank screen - the failure mode when each page
 * invents its own handling.
 */

export function SectionHeader({
  title,
  subtitle,
  action,
  id,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <header className="section-header">
      <div>
        <h2 className="section-header__title" {...(id ? { id } : {})}>
          {title}
        </h2>
        {subtitle ? <p className="section-header__subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="section-header__action">{action}</div> : null}
    </header>
  );
}

export function SiteEmptyState({
  messageKey,
  message,
}: {
  messageKey?: StringKey;
  message?: string;
}) {
  const { t } = useSite();
  const text = message ?? (messageKey ? t(messageKey) : t('empty.generic'));

  return (
    <div className="empty-state" role="status">
      <p className="empty-state__title">{text}</p>
      <p className="empty-state__hint">{t('empty.hint')}</p>
    </div>
  );
}

/**
 * What a page looks like before its data arrives.
 *
 * Shaped like the content it is standing in for, rather than a spinner over an
 * empty area: the layout keeps its real dimensions, so nothing jumps when the
 * data lands, and the wait reads as filling in rather than as a stall.
 *
 * The whole group announces itself ONCE - a screen reader hearing "loading"
 * once per placeholder block would be worse than hearing nothing.
 */
export type LoadingVariant = 'cards' | 'detail' | 'text';

export function SiteLoadingState({ variant = 'cards' }: { variant?: LoadingVariant }) {
  const { t } = useSite();

  return (
    <SkeletonGroup label={t('loading.generic')}>
      {variant === 'cards' ? <CardGridSkeleton /> : null}
      {variant === 'detail' ? <DetailSkeleton /> : null}
      {variant === 'text' ? <SkeletonText lines={4} /> : null}
    </SkeletonGroup>
  );
}

/** Mirrors `.card-grid--3` of `.content-card`, down to the padding. */
function CardGridSkeleton() {
  return (
    <div className="card-grid card-grid--3">
      {[0, 1, 2].map((index) => (
        <div className="content-card" key={index}>
          <Skeleton height="9rem" radius="none" />
          <div className="content-card__body">
            <Skeleton height="1.25rem" width="72%" radius="sm" />
            <SkeletonText lines={2} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mirrors a single article: lead image, title, then body copy. */
function DetailSkeleton() {
  return (
    <div className="stack">
      <Skeleton height="12rem" radius="lg" />
      <Skeleton height="2rem" width="60%" radius="sm" />
      <SkeletonText lines={5} />
    </div>
  );
}

export function SiteErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useSite();

  return (
    <ErrorState
      title={t('error.title')}
      description={message ?? t('error.body')}
      retryLabel={t('error.retry')}
      {...(onRetry ? { onRetry } : {})}
    />
  );
}

/**
 * Renders a query's four states in one place.
 *
 * `isEmpty` is supplied per call site because "empty" is content-specific: a
 * missing profile object and an empty project list are both success responses
 * with nothing to show.
 */
export function QueryBoundary<T>({
  state,
  refetch,
  isEmpty,
  emptyKey,
  loadingVariant,
  children,
}: {
  state: QueryState<T>;
  refetch?: () => void;
  isEmpty?: (data: T) => boolean;
  emptyKey?: StringKey;
  /** Shape of the placeholder. Defaults to the card grid most pages render. */
  loadingVariant?: LoadingVariant;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') {
    return <SiteLoadingState {...(loadingVariant ? { variant: loadingVariant } : {})} />;
  }

  if (state.status === 'error') {
    return <SiteErrorState message={state.message} {...(refetch ? { onRetry: refetch } : {})} />;
  }

  if (isEmpty?.(state.data)) {
    return <SiteEmptyState {...(emptyKey ? { messageKey: emptyKey } : {})} />;
  }

  return <>{children(state.data)}</>;
}

/** "Load more" pagination. Keyboard accessible and announces progress. */
export function LoadMore({
  hasNextPage,
  loading,
  shown,
  total,
  onLoadMore,
}: {
  hasNextPage: boolean;
  loading?: boolean;
  shown: number;
  total: number;
  onLoadMore: () => void;
}) {
  const { t } = useSite();

  return (
    <div className="load-more">
      <p className="load-more__count" aria-live="polite">
        {t('pagination.showing', { count: shown, total })}
      </p>
      {hasNextPage ? (
        <Button variant="secondary" onClick={onLoadMore} isLoading={loading ?? false}>
          {t('pagination.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Renders sanitised CMS HTML.
 *
 * The server sanitises on write against a strict allow-list, so the stored
 * value is already safe; this component exists so that every such render goes
 * through one reviewed place rather than scattering `dangerouslySetInnerHTML`
 * across pages.
 */
export function RichText({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  if (!html) return null;

  return (
    <div
      className={['rich-text', className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
