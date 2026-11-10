import db from '../database';
import { nextDueAt, parseStored, type ScheduledTask } from './schedule';

/**
 * Shared and custom chores: every assignee does their own share (BUG-26).
 *
 * A share counts from the moment it's done until the chore comes due again for that person (a week
 * for a weekly chore), and only if it was done after the chore was last clean or reset to dirty.
 * The chore turns clean once every assignee has a share that counts, on whatever days they did them.
 */
type ShareTask = ScheduledTask & { id: number; assignmentMode?: string | null; sharesResetAt?: string | null };

export const isPerPerson = (task: { assignmentMode?: string | null }) =>
  task.assignmentMode === 'shared' || task.assignmentMode === 'custom';

export interface Share { userId: number; displayName: string; completionId: number; completedAt: string; status: string }

const ms = (v: string | null | undefined) => (v ? parseStored(v).getTime() : -Infinity);

/** Each person's latest share that counts at `at`; with `waiting`, a Done that waits for approval counts too. */
export function currentShares(task: ShareTask, at: Date = new Date(), waiting = false): Share[] {
  const since = Math.max(ms(task.lastCompletedAt), ms(task.sharesResetAt));
  const rows = db.prepare(
    `SELECT tc.id AS completionId, tc.userId, tc.completedAt, tc.status, u.displayName
     FROM task_completions tc JOIN users u ON u.id = tc.userId
     WHERE tc.taskId = ? AND tc.status IN ('approved'${waiting ? ", 'pending'" : ''}) AND substr(tc.completedAt, 1, 10) >= ?
     ORDER BY tc.completedAt DESC`
  ).all(task.id, Number.isFinite(since) ? new Date(since).toISOString().slice(0, 10) : '') as Share[];
  const latest = new Map<number, Share>();
  for (const r of rows) {
    if (latest.has(r.userId) || ms(r.completedAt) <= since) continue;
    const due = task.oneTime ? null : nextDueAt({ ...task, lastCompletedAt: r.completedAt }, at);
    if (!due || due.getTime() > at.getTime()) latest.set(r.userId, r);
  }
  return [...latest.values()];
}

/** The moment a shared chore became clean: every assignee's share counts at `at`. Null while a share is open. */
export function sharesCompleteAt(task: ShareTask, assigneeIds: number[], at: Date): string | null {
  const shares = new Map(currentShares(task, at).map((s) => [s.userId, s]));
  if (!assigneeIds.every((id) => shares.has(id))) return null;
  return assigneeIds.map((id) => shares.get(id)!.completedAt).sort((a, b) => ms(a) - ms(b)).pop() ?? null;
}

/** For the task lists: whose share is done right now (what the Done button and "2/3 done" show). */
export const sharesFor = (task: ShareTask) =>
  currentShares(task).map(({ userId, displayName, completionId }) => ({ userId, displayName, completionId }));
