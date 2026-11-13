import db, { prepared } from '../database';
import { isSeasonalNow, nextDueAt, taskHealth, type ScheduledTask } from './schedule';
import { localDateStr } from './dateHelpers';
import { dayAt, daySql } from './clock';
import { getGlobalVacation, getUserVacation, resolveVacation } from './adminHelpers';
import { isFeatureOn } from './features';
import { notifyPeople } from './notify';
import { tr } from './i18n';
import { perFamily } from '../hosted/context';

/**
 * Streaks (days in a row with at least one chore) and streak shields (NEW-3).
 *
 * A shield is earned each time a streak reaches a multiple of 7 days, bought with coins, or given by
 * a parent; a person holds at most 2. When a day is missed, a shield is used up and the streak carries
 * on (the missed day doesn't add to it). Two missed days need two shields; with too few, none are used
 * and the streak breaks on the next chore, as before.
 *
 * lastActiveDate is the streak's last counted day: a used shield moves it to the covered day, so the
 * next chore continues the streak.
 */

export const MAX_SHIELDS = 2;
export const SHIELD_EVERY = 7;
const DEFAULT_PRICE = 25;

/** What a shield costs (Settings → Features; 25 coins by default). */
export function shieldPrice(): number {
  const v = Number((prepared("SELECT value FROM app_settings WHERE key = 'shieldPrice'").get() as { value: string } | undefined)?.value);
  return Number.isInteger(v) && v >= 1 && v <= 500 ? v : DEFAULT_PRICE;
}

/** Shields need coins and streaks (gamification) and their own switch. */
export function shieldsOn(): boolean {
  const g = prepared("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  return (g ? g.value !== '0' : true) && isFeatureOn('shields');
}

/** A 'YYYY-MM-DD' day n days later (pure calendar, so no zone or DST can shift it). */
const addDays = (day: string, n: number) =>
  new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + n)).toISOString().slice(0, 10);

export function hadDueTaskOnDate(dateIsoDay: string): boolean {
  const endOfDay = dayAt(dateIsoDay, 23, 59, 59, 999).getTime();
  const tasks = prepared('SELECT * FROM tasks WHERE archivedAt IS NULL AND deletedAt IS NULL AND pausedAt IS NULL AND oneTime = 0 AND onDemand = 0').all() as Array<ScheduledTask & {
    id: number; isSeasonal: number;
  }>;

  for (const t of tasks) {
    if (isSeasonalNow(t, dayAt(dateIsoDay, 12))) continue;
    const dueTs = nextDueAt(t)?.getTime() ?? 0;
    if (dueTs <= endOfDay && taskHealth(t) < 100) return true;
  }
  return false;
}

/**
 * Days after `lastDay` up to and including `lastDayToCheck` that break a streak: a chore was due and
 * this person did none. A chore waiting for a parent's approval counts as done that day. Stops after
 * `limit` days.
 */
export function missedStreakDays(userId: number, lastDay: string, lastDayToCheck: string, limit = Infinity): string[] {
  const done = new Set((db.prepare(
    `SELECT DISTINCT ${daySql('completedAt')} AS d FROM task_completions
     WHERE userId = ? AND status IN ('approved', 'pending') AND completedAt >= ?`
  ).all(userId, addDays(lastDay, -1)) as { d: string }[]).map((r) => r.d));
  const missed: string[] = [];
  for (let day = addDays(lastDay, 1); day <= lastDayToCheck && missed.length < limit; day = addDays(day, 1)) {
    if (!done.has(day) && hadDueTaskOnDate(day)) missed.push(day);
  }
  return missed;
}

/** The streak after a chore today: one longer, or 1 if a day was missed since the last counted day. */
export function nextStreak(userId: number, current: number, lastActiveDate: string | null, today: string): number {
  if (!lastActiveDate) return 1;
  const yesterday = addDays(today, -1);
  if (lastActiveDate >= yesterday) return current + 1;
  return missedStreakDays(userId, lastActiveDate, yesterday, 1).length === 0 ? current + 1 : 1;
}

