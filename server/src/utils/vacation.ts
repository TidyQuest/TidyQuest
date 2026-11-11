import db from '../database';
import { dateStr, dayAt } from './clock';

/**
 * When a vacation ends: switched off by a parent, or its return date has come (checked whenever a
 * vacation is read, and by the server's minute check). The days away don't count against anyone:
 * - the chores it froze pick up where they left off (their last-done dates move forward by its length),
 *   so the house doesn't come back all red (BUG-45);
 * - streaks carry on from the day before the return, and no shield is used for the days away (BUG-29).
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const setting = (key: string) => ((db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value) || null;
const setSetting = (key: string, value: string) => db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = ?").run(value, key);
const stored = (v: string) => new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`);
/** A 'YYYY-MM-DD' day n days later (pure calendar) */
const addDays = (day: string, n: number) =>
  new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + n)).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** The day of a saved return date. Older family dates were saved as midnight UTC of the picked day. */
export function returnDay(value: string | null | undefined): string | null {
  const day = (value ?? '').slice(0, 10);
  return ISO_DAY.test(day) ? day : null;
}
/** A vacation is over from the start of its return day, in the family's time zone. */
export function returnMoment(value: string | null | undefined): Date | null {
  const day = returnDay(value);
  return day ? dayAt(day) : null;
}

function afterVacation(startedAt: string | null, endedAt: Date, userId: number | null): void {
  const start = startedAt ? stored(startedAt) : null;
  if (!start || Number.isNaN(start.getTime()) || endedAt.getTime() <= start.getTime()) return;
  const length = endedAt.getTime() - start.getTime();

  // Chores last done before it began (one done while away is as fresh as it looks). For one person: the
  // chores that are theirs alone, the ones their vacation froze.
  const tasks = db.prepare(
    `SELECT t.id, t.lastCompletedAt, r.assignedUserId AS roomOwner FROM tasks t JOIN rooms r ON r.id = t.roomId
     WHERE t.oneTime = 0 AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND t.pausedAt IS NULL AND t.lastCompletedAt IS NOT NULL`
  ).all() as { id: number; lastCompletedAt: string; roomOwner: number | null }[];
  const assignees = db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?');
  const move = db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?');
  for (const t of tasks) {
    const last = stored(t.lastCompletedAt).getTime();
    if (Number.isNaN(last) || last >= start.getTime()) continue;
    if (userId !== null) {
      const who = t.roomOwner ? [t.roomOwner] : (assignees.all(t.id) as { userId: number }[]).map((a) => a.userId);
      if (who.length !== 1 || who[0] !== userId) continue;
    }
    move.run(new Date(last + length).toISOString(), t.id);
  }

  // Streaks: the last counted day moves forward by the days away, at most to the day before the return
  const days = daysBetween(dateStr(start), dateStr(endedAt));
  if (days < 1) return;
  const dayBefore = addDays(dateStr(endedAt), -1);
  const people = db.prepare(`SELECT id, lastActiveDate FROM users WHERE lastActiveDate IS NOT NULL${userId !== null ? ' AND id = ?' : ''}`)
    .all(...(userId !== null ? [userId] : [])) as { id: number; lastActiveDate: string }[];
  for (const p of people) {
    const moved = addDays(p.lastActiveDate, days);
    const next = moved < dayBefore ? moved : dayBefore;
    if (next > p.lastActiveDate) db.prepare('UPDATE users SET lastActiveDate = ? WHERE id = ?').run(next, p.id);
  }
}

export function endFamilyVacation(endedAt: Date = new Date()): void {
  if (setting('vacationMode') !== '1') return;
  const startedAt = setting('vacationStartDate');
  db.transaction(() => {
    setSetting('vacationMode', '0');
    setSetting('vacationStartDate', '');
    setSetting('vacationEndDate', '');
    afterVacation(startedAt, endedAt, null);
  })();
}

export function endPersonVacation(userId: number, endedAt: Date = new Date()): void {
  const u = db.prepare('SELECT isVacationMode, vacationStartDate FROM users WHERE id = ?').get(userId) as { isVacationMode: number; vacationStartDate: string | null } | undefined;
  if (!u?.isVacationMode) return;
  db.transaction(() => {
    db.prepare('UPDATE users SET isVacationMode = 0, vacationStartDate = NULL, vacationEndDate = NULL WHERE id = ?').run(userId);
    afterVacation(u.vacationStartDate, endedAt, userId);
  })();
}

/** End every vacation whose return day has come. Cheap when none has. */
export function endDueVacations(now: Date = new Date()): void {
  if (setting('vacationMode') === '1') {
    const back = returnMoment(setting('vacationEndDate'));
    if (back && back.getTime() <= now.getTime()) endFamilyVacation(back);
  }
  const away = db.prepare('SELECT id, vacationEndDate FROM users WHERE isVacationMode = 1 AND vacationEndDate IS NOT NULL').all() as { id: number; vacationEndDate: string }[];
  for (const u of away) {
    const back = returnMoment(u.vacationEndDate);
    if (back && back.getTime() <= now.getTime()) endPersonVacation(u.id, back);
  }
}

/**
 * Who's away at `now`: everyone during a family vacation, otherwise the people on their own. Only reads
 * (endDueVacations does the ending), so a vacation whose return day has come already counts as over.
 */
export function awayNow(now: Date = new Date()): { family: boolean; ids: Set<number> } {
  const over = (endDate: string | null) => { const back = returnMoment(endDate); return !!back && back.getTime() <= now.getTime(); };
  const family = setting('vacationMode') === '1' && !over(setting('vacationEndDate'));
  const people = db.prepare('SELECT id, vacationEndDate FROM users WHERE isVacationMode = 1').all() as { id: number; vacationEndDate: string | null }[];
  return { family, ids: new Set(people.filter((u) => !over(u.vacationEndDate)).map((u) => u.id)) };
}
