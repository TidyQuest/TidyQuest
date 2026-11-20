import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { KidQuestCard } from './KidQuestCard';
import { MonthEnd } from './MonthEnd';
import { QuestRail } from './QuestRail';
import { daysLeft, fill } from './questText';
import type { QuestPlayer, QuestState } from './types';

/**
 * Quest Trail's card on Today (NEW-40): stars waiting to be rolled, where everyone is on the trail, and today's two
 * stars (one for any chore, a bonus at three), with any chores still waiting for a parent's OK. Opens the map. Also
 * shows last month's results once, on the 1st.
 */

interface Props {
  userId: number;
  language?: string;
  /** Changes whenever Today reloads (a chore done or taken back), so the stars stay current */
  refreshKey: unknown;
  /** Kid mode: a big Roll button right on the card, few words (KidQuestCard) */
  kidMode?: boolean;
  /** After a roll on the card (kid mode): Today reloads, for the coins */
  onRolled?: () => void;
}

const STAR = 'M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z';

export const QuestCard: React.FC<Props> = ({ userId, language, refreshKey, kidMode, onRolled }) => {
  const { t } = useTranslation(language);
  const navigate = useNavigate();
  const [state, setState] = useState<QuestState | null>(null);
  const [endSeen, setEndSeen] = useState(false);

  useEffect(() => {
    let live = true;
    api.questState().then((s) => { if (live) setState(s.enabled ? s : null); }).catch(() => { /* the card just stays away */ });
    return () => { live = false; };
  }, [refreshKey]);
  const reload = () => { api.questState().then((s) => setState(s.enabled ? s : null)).catch(() => undefined); onRolled?.(); };

  if (!state) return null;
  const len = state.trail.length;
  const me = state.players.find((p) => p.userId === userId) ?? null;
  const stars = state.me?.starsLeft ?? 0;
  const left = daysLeft(state.trail.endDay);
  const others = state.players.filter((p) => p.userId !== userId);
  const ahead = me ? others.filter((p) => p.position > me.position).sort((a, b) => b.position - a.position)[0] : null;
  const leader = [...state.players].sort((a, b) => b.position - a.position)[0];
  const today = state.me?.today;

  const status = !me
    ? (stars > 0 ? '' : t('quest.cardWatch'))
    : me.finishedAt
      ? fill(t('quest.cardFinished'), { n: state.coinsPerStar })
      : stars > 0 ? fill(t(stars === 1 ? 'quest.cardStarOne' : 'quest.cardStars'), { n: stars }) : t('quest.cardNoStars');
  const lead = (p: QuestPlayer) => fill(t(p.finishedAt ? 'quest.cardLeaderDone' : 'quest.cardLeader'), { name: p.displayName });
  const race = [
    me && !me.finishedAt
      ? (ahead ? (ahead.finishedAt ? lead(ahead) : fill(t('quest.cardAhead'), { name: ahead.displayName, n: ahead.position - me.position }))
        : others.some((p) => p.position === me.position) ? '' : t('quest.cardLead'))
      : '',
    !me && leader ? lead(leader) : '',
    left > 0 ? fill(t(left === 1 ? 'quest.dayLeft' : 'quest.daysLeft'), { n: left }) : t('quest.lastDay'),
  ].filter(Boolean).join(' · ');
  // Today's two stars, and chores still waiting for a parent's OK (Strict Mode): their star comes with the approval
  const bonusLeft = today ? Math.max(1, (state.me?.bonusAt ?? 3) - today.chores) : 0;
  const todayLine = !today || me?.finishedAt ? '' : today.stars >= 2
    ? t('quest.todayBoth')
    : today.stars === 0 ? t(today.pending > 0 ? 'quest.todayWaiting' : 'quest.todayFirst')
      : fill(t(bonusLeft === 1 ? 'quest.todayBonusOne' : 'quest.todayBonusMany'), { n: bonusLeft });
  const waiting = today && today.pending > 0 && !me?.finishedAt ? fill(t('quest.todayPending'), { n: today.pending }) : '';

  const monthEnd = state.lastMonth && !endSeen && (
    <MonthEnd last={state.lastMonth} current={state} userId={userId} language={language || 'en'}
      onDone={() => { setEndSeen(true); void api.questEndSeen().catch(() => undefined).then(() => navigate('/quest')); }} />
  );
  if (kidMode) return <><KidQuestCard state={state} userId={userId} language={language} onRolled={reload} />{monthEnd}</>;

  return (
    <>
      <button type="button" className="tq-card quest-card" onClick={() => navigate('/quest')}>
        <span className="quest-card-row">
          <span className="quest-card-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24"><path d={STAR} fill="#FFC93C" stroke="#D98A0B" strokeWidth="1.4" strokeLinejoin="round" /></svg>
          </span>
          <span className="quest-card-text">
            <b>{t('quest.title')}</b>
            {status && <span>{status}</span>}
          </span>
          <span className="quest-card-play">{me && stars > 0 && !me.finishedAt ? t('quest.play') : t('quest.seeMap')}</span>
        </span>
        <QuestRail players={state.players} userId={userId} length={len} crown={state.crown} />
        <small className="quest-card-race">{race}</small>
        {today && todayLine && (
          <span className="quest-card-today">
            <span>
              {todayLine}{today.card === 'open' ? ` ${t('quest.todayCard')}` : ''}
              {waiting && <span className="quest-card-waiting">{waiting}</span>}
            </span>
            <span className="quest-card-stars">
              {[0, 1].map((i) => {
                const got = today.stars > i;
                return (
                  <svg key={i} width="28" height="28" viewBox="0 0 24 24" role="img"
                    aria-label={`${t(i === 0 ? 'quest.starToday' : 'quest.starBonus')}: ${t(got ? 'quest.starGot' : 'quest.starNotYet')}`}>
                    <path d={STAR} fill={got ? '#FFC93C' : '#FFF8DE'} stroke="#D98A0B" strokeWidth={got ? 1.3 : 1.1} strokeDasharray={got ? undefined : '2 1.6'} strokeLinejoin="round" />
                  </svg>
                );
              })}
            </span>
          </span>
        )}
      </button>
      {monthEnd}
    </>
  );
};

export default QuestCard;