/** A streak just broke (restarted at 1 on `restartedOn`): remember it, so a late log for a missed day can bring it back. */
export function noteBrokenStreak(userId: number, streak: number, lastCounted: string, restartedOn: string): void {
  prepared('UPDATE users SET brokenStreak = ?, brokenStreakAfter = ?, brokenStreakOn = ? WHERE id = ?').run(streak, lastCounted, restartedOn, userId);
}

/**
 * A chore logged late for `day` ("Done earlier…", ENH-7) counts for the streak on that day:
 * - after the streak's last counted day, the streak goes on (or restarts) as a chore on that day would have;
 * - inside the gap that last broke the streak, once no missed day is left in it, the old streak comes back,
 *   with the days filled in and the days counted since;
 * - on a day inside the current run that had no counted chore yet, the streak is one day longer.
 * A chore a parent approves on a later day counts the same way, for the day it was done (BUG-29).
 */
export function lateStreak(userId: number, day: string): void {
  if (resolveVacation(getGlobalVacation(), getUserVacation(userId)).isVacation) return;
  settleStreak(userId);
  const u = prepared('SELECT currentStreak, lastActiveDate, brokenStreak, brokenStreakAfter, brokenStreakOn FROM users WHERE id = ?').get(userId) as {
    currentStreak: number; lastActiveDate: string | null; brokenStreak: number | null; brokenStreakAfter: string | null; brokenStreakOn: string | null;
  } | undefined;
  if (!u) return;
  if (!u.lastActiveDate || day > u.lastActiveDate) {
    const streak = nextStreak(userId, u.currentStreak, u.lastActiveDate, day);
    if (streak === 1 && u.currentStreak > 0 && u.lastActiveDate) noteBrokenStreak(userId, u.currentStreak, u.lastActiveDate, day);
    prepared('UPDATE users SET currentStreak = ?, lastActiveDate = ? WHERE id = ?').run(streak, day, userId);
    earnShieldAt(userId, streak);
    return;
  }
  const { brokenStreak: old, brokenStreakAfter: after, brokenStreakOn: restarted } = u;
  const doneDay = daySql('completedAt');
  if (!old || !after || !restarted || day <= after || day >= restarted) {
    // A day inside the current run that hasn't counted yet (its only chore was waiting for a parent, or
    // is logged now): one more day. Days before the run's first day belong to a streak that's gone.
    if (restarted && day < restarted) return;
    const thatDay = (db.prepare(`SELECT COUNT(*) AS n FROM task_completions WHERE userId = ? AND status = 'approved' AND ${doneDay} = ?`)
      .get(userId, day) as { n: number }).n;
    if (thatDay !== 1 || missedStreakDays(userId, day, addDays(u.lastActiveDate, -1), 1).length > 0) return;
    prepared('UPDATE users SET currentStreak = currentStreak + 1 WHERE id = ?').run(userId);
    earnShieldAt(userId, u.currentStreak + 1);
    return;
  }
  if (missedStreakDays(userId, after, addDays(restarted, -1), 1).length > 0) return;
  const filled = (db.prepare(
    `SELECT COUNT(DISTINCT ${doneDay}) AS n FROM task_completions
     WHERE userId = ? AND status = 'approved' AND ${doneDay} > ? AND ${doneDay} < ?`
  ).get(userId, after, restarted) as { n: number }).n;
  const streak = old + filled + u.currentStreak;
  prepared('UPDATE users SET currentStreak = ?, brokenStreak = NULL, brokenStreakAfter = NULL, brokenStreakOn = NULL WHERE id = ?').run(streak, userId);
  earnShieldAt(userId, streak);
}

