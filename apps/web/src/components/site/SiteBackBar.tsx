import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@rk/ui';

/**
 * Sticky back control for public pages that sit below the site header.
 *
 * Prefers browser history so deep links and in-app navigation both feel natural;
 * falls back to `fallbackTo` when there is nowhere to go back to (direct entry).
 * Optional `listTo` keeps a stable link to the parent list for share/deep-link cases.
 */
export function SiteBackBar({
  fallbackTo,
  backLabel,
  listTo,
  listLabel,
}: {
  fallbackTo: string;
  backLabel: string;
  listTo?: string;
  listLabel?: string;
}) {
  const navigate = useNavigate();

  const onBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(fallbackTo);
  }, [navigate, fallbackTo]);

  return (
    <div className="site-back-bar">
      <button type="button" className="site-back-bar__btn" onClick={onBack}>
        <Icon name="chevronLeft" size={1.1} aria-hidden="true" />
        <span>{backLabel}</span>
      </button>
      {listTo && listLabel ? (
        <Link to={listTo} className="site-back-bar__link">
          {listLabel}
        </Link>
      ) : null}
    </div>
  );
}
