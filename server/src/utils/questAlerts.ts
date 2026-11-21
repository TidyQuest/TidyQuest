import { prepared } from '../database';
import { dateStr, endOfDay } from './clock';
import { isFeatureOn } from './features';
import { tr } from './i18n';
import { notificationsOn, notifyPeople } from './notify';
import { ensureTrail, starsFor, type Player, type Trail } from './quest';
import { awayNow } from './vacation';

/**
 * Quest Trail's two alerts (NEW-40 part 3), through the existing kinds so nobody has a new switch to find:
 * "3 days left" as an evening nudge, and "the month is over" with the morning summary on the 1st. Both go
 * only to the people who play, wait out quiet hours like every other alert, and go out once (a dedupe key
 * per month). Checked by the scheduled notifications every minute, inside the same time windows.
 */

const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const prevMonthOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const getTrail = (month: string) => prepared('SELECT * FROM quest_trails WHERE month = ?').get(month) as Trail | undefined;
/** The month's players who still play ("Participates in tasks" on) */
const playersOf = (month: string) => prepared(`SELECT q.* FROM quest_players q JOIN users u ON u.id = q.userId
  WHERE q.month = ? AND (u.role IN ('child', 'member') OR (u.role = 'admin' AND u.isParticipant = 1)) ORDER BY q.userId`).all(month) as Player[];

/** In the evening window, two days before the month's last day (so today and two more): everyone still on the way who's home. */
export async function questThreeDaysLeft(now: Date): Promise<void> {
  if (!isFeatureOn('questTrail') || !notificationsOn('nudge')) return;
  const today = dateStr(now);
  const month = today.slice(0, 7);
  if (Number(today.slice(8, 10)) !== daysIn(month) - 2) return;
  const trail = ensureTrail(now);
  if (!trail || trail.month !== month) return;
  // Like the other evening nudges: nothing during a family vacation, and nothing to whoever is away
  const away = awayNow(now);
  if (away.family) return;
  const players = playersOf(month).filter((p) => !p.finishedAt && !away.ids.has(p.userId));
  const stars = new Map(players.map((p) => [p.userId, Math.max(0, starsFor(trail, p, now).left)]));
  const toGo = new Map(players.map((p) => [p.userId, Math.max(0, trail.length - p.position)]));
  if (!players.length) return;
  await notifyPeople(players.map((p) => p.userId), 'nudge', (lang, person) => {
    if (!person) return null;
    const n = stars.get(person.id) ?? 0;
    return tr(lang, n > 0 ? 'notify.questThreeDaysStars' : 'notify.questThreeDays', { n, left: toGo.get(person.id) ?? 0 });
  }, { now, dedupeKey: `quest3days:${month}`, expiresAt: endOfDay(now) });
}

/** On the 1st, in the morning window: last month's results to everyone who played it. */
export async function questMonthOver(now: Date): Promise<void> {
  if (!isFeatureOn('questTrail') || !notificationsOn('summary')) return;
  const today = dateStr(now);
  if (today.slice(8, 10) !== '01') return;
  ensureTrail(now); // closes last month's trail (its leftover stars rolled) if the job hasn't yet
  const prev = getTrail(prevMonthOf(today.slice(0, 7)));
  if (!prev?.closedAt) return;
  const players = playersOf(prev.month);
  if (!players.length) return;
  const winnerId = (players.find((p) => p.prizeWon) ?? players.find((p) => p.place === 1))?.userId;
  const winner = winnerId ? (prepared('SELECT displayName FROM users WHERE id = ?').get(winnerId) as { displayName: string } | undefined)?.displayName : undefined;
  const byId = new Map(players.map((p) => [p.userId, p]));
  await notifyPeople(players.map((p) => p.userId), 'summary', (lang, person) => {
    const me = person ? byId.get(person.id) : undefined;
    if (!me) return null;
    const head = winner
      ? (me.userId === winnerId ? tr(lang, 'notify.questOverYouWon') : tr(lang, 'notify.questOverWinner', { name: winner }))
      : tr(lang, 'notify.questOverNobody');
    const mine = me.userId === winnerId ? ''
      : me.finishedAt && me.place ? tr(lang, 'notify.questOverPlace', { n: me.place })
        : tr(lang, 'notify.questOverSpace', { n: me.position, length: prev.length });
    return [head, mine, tr(lang, 'notify.questOverNew')].filter(Boolean).join('\n');
  }, { now, dedupeKey: `questEnd:${prev.month}`, expiresAt: endOfDay(now) });
}
