import { useTranslation } from '../../hooks/useTranslation';
import { localeFor } from '../../utils/locale';

/** Month and day of a birthday (no year), as 'MM-DD'; empty = not set. */
export function BirthdayInput({ value, onChange, language }: { value: string; onChange: (v: string) => void; language?: string }) {
  const { t } = useTranslation(language);
  const [month, day] = /^\d\d-\d\d$/.test(value) ? value.split('-') : ['', ''];
  const pad = (n: number) => String(n).padStart(2, '0');
  const set = (m: string, d: string) => onChange(m && d ? `${m}-${d}` : m ? `${m}-01` : '');
  const lastDay = (m: string) => new Date(2024, Number(m), 0).getDate(); // 2024: leap year, so Feb 29 works
  const daysIn = month ? lastDay(month) : 31;
  // A new month keeps the day, moved back to its last day if it has fewer (March 31 → April 30)
  const pickMonth = (m: string) => set(m, m ? (day ? pad(Math.min(Number(day), lastDay(m))) : '01') : '');
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
      🎂 {t('badges.birthday')}
      <select className="tq-input-compact" value={month} aria-label={t('badges.birthdayMonth')} onChange={(e) => pickMonth(e.target.value)}>
        <option value="">—</option>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i} value={pad(i + 1)}>{new Date(2024, i, 1).toLocaleDateString(localeFor(language), { month: 'long' })}</option>
        ))}
      </select>
      {month && (
        <select className="tq-input-compact" value={day} aria-label={t('badges.birthdayDay')} onChange={(e) => set(month, e.target.value)}>
          {Array.from({ length: daysIn }, (_, i) => <option key={i} value={pad(i + 1)}>{i + 1}</option>)}
        </select>
      )}
    </label>
  );
}
