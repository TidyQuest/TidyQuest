import React from 'react';
import { TaskIcon } from '../icons/TaskIcons';
import { CoinIcon } from '../icons/UIIcons';
import { EffortDots } from './EffortDots';
import { useTranslation } from '../../hooks/useTranslation';
import { useWeekStart } from '../../utils/week';
import { getHealthColor } from '../../utils/health';
import { localeFor } from '../../utils/locale';
import { seasonLabel, startsLater } from '../../utils/schedule';
import { choreSchedule, type ChoreTextTask } from '../../utils/choreText';

/** The square tick at the end of a row: ready to tap, already done, or not possible right now */
export interface ChoreTick {
  state: 'ready' | 'done' | 'off';
  /** What a tap does, or why it can't be done (read out, and shown on hover) */
  label: string;
  onTick?: () => void;
}

interface ChoreRowProps {
  taskId?: number;
  iconKey?: string;
  /** The room's colours behind the icon (Home and Tasks, where chores from every room mix) */
  tileColor?: string;
  tileBorder?: string;
  name: string;
  /** The line under the name, "room · when": its parts, joined with " · " (empty ones are dropped) */
  sub?: React.ReactNode[];
  /** Lets the line under the name wrap when the row is closed too */
  wrapSub?: boolean;
  coins?: React.ReactNode;
  /** Before the icon (the Tasks page's select box) */
  leading?: React.ReactNode;
  tick?: ChoreTick | null;
  /** Instead of the tick (a kid's ▶ Start when the timer comes first) */
  trailing?: React.ReactNode;
  /** With `children`, tapping the row opens them underneath */
  open?: boolean;
  onToggle?: () => void;
  pressed?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const TickMark = () => (
  <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M4 9.5L7.5 13L14 5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * One chore, drawn the same on Home, Tasks and room pages (ENH-25): icon, name (up to two lines),
 * "room · when", coins and a square tick. Tapping the row opens its details and the less-used buttons.
 */
export function ChoreRow({ taskId, iconKey, tileColor, tileBorder, name, sub, wrapSub, coins, leading, tick, trailing, open, onToggle, pressed, className = '', children }: ChoreRowProps) {
  const parts = (sub ?? []).filter((p) => p !== null && p !== undefined && p !== false && p !== '');
  return (
    <div className={`chore-row${open ? ' open' : ''}${tick?.state === 'done' ? ' done' : ''} ${className}`} data-task-id={taskId}>
      <div className="chore-row-top">
        <button type="button" className="chore-row-main" onClick={onToggle} aria-expanded={children !== undefined ? !!open : undefined} aria-pressed={pressed}>
          {leading}
          <span className="chore-tile" style={tileColor ? { backgroundColor: tileColor, borderColor: tileBorder ?? tileColor } : undefined}>
            <TaskIcon iconKey={iconKey} size={24} />
          </span>
          <span className="chore-text">
            <span className="chore-name">{name}</span>
            {parts.length > 0 && (
              <span className={`chore-sub${wrapSub ? ' wrap' : ''}`}>
                {parts.map((p, i) => <React.Fragment key={i}>{i > 0 ? ' · ' : ''}{p}</React.Fragment>)}
              </span>
            )}
          </span>
          {coins != null && coins !== false && <span className="chore-coins">{coins}</span>}
        </button>
        {trailing ?? (tick && (
          <button type="button" className={`chore-tick ${tick.state}`} disabled={tick.state !== 'ready'}
            title={tick.label} aria-label={`${tick.label}: ${name}`}
            onClick={() => tick.state === 'ready' && tick.onTick?.()}>
            <TickMark />
          </button>
        ))}
      </div>
      {open && children !== undefined && <div className="chore-detail">{children}</div>}
    </div>
  );
}

/** A late chore's "when", in red */
export const ChoreLate = ({ children }: { children: React.ReactNode }) => <span className="chore-late">{children}</span>;

/** Coins for a row; with a double coins event or the Rescue Mission, the boosted amount and "⚡ 2×" */
export function ChoreCoins({ coins, boost = 1, format = String }: { coins: number; boost?: number; format?: (n: number) => string }) {
  return (
    <>
      <span className="chore-coins-amount"><CoinIcon />{format(boost > 1 ? Math.round(coins * boost) : coins)}</span>
      {boost > 1 && <span className="chore-coins-boost">⚡ {boost}×</span>}
    </>
  );
}

/** A button in an opened row (Edit, Pin, Done earlier…) */
export function ChoreAct({ on, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return <button type="button" {...props} className={`chore-act${on ? ' on' : ''} ${className}`} />;
}

export interface ChoreFactsTask extends ChoreTextTask {
  effort: number;
  isSeasonal?: boolean;
  timerMinutes?: number | null;
  assignedUsers?: Array<{ id: number; displayName: string; coinPercentage?: number }>;
  assignmentMode?: 'first' | 'shared' | 'custom' | 'rotating';
  rotationCurrentUserId?: number | null;
  sharedCompletions?: Array<{ userId: number }>;
  repeatLimit?: number | null;
  repeatPeriod?: 'day' | 'week' | null;
  myRepeatCount?: number;
  myPendingCount?: number;
}

/** The small labels in an opened row: schedule, effort, whose turn, last done, health and the rest */
export function ChoreFacts({ task, language, showHealth = true }: { task: ChoreFactsTask; language?: string; showHealth?: boolean }) {
  const { t, timeAgo } = useTranslation(language);
  const weekStart = useWeekStart();
  const people = task.assignedUsers ?? [];
  const turn = task.assignmentMode === 'rotating' && task.rotationCurrentUserId != null
    ? people.find((u) => u.id === task.rotationCurrentUserId)?.displayName ?? '?' : null;
  const perPerson = (task.assignmentMode === 'shared' || task.assignmentMode === 'custom') && people.length >= 2;
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(localeFor(language), { weekday: 'short', month: 'short', day: 'numeric' });
  const health = Math.round(task.health);
  return (
    <div className="chore-tags">
      <span className="chore-tag">{task.oneTime || task.onDemand ? '' : '🔁 '}{choreSchedule(task, t, language, weekStart)}</span>
      <span className="chore-tag">{t('roomDetail.effort')} <EffortDots effort={task.effort} /></span>
      {turn && <span className="chore-tag">🔄 {t('chore.turn').replace('{name}', turn)}{task.rotationPeriod === 'week' ? ` · ${t('repeat.thisWeek')}` : ''}</span>}
      {perPerson && <span className="chore-tag">{task.assignmentMode === 'shared' ? t('rooms.modeShared') : t('rooms.modeCustom')} · {task.sharedCompletions?.length ?? 0}/{people.length} {t('rooms.done')}</span>}
      <span className="chore-tag">{t('chore.lastDone').replace('{when}', timeAgo(task.lastCompletedAt))}</span>
      {showHealth && !task.onDemand && !task.oneTime && !task.outOfSeason && (
        <span className="chore-tag">{t('rooms.health')} <b style={{ color: getHealthColor(health) }}>{health}%</b></span>
      )}
      {!!task.timerMinutes && <span className="chore-tag">⏱️ {task.timerMinutes} {t('timer.min')}</span>}
      {startsLater(task) && task.startsOn && <span className="chore-tag">📅 {t('schedule.startsLabel').replace('{date}', day(task.startsOn))}</span>}
      {task.outOfSeason && task.seasonStartMonth && task.seasonEndMonth
        ? <span className="chore-tag">{t('schedule.offSeason')} ({seasonLabel(task.seasonStartMonth, task.seasonEndMonth, language)})</span>
        : task.isSeasonal ? <span className="chore-tag">{t('roomDetail.seasonal')}</span> : null}
      {!!task.onDemand && !!task.repeatLimit && (
        <span className="chore-tag">{task.myRepeatCount ?? 0}/{task.repeatLimit} {t(task.repeatPeriod === 'day' ? 'repeat.today' : 'repeat.thisWeek')}</span>
      )}
      {(task.myPendingCount ?? 0) > 0 && <span className="chore-tag">⏳ {t('app.waitingCount').replace('{n}', String(task.myPendingCount))}</span>}
    </div>
  );
}
