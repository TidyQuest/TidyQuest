import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { UserAvatar } from '../shared/UserAvatar';
import { TrailMap, MAP_WIDTH } from '../quest/TrailMap';
import { THEMES, ICONS, META } from '../quest/trailBuild';
import { daysLeft, fill, mapTexts, turnMessage, worldTitle, type TurnMessage } from '../quest/questText';
import { MonthEnd } from '../quest/MonthEnd';
import type { QuestState } from '../quest/types';

/**
 * Quest Trail's map page (NEW-40): the month's adventure map with everyone's piece, the die at the bottom, and a
 * card saying what each roll did. The die is rolled on the server; the page only walks the piece to where it landed.
 * A parent can roll for someone who doesn't sign in: Settings → Quest Trail → Roll opens /quest?for=<their id>.
 */

interface Props {
  userId: number;
  language: string;
  coins: number;
  onCoinsChanged: () => void;
  /** Kid mode: results are a big picture and two or three words, and the small hints go */
  kidMode?: boolean;
  /** Parents can roll for someone else (?for=<userId>) */
  isAdmin?: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => { window.setTimeout(r, ms); });
const calm = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const FACES: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const KEY_ITEMS = [['keyCoins', 'keyCoinsWhat', 'coins'], ['keyCard', 'keyCardWhat', 'card'], ['keyTreat', 'keyTreatWhat', 'treat'], ['', 'keyUpWhat', 'up'], ['', 'keyDownWhat', 'down'], ['keyHigh', 'keyHighWhat', 'high']] as const;

/** Scrolls the page so someone's piece sits a little above the middle of the screen */
function follow(userId: number, smooth: boolean) {
  const el = document.querySelector(`[data-piece="${userId}"]`);
  if (!el) return;
  const top = window.scrollY + el.getBoundingClientRect().top - window.innerHeight * 0.45;
  window.scrollTo({ top: Math.max(0, top), behavior: smooth && !calm() ? 'smooth' : 'auto' });
}

