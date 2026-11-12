import db from '../database';
import { dateStr, endOfDay, startOfDay } from './clock';
import { hasWeekdaySchedule, monthlyRule, nextDueAt, weekdayMask, type ScheduledTask } from './schedule';

/**
 * Two Home sections built from the dashboard's task list:
 * - Your usual: the tasks a person pins, then the ones they did most in the last 30 days.
 * - Maybe you forgot about these: chores overdue by at least their own interval (a weekly chore not
 *   done in two weeks), worst first, minus the ones this person snoozed.
 */

const DAY_MS = 86400000;
const parseStored = (v: string) => new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`);

interface HomeTask extends Omit<ScheduledTask, 'isSeasonal'> {
  id: number; onDemand?: number | boolean; isSeasonal?: boolean; dueDate: string;
}

/** A chore's own interval in days (set weekdays: the average gap between them; monthly: 30), at least a day. */
export function intervalDays(t: ScheduledTask): number {
  if (monthlyRule(t)) return 30;
  if (hasWeekdaySchedule(t)) {
    let mask = weekdayMask(t); let n = 0;
    while (mask) { n += mask & 1; mask >>= 1; }
    return Math.max(1, 7 / n);
  }
  return Math.max(1, Number(t.frequencyDays) || 7);
}

/** How long a chore has been overdue, in days (never done: since it was added). */
export function overdueDays(t: HomeTask, now: Date = new Date()): number {
  const due = !nextDueAt(t, now) && t.createdAt ? parseStored(t.createdAt) : new Date(t.dueDate);
  return Math.max(0, (now.getTime() - due.getTime()) / DAY_MS);
}

export function pinnedTaskIds(userId: number): number[] {
  return (db.prepare('SELECT taskId FROM task_pins WHERE userId = ? ORDER BY createdAt').all(userId) as Array<{ taskId: number }>).map((r) => r.taskId);
}

/** Pins first, then the tasks this person did most (at least twice) in the last 30 days. */
export function usualTasks<T extends HomeTask>(tasks: T[], userId: number, now: Date = new Date(), limit = 10): Array<T & { pinned: boolean; usualCount: number }> {
  const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const counts = new Map((db.prepare(
    "SELECT taskId, COUNT(*) AS n FROM task_completions WHERE userId = ? AND status IN ('approved', 'pending') AND completedAt >= ? GROUP BY taskId"
  ).all(userId, since) as Array<{ taskId: number; n: number }>).map((r) => [r.taskId, r.n]));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const pins = pinnedTaskIds(userId).map((id) => byId.get(id)).filter((t): t is T => !!t);
  const pinnedIds = new Set(pins.map((t) => t.id));
  const auto = tasks
    .filter((t) => !pinnedIds.has(t.id) && !t.oneTime && !t.isSeasonal && (counts.get(t.id) ?? 0) >= 2)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.id - b.id);
  return [...pins, ...auto].slice(0, Math.max(limit, pins.length)).map((t) => ({ ...t, pinned: pinnedIds.has(t.id), usualCount: counts.get(t.id) ?? 0 }));
}

/** Chores overdue by at least their own interval, worst (most intervals behind) first. */
export function forgottenTasks<T extends HomeTask>(tasks: T[], userId: number, now: Date = new Date(), exclude: Set<number> = new Set(), limit = 10): Array<T & { overdueDays: number }> {
  const snoozed = new Set((db.prepare('SELECT taskId FROM task_snoozes WHERE userId = ? AND until > ?').all(userId, now.toISOString()) as Array<{ taskId: number }>).map((r) => r.taskId));
  return tasks
    .filter((t) => !t.onDemand && !t.oneTime && !t.isSeasonal && !snoozed.has(t.id) && !exclude.has(t.id))
    .map((t) => ({ t, days: overdueDays(t, now), ratio: overdueDays(t, now) / intervalDays(t) }))
    .filter((x) => x.ratio >= 1)
    .sort((a, b) => b.ratio - a.ratio || a.t.id - b.t.id)
    .slice(0, limit)
    .map((x) => ({ ...x.t, overdueDays: Math.floor(x.days) }));
}

/**
 * The Today page (ENH-26): every chore sorted into one of four lists.
 * - overdue: due on an earlier day (a to-do past its do-by date), minus the ones this person snoozed
 * - today:   due now, or later today when it may be done early (the same rule as One thing at a time)
 * - anytime: anytime chores set to show on Home, and to-dos without a date
 * - later:   due within `laterDays`, soonest first; snoozed overdue chores wait here too (snoozed: true)
 * Out-of-season chores are left out. The page filters each list to Mine or Everyone itself.
 */
type TodayTask = HomeTask & { health: number; showInDashboard?: number | boolean; allowEarlyCompletion?: number | boolean; doBy?: string | null };
export type TodayItem<T> = T & { overdueDays?: number; snoozed?: boolean; pinned?: boolean };
export function todaySections<T extends TodayTask>(tasks: T[], userId: number, now: Date = new Date(), opts: { todos?: boolean; laterDays?: number } = {}) {
  const snoozed = new Set((db.prepare('SELECT taskId FROM task_snoozes WHERE userId = ? AND until > ?').all(userId, now.toISOString()) as Array<{ taskId: number }>).map((r) => r.taskId));
  const pinned = new Set(pinnedTaskIds(userId));
  const today = dateStr(now);
  const endOfToday = endOfDay(now).getTime();
  const horizon = endOfDay(now, opts.laterDays ?? 30).getTime();
  const lists = { overdue: [] as Array<TodayItem<T>>, today: [] as Array<TodayItem<T>>, anytime: [] as Array<TodayItem<T>>, later: [] as Array<TodayItem<T>> };
  for (const t of tasks) {
    if (t.isSeasonal) continue;
    const item: TodayItem<T> = pinned.has(t.id) ? { ...t, pinned: true } : t;
    if (t.onDemand) {
      if (t.showInDashboard) lists.anytime.push(item);
      continue;
    }
    if (t.oneTime && opts.todos === false) continue;
    if (t.oneTime && !t.doBy) { lists.anytime.push(item); continue; }
    // Never done: late since the day it was added (as "Maybe you forgot" counts it)
    const since = !t.oneTime && !nextDueAt(t, now) && t.createdAt ? parseStored(t.createdAt) : new Date(t.dueDate);
    const due = t.oneTime ? since.getTime() : new Date(t.dueDate).getTime();
    const sinceDay = t.oneTime ? String(t.doBy) : dateStr(since);
    if (sinceDay < today) {
      const late = { ...item, overdueDays: Math.round((startOfDay(now).getTime() - startOfDay(since).getTime()) / DAY_MS) };
      if (snoozed.has(t.id)) lists.later.push({ ...late, snoozed: true }); else lists.overdue.push(late);
    } else if (sinceDay === today && (t.oneTime || due <= now.getTime() || t.allowEarlyCompletion)) {
      lists.today.push(item);
    } else if (due <= horizon) {
      lists.later.push(item);
    }
  }
  const dueAt = (t: T) => new Date(t.dueDate).getTime();
  lists.overdue.sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0) || a.health - b.health || a.id - b.id);
  lists.today.sort((a, b) => dueAt(a) - dueAt(b) || a.id - b.id);
  lists.anytime.sort((a, b) => Number(!!a.oneTime) - Number(!!b.oneTime) || a.health - b.health || a.id - b.id);
  lists.later.sort((a, b) => Number(!!b.snoozed) - Number(!!a.snoozed) || dueAt(a) - dueAt(b) || a.id - b.id);
  return lists;
}
