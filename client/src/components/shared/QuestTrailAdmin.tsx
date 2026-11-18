import { useEffect, useState } from 'react';
import { api, type QuestPlayers, type QuestSettings } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { serverErrorText } from '../../utils/serverError';
import { Toggle } from './Toggle';

const LENGTHS = { min: 40, max: 120 };
const label = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)', flexWrap: 'wrap' } as const;
const hint = { fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)' } as const;
const box = { backgroundColor: 'var(--warm-bg-subtle)', border: 'var(--shape-border-w) solid var(--warm-border)', borderRadius: 12, padding: '10px 12px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 } as const;
const heading = { fontSize: 12, fontWeight: 800, color: 'var(--warm-text)' } as const;

/** A whole number box that saves when you leave it */
function NumberBox({ value, min, max, onSave, ariaLabel, width = 80 }: { value: number; min: number; max: number; onSave: (n: number) => void; ariaLabel: string; width?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.min(max, Math.max(min, Math.round(Number(draft) || 0)));
    setDraft(null);
    if (n !== value) onSave(n);
  };
  return (
    <input type="number" inputMode="numeric" min={min} max={max} className="tq-input-compact" aria-label={ariaLabel} style={{ width }}
      value={draft ?? String(value)} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

/**
 * Settings → Quest Trail (NEW-40): on/off, a star by hand, the first-place prize, finisher coins, coins per star
 * after the finish, the trail's length, and the map's look. Each change saves straight away.
 */
export function QuestTrailAdmin({ language, onChanged }: { language?: string; onChanged?: () => void }) {
  const { t } = useTranslation(language);
  const [on, setOn] = useState<boolean | null>(null);
  const [s, setS] = useState<QuestSettings | null>(null);
  const [state, setState] = useState<QuestPlayers | null>(null);
  const [rewards, setRewards] = useState<Array<{ id: number; title: string }>>([]);
  const [message, setMessage] = useState('');

  const loadGame = () => api.questPlayers().then(setState).catch(() => {});
  useEffect(() => {
    api.getFeatures().then((f) => setOn(f.features.questTrail !== false)).catch(() => {});
    api.questSettings().then(setS).catch(() => {});
    api.getRewardsAdmin().then((r) => setRewards(((r.rewards ?? []) as Array<{ id: number; title: string; deletedAt?: string | null }>).filter((x) => !x.deletedAt).map((x) => ({ id: x.id, title: x.title })))).catch(() => {});
    loadGame();
  }, []);

  const save = (change: Partial<QuestSettings>) => {
    setMessage('');
    api.saveQuestSettings(change).then((next) => { setS(next); setMessage(t('common.saved')); })
      .catch((err) => setMessage(serverErrorText(err, t)));
  };
  const switchOn = (next: boolean) => {
    setMessage('');
    api.updateFeatures({ features: { questTrail: next } }).then((f) => { setOn(f.features.questTrail !== false); onChanged?.(); return loadGame(); })
      .catch((err) => setMessage(serverErrorText(err, t)));
  };
  const give = (userId: number, name: string) => {
    setMessage('');
    api.questGiveStar(userId).then((next) => { setState(next); setMessage(t('questAdmin.given').replace('{name}', name)); })
      .catch((err) => setMessage(serverErrorText(err, t)));
  };

  if (on === null || !s) return null;
  const game = state?.enabled ? state : null;
  // A reward that was deleted since it was picked still shows, so the box never looks empty by mistake
  const prizeMissing = s.prizeRewardId !== null && !rewards.some((r) => r.id === s.prizeRewardId);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <div style={hint}>{t('questAdmin.desc')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>{t('questAdmin.on')}</div>
        <Toggle checked={on} label={t('questAdmin.on')} onChange={switchOn} />
      </div>
      {!on && <div style={hint}>{t('questAdmin.offNote')}</div>}

      {on && (
        <>
          <div style={box}>
            <div style={heading}>⭐ {t('questAdmin.giveTitle')}</div>
            <div style={hint}>{t('questAdmin.giveDesc')}</div>
            {game && game.players.length === 0 && <div style={hint}>{t('questAdmin.noPlayers')}</div>}
            {game?.players.map((p) => (
              <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: 'var(--warm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.displayName}
                  <span style={{ ...hint, marginLeft: 6 }}>
                    {p.finishedAt ? t('questAdmin.finished') : `${p.position}/${game.trail.length}`} · {t('questAdmin.starsLeft').replace('{n}', String(p.starsLeft))}
                  </span>
                </div>
                <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => give(p.userId, p.displayName)}>{t('questAdmin.give')}</button>
              </div>
            ))}
          </div>

          <div style={box}>
            <div style={heading}>🏆 {t('questAdmin.prizeTitle')}</div>
            <div style={hint}>{t('questAdmin.prizeDesc')}</div>
            <label style={label}>
              {t('questAdmin.prizeReward')}
              <select className="tq-input-compact" style={{ flex: '1 1 160px', minWidth: 0, width: '100%', maxWidth: '100%' }} value={s.prizeRewardId ?? ''}
                onChange={(e) => save({ prizeRewardId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('questAdmin.prizeNoReward')}</option>
                {prizeMissing && <option value={s.prizeRewardId!}>#{s.prizeRewardId}</option>}
                {rewards.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </label>
            <label style={label}>
              🪙 {t('questAdmin.prizeCoins')}
              <NumberBox value={s.prizeCoins} min={0} max={1000} ariaLabel={t('questAdmin.prizeCoins')} onSave={(n) => save({ prizeCoins: n })} />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text-muted)' }}>{t('questAdmin.kidsOnly')}</div>
                <div style={hint}>{t('questAdmin.kidsOnlyDesc')}</div>
              </div>
              <Toggle checked={s.prizeKidsOnly} label={t('questAdmin.kidsOnly')} onChange={(v) => save({ prizeKidsOnly: v })} />
            </div>
            <label style={label}>
              🏁 {t('questAdmin.finisherCoins')}
              <NumberBox value={s.finisherCoins} min={0} max={1000} ariaLabel={t('questAdmin.finisherCoins')} onSave={(n) => save({ finisherCoins: n })} />
            </label>
            <label style={label}>
              ⭐ {t('questAdmin.coinsPerStar')}
              <NumberBox value={s.coinsPerStar} min={0} max={20} width={64} ariaLabel={t('questAdmin.coinsPerStar')} onSave={(n) => save({ coinsPerStar: n })} />
            </label>
          </div>

          <div style={box}>
            <div style={heading}>📏 {t('questAdmin.lengthTitle')}</div>
            <label style={label}>
              <input type="radio" name="quest-length" checked={s.length === 'auto'} onChange={() => save({ length: 'auto' })} />
              {t('questAdmin.lengthAuto')}
            </label>
            <label style={label}>
              <input type="radio" name="quest-length" checked={s.length !== 'auto'} onChange={() => save({ length: game?.trail.length && game.trail.length >= LENGTHS.min ? Math.min(LENGTHS.max, game.trail.length) : 80 })} />
              {t('questAdmin.lengthFixed')}
              {s.length !== 'auto' && (
                <>
                  <NumberBox value={s.length} min={LENGTHS.min} max={LENGTHS.max} width={70} ariaLabel={t('questAdmin.lengthTitle')} onSave={(n) => save({ length: n })} />
                  {t('questAdmin.lengthSpaces')} ({LENGTHS.min}–{LENGTHS.max})
                </>
              )}
            </label>
            <div style={hint}>{t('questAdmin.lengthHelp')}</div>
            {game && <div style={hint}>{t('questAdmin.thisMonth').replace('{length}', String(game.trail.length))}</div>}
          </div>

          <div style={box}>
            <div style={heading}>🗺️ {t('questAdmin.lookTitle')}</div>
            <label style={label}>
              {t('questAdmin.timeOfDay')}
              <select className="tq-input-compact" value={s.timeOfDay} onChange={(e) => save({ timeOfDay: e.target.value as QuestSettings['timeOfDay'] })}>
                <option value="day">☀️ {t('questAdmin.day')}</option>
                <option value="sunset">🌇 {t('questAdmin.sunset')}</option>
                <option value="night">🌙 {t('questAdmin.night')}</option>
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text-muted)' }}>🌫️ {t('questAdmin.fog')}</div>
                <div style={hint}>{t('questAdmin.fogDesc')}</div>
              </div>
              <Toggle checked={s.fog} label={t('questAdmin.fog')} onChange={(v) => save({ fog: v })} />
            </div>
          </div>
        </>
      )}
      {message && <div role="status" style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-accent)' }}>{message}</div>}
    </div>
  );
}
