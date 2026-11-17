import db, { currentDatabase, prepared } from '../database';
import { taskName, tr, type TaskLabel } from './i18n';
import { dropQueued, flushNotificationQueue, notificationsOn, notifyPeople } from './notify';
import { atHome, choreAudience, taskAudience } from './notifyMessages';
import { dueBy } from './notifyChecks';
import { isSeasonalNow } from './schedule';
import { localDateStr } from './dateHelpers';
import { at, endOfDay, minuteOfDay, wall } from './clock';
import { awayNow } from './vacation';
import { buildBoard } from './board';
import { weekStartDay } from './periods';
import { todaysMission } from './rescue';

/**
 * The timed notifications, checked every minute: queued messages after quiet hours, the morning
 * "today's chores" for kids, the evening nudge, the Sunday recap for parents, and task reminders.
 * Each goes out once (a dedupe key per person and day), within a window after its time, so a restart
 * neither repeats nor sends a 7 am summary at 3 pm.
 *
 * Chore messages leave out whoever is on vacation, and say nothing during a family vacation (BUG-49). The
 * ones about a day ("today's chores") aren't sent after it if they had to wait out quiet hours (BUG-41).
 */

const WINDOW_MIN = 90;
export const SCHEDULE_DEFAULTS = { morningTime: '07:00', eveningTime: '19:00', recapDay: '0', recapTime: '18:00' };

