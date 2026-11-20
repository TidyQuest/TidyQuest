import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { THEMES, worldFor } from './trailBuild';
import { FINISHES } from './worldArt';
import { fill, monthName } from './questText';

/**
 * Someone's trail badges for a year (Quest Trail, NEW-40 and ENH-44): one tile per month showing that month's finish
 * (the landmark at the end of its map), in colour when they reached it and faded when not, and a small crown when
 * they got there first. Shown on the end-of-month screen, the Achievements page and the Quest Trail page's badge button.
 */

interface Props {
  year: string;
  /** Months reached the finish ("2026-03") */
  finished: string[];
  /** Months they came first */
  first: string[];
  /** The month to mark with a dashed ring when it has no badge yet */
  current?: string;
  language: string;
}

export const TrailBadgeRow: React.FC<Props> = ({ year, finished, first, current, language }) => {
  const { t } = useTranslation(language);
  const narrow = (m: number) => new Intl.DateTimeFormat(language, { month: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(year), m, 15)));
  return (
    <div className="quest-end-badges" role="img" aria-label={fill(t('quest.endBadgeCount'), { n: finished.length })}>
      {Array.from({ length: 12 }, (_, m) => {
        const key = `${year}-${String(m + 1).padStart(2, '0')}`;
        const won = finished.includes(key), crown = first.includes(key);
        const month = monthName(language, key);
        const art = FINISHES[worldFor(key)];
        return (
          <span key={key} className={`quest-badge${won ? ' won' : ''}${!won && key === current ? ' this' : ''}`}
            title={crown ? fill(t('quest.badgeFirst'), { month }) : won ? fill(t('quest.badgeFinished'), { month }) : month}>
            <span className="quest-badge-tile" style={won ? { borderColor: THEMES[worldFor(key)].accent } : undefined}>
              {art ? <span className="quest-badge-art" dangerouslySetInnerHTML={{ __html: art }} /> : (won ? '★' : '')}
            </span>
            <span className="quest-badge-month">{narrow(m)}</span>
            {crown && <i className="quest-badge-crown" aria-hidden="true">👑</i>}
          </span>
        );
      })}
    </div>
  );
};

/** The heading over the row: the title and "3 of 12" */
export const TrailBadgeHead: React.FC<{ title: string; count: number; language: string }> = ({ title, count, language }) => {
  const { t } = useTranslation(language);
  return (
    <div className="quest-end-badges-head">
      <b>{title}</b>
      <small>{fill(t('quest.endBadgeCount'), { n: count })}</small>
    </div>
  );
};

export default TrailBadgeRow;
