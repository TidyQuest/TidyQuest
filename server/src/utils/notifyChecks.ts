import db, { prepared } from '../database';
import { nextDueAt, type ScheduledTask } from './schedule';

/**
 * What a notification depends on, checked before a chore message is sent and again when a message that
 * waited out quiet hours finally goes out (utils/notify.ts), so nobody hears about something that's no
 * longer true.
 */

type DueTask = ScheduledTask & { id: number };

/**
 * The task as the family sees it: a Done that waits for a parent counts as done (lastCompletedAt itself
 * only moves on approval). Null when a one-time chore is waiting: it's finished unless the parent says no.
 */
export function withWaitingDone<T extends DueTask>(task: T): T | null {
  const waiting = prepared("SELECT completedAt FROM task_completions WHERE taskId = ? AND status = 'pending' ORDER BY completedAt DESC LIMIT 1")
    .get(task.id) as { completedAt: string } | undefined;
  if (!waiting) return task;
  if (task.oneTime) return null;
  return !task.lastCompletedAt || new Date(waiting.completedAt) > new Date(task.lastCompletedAt) ? { ...task, lastCompletedAt: waiting.completedAt } : task;
}

/**
 * Not done (nor waiting for approval) and due by `by`. Asked after `by` (a message that waited out quiet
 * hours), it's still "was it due by then, with what's been done since": a chore never done is due as of
 * then, not as of now.
 */
export function dueBy(task: DueTask, by: Date, now: Date): boolean {
  const t = withWaitingDone(task);
  const asOf = new Date(Math.min(now.getTime(), by.getTime()));
  return !!t && (nextDueAt(t, asOf)?.getTime() ?? asOf.getTime()) <= by.getTime();
}

/** One condition a held message depends on (saved with it in notification_queue.onlyIf) */
export type StillTrue =
  /** The chore still isn't done, and is due by then */
  | { taskDue: number; by: string }
  /** The team-up is still looking for people */
  | { teamupOpen: number }
  /** The Done is still waiting for a parent */
  | { waiting: number }
  /** The double coins event is still on */
  | { boost: number };

export function stillTrue(check: StillTrue, now: Date): boolean {
  if ('taskDue' in check) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND archivedAt IS NULL AND deletedAt IS NULL AND pausedAt IS NULL').get(check.taskDue) as DueTask | undefined;
    return !!task && dueBy(task, new Date(check.by), now);
  }
  if ('teamupOpen' in check) return !!db.prepare("SELECT 1 FROM teamups WHERE id = ? AND status = 'open'").get(check.teamupOpen);
  if ('waiting' in check) return !!db.prepare("SELECT 1 FROM task_completions WHERE id = ? AND status = 'pending'").get(check.waiting);
  if ('boost' in check) return !!db.prepare('SELECT 1 FROM coin_boosts WHERE id = ? AND startAt <= ? AND endAt > ?').get(check.boost, now.toISOString(), now.toISOString());
  return true;
}