/** The parts of a person's streak a Done can change (BUG-50). */
type StreakState = {
  currentStreak: number; lastActiveDate: string | null; streakShields: number;
  brokenStreak: number | null; brokenStreakAfter: string | null; brokenStreakOn: string | null;
};
export function streakState(userId: number): StreakState | undefined {
  return prepared('SELECT currentStreak, lastActiveDate, streakShields, brokenStreak, brokenStreakAfter, brokenStreakOn FROM users WHERE id = ?')
    .get(userId) as StreakState | undefined;
}
const sameStreak = (a: StreakState, b: StreakState) =>
  a.currentStreak === b.currentStreak && a.lastActiveDate === b.lastActiveDate && a.brokenStreak === b.brokenStreak
  && a.brokenStreakAfter === b.brokenStreakAfter && a.brokenStreakOn === b.brokenStreakOn;

/** A Done just moved the streak (or the shields): keep the before and after on the completion, for a take-back. */
export function keepStreakBefore(completionId: number, userId: number, before: StreakState | undefined): void {
  const after = streakState(userId);
  if (!before || !after || (sameStreak(before, after) && before.streakShields === after.streakShields)) return;
  prepared('UPDATE task_completions SET streakBefore = ? WHERE id = ?').run(JSON.stringify({ before, after }), completionId);
}

/**
 * A Done that moved the streak was taken back (its row is already deleted): put the streak back as it
 * was before it, with any shield it used or earned. Not when the streak has moved on since, and not
 * while another Done still counts for that day; that one takes over the before, so taking it back
 * later restores the streak instead.
 */
export function restoreStreak(userId: number, completedAt: string, saved: string | null): void {
  if (!saved) return;
  let kept: { before: StreakState; after: StreakState };
  try { kept = JSON.parse(saved); } catch { return; }
  const now = streakState(userId);
  if (!now || !kept?.before || !kept?.after || !sameStreak(now, kept.after)) return;
  const other = db.prepare(
    `SELECT id FROM task_completions WHERE userId = ? AND status = 'approved' AND ${daySql('completedAt')} = ? ORDER BY completedAt, id LIMIT 1`
  ).get(userId, localDateStr(new Date(completedAt))) as { id: number } | undefined;
  if (other) {
    prepared('UPDATE task_completions SET streakBefore = COALESCE(streakBefore, ?) WHERE id = ?').run(saved, other.id);
    return;
  }
  const { before, after } = kept;
  const shields = Math.max(0, Math.min(MAX_SHIELDS, now.streakShields + before.streakShields - after.streakShields));
  prepared('UPDATE users SET currentStreak = ?, lastActiveDate = ?, streakShields = ?, brokenStreak = ?, brokenStreakAfter = ?, brokenStreakOn = ? WHERE id = ?')
    .run(before.currentStreak, before.lastActiveDate, shields, before.brokenStreak, before.brokenStreakAfter, before.brokenStreakOn, userId);
}

