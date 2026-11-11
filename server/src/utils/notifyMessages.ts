import db, { prepared } from '../database';
import { endOfDay } from './clock';
import { taskName, tr, type TaskLabel } from './i18n';
import { notifyPeople, type Audience } from './notify';
import { rotationTurnFor } from './schedule';
import { awayNow } from './vacation';

/**
 * Every notification the app sends, in each person's language (texts: the "notify" section of the
 * app's translations). Routes call these; utils/notify.ts decides who gets what where.
 */

const nameOf = (userId: number | null | undefined) =>
  (db.prepare('SELECT displayName FROM users WHERE id = ?').get(userId ?? -1) as { displayName: string } | undefined)?.displayName ?? '?';

/** Who a task is for: whose turn it is, its people, the room's owner, or everyone. */
export function taskAudience(task: { id: number; roomId: number; assignmentMode?: string | null; rotationPeriod?: string | null; rotationCurrentUserId?: number | null }): Audience {
  const ids = (prepared('SELECT userId FROM task_assignees WHERE taskId = ?').all(task.id) as Array<{ userId: number }>).map((a) => a.userId);
  if (task.assignmentMode === 'rotating' && ids.length > 0) {
    const turn = rotationTurnFor(task, ids);
    if (turn) return [turn];
  }
  if (ids.length > 0) return ids;
  const owner = (prepared('SELECT assignedUserId FROM rooms WHERE id = ?').get(task.roomId) as { assignedUserId: number | null } | undefined)?.assignedUserId;
  return owner ? [owner] : 'everyone';
}

/**
 * The same people without the ones on vacation (BUG-49): chore messages don't follow anyone on holiday.
 * Null when nobody's left to tell, or the whole family is away.
 */
export function atHome(audience: Audience, now: Date = new Date()): Audience | null {
  const away = awayNow(now);
  if (away.family) return null;
  if (away.ids.size === 0) return audience;
  const ids = Array.isArray(audience) ? audience
    : (db.prepare('SELECT id, role FROM users').all() as Array<{ id: number; role: string }>)
      .filter((u) => audience === 'everyone' || (audience === 'parents') === (u.role === 'admin')).map((u) => u.id);
  const home = ids.filter((id) => !away.ids.has(id));
  return home.length > 0 ? home : null;
}

const room = (name: string | null | undefined) => (name ? ` (${name})` : '');

/** "Due today", to the task's people who are home. Held past quiet hours only while it's still today and not done. */
export function notifyTaskDue(task: TaskLabel & { id: number; roomId: number; roomName: string | null; assignmentMode?: string | null; rotationPeriod?: string | null; rotationCurrentUserId?: number | null }, day: string, now: Date = new Date()) {
  const audience = atHome(taskAudience(task), now);
  if (!audience) return Promise.resolve();
  const by = endOfDay(now);
  return notifyPeople(audience, 'taskDue', (lang) => tr(lang, 'notify.taskDue', { task: taskName(lang, task) }) + room(task.roomName),
    { now, dedupeKey: `due:${task.id}:${day}`, expiresAt: by, onlyIf: { taskDue: task.id, by: by.toISOString() } });
}

/** To the parents; a message that waits out quiet hours is dropped if the Done was handled meanwhile. */
export function notifyChoreWaiting(childId: number, task: TaskLabel, completionId?: number) {
  const name = nameOf(childId);
  return notifyPeople('parents', 'choreApproval', (lang) => tr(lang, 'notify.choreApproval', { name, task: taskName(lang, task) }),
    completionId ? { onlyIf: { waiting: completionId } } : {});
}

export function notifyRewardRequest(userId: number, reward: string, coins: number) {
  const name = nameOf(userId);
  return notifyPeople('parents', 'rewardRequest', (lang) => tr(lang, 'notify.rewardRequest', { name, reward, coins }));
}

export function notifyPotFull(reward: string, coins: number) {
  return notifyPeople('parents', 'rewardRequest', (lang) => tr(lang, 'notify.potFull', { reward, coins }));
}

/** To the person ("You earned …") and the parents ("Alex earned …"). */
export function notifyBadge(userId: number, badge: { titleKey: string | null; title: string | null }) {
  const name = nameOf(userId);
  const title = (lang: string) => (badge.titleKey ? tr(lang, badge.titleKey) : badge.title ?? '');
  const parents = (db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as Array<{ id: number }>).map((p) => p.id);
  return notifyPeople([userId, ...parents.filter((id) => id !== userId)], 'achievementUnlocked',
    (lang, p) => (p?.id === userId ? tr(lang, 'notify.badgeYou', { badge: title(lang) }) : tr(lang, 'notify.badgeOther', { name, badge: title(lang) })));
}

// ---------- Outcomes, to the kid only ----------

export function notifyChoreApproved(childId: number, parentId: number, task: TaskLabel, coins: number, extras: { note?: string | null; bonus?: number } = {}) {
  const parent = nameOf(parentId);
  // A bonus and a note from the parent ride along: "… +12 coins ⭐ +2 · “Great job!”"
  const more = `${extras.bonus ? ` ⭐ +${extras.bonus}` : ''}${extras.note ? ` · “${extras.note}”` : ''}`;
  return notifyPeople([childId], 'outcome', (lang) => tr(lang, 'notify.choreApproved', { parent, task: taskName(lang, task), coins }) + more);
}

export function notifyChoreRejected(childId: number, parentId: number, task: TaskLabel, reason?: string | null) {
  const parent = nameOf(parentId);
  return notifyPeople([childId], 'outcome', (lang) =>
    reason ? tr(lang, 'notify.choreRejectedReason', { parent, task: taskName(lang, task), reason }) : tr(lang, 'notify.choreRejected', { parent, task: taskName(lang, task) }));
}

export function notifyRewardDecision(childId: number, parentId: number, reward: string, approved: boolean) {
  const parent = nameOf(parentId);
  return notifyPeople([childId], 'outcome', (lang) => tr(lang, approved ? 'notify.rewardApproved' : 'notify.rewardRejected', { parent, reward }));
}

export function notifyCoinsAdjusted(childId: number, parentId: number, amount: number, reason: string | null) {
  const parent = nameOf(parentId);
  return notifyPeople([childId], 'outcome', (lang) =>
    tr(lang, amount > 0 ? 'notify.coinsAdded' : 'notify.coinsRemoved', { parent, coins: Math.abs(amount) }) + (reason ? ` — ${reason}` : ''));
}
