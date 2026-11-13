import { useEffect, useState } from 'react';
import { api, type Look } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { UserAvatar } from './UserAvatar';
import { isTheme, themeLabelKey, THEME_SWATCHES } from '../../utils/themes';

const LOOKS: Look[] = ['fresh', 'quest', 'calm'];

interface Member {
  id: number;
  displayName: string;
  avatarColor: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
  theme?: string | null;
}

/** A small drawing of a look: a summary card and three chore rows, in the colours of whoever is looking. */
function LookMini({ look }: { look: Look }) {
  return (
    <div className={`look-mini look-mini-${look}`} aria-hidden="true">
      <div className="look-mini-head"><i /><u /></div>
      <div className="look-mini-list">
        {[0, 1, 2].map((n) => <div key={n} className="look-mini-row"><s /><u /><em /></div>)}
      </div>
    </div>
  );
}

/**
 * Settings → Look (NEW-37): Fresh, Quest or Calm for the whole family. Admins only. The look sets the shapes; each
 * person's colour theme (their profile) fills them in, so the page lists everyone's theme under the choices.
 */
export function LookAdmin({ language, family, onChanged }: { language?: string; family: Member[]; onChanged?: () => void }) {
  const { t } = useTranslation(language);
  const [look, setLook] = useState<Look>(() => {
    const now = document.documentElement.getAttribute('data-look');
    return now === 'quest' || now === 'calm' ? now : 'fresh';
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    api.getFeatures().then((r) => { if (r.look) setLook(r.look); }).catch(() => {});
  }, []);

  const pick = async (next: Look) => {
    if (next === look || saving) return;
    const before = look;
    setLook(next); setSaving(true); setError(false);
    // Shown at once on this device; everyone else's changes at their next refresh
    if (next === 'fresh') document.documentElement.removeAttribute('data-look'); else document.documentElement.setAttribute('data-look', next);
    try {
      const r = await api.updateFeatures({ look: next });
      if (r.look) setLook(r.look);
      onChanged?.();
    } catch {
      setLook(before); setError(true);
      if (before === 'fresh') document.documentElement.removeAttribute('data-look'); else document.documentElement.setAttribute('data-look', before);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="look-admin">
      <p className="look-lede">{t('look.lede')}</p>
      <div className="look-choices" role="radiogroup" aria-label={t('look.title')}>
        {LOOKS.map((l) => (
          <label key={l} className={`tq-card look-choice${look === l ? ' on' : ''}`}>
            <LookMini look={l} />
            <span className="look-choice-text">
              <span className="look-choice-name">
                <input type="radio" name="family-look" value={l} checked={look === l} disabled={saving} onChange={() => void pick(l)}
                  aria-label={t(`look.${l}`)} aria-describedby={`look-desc-${l}`} />
                {t(`look.${l}`)}
              </span>
              <small id={`look-desc-${l}`}>{t(`look.${l}Desc`)}</small>
            </span>
          </label>
        ))}
      </div>
      {error && <div className="look-error" role="alert">{t('look.saveFailed')}</div>}

      <h3 className="look-people-title">{t('look.coloursTitle')}</h3>
      <div className="tq-card look-people">
        {family.map((m) => {
          const theme = isTheme(m.theme) ? m.theme : 'orange';
          const sw = THEME_SWATCHES[theme];
          return (
            <div key={m.id} className="look-person">
              <UserAvatar userId={m.id} name={m.displayName} color={m.avatarColor} size={32}
                avatarType={m.avatarType as never} avatarPreset={m.avatarPreset} avatarPhotoUrl={m.avatarPhotoUrl} />
              <b>{m.displayName}</b>
              <span className="look-person-theme">{t(themeLabelKey(theme))}<i className="look-swatch" style={{ background: `linear-gradient(90deg, ${sw.bg} 0 50%, ${sw.accent} 50% 100%)` }} /></span>
            </div>
          );
        })}
      </div>
      <p className="look-note">{t('look.coloursNote')}</p>
    </div>
  );
}
