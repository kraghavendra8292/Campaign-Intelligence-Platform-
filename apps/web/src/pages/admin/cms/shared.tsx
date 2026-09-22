import { CONTENT_STATUSES, type Permission } from '@rk/types';
import { Badge } from '@rk/ui';
import type { StatusTone } from '@rk/design-tokens';
import { IfPermitted } from '../../../components/cms/CmsShell';
import { useAdminI18n } from '../../../features/admin/AdminI18nContext';
import type { AdminStringKey } from '../../../i18n/adminStrings';

/**
 * Pieces shared by every CMS list screen.
 *
 * Publishing controls in particular live here rather than being rebuilt per
 * entity: the rule about which transitions need which permission is security
 * relevant, and it should exist once.
 */

const TONES: Record<string, StatusTone> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
  PLANNED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  ON_HOLD: 'neutral',
  CANCELLED: 'error',
  UPCOMING: 'info',
  ONGOING: 'warning',
  UNVERIFIED: 'neutral',
  VERIFIED: 'success',
};

/**
 * Status label. Always words plus tone, never tone alone.
 *
 * One component renders every status badge in the console, so translating it
 * here translates them all. An unrecognised value falls back to the humanised
 * enum rather than rendering a raw `IN_REVIEW` or the key itself - new statuses
 * appear in the API before they appear in this dictionary.
 */
export function StatusPill({ value }: { value: string }) {
  const { t } = useAdminI18n();
  const key = `status.${value}` as AdminStringKey;
  const label = translatedOr(t(key), key, value);

  return (
    <Badge tone={TONES[value] ?? 'neutral'} withDot>
      {label}
    </Badge>
  );
}

/** `translateAdmin` returns the key itself when it knows nothing about it. */
function translatedOr(translated: string, key: string, raw: string): string {
  return translated === key ? raw.replace(/_/g, ' ').toLowerCase() : translated;
}

export function StatusFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useAdminI18n();

  return (
    <label className="cms-filters__status">
      <span className="visually-hidden">{t('filter.byStatus')}</span>
      <select
        className="rk-select__control"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('filter.allStatuses')}</option>
        {CONTENT_STATUSES.map((status) => {
          const key = `status.${status}` as AdminStringKey;
          return (
            <option key={status} value={status}>
              {translatedOr(t(key), key, status)}
            </option>
          );
        })}
      </select>
    </label>
  );
}

/**
 * Publishing controls for a row.
 *
 * Which action is offered depends on the current status, and the publishing
 * actions are wrapped in the entity's PUBLISH permission. "Submit for review"
 * is outside that wrapper because it is ordinary editorial work - an editor who
 * cannot publish can still hand something over for approval.
 *
 * This governs what is *shown*. The API independently enforces the same rule.
 */
export function PublishControls({
  status,
  publishPermission,
  onTransition,
  busy,
}: {
  status: string;
  publishPermission: Permission;
  onTransition: (action: string) => void;
  busy?: boolean;
}) {
  const { t } = useAdminI18n();

  return (
    <>
      {status === 'DRAFT' ? (
        <button
          type="button"
          className="cms-row-actions__link"
          disabled={busy ?? false}
          onClick={() => onTransition('SUBMIT_FOR_REVIEW')}
        >
          {t('action.submitForReview')}
        </button>
      ) : null}

      <IfPermitted permission={publishPermission}>
        {status !== 'PUBLISHED' && status !== 'ARCHIVED' ? (
          <button
            type="button"
            className="cms-row-actions__primary"
            disabled={busy ?? false}
            onClick={() => onTransition('PUBLISH')}
          >
            {t('action.publish')}
          </button>
        ) : null}

        {status === 'PUBLISHED' ? (
          <button
            type="button"
            className="cms-row-actions__link"
            disabled={busy ?? false}
            onClick={() => onTransition('UNPUBLISH')}
          >
            {t('action.unpublish')}
          </button>
        ) : null}

        {status !== 'ARCHIVED' ? (
          <button
            type="button"
            className="cms-row-actions__link"
            disabled={busy ?? false}
            onClick={() => onTransition('ARCHIVE')}
          >
            {t('action.archive')}
          </button>
        ) : null}
      </IfPermitted>
    </>
  );
}
