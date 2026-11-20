import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { ICONS, META } from './trailBuild';
import { QuestRail } from './QuestRail';
import { fill, turnMessage, type TurnMessage } from './questText';
import type { QuestState } from './types';

/**
 * Quest Trail's Today card in kid mode (NEW-40 part 3): few words for a new reader. A big Roll button rolls right
 * here, the result is a picture and two or three words, today's progress is two big stars that fill in (with a
 * line when chores are waiting for a parent's OK), and "See the map" sits underneath.
 */

interface Props {
  state: QuestState;
  userId: number;
  language?: string;
  /** After a roll: the card's state again, and the coins on Today */
  onRolled: () => void;
}

const STAR = 'M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z';
const FACES: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const sleep = (ms: number) => new Promise<void>((r) => { window.setTimeout(r, ms); });
const calm = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const KidQuestCard: React.FC<Props> = ({ state, userId, language, onRolled }) => {
  const { t } = useTranslation(language);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [face, setFace] = useState<number | null>(null);
  const [result, setResult] = useState<TurnMessage | null>(null);

  const me = state.players.find((p) => p.userId === userId) ?? null;
  const stars = state.me?.starsLeft ?? 0;
  const finished = !!me?.finishedAt;
  const today = state.me?.today;
  const len = state.trail.length;

  const roll = async () => {
    if (!me || busy || stars < 1) return;
    setBusy(true);
    setResult(null);
    const tumble = window.setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 75);
    try {
      const [turn] = await Promise.all([api.questRoll(), sleep(calm() ? 0 : 700)]);
      window.clearInterval(tumble);
      if (turn.roll > 0) setFace(turn.roll);
      const names = new Map(state.players.map((p) => [p.userId, p.displayName]));
      setResult(turnMessage(t, language || 'en', state.trail.world, turn.events, turn.starsLeft, names, state.coinsPerStar));
      onRolled();
    } catch {
      window.clearInterval(tumble);
      setFace(null);
      setResult({ kind: 'plain', title: t('quest.rollFailedTitle'), body: '' });
    } finally {
      setBusy(false);
    }
  };

  const tile = result ? META[result.kind === 'finish' ? 'start' : result.kind] : null;
  const label = busy ? t('quest.rolling') : finished ? (stars > 0 ? fill(t('quest.cashIn'), { n: state.coinsPerStar }) : t('quest.finished')) : stars > 0 ? t('quest.roll') : t('quest.noStars');

  return (
    <div className="tq-card quest-card quest-kid">
      <span className="quest-card-row">
        <span className="quest-card-text"><b>{t('quest.title')}</b></span>
        {me && (
          <span className="quest-kid-count" aria-label={`${stars} ${t(stars === 1 ? 'quest.starOne' : 'quest.starMany')}`}>
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} fill="#FFC93C" stroke="#D98A0B" strokeWidth="1.4" strokeLinejoin="round" /></svg>
            {stars}
          </span>
        )}
      </span>
      <QuestRail players={state.players} userId={userId} length={len} crown={state.crown} youSize={24} />
      {today && !finished && (
        <span className="quest-kid-today">
          {[0, 1].map((i) => {
            const got = today.stars > i;
            return (
              <svg key={i} width="48" height="48" viewBox="0 0 24 24" role="img"
                aria-label={`${t(i === 0 ? 'quest.starToday' : 'quest.starBonus')}: ${t(got ? 'quest.starGot' : 'quest.starNotYet')}`}>
                <path d={STAR} fill={got ? '#FFC93C' : '#FFF8DE'} stroke="#D98A0B" strokeWidth={got ? 1.3 : 1.1} strokeDasharray={got ? undefined : '2 1.6'} strokeLinejoin="round" />
              </svg>
            );
          })}
        </span>
      )}
      {today && !finished && today.pending > 0 && <span className="quest-kid-waiting">{fill(t('quest.todayPending'), { n: today.pending })}</span>}
      {result && tile && (
        <span className="quest-kid-result" role="status">
          <span className="quest-result-tile" style={{ background: tile.bg, color: tile.fg }}>
            {face && result.kind === 'plain' ? <b className="quest-kid-face">{face}</b> : (
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[result.kind]} /></svg>
            )}
          </span>
          <strong>{result.title}</strong>
        </span>
      )}
      {me && (
        <button type="button" className="quest-roll quest-kid-roll" disabled={busy || stars < 1} onClick={() => void roll()}>
          {busy && face ? (
            <span className="quest-die busy" aria-hidden="true">
              {Array.from({ length: 9 }, (_, n) => <span key={n} className={(FACES[face] ?? []).includes(n) ? 'on' : ''} />)}
            </span>
          ) : '🎲'} {label}
        </button>
      )}
      <button type="button" className="tq-btn tq-btn-secondary quest-kid-map" onClick={() => navigate('/quest')}>🗺️ {t('quest.seeMap')}</button>
    </div>
  );
};

export default KidQuestCard;
