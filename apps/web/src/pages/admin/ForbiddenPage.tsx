import { Link } from 'react-router-dom';
import { Button, ErrorState } from '@rk/ui';
import { useAdminI18n } from '../../features/admin/AdminI18nContext';

/** Shown when a signed-in user reaches a route their role does not allow. */
export function ForbiddenPage() {
  const { t } = useAdminI18n();

  return (
    <div className="stack">
      <ErrorState
        title={t('state.forbiddenAreaTitle')}
        description={t('state.forbiddenAreaBody')}
      />
      <Link to="/admin">
        <Button variant="secondary">{t('state.backToConsole')}</Button>
      </Link>
    </div>
  );
}
