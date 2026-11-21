import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { UserAvatar } from '../shared/UserAvatar';
import { THEMES } from './trailBuild';
import { TrailBadgeHead, TrailBadgeRow } from './TrailBadges';
import { fill, finishPlace, monthName, prizeText, shortDate, worldTitle } from './questText';
import type { QuestLastMonth, QuestState } from './types';

/**
 * The end-of-month screen (Quest Trail, NEW-40): shown once, the first time someone opens the app in the new month.
 * Who won, everyone's place, the viewer's coins and badges this year, and the new world.
 */

interface Props {
  last: QuestLastMonth;
  current: QuestState;
  userId: number;
  language: string;
  /** Closes the screen (and marks it seen) */
  onDone: () => void;
  /** The button's label; defaults to "See the new trail" */
  doneLabel?: string;
}

const TROPHY = 'M8 4h8v5a4 4 0 01-8 0V4zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8 20h8';

export const MonthEnd: React.FC<Props> = ({ last, current, userId, language, onDone, doneLabel }) => {
  const { t } = useTranslation(language);
  const button = useRef<HTMLButtonElement | null>(null);
  // Focus the button without scrolling to it, so the screen opens at its top (BUG-61)
  useEffect(() => { button.current?.focus({ preventScroll: true }); }, []);

  const place = finishPlace(t, last.world);
  const month = monthName(language, last.month);
  const winner = last.players.find((p) => p.place === 1) ?? null;
  const me = last.players.find((p) => p.userId === userId) ?? null;
  const prize = prizeText(t, last.prize);
  const prizeWinner = last.players.find((p) => p.prizeWon) ?? null;

  const headline = winner
    ? (winner.userId === userId ? fill(t('quest.endYouWon'), { month }) : fill(t('quest.endWon'), { name: winner.displayName, month }))
    : fill(t('quest.endNoWinner'), { place });
  const sub = prize && prizeWinner
    ? (prizeWinner.userId === userId ? fill(t('quest.endPrizeYou'), { place, prize }) : fill(t('quest.endPrize'), { place, name: prizeWinner.displayName, prize }))
    : winner?.finishedAt ? fill(t('quest.endFirst'), { place, date: shortDate(language, winner.finishedAt) }) : '';

  const year = last.month.slice(0, 4);
  const T = THEMES[last.world];

  return (
    <div className="quest-end" role="dialog" aria-modal="true" aria-labelledby="quest-end-title">
      <div className="quest-end-inner">
        <div className="quest-end-top">
          <span className="quest-end-trophy" aria-hidden="true">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={TROPHY} /></svg>
          </span>
          <span className="quest-end-kicker">{fill(t('quest.endOver'), { title: worldTitle(t, last.world) })}</span>
          <h1 id="quest-end-title">{headline}</h1>
          {sub && <p>{sub}</p>}
        </div>

        {me && (
          <section className="quest-end-me">
            <UserAvatar userId={me.userId} name={me.displayName} color={me.avatarColor || '#1971C2'} size={40}
              avatarType={me.avatarType ?? undefined} avatarPreset={me.avatarPreset} avatarPhotoUrl={me.avatarPhotoUrl} />
            <span>
              <b>{me.finishedAt
                ? (me.place === 1 ? t('quest.endYouFirst') : fill(t('quest.endYouFinished'), { n: me.place ?? 0 }))
                : fill(t('quest.endYouToGo'), { n: Math.max(0, last.length - me.position) })}</b>
              {last.myCoins > 0 && <small>{fill(t('quest.endYouCoins'), { n: last.myCoins })}</small>}
            </span>
          </section>
        )}

        {me && (
          <section className="quest-end-card tq-card">
            <TrailBadgeHead title={t('quest.endBadges')} count={last.badges.length} language={language} />
            <TrailBadgeRow year={year} finished={last.badges} first={last.firsts ?? []} current={last.month} language={language} />
          </section>
        )}

        <section className="quest-end-card tq-card quest-end-rows">
          {last.players.map((p, i) => (
            <div key={p.userId} className="quest-end-row">
              <span className="quest-end-place">{i + 1}</span>
              <UserAvatar userId={p.userId} name={p.displayName} color={p.avatarColor || '#6B5A4B'} size={28}
                avatarType={p.avatarType ?? undefined} avatarPreset={p.avatarPreset} avatarPhotoUrl={p.avatarPhotoUrl} />
              <b>{p.userId === userId ? fill(t('quest.endRowYou'), { name: p.displayName }) : p.displayName}</b>
              <span className={p.finishedAt ? 'done' : ''}>
                {p.place === 1 ? t('quest.endRowWinner') : p.finishedAt ? t('quest.endRowFinished') : fill(t('quest.mapToGo'), { n: Math.max(0, last.length - p.position) })}
              </span>
            </div>
          ))}
        </section>
        <small className="quest-end-note">{t('quest.endAutoRolled')}</small>

        <section className="quest-end-next" style={{ borderColor: T.edge }}>
          <small>{t('quest.endStarts')}</small>
          <b>{fill(t('quest.endNew'), { month: monthName(language, current.trail.month), title: worldTitle(t, current.trail.world) })}</b>
          <span>{t('quest.endNewText')}</span>
        </section>

        <button ref={button} type="button" className="tq-btn tq-btn-primary quest-end-go" onClick={onDone}>{doneLabel ?? t('quest.endSee')}</button>
      </div>
    </div>
  );
};

export default MonthEnd;
