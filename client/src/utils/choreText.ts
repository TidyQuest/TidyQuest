// The words on a chore row (ENH-25): its schedule, when it's due and who it's for. Shared by Home, Tasks and
// the room page so a chore reads the same wherever it shows.
import { formatNextDue, taskNextDue } from './tasks';
import { monthlyLabel, weekdaysLabel, type ScheduledTaskFields } from './schedule';
import { localeFor } from './locale';

type T = (key: string) => string;

export function daysToFreq(days: number): { value: number; unit: string } {
  if (days >= 365 && days % 365 === 0) return { value: days / 365, unit: 'years' };
  if (days >= 30 && days % 30 === 0) return { value: days / 30, unit: 'months' };
  if (days >= 7 && days % 7 === 0) return { value: days / 7, unit: 'weeks' };
  if (days >= 1) return { value: days, unit: 'days' };
  return { value: Math.round(days * 24), unit: 'hours' };
}

/** "3d", "2w" */
export function formatFreq(days: number, t: T): string {
  const { value, unit } = daysToFreq(days);
  return `${value}${t(`unitsShort.${unit}`)}`;
}

export interface ChoreTextTask extends ScheduledTaskFields {
  frequencyDays: number;
  lastCompletedAt: string | null;
  health: number;
  onDemand?: boolean | number | null;
  outOfSeason?: boolean;
  nextDueAt?: string | null;
  /** From Home: a one-time chore past its do-by date, and whole days overdue */
  overdue?: boolean;
  overdueDays?: number;
}

/** "Every 3d", "Mon, Thu", "Monthly, day 15", "One time", "On Demand" */
export function choreSchedule(task: ChoreTextTask, t: T, language?: string, weekStart = 1): string {
  if (task.onDemand) return t('roomDetail.onDemand');
  if (task.oneTime) return t('schedule.once');
  return monthlyLabel(task, t, language)
    || (task.scheduleWeekdays ? weekdaysLabel(task.scheduleWeekdays, language, weekStart) : `${t('roomDetail.every')} ${formatFreq(task.frequencyDays, t)}`);
}

/** When a chore is due, in a few words, and whether it's late (rows show late ones in red). */
export function choreDue(task: ChoreTextTask, t: T, language?: string): { text: string; late: boolean } {
  if (task.onDemand) return { text: t('roomDetail.onDemand'), late: false };
  if (task.outOfSeason) return { text: t('schedule.offSeason'), late: false };
  if (task.oneTime) {
    const late = task.overdue ?? task.health <= 0;
    const by = task.doBy
      ? t('todos.byDate').replace('{date}', new Date(`${task.doBy}T12:00:00`).toLocaleDateString(localeFor(language), { weekday: 'short', month: 'short', day: 'numeric' }))
      : '';
    return { text: [late ? t('todos.overdue') : '', by].filter(Boolean).join(' · '), late };
  }
  const lateMs = Date.now() - taskNextDue(task).getTime();
  if (lateMs > 0 && task.health <= 0) {
    const days = task.overdueDays ?? Math.floor(lateMs / 86400000);
    return { text: days < 1 ? t('roomDetail.overdue') : days === 1 ? t('home.overdueDay') : t('home.overdueDays').replace('{n}', String(days)), late: true };
  }
  return { text: formatNextDue(task.lastCompletedAt, task.frequencyDays, t, language, task.health, task.nextDueAt).text, late: false };
}

/** Who a chore is for: "Wyatt, Cecil" (with each share for split coins), or '' when it's open to anyone */
export function choreWho(task: { assignedUsers?: Array<{ displayName: string; coinPercentage?: number }>; assignmentMode?: string }): string {
  const people = task.assignedUsers ?? [];
  return task.assignmentMode === 'custom'
    ? people.map((u) => `${u.displayName} (${u.coinPercentage ?? 0}%)`).join(', ')
    : people.map((u) => u.displayName).join(', ');
}
