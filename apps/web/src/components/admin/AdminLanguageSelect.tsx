import { LOCALES, type Locale } from '@rk/types';
import { useAdminI18n } from '../../features/admin/AdminI18nContext';

/**
 * Interface language for the console.
 *
 * Each language is named IN ITSELF - "English", "ಕನ್ನಡ" - so the option an
 * administrator is looking for is legible even when the console is currently in
 * the language they cannot read. No flags: a flag is a country, and neither of
 * these languages belongs to one country.
 *
 * The visible label says "interface" because the console also has an EDITING
 * language, which picks which content rows are on screen. Two controls that
 * both say "Language" would be genuinely confusing, so neither of them does.
 */
const NATIVE_NAME: Record<Locale, string> = {
  en: 'English',
  kn: 'ಕನ್ನಡ',
};

export function AdminLanguageSelect() {
  const { locale, setLocale, t } = useAdminI18n();

  return (
    <label className="admin-language">
      <span className="admin-language__label">{t('console.interfaceLanguage')}</span>
      <select
        className="admin-language__select"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {LOCALES.map((value) => (
          <option key={value} value={value}>
            {NATIVE_NAME[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