function logShield(userId: number, kind: 'earned' | 'bought' | 'given' | 'used', fields: { count?: number; coins?: number; streak?: number; byUserId?: number } = {}) {
  prepared('INSERT INTO streak_shield_events (userId, kind, count, coins, streak, byUserId) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, kind, fields.count ?? 1, fields.coins ?? 0, fields.streak ?? 0, fields.byUserId ?? null);
}

/** A streak that just reached 7, 14, 21… days earns a shield, unless 2 are held already. */
export function earnShieldAt(userId: number, streak: number): boolean {
  if (streak < SHIELD_EVERY || streak % SHIELD_EVERY !== 0 || !shieldsOn()) return false;
  const r = prepared('UPDATE users SET streakShields = streakShields + 1 WHERE id = ? AND streakShields < ?').run(userId, MAX_SHIELDS);
  if (r.changes === 0) return false;
  logShield(userId, 'earned', { streak });
  return true;
}

/**
 * Use shields for the days missed since the streak's last counted day, through yesterday. Only when
 * there are enough for all of them; then the streak is safe and the person hears about it.
 */
export function settleStreak(userId: number, now: Date = new Date()): number {
  if (!shieldsOn()) return 0;
  // First: a vacation that has just ended moves the last counted day past the days away
  if (resolveVacation(getGlobalVacation(), getUserVacation(userId)).isVacation) return 0;
  const user = prepared('SELECT currentStreak, lastActiveDate, streakShields FROM users WHERE id = ?').get(userId) as
    { currentStreak: number; lastActiveDate: string | null; streakShields: number } | undefined;
  if (!user || user.streakShields < 1 || user.currentStreak < 1 || !user.lastActiveDate) return 0;
  const yesterday = addDays(localDateStr(now), -1);
  if (user.lastActiveDate >= yesterday) return 0;
  const missed = missedStreakDays(userId, user.lastActiveDate, yesterday, user.streakShields + 1);
  if (missed.length === 0 || missed.length > user.streakShields) return 0;

  prepared('UPDATE users SET streakShields = streakShields - ?, lastActiveDate = ? WHERE id = ?').run(missed.length, yesterday, userId);
  logShield(userId, 'used', { count: missed.length, streak: user.currentStreak });
  void notifyPeople([userId], 'nudge', (lang) => tr(lang, missed.length > 1 ? 'notify.shieldsSaved' : 'notify.shieldSaved', { n: user.currentStreak, count: missed.length }),
    { now, dedupeKey: `shield:${yesterday}` });
  return missed.length;
}

// The last day settled, per family
const settledDay = perFamily('');
/** Once a day (the server's minute check): use shields for everyone who missed yesterday. */
export function settleAllStreaks(now: Date = new Date()): void {
  const day = localDateStr(now);
  if (day === settledDay.get()) return;
  settledDay.set(day);
  if (!shieldsOn()) return;
  const people = prepared('SELECT id FROM users WHERE streakShields > 0 AND currentStreak > 0 AND lastActiveDate < ?').all(addDays(day, -1)) as { id: number }[];
  for (const p of people) settleStreak(p.id, now);
}

type ShieldResult = { error: string } | { shields: number; coins: number };
const stateOf = (userId: number) => prepared('SELECT streakShields AS shields, coins FROM users WHERE id = ?').get(userId) as { shields: number; coins: number };

/** Buy a shield with coins (up to 2 held). It covers a day missed already, too. */
export function buyShield(userId: number): ShieldResult {
  if (!shieldsOn()) return { error: 'shields_off' };
  const user = prepared('SELECT coins, currentStreak, streakShields FROM users WHERE id = ?').get(userId) as
    { coins: number; currentStreak: number; streakShields: number } | undefined;
  if (!user) return { error: 'not_found' };
  if (user.streakShields >= MAX_SHIELDS) return { error: 'shields_full' };
  const price = shieldPrice();
  if (user.coins < price) return { error: 'not_enough_coins' };
  db.transaction(() => {
    prepared('UPDATE users SET coins = coins - ?, streakShields = streakShields + 1 WHERE id = ?').run(price, userId);
    logShield(userId, 'bought', { coins: price, streak: user.currentStreak });
  })();
  settleStreak(userId);
  return stateOf(userId);
}

/** A parent gives a shield (a sick day, a busy weekend), up to 2 held. */
export function giveShield(byUserId: number, userId: number): ShieldResult {
  if (!shieldsOn()) return { error: 'shields_off' };
  const user = prepared('SELECT currentStreak, streakShields FROM users WHERE id = ?').get(userId) as { currentStreak: number; streakShields: number } | undefined;
  if (!user) return { error: 'not_found' };
  if (user.streakShields >= MAX_SHIELDS) return { error: 'shields_full' };
  prepared('UPDATE users SET streakShields = streakShields + 1 WHERE id = ?').run(userId);
  logShield(userId, 'given', { streak: user.currentStreak, byUserId });
  if (byUserId !== userId) {
    const by = (prepared('SELECT displayName FROM users WHERE id = ?').get(byUserId) as { displayName: string } | undefined)?.displayName ?? '';
    void notifyPeople([userId], 'outcome', (lang) => tr(lang, 'notify.shieldGiven', { name: by }));
  }
  settleStreak(userId);
  return stateOf(userId);
}
