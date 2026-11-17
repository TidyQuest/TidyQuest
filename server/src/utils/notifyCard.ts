import { prepared } from '../database';
import { onDayArgs, onDaySql } from './clock';
import { getPeople, personalChannels, receives } from './notify';
import { pushOn } from './push';

/**
 * The "turn on notifications" card on Today (ENH-31). People with no channel of their own get nothing private
 * (their approvals, cheers, nudges), and few find Profile → My notifications, so Today offers it once, after
 * their first chore of the day. users.notifyCard keeps {done, snoozes, until} so it doesn't nag on every device.
 */
export const SNOOZE_DAYS = 7;
/** "Not now" brings it back at most this many times */
export const MAX_RETURNS = 3;

export type NotifyCardState = { done?: boolean; snoozes?: number; until?: string };

function readState(userId: number): NotifyCardState {
  try {
    const raw = (prepared('SELECT notifyCard FROM users WHERE id = ?').get(userId) as { notifyCard: string | null } | undefined)?.notifyCard;
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

function writeState(userId: number, state: NotifyCardState) {
  prepared('UPDATE users SET notifyCard = ? WHERE id = ?').run(JSON.stringify(state), userId);
}

/** Whether Today shows the card to this person now: 'kid' or 'parent' wording, or null. */
export function notifyCardFor(userId: number, now: Date = new Date()): 'kid' | 'parent' | null {
  if (!pushOn()) return null;
  if ((prepared("SELECT value FROM app_settings WHERE key = 'notificationsEnabled'").get() as { value: string } | undefined)?.value !== '1') return null;
  const state = readState(userId);
  if (state.done || (state.snoozes ?? 0) > MAX_RETURNS) return null;
  if (state.until && new Date(state.until).getTime() > now.getTime()) return null;
  const person = getPeople().find((p) => p.id === userId);
  if (!person || !receives(person) || personalChannels(person).length > 0) return null;
  // A good moment: once they've done a chore today (waiting for approval counts), not on first login
  const doneToday = prepared(`SELECT 1 FROM task_completions WHERE userId = ? AND status IN ('approved', 'pending') AND ${onDaySql('completedAt')} LIMIT 1`)
    .get(userId, ...onDayArgs(now));
  if (!doneToday) return null;
  return person.role === 'admin' ? 'parent' : 'kid';
}

/** Turn on (done for good) or Not now (back in a week, at most MAX_RETURNS times). */
export function answerNotifyCard(userId: number, answer: 'done' | 'snooze', now: Date = new Date()) {
  const state = readState(userId);
  if (answer === 'done') return writeState(userId, { ...state, done: true });
  writeState(userId, { ...state, snoozes: (state.snoozes ?? 0) + 1, until: new Date(now.getTime() + SNOOZE_DAYS * 24 * 60 * 60 * 1000).toISOString() });
}