const setting = (key: keyof typeof SCHEDULE_DEFAULTS) =>
  (prepared('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || SCHEDULE_DEFAULTS[key];
const minutes = (hm: string) => { const m = /^(\d\d):(\d\d)$/.exec(hm); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
const nowMinutes = (now: Date) => minuteOfDay(now);
/** Within [time + offset, time + offset + window) today, `current` being now's minute of the day */
const inWindow = (current: number, hm: string, offset = 0, window = WINDOW_MIN) => {
  const start = minutes(hm) + offset;
  return start >= 0 && current >= start && current < start + window;
};

interface TaskRow { id: number; name: string; translationKey: string | null; roomId: number; onDemand: number; isSeasonal: number; frequencyDays: number; lastCompletedAt: string | null;
  scheduleWeekdays: number | null; seasonStartMonth: number | null; seasonEndMonth: number | null; assignmentMode: string | null;
  rotationPeriod: string | null; rotationCurrentUserId: number | null; reminderTime: string | null; reminderDayBefore: number }

const scheduledTasks = (now: Date, only = '') => (prepared(`SELECT * FROM tasks WHERE onDemand = 0 AND archivedAt IS NULL AND deletedAt IS NULL AND pausedAt IS NULL ${only}`).all() as TaskRow[]).filter((t) => !isSeasonalNow(t, now));
/**
 * Each person's own chores still due today (not ones open to anyone, nor ones done and waiting for a
 * parent), worked out once for everyone.
 */
function choresDue(now: Date): Map<number, TaskLabel[]> {
  const due = new Map<number, TaskLabel[]>();
  const by = endOfDay(now);
  for (const t of scheduledTasks(now)) {
    const audience = taskAudience(t);
    if (!Array.isArray(audience) || !dueBy(t, by, now)) continue;
    for (const id of audience) due.set(id, [...(due.get(id) ?? []), t]);
  }
  return due;
}

function list(lang: string, tasks: TaskLabel[]) {
  const shown = tasks.slice(0, 6).map((t) => taskName(lang, t)).join(', ');
  return tasks.length > 6 ? `${shown} ${tr(lang, 'notify.moreItems', { n: tasks.length - 6 })}` : shown;
}

/** The kids who are home: nobody during a family vacation, and not the ones on their own */
function kids(now: Date) {
  const away = awayNow(now);
  if (away.family) return [];
  return (db.prepare("SELECT id, displayName, currentStreak, lastActiveDate FROM users WHERE role != 'admin'").all() as Array<{ id: number; displayName: string; currentStreak: number; lastActiveDate: string | null }>)
    .filter((k) => !away.ids.has(k.id));
}

async function morningSummaries(now: Date) {
  if (!notificationsOn('summary') || !inWindow(nowMinutes(now), setting('morningTime'))) return;
  const day = localDateStr(now);
  const due = choresDue(now);
  for (const kid of kids(now)) {
    const chores = due.get(kid.id) ?? [];
    if (chores.length === 0) continue;
    await notifyPeople([kid.id], 'summary', (lang) => tr(lang, 'notify.morning', { name: kid.displayName, list: list(lang, chores) }), { now, dedupeKey: `morning:${day}`, expiresAt: endOfDay(now) });
  }
}

/** The day's Rescue Mission, at the morning time, to the people who can do it. */
async function rescueAnnouncement(now: Date) {
  if (!notificationsOn('rescue') || !inWindow(nowMinutes(now), setting('morningTime'))) return;
  const mission = todaysMission(now);
  if (!mission || mission.completedBy || !mission.taskId) return;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(mission.taskId) as TaskRow | undefined;
  if (!task) return;
  const audience = atHome(taskAudience(task), now);
  if (!audience) return;
  const m = String(Math.round(mission.multiplier * 100) / 100);
  await notifyPeople(audience, 'rescue', (lang) => tr(lang, 'notify.rescue', { task: taskName(lang, task), multiplier: m }), { now, dedupeKey: `rescue:${mission.day}`, expiresAt: endOfDay(now) });
}

async function eveningNudges(now: Date) {
  if (!notificationsOn('nudge') || !inWindow(nowMinutes(now), setting('eveningTime'))) return;
  const day = localDateStr(now);
  const due = choresDue(now);
  for (const kid of kids(now)) {
    const chores = due.get(kid.id) ?? [];
    const streakAtRisk = kid.currentStreak >= 2 && kid.lastActiveDate !== day;
    // This week's goal, if it's close (a quarter or less to go)
    const goal = db.prepare(
      "SELECT goalCoins, startAt, endAt FROM user_goals WHERE userId = ? AND status = 'active' AND startAt <= ? AND endAt >= ? ORDER BY startAt DESC LIMIT 1"
    ).get(kid.id, now.toISOString(), now.toISOString()) as { goalCoins: number; startAt: string; endAt: string } | undefined;
    let toGoal = 0;
    if (goal) {
      const earned = (db.prepare("SELECT COALESCE(SUM(coinsEarned), 0) AS n FROM task_completions WHERE userId = ? AND status = 'approved' AND completedAt >= ? AND completedAt <= ?")
        .get(kid.id, goal.startAt, goal.endAt) as { n: number }).n;
      const left = goal.goalCoins - earned;
      if (left > 0 && left <= goal.goalCoins / 4) toGoal = left;
    }
    if (chores.length === 0 && !streakAtRisk && !toGoal) continue;
    await notifyPeople([kid.id], 'nudge', (lang) => [
      chores.length ? tr(lang, 'notify.evening', { list: list(lang, chores) }) : '',
      streakAtRisk ? tr(lang, 'notify.streakRisk', { n: kid.currentStreak }) : '',
      toGoal ? tr(lang, 'notify.goalClose', { n: toGoal }) : '',
    ].filter(Boolean).join('\n'), { now, dedupeKey: `evening:${day}`, expiresAt: endOfDay(now) });
  }
}

async function weeklyRecap(now: Date) {
  const today = wall(now).weekday;
  if (!notificationsOn('summary') || String(today) !== setting('recapDay') || !inWindow(nowMinutes(now), setting('recapTime'))) return;
  // On the week's first day (Sunday by default for Sunday-first families) this week has barely begun: recap the one that ended
  const lastWeek = today === weekStartDay();
  const board = buildBoard(lastWeek ? 'lastWeek' : 'week', 'coins', now);
  if (board.people.length === 0) return;
  const top = board.people.filter((p) => p.rank === 1 && p.points > 0).map((p) => p.displayName);
  await notifyPeople('parents', 'summary', (lang) => [
    tr(lang, lastWeek ? 'notify.recapLastWeek' : 'notify.recap', { lines: board.people.map((p) => tr(lang, 'notify.recapLine', { name: p.displayName, coins: p.points, chores: p.chores })).join('; ') }),
    top.length ? tr(lang, 'notify.recapWinner', { name: top.join(' & ') }) : '',
  ].filter(Boolean).join('\n'), { now, dedupeKey: `recap:${localDateStr(now)}` });
}

const STAGE_GAP_MIN = 120;
const STAGE_WINDOW_MIN = 60;

/**
 * Task reminders: at the task's reminder time on its due day (or the evening before), again two
 * hours later if it's still not done, and two hours after that a parent hears about it.
 *
 * A late reminder's follow-ups fall after midnight (20:00 → 22:00 → 00:00), so each stage is looked for
 * from today's reminder time and from yesterday's (BUG-43). Every stage is tied to the chore still not
 * being done, also when it has to wait out quiet hours (BUG-41).
 */
async function taskReminders(now: Date) {
  if (!notificationsOn('reminder') || awayNow(now).family) return;
  const today = wall(now);
  for (const t of scheduledTasks(now, "AND reminderTime IS NOT NULL AND reminderTime != ''")) {
    const time = minutes(t.reminderTime!);
    if (time < 0) continue;
    for (const daysBack of [0, 1]) {
      // The reminder time on the day this round of reminders began
      const first = at(today.year, today.month, today.date - daysBack, Math.floor(time / 60), time % 60);
      const target = endOfDay(first, t.reminderDayBefore ? 1 : 0);
      const day = localDateStr(target);
      for (const stage of [1, 2, 3] as const) {
        const late = (now.getTime() - first.getTime()) / 60000 - (stage - 1) * STAGE_GAP_MIN;
        if (late < 0 || late >= STAGE_WINDOW_MIN) continue;
        if (!dueBy(t, target, now)) continue;
        const people = atHome(taskAudience(t), now);
        if (!people) continue; // everyone it's for is on vacation: the parents aren't told either
        const audience = choreAudience(t, now); // null: nobody wants this open chore's reminders, but a parent still hears at stage 3
        const key = (n: number) => `reminder:${t.id}:${day}:${n}`;
        const onlyIf = { taskDue: t.id, by: target.toISOString() };
        if (stage < 3 && !audience) continue;
        if (stage === 1) {
          const tomorrow = !!t.reminderDayBefore;
          await notifyPeople(audience!, 'reminder', (lang) => tr(lang, tomorrow ? 'notify.reminderTomorrow' : 'notify.reminder', { task: taskName(lang, t) }),
            { now, dedupeKey: key(1), onlyIf, ...(tomorrow ? { expiresAt: endOfDay(first) } : {}) });
        } else if (stage === 2) {
          dropQueued(key(1)); // a first reminder still waiting out quiet hours: this one takes its place
          await notifyPeople(audience!, 'reminder', (lang) => tr(lang, 'notify.reminderAgain', { task: taskName(lang, t) }), { now, dedupeKey: key(2), onlyIf });
        } else {
          const parents = atHome('parents', now);
          if (!parents) continue;
          const names = Array.isArray(people)
            ? (db.prepare(`SELECT displayName FROM users WHERE id IN (${people.map(() => '?').join(',')})`).all(...people) as Array<{ displayName: string }>).map((u) => u.displayName).join(', ')
            : '';
          await notifyPeople(parents, 'reminder', (lang) => tr(lang, 'notify.reminderParents', { task: taskName(lang, t) }) + (names ? ` (${names})` : ''), { now, dedupeKey: key(3), onlyIf });
        }
      }
    }
  }
}

let running = false;
// The jobs run every 30 seconds and these are checked once a minute, so each database keeps the last minute checked
const checkedMinute = new WeakMap<object, string>();
export async function runScheduledNotifications(now: Date = new Date()): Promise<void> {
  if (running) return; // a slow send mustn't overlap the next minute's check
  const instance = currentDatabase();
  const minute = `${localDateStr(now)} ${minuteOfDay(now)}`;
  if (instance) {
    if (checkedMinute.get(instance) === minute) return;
    checkedMinute.set(instance, minute);
  }
  running = true;
  try {
    await flushNotificationQueue(now);
    await morningSummaries(now);
    await rescueAnnouncement(now);
    await eveningNudges(now);
    await weeklyRecap(now);
    await taskReminders(now);
  } finally {
    running = false;
  }
}
