import { useState, type ReactNode } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

// ENH-27: Settings as a short index. Each row opens its section (its own page on a phone, beside the index on a
// desktop); the search box narrows the rows by title, summary and the names of the settings inside.
export interface SettingsIndexRow {
  id: string;
  icon: string;
  title: string;
  summary?: string;
  /** A count that needs a parent (chores waiting for approval, reward requests) */
  badge?: number;
  /** The names of the settings inside, so a search for "strict" finds General */
  keywords?: string[];
  onOpen: () => void;
}

export interface SettingsIndexGroup {
  title: string;
  rows: SettingsIndexRow[];
}

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function SettingsIndex({ groups, selected, language, footer }: {
  groups: SettingsIndexGroup[];
  selected?: string;
  language?: string;
  footer?: ReactNode;
}) {
  const { t } = useTranslation(language);
  const [query, setQuery] = useState('');
  const q = fold(query.trim());
  const shown = groups
    .map((g) => ({ ...g, rows: q ? g.rows.filter((r) => fold([r.title, r.summary ?? '', ...(r.keywords ?? [])].join(' ')).includes(q)) : g.rows }))
    .filter((g) => g.rows.length > 0);
  return (
    <nav className="settings-index" aria-label={t('nav.settings')}>
      <input type="search" className="tq-input settings-search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={t('settingsIndex.search')} aria-label={t('settingsIndex.search')} />
      {shown.map((g) => (
        <div key={g.title} className="settings-index-group">
          <div className="settings-group-title">{g.title}</div>
          <div className="tq-card settings-index-list">
            {g.rows.map((r) => (
              <button key={r.id} type="button" className={`settings-row${r.id === selected ? ' on' : ''}`} onClick={r.onOpen}
                aria-current={r.id === selected ? 'page' : undefined}>
                <span className="settings-row-icon" aria-hidden="true">{r.icon}</span>
                <span className="settings-row-text">
                  <b>{r.title}</b>
                  {r.summary && <small>{r.summary}</small>}
                </span>
                {!!r.badge && <span className="settings-row-badge">{r.badge}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
      {shown.length === 0 && <div className="settings-index-empty">{t('settingsIndex.noMatch')}</div>}
      {footer}
    </nav>
  );
}