const QuestTrail: React.FC<Props> = ({ userId, language, coins, onCoinsChanged, kidMode, isAdmin }) => {
  const { t } = useTranslation(language);
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [state, setState] = useState<QuestState | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [face, setFace] = useState(5);
  const [walkPos, setWalkPos] = useState<number | null>(null);
  const [jump, setJump] = useState<{ from: number; to: number; t: number } | null>(null);
  const [result, setResult] = useState<TurnMessage | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [zoom, setZoom] = useState(1);
  const scrolled = useRef(false);

  const load = useCallback(() => api.questState()
    .then((s) => {
      if (!s.enabled) { navigate('/', { replace: true }); return; }
      setState(s);
      setFailed(false);
    })
    .catch(() => setFailed(true)), [navigate]);
  useEffect(() => { void load(); }, [load]);

  // The map is drawn 390 px wide: narrower phones shrink it to fit, so nothing scrolls sideways
  const columnRef = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setZoom(Math.min(1, e.contentRect.width / MAP_WIDTH)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const me = state?.players.find((p) => p.userId === userId) ?? null;
  // Whose die it is: yours, or (a parent's) someone else's from Settings → Quest Trail → Roll
  const forId = Number(search.get('for'));
  const other = isAdmin && forId && forId !== userId ? state?.players.find((p) => p.userId === forId) ?? null : null;
  const turnOf = other ?? me;
  const turnId = turnOf?.userId ?? null;
  const activePos = walkPos ?? turnOf?.position ?? 0;
  const posOf = (p: { userId: number; position: number }) => (p.userId === turnId ? activePos : p.position);
  const texts = useMemo(() => (state ? mapTexts(t, language, state, userId, me?.position ?? 0) : null), [state, t, language, userId, me?.position]);

  // Open on the piece whose turn it is (or the leader's when you're watching)
  useEffect(() => {
    if (!state || scrolled.current) return;
    scrolled.current = true;
    const lead = [...state.players].sort((a, b) => b.position - a.position)[0];
    const who = turnId ?? lead?.userId;
    if (who != null) requestAnimationFrame(() => follow(who, false));
  }, [state, turnId]);

  const roll = async () => {
    if (!state || !turnOf || busy || turnOf.starsLeft < 1) return;
    const who = turnOf.userId;
    setBusy(true);
    setResult(null);
    setShowKey(false);
    setWalkPos(turnOf.position);
    follow(who, true);
    const tumble = window.setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 75);
    let turn;
    try {
      [turn] = await Promise.all([api.questRoll(other ? who : undefined), sleep(calm() ? 0 : 600)]);
    } catch {
      window.clearInterval(tumble);
      setWalkPos(null);
      setBusy(false);
      setResult({ kind: 'plain', title: t('quest.rollFailedTitle'), body: t('quest.rollFailed') });
      return;
    }
    window.clearInterval(tumble);
    const step = calm() ? 0 : 300;
    if (turn.roll > 0) {
      setFace(turn.roll);
      await sleep(step ? 350 : 0);
      const move = turn.events.find((e) => e.t === 'move');
      if (move && move.t === 'move') {
        for (let p = move.from + 1; p <= move.to; p++) {
          setWalkPos(p);
          window.setTimeout(() => follow(who, true), 40);
          await sleep(step);
        }
      }
      const link = turn.events.find((e) => e.t === 'shortcut' || e.t === 'slide');
      if (link && (link.t === 'shortcut' || link.t === 'slide')) {
        await sleep(step ? 500 : 0);
        if (step) {
          for (let k = 1; k <= 10; k++) {
            setJump({ from: link.from, to: link.to, t: k / 11 });
            await sleep(90);
          }
        }
        setJump(null);
        setWalkPos(link.to);
        window.setTimeout(() => follow(who, true), 60);
      }
    }
    const names = new Map(state.players.map((p) => [p.userId, p.displayName]));
    setResult(turnMessage(t, language, state.trail.world, turn.events, turn.starsLeft, names, state.coinsPerStar));
    await load();
    setWalkPos(null);
    setBusy(false);
    // Your coins (a high five pays you too when you roll for someone)
    if (turn.coins > 0 || other) onCoinsChanged();
  };
  // Back to where you came from, or Today when the page was opened by itself (nothing to go back to)
  const back = () => { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else navigate('/'); };

  if (failed && !state) return <div className="tq-card tq-card-padded" role="alert">{t('quest.loadFailed')}</div>;
  if (!state || !texts) return <div className="quest-page-loading" aria-busy="true" />;

  const world = state.trail.world, T = THEMES[world];
  const left = daysLeft(state.trail.endDay);
  const stars = turnOf?.starsLeft ?? 0;
  const finished = !!turnOf?.finishedAt;
  const canRoll = !!turnOf && !busy && stars > 0;
  const waiting = !other && stars === 0 && (state.me?.today.pending ?? 0) > 0;
  const sorted = [...state.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.position - a.position);
  const len = state.trail.length;
  const rollLabel = busy ? t('quest.rolling') : finished ? (stars > 0 ? fill(t('quest.cashIn'), { n: state.coinsPerStar }) : t('quest.finished')) : stars > 0 ? t('quest.roll') : t('quest.noStars');
  const hint = finished ? fill(t('quest.hintFinished'), { n: state.coinsPerStar }) : stars > 0 ? t('quest.hintRoll') : t(waiting ? 'quest.hintWaiting' : 'quest.hintEarn');
  const myPos = me ? posOf(me) : 0;
  const tile = result ? META[result.kind === 'finish' ? 'start' : result.kind] : null;

  return (
    <div className="quest-page">
      <header className="quest-head">
        <div className="quest-head-row">
          <button type="button" className="quest-icon-btn" aria-label={t('quest.back')} onClick={back}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <div className="quest-head-title">
            <h1>{t('quest.title')}</h1>
            <span>{worldTitle(t, world)} · {left > 0 ? fill(t(left === 1 ? 'quest.dayLeft' : 'quest.daysLeft'), { n: left }) : t('quest.lastDay')}</span>
          </div>
          <button type="button" className="quest-icon-btn" aria-label={t('quest.keyTitle')} aria-expanded={showKey} onClick={() => setShowKey((v) => !v)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5zM9 4v13.5M15 6.5V20" /></svg>
          </button>
          <span className="quest-coins" aria-label={fill(t('quest.coinsAria'), { n: coins })}><span aria-hidden="true" className="quest-coin" />{coins}</span>
        </div>
        <nav className="quest-chips" aria-label={t('quest.whoWhere')}>
          {sorted.map((p, i) => (
            <button key={p.userId} type="button" className={`quest-chip${p.userId === userId ? ' you' : ''}`} onClick={() => follow(p.userId, true)}
              aria-label={fill(t('quest.chipAria'), { place: i + 1, name: p.displayName, pos: p.position })}>
              <UserAvatar userId={p.userId} name={p.displayName} color={p.avatarColor || '#6B5A4B'} size={26}
                avatarType={p.avatarType ?? undefined} avatarPreset={p.avatarPreset} avatarPhotoUrl={p.avatarPhotoUrl} />
              {p.finishedAt ? '🏁' : posOf(p)}
            </button>
          ))}
        </nav>
        {showKey && (
          <section className="quest-key tq-card" aria-label={t('quest.keyTitle')}>
            <div className="quest-key-head">
              <h2>{t('quest.keyTitle')}</h2>
              <button type="button" className="quest-icon-btn" aria-label={t('quest.closeKey')} onClick={() => setShowKey(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="quest-key-grid">
              {KEY_ITEMS.map(([title, what, kind]) => (
                <div key={kind} className="quest-key-item">
                  <span className="quest-key-disc" style={{ background: META[kind].bg, borderColor: META[kind].fg, color: META[kind].fg }}>
                    {kind === 'coins' ? <b style={{ color: '#6E4000' }}>+2</b> : (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[kind]} /></svg>
                    )}
                  </span>
                  <span>
                    <b>{title ? t(`quest.${title}`) : t(`quest.${world}${kind === 'up' ? 'Go' : 'Back'}`)}</b>
                    <small>{t(`quest.${what}`)}</small>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </header>

      <div className="quest-map-col" ref={columnRef} style={{ background: T.ground }}>
        <div className="quest-rail-holder">
          <div className="quest-rail" aria-hidden="true">
            <span className="quest-rail-track" />
            <span className="quest-rail-done" style={{ height: `${(100 * myPos) / len}%` }} />
            {state.players.map((p) => {
              const mine = p.userId === userId, pos = posOf(p);
              return (
                <button key={p.userId} type="button" tabIndex={-1} className={`quest-rail-dot${mine ? ' you' : ''}`} style={{ top: `${(100 * pos) / len}%` }} onClick={() => follow(p.userId, true)}>
                  <UserAvatar name={p.displayName} color={p.avatarColor || '#6B5A4B'} size={mine ? 22 : 16} avatarType={p.avatarType ?? undefined} avatarPreset={p.avatarPreset} avatarPhotoUrl={p.avatarPhotoUrl} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="quest-map" style={{ zoom }}>
          <TrailMap world={world} month={state.trail.month} length={len} spaces={state.trail.spaces} players={state.players} meId={me ? userId : null}
            activeId={turnId} activePos={activePos} jump={jump} reach={canRoll && !finished} timeOfDay={state.timeOfDay} fog={state.fog} texts={texts} />
        </div>
      </div>

      <div className="quest-dock">
        {result && tile && (
          <div className={`quest-result tq-card${kidMode ? ' kid' : ''}`} role="status">
            <span className="quest-result-tile" style={{ background: tile.bg, color: tile.fg }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[result.kind]} /></svg>
            </span>
            <span className="quest-result-text">
              <strong>{result.title}</strong>
              {!kidMode && <span>{result.body}</span>}
            </span>
            <button type="button" className="quest-icon-btn" aria-label={t('quest.close')} onClick={() => setResult(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        )}
        {other && (
          <div className="quest-for tq-card">
            <UserAvatar userId={other.userId} name={other.displayName} color={other.avatarColor || '#6B5A4B'} size={26}
              avatarType={other.avatarType ?? undefined} avatarPreset={other.avatarPreset} avatarPhotoUrl={other.avatarPhotoUrl} />
            <b>{fill(t('quest.rollingFor'), { name: other.displayName })}</b>
            <button type="button" className="quest-icon-btn" aria-label={t('quest.backToMine')} disabled={busy} onClick={() => navigate('/quest', { replace: true })}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        )}
        {turnOf ? (
          <div className="quest-diebar tq-card">
            <div className={`quest-die${busy ? ' busy' : ''}`} role="img" aria-label={fill(t('quest.dieAria'), { n: face })}>
              {Array.from({ length: 9 }, (_, n) => <span key={n} className={(FACES[face] ?? []).includes(n) ? 'on' : ''} />)}
            </div>
            <div className="quest-stars">
              <span>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z" fill="#FFC93C" stroke="#D98A0B" strokeWidth="1.4" strokeLinejoin="round" /></svg>
                <b>{stars}</b> {t(stars === 1 ? 'quest.starOne' : 'quest.starMany')}
              </span>
              {!kidMode && <small>{hint}</small>}
            </div>
            <button type="button" className="quest-roll" disabled={!canRoll} onClick={() => void roll()}>{rollLabel}</button>
          </div>
        ) : (
          <div className="quest-diebar tq-card"><span className="quest-watch">{t('quest.watching')}</span></div>
        )}
      </div>

      {state.lastMonth && (
        <MonthEnd last={state.lastMonth} current={state} userId={userId} language={language}
          onDone={() => { void api.questEndSeen().then(load, load); }} />
      )}
    </div>
  );
};

export default QuestTrail;
