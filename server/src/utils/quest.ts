import { randomInt } from 'crypto';
import db, { prepared } from '../database';
import { dateStr, daySql } from './clock';
import { isFeatureOn } from './features';
import { tr } from './i18n';
import { giftAccessory } from './mascot';
import { awayNow } from './vacation';

/**
 * Quest Trail (NEW-40): a board game the family plays over a month. Doing chores earns stars, each star is
 * one roll of the die, and everyone races along a trail on a new world's map each month.
 *
 * Stars are worked out from the chores themselves, never stored as a running count, so taking back a Done
 * takes back a star that hasn't been rolled with yet. Each roll keeps the stars earned so far (quest_kept):
 * a Done taken back after a roll takes nothing back, and nothing is ever owed.
 * - 1 star for a day with any chore done (each chore counts once a day), 1 more for 3 or more that day.
 *   In Strict Mode a chore counts once it's approved, for the day it was done. "Log it late" counts for
 *   the day it was logged for.
 * - A day on your own vacation gives the day's star, but only while someone else is home: when the whole
 *   family is away (Vacation Mode, or everyone on their own), nobody gets a free star.
 * - A chore card (landed on) gives a star once a chore is done after it that day. Parents can give stars.
 *
 * The die is rolled here, on the server. Stars nobody rolled are rolled for them when the month is over
 * (the first time the server looks after midnight), in a random order each round. After the finish, each
 * star is cashed in for coins.
 */

// ---- The trail ----

export type Space =
  | { t: 'coins'; n: number }
  | { t: 'card' }
  | { t: 'treat' }
  | { t: 'up'; to: number }
  | { t: 'down'; to: number };

export const BASE_LENGTH = 80;
/** The 80-space trail of the mock-ups; other lengths are this one stretched or squeezed. */
const BASE: Record<number, Space> = {
  3: { t: 'coins', n: 1 }, 12: { t: 'coins', n: 2 }, 19: { t: 'coins', n: 1 }, 27: { t: 'coins', n: 3 }, 36: { t: 'coins', n: 2 },
  43: { t: 'coins', n: 1 }, 51: { t: 'coins', n: 2 }, 60: { t: 'coins', n: 3 }, 66: { t: 'coins', n: 2 }, 76: { t: 'coins', n: 3 },
  6: { t: 'card' }, 24: { t: 'card' }, 40: { t: 'card' }, 57: { t: 'card' }, 71: { t: 'card' },
  15: { t: 'treat' }, 33: { t: 'treat' }, 54: { t: 'treat' }, 73: { t: 'treat' },
  10: { t: 'up', to: 18 }, 30: { t: 'up', to: 37 }, 49: { t: 'up', to: 56 }, 64: { t: 'up', to: 70 },
  21: { t: 'down', to: 16 }, 45: { t: 'down', to: 39 }, 62: { t: 'down', to: 58 },
};

/**
 * The special spaces of a trail this long: the same places as on 80 spaces, in proportion. Shortcuts and
 * slides go first and both their ends stay plain, so one never leads onto another.
 */
export function layoutFor(length: number): Record<number, Space> {
  const scale = (p: number) => Math.round((p * length) / BASE_LENGTH);
  const out: Record<number, Space> = {};
  const used = new Set([0, length]);
  const entries = Object.entries(BASE).map(([k, s]) => [Number(k), s] as const).sort((a, b) => a[0] - b[0]);
  for (const [p, s] of entries) {
    if (s.t !== 'up' && s.t !== 'down') continue;
    const from = scale(p), to = scale(s.to);
    if (from === to || used.has(from) || used.has(to) || to <= 0 || to >= length) continue;
    out[from] = { t: s.t, to };
    used.add(from).add(to);
  }
  for (const [p, s] of entries) {
    if (s.t === 'up' || s.t === 'down') continue;
    const q = scale(p);
    if (q <= 0 || q >= length || used.has(q)) continue;
    out[q] = { ...s };
    used.add(q);
  }
  return out;
}

/** Each month's world, January to December (the client draws them; each map blends into the months beside it) */
export const WORLDS = ['summit', 'frozen', 'rainy', 'blossom', 'kites', 'camp', 'shores', 'prairie', 'orchard', 'woods', 'misty', 'village'] as const;
export const worldFor = (month: string) => WORLDS[Number(month.slice(5, 7)) - 1];

const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const prevMonthOf = (month: string) => {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

// ---- Settings (Settings → Quest Trail) ----

export interface QuestSettings {
  /** 'auto' adjusts each month (60–100 spaces); a number fixes it */
  length: 'auto' | number;
  /** First to the finish: a reward from the catalog and/or coins. Nothing until a parent picks it. */
  prizeRewardId: number | null;
  prizeCoins: number;
  prizeKidsOnly: boolean;
  /** Everyone who finishes */
  finisherCoins: number;
  /** Each star after the finish */
  coinsPerStar: number;
  timeOfDay: 'day' | 'sunset' | 'night';
  fog: boolean;
}
export const QUEST_DEFAULTS: QuestSettings = {
  length: 'auto', prizeRewardId: null, prizeCoins: 0, prizeKidsOnly: false, finisherCoins: 0, coinsPerStar: 2, timeOfDay: 'day', fog: true,
};
export const LENGTH_LIMITS = { min: 40, max: 120 };
const AUTO = { start: 80, min: 60, max: 100, step: 10 };
/** A trail started partway through a month is never shorter than this */
const SHORTEST = 20;

const setting = (key: string) => (prepared('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
const saveSetting = (key: string, value: string) => prepared('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
const int = (v: unknown, min: number, max: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : null);

export function questSettings(): QuestSettings {
  let raw: Partial<QuestSettings> = {};
  try { raw = JSON.parse(setting('questTrail') ?? '{}') ?? {}; } catch { /* the defaults */ }
  return { ...QUEST_DEFAULTS, ...cleanSettings(raw).value };
}

/** The valid fields of a settings change (and the first invalid one's name). */
export function cleanSettings(input: Record<string, unknown>): { value: Partial<QuestSettings>; error?: string } {
  const value: Partial<QuestSettings> = {};
  for (const [k, v] of Object.entries(input ?? {})) {
    let ok = true;
    if (k === 'length') {
      const n = int(v, LENGTH_LIMITS.min, LENGTH_LIMITS.max);
      if (v === 'auto') value.length = 'auto'; else if (n !== null) value.length = n; else ok = false;
    } else if (k === 'prizeRewardId') {
      if (v === null) value.prizeRewardId = null; else if (int(v, 1, Number.MAX_SAFE_INTEGER) !== null) value.prizeRewardId = v as number; else ok = false;
    } else if (k === 'prizeCoins' || k === 'finisherCoins') {
      const n = int(v, 0, 1000);
      if (n !== null) value[k] = n; else ok = false;
    } else if (k === 'coinsPerStar') {
      const n = int(v, 0, 20);
      if (n !== null) value.coinsPerStar = n; else ok = false;
    } else if (k === 'prizeKidsOnly' || k === 'fog') {
      if (typeof v === 'boolean') value[k] = v; else ok = false;
    } else if (k === 'timeOfDay') {
      if (v === 'day' || v === 'sunset' || v === 'night') value.timeOfDay = v; else ok = false;
    } else ok = false;
    if (!ok) return { value, error: k };
  }
  return { value };
}

export function saveQuestSettings(change: Partial<QuestSettings>): QuestSettings {
  const next = { ...questSettings(), ...change };
  saveSetting('questTrail', JSON.stringify(next));
  return next;
}

// ---- Who plays ----

interface Person { id: number; displayName: string; role: string; language: string | null; avatarColor: string | null; avatarType: string | null; avatarPreset: string | null; avatarPhotoUrl: string | null }
/** Everyone with "Participates in tasks" on: kids and members always, parents when they've switched it on. */
function participants(): Person[] {
  return prepared(`SELECT id, displayName, role, language, avatarColor, avatarType, avatarPreset, avatarPhotoUrl FROM users
    WHERE role IN ('child', 'member') OR (role = 'admin' AND isParticipant = 1) ORDER BY id`).all() as Person[];
}

// ---- Rows ----

export interface Trail { month: string; world: string; length: number; spaces: string; startDay: string; closedAt: string | null }
export interface Player { month: string; userId: number; position: number; joinDay: string; finishedAt: string | null; place: number | null; prizeWon: number; endSeenAt: string | null }

const getTrail = (month: string) => prepared('SELECT * FROM quest_trails WHERE month = ?').get(month) as Trail | undefined;
const getPlayer = (month: string, userId: number) => prepared('SELECT * FROM quest_players WHERE month = ? AND userId = ?').get(month, userId) as Player | undefined;
const playersOf = (month: string) => prepared('SELECT * FROM quest_players WHERE month = ? ORDER BY userId').all(month) as Player[];
export const spacesOf = (t: Trail): Record<number, Space> => JSON.parse(t.spaces);

// ---- Stars ----

export interface StarCount {
  /** Earned this month, from the day they joined */
  earned: number;
  /** Rolls (and cash-ins) so far */
  used: number;
  /** earned − used */
  left: number;
  /** Today's chores done, those still waiting for a parent's OK (Strict Mode), today's two stars, the chore card */
  today: { chores: number; pending: number; stars: number; card: 'none' | 'open' | 'done' };
}

/** A day's stars: the chores' (0–2, or the vacation star) and the chore card's (0–1) */
interface DayStars { stars: number; card: number }

/** A month's dates as ISO bounds with room for any time zone (the exact day is checked by daySql). */
function monthBounds(month: string): [string, string] {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return [new Date(Date.UTC(y, m - 1, -1)).toISOString().slice(0, 10), new Date(Date.UTC(y, m, 2)).toISOString().slice(0, 10)];
}

/** Each day's stars as the chores give them now, never below what a roll has kept */
function count(trail: Trail, player: Player, now: Date): { stars: StarCount; days: Map<string, DayStars> } {
  const today = dateStr(now);
  const [from, to] = monthBounds(trail.month);
  // Each chore once a day: distinct chores by day
  const chores = new Map<string, number>();
  for (const r of prepared(`SELECT ${daySql('completedAt')} AS day, COUNT(DISTINCT taskId) AS n FROM task_completions
      WHERE userId = ? AND status = 'approved' AND completedAt >= ? AND completedAt < ? GROUP BY day`)
    .all(player.userId, from, to) as { day: string; n: number }[]) {
    if (r.day.startsWith(trail.month) && r.day >= player.joinDay && r.day <= today) chores.set(r.day, r.n);
  }
  const extras = prepared('SELECT id, day, kind, createdAt FROM quest_stars WHERE month = ? AND userId = ?')
    .all(trail.month, player.userId) as { id: number; day: string; kind: string; createdAt: string }[];
  const away = new Set(extras.filter((e) => e.kind === 'vacation').map((e) => e.day));
  const kept = new Map((prepared('SELECT day, stars, card FROM quest_kept WHERE month = ? AND userId = ?')
    .all(trail.month, player.userId) as ({ day: string } & DayStars)[]).map((k) => [k.day, k]));
  const cardDone = prepared(`SELECT 1 FROM task_completions WHERE userId = ? AND status = 'approved'
      AND julianday(completedAt) >= julianday(?) AND ${daySql('completedAt')} = ? LIMIT 1`);

  const days = new Map<string, DayStars>();
  const dayOf = (day: string) => {
    if (!days.has(day)) days.set(day, { stars: 0, card: 0 });
    return days.get(day)!;
  };
  for (const day of new Set([...chores.keys(), ...away, ...kept.keys()])) {
    const n = chores.get(day) ?? 0;
    dayOf(day).stars = Math.max((n >= 1 || away.has(day) ? 1 : 0) + (n >= 3 ? 1 : 0), kept.get(day)?.stars ?? 0);
  }
  let earned = 0;
  let card: StarCount['today']['card'] = 'none';
  for (const e of extras) {
    if (e.kind === 'gift') earned += 1;
    if (e.kind === 'card') {
      const done = !!cardDone.get(player.userId, e.createdAt, e.day) || (kept.get(e.day)?.card ?? 0) > 0;
      if (done) dayOf(e.day).card = 1;
      if (e.day === today) card = done ? 'done' : 'open';
    }
  }
  for (const d of days.values()) earned += d.stars + d.card;
  const used = (prepared('SELECT COUNT(*) AS n FROM quest_rolls WHERE month = ? AND userId = ?').get(trail.month, player.userId) as { n: number }).n;
  // Today's chores still waiting for a parent's OK (Strict Mode): their star comes with the approval
  const pending = today.startsWith(trail.month)
    ? (prepared(`SELECT COUNT(DISTINCT taskId) AS n FROM task_completions WHERE userId = ? AND status = 'pending'
        AND completedAt >= ? AND completedAt < ? AND ${daySql('completedAt')} = ?`).get(player.userId, from, to, today) as { n: number }).n
    : 0;
  return {
    stars: { earned, used, left: earned - used, today: { chores: chores.get(today) ?? 0, pending, stars: days.get(today)?.stars ?? 0, card } },
    days,
  };
}

export const starsFor = (trail: Trail, player: Player, now: Date = new Date()): StarCount => count(trail, player, now).stars;

/** A roll keeps every star earned so far, so a Done taken back afterwards takes nothing back */
function keep(trail: Trail, userId: number, days: Map<string, DayStars>): void {
  const up = prepared(`INSERT INTO quest_kept (month, userId, day, stars, card) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (month, userId, day) DO UPDATE SET stars = MAX(stars, excluded.stars), card = MAX(card, excluded.card)`);
  for (const [day, d] of days) if (d.stars > 0 || d.card > 0) up.run(trail.month, userId, day, d.stars, d.card);
}

// ---- The month's trail ----

/** The base length for 'auto': grows when someone finished before the 20th, shrinks when nobody finished. */
function autoLength(prev: Trail | undefined, month: string): number {
  let base = Number(setting('questAutoLength')) || AUTO.start;
  if (prev && prev.month === prevMonthOf(month)) {
    const finishes = prepared(`SELECT ${daySql('finishedAt')} AS day FROM quest_players WHERE month = ? AND finishedAt IS NOT NULL`)
      .all(prev.month) as { day: string }[];
    if (finishes.some((f) => f.day < `${prev.month}-20`)) base += AUTO.step;
    else if (finishes.length === 0) base -= AUTO.step;
    base = Math.min(AUTO.max, Math.max(AUTO.min, base));
    saveSetting('questAutoLength', String(base));
  }
  return base;
}

function createTrail(month: string, today: string): Trail {
  const s = questSettings();
  const prev = prepared('SELECT * FROM quest_trails WHERE month < ? ORDER BY month DESC LIMIT 1').get(month) as Trail | undefined;
  const base = s.length === 'auto' ? autoLength(prev, month) : s.length;
  // Carrying on from last month: the whole month. Starting fresh partway through: the days left.
  const startDay = prev && prev.month === prevMonthOf(month) ? `${month}-01` : today;
  const dim = daysIn(month);
  const daysLeft = dim - Number(startDay.slice(8, 10)) + 1;
  const length = daysLeft >= dim ? base : Math.max(SHORTEST, Math.round((base * daysLeft) / dim));
  prepared('INSERT OR IGNORE INTO quest_trails (month, world, length, spaces, startDay) VALUES (?, ?, ?, ?, ?)')
    .run(month, worldFor(month), length, JSON.stringify(layoutFor(length)), startDay);
  return getTrail(month)!;
}

/** New players join level with whoever is last (at Start on a new trail). */
function syncPlayers(trail: Trail, today: string): Person[] {
  const people = participants();
  const rows = playersOf(trail.month);
  const have = new Set(rows.map((r) => r.userId));
  const missing = people.filter((p) => !have.has(p.id));
  if (missing.length) {
    const playing = new Set(people.map((p) => p.id));
    const current = rows.filter((r) => playing.has(r.userId));
    const start = current.length ? Math.min(...current.map((r) => r.position)) : 0;
    const joinDay = today < trail.startDay ? trail.startDay : today;
    const add = prepared('INSERT OR IGNORE INTO quest_players (month, userId, position, joinDay) VALUES (?, ?, ?, ?)');
    for (const p of missing) add.run(trail.month, p.id, start, rows.length ? joinDay : trail.startDay);
  }
  return people;
}

/** Today's star for each player on their own vacation, while someone who plays is home. */
function grantVacationStars(trail: Trail, people: Person[], now: Date): void {
  const away = awayNow(now);
  if (away.family || away.ids.size === 0) return;
  if (!people.some((p) => !away.ids.has(p.id))) return;
  const day = dateStr(now);
  const add = prepared("INSERT OR IGNORE INTO quest_stars (month, userId, day, kind) VALUES (?, ?, ?, 'vacation')");
  for (const p of people) if (away.ids.has(p.id)) add.run(trail.month, p.id, day);
}

/**
 * This month's trail, made the first time it's needed (null when Quest Trail is switched off). An older
 * trail still open is finished first: its leftover stars are rolled. Also the background job, every 30 s.
 */
export function ensureTrail(now: Date = new Date()): Trail | null {
  if (!isFeatureOn('questTrail')) return null;
  const today = dateStr(now);
  const month = today.slice(0, 7);
  for (const old of prepared('SELECT * FROM quest_trails WHERE closedAt IS NULL AND month < ? ORDER BY month').all(month) as Trail[]) {
    closeTrail(old, now);
  }
  return db.transaction(() => {
    const trail = getTrail(month) ?? createTrail(month, today);
    const people = syncPlayers(trail, today);
    grantVacationStars(trail, people, now);
    return trail;
  })();
}

/** Tests can fix the month-end order (each round is shuffled with this) */
let pick = (n: number) => randomInt(n);
export function setQuestOrder(fn?: (n: number) => number) { pick = fn ?? ((n: number) => randomInt(n)); }
const shuffled = <T>(list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * The month is over: every star nobody rolled is rolled for them, one round of turns at a time, each round in
 * a random order (so nobody always goes first at the finish).
 */
export function closeTrail(trail: Trail, now: Date = new Date()): void {
  db.transaction(() => {
    if ((getTrail(trail.month) as Trail).closedAt) return;
    let rolled = true;
    while (rolled) {
      rolled = false;
      for (const p of shuffled(playersOf(trail.month))) {
        if (starsFor(trail, p, now).left < 1) continue;
        const r = takeTurn(trail, p.userId, { auto: true, rolledBy: null, now });
        if (!('error' in r)) rolled = true;
      }
    }
    prepared('UPDATE quest_trails SET closedAt = ? WHERE month = ?').run(now.toISOString(), trail.month);
  })();
}

// ---- A turn ----

export type QuestEvent =
  | { t: 'move'; from: number; to: number }
  | { t: 'coins'; n: number }
  | { t: 'shortcut'; from: number; to: number }
  | { t: 'slide'; from: number; to: number }
  | { t: 'card'; fresh: boolean }
  | { t: 'treat'; item: string }
  | { t: 'treatCoins'; n: number }
  | { t: 'highFive'; with: number[] }
  | { t: 'finish'; place: number; coins: number; prize: { rewardId: number | null; rewardTitle: string | null; coins: number } | null }
  | { t: 'cashIn'; coins: number };

export interface TurnResult { roll: number; from: number; to: number; events: QuestEvent[]; coins: number; starsLeft: number }

/** Coins for a player, with a line in their coin history (in their own language). */
function pay(userId: number, amount: number, key: string, vars: Record<string, string | number> = {}): void {
  if (amount <= 0) return;
  const lang = (prepared('SELECT language FROM users WHERE id = ?').get(userId) as { language: string | null } | undefined)?.language;
  prepared('UPDATE users SET coins = coins + ? WHERE id = ?').run(amount, userId);
  prepared('INSERT INTO coin_adjustments (userId, amount, reason, createdBy, createdAt) VALUES (?, ?, ?, NULL, ?)')
    .run(userId, amount, tr(lang, `quest.${key}`, vars), new Date().toISOString());
}

const TREAT_COINS = 2;
/** Tests can load the die. */
let die = (n: number) => randomInt(n);
export function setQuestDie(fn?: (n: number) => number) { die = fn ?? ((n: number) => randomInt(n)); }

/**
 * One star spent: a roll of the die, or (after the finish) the star's coins. `auto` is the month-end roll for
 * someone's leftover stars (no chore cards then: there's no day left to do the chore).
 */
export function takeTurn(trail: Trail, userId: number, opts: { auto?: boolean; rolledBy: number | null; now?: Date }): TurnResult | { error: string } {
  const now = opts.now ?? new Date();
  return db.transaction((): TurnResult | { error: string } => {
    const p = getPlayer(trail.month, userId);
    if (!p) return { error: 'not_playing' };
    const { stars, days } = count(trail, p, now);
    if (stars.left < 1) return { error: 'no_stars' };
    keep(trail, userId, days);
    const s = questSettings();
    const record = (roll: number, to: number, events: QuestEvent[], coins: number) =>
      prepared('INSERT INTO quest_rolls (month, userId, roll, fromPos, toPos, events, coins, auto, rolledBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(trail.month, userId, roll, p.position, to, JSON.stringify(events), coins, opts.auto ? 1 : 0, opts.rolledBy, now.toISOString());

    if (p.finishedAt) {
      pay(userId, s.coinsPerStar, 'starCoinsReason');
      const events: QuestEvent[] = [{ t: 'cashIn', coins: s.coinsPerStar }];
      record(0, p.position, events, s.coinsPerStar);
      return { roll: 0, from: p.position, to: p.position, events, coins: s.coinsPerStar, starsLeft: stars.left - 1 };
    }

    const roll = die(6) + 1;
    const events: QuestEvent[] = [];
    let to = Math.min(p.position + roll, trail.length);
    events.push({ t: 'move', from: p.position, to });
    let coins = 0;
    const space = to < trail.length ? spacesOf(trail)[to] : undefined;
    if (space?.t === 'coins') {
      coins += space.n;
      events.push({ t: 'coins', n: space.n });
      pay(userId, space.n, 'coinsReason');
    } else if (space?.t === 'up' || space?.t === 'down') {
      events.push({ t: space.t === 'up' ? 'shortcut' : 'slide', from: to, to: space.to });
      to = space.to;
    } else if (space?.t === 'card' && !opts.auto) {
      const fresh = prepared("INSERT OR IGNORE INTO quest_stars (month, userId, day, kind, createdAt) VALUES (?, ?, ?, 'card', ?)")
        .run(trail.month, userId, dateStr(now), now.toISOString()).changes > 0;
      events.push({ t: 'card', fresh });
    } else if (space?.t === 'treat') {
      const item = giftAccessory(userId, die);
      if (item) events.push({ t: 'treat', item });
      else {
        coins += TREAT_COINS;
        events.push({ t: 'treatCoins', n: TREAT_COINS });
        pay(userId, TREAT_COINS, 'treatReason');
      }
    }

    // A high five with everyone on the space you end on (not Start or the finish): a coin each
    if (to > 0 && to < trail.length) {
      const there = prepared('SELECT q.userId, u.displayName FROM quest_players q JOIN users u ON u.id = q.userId WHERE q.month = ? AND q.position = ? AND q.userId != ? AND q.finishedAt IS NULL')
        .all(trail.month, to, userId) as { userId: number; displayName: string }[];
      if (there.length) {
        const me = (prepared('SELECT displayName FROM users WHERE id = ?').get(userId) as { displayName: string }).displayName;
        for (const o of there) {
          pay(o.userId, 1, 'highFiveReason', { name: me });
          pay(userId, 1, 'highFiveReason', { name: o.displayName });
          coins += 1;
        }
        events.push({ t: 'highFive', with: there.map((o) => o.userId) });
      }
    }

    prepared('UPDATE quest_players SET position = ? WHERE month = ? AND userId = ?').run(to, trail.month, userId);
    if (to >= trail.length) coins += finish(trail, userId, now, s, events);
    record(roll, to, events, coins);
    return { roll, from: p.position, to, events, coins, starsLeft: stars.left - 1 };
  })();
}

/** Reaching the finish: a place, the finisher coins, and the prize for the first one who can win it. */
function finish(trail: Trail, userId: number, now: Date, s: QuestSettings, events: QuestEvent[]): number {
  const place = 1 + (prepared('SELECT COUNT(*) AS n FROM quest_players WHERE month = ? AND finishedAt IS NOT NULL').get(trail.month) as { n: number }).n;
  prepared('UPDATE quest_players SET finishedAt = ?, place = ? WHERE month = ? AND userId = ?').run(now.toISOString(), place, trail.month, userId);
  let coins = 0;
  if (s.finisherCoins > 0) {
    pay(userId, s.finisherCoins, 'finisherReason');
    coins += s.finisherCoins;
  }
  let prize: Extract<QuestEvent, { t: 'finish' }>['prize'] = null;
  const role = (prepared('SELECT role FROM users WHERE id = ?').get(userId) as { role: string }).role;
  const taken = !!prepared('SELECT 1 FROM quest_players WHERE month = ? AND prizeWon = 1').get(trail.month);
  // A reward hidden from the shop can still be the prize (one kept just for the Quest Trail)
  const reward = s.prizeRewardId
    ? prepared('SELECT id, title FROM rewards WHERE id = ? AND deletedAt IS NULL').get(s.prizeRewardId) as { id: number; title: string } | undefined
    : undefined;
  if (!taken && (!s.prizeKidsOnly || role === 'child') && (reward || s.prizeCoins > 0)) {
    prepared('UPDATE quest_players SET prizeWon = 1 WHERE month = ? AND userId = ?').run(trail.month, userId);
    // A catalog reward arrives like one bought for them: waiting for a parent to hand it over
    if (reward) prepared("INSERT INTO reward_redemptions (rewardId, userId, costCoins, status) VALUES (?, ?, 0, 'requested')").run(reward.id, userId);
    if (s.prizeCoins > 0) {
      pay(userId, s.prizeCoins, 'prizeReason');
      coins += s.prizeCoins;
    }
    prize = { rewardId: reward?.id ?? null, rewardTitle: reward?.title ?? null, coins: s.prizeCoins };
  }
  events.push({ t: 'finish', place, coins: s.finisherCoins, prize });
  return coins;
}

/** A parent gives someone a star. */
export function giveStar(trail: Trail, userId: number, by: number, now: Date = new Date()): boolean {
  if (!getPlayer(trail.month, userId)) return false;
  prepared("INSERT INTO quest_stars (month, userId, day, kind, createdBy, createdAt) VALUES (?, ?, ?, 'gift', ?, ?)")
    .run(trail.month, userId, dateStr(now), by, now.toISOString());
  return true;
}

// ---- What the app shows ----

export function questState(viewerId: number, now: Date = new Date()) {
  const trail = ensureTrail(now);
  if (!trail) return { enabled: false as const };
  const s = questSettings();
  const playing = new Map(participants().map((p) => [p.id, p]));
  const players = playersOf(trail.month).filter((p) => playing.has(p.userId)).map((p) => {
    const stars = starsFor(trail, p, now);
    const who = playing.get(p.userId)!;
    return {
      userId: p.userId, displayName: who.displayName, isKid: who.role === 'child', ...avatarOf(who),
      position: p.position, finishedAt: p.finishedAt, place: p.place, prizeWon: !!p.prizeWon,
      starsLeft: Math.max(0, stars.left),
    };
  });
  const mine = getPlayer(trail.month, viewerId);
  const myStars = mine && playing.has(viewerId) ? starsFor(trail, mine, now) : null;
  const reward = s.prizeRewardId ? prepared('SELECT id, title FROM rewards WHERE id = ? AND deletedAt IS NULL').get(s.prizeRewardId) as { id: number; title: string } | undefined : undefined;
  const won = prizeWonIn(trail.month);
  return {
    enabled: true as const,
    trail: { month: trail.month, world: trail.world, length: trail.length, startDay: trail.startDay, endDay: `${trail.month}-${daysIn(trail.month)}`, spaces: spacesOf(trail) },
    players,
    me: myStars ? { starsLeft: Math.max(0, myStars.left), today: myStars.today, bonusAt: 3 } : null,
    prize: {
      rewardId: reward?.id ?? null, rewardTitle: reward?.title ?? null, coins: s.prizeCoins, kidsOnly: s.prizeKidsOnly,
      // Once someone has won it, the sign at the finish says who (and what they won)
      won: won ? { userId: won.userId, displayName: won.displayName, rewardTitle: won.prize?.rewardTitle ?? null, coins: won.prize?.coins ?? 0 } : null,
    },
    finisherCoins: s.finisherCoins, coinsPerStar: s.coinsPerStar, timeOfDay: s.timeOfDay, fog: s.fog,
    // The viewer's badges this year, and last winner's crown (only while they're still in the race)
    badges: trailBadges(viewerId, trail.month.slice(0, 4)),
    crown: ((id) => (id != null && playing.has(id) ? id : null))(crownFor(trail.month)),
    lastMonth: lastMonthFor(viewerId, trail.month),
  };
}

const avatarOf = (u: { avatarColor: string | null; avatarType: string | null; avatarPreset: string | null; avatarPhotoUrl: string | null }) =>
  ({ avatarColor: u.avatarColor, avatarType: u.avatarType, avatarPreset: u.avatarPreset, avatarPhotoUrl: u.avatarPhotoUrl });

/** Who won a month's prize, and the prize as it was won (the settings may have changed since) */
function prizeWonIn(month: string): { userId: number; displayName: string; prize: { rewardTitle: string | null; coins: number } | null } | null {
  const winner = prepared('SELECT q.userId, u.displayName FROM quest_players q JOIN users u ON u.id = q.userId WHERE q.month = ? AND q.prizeWon = 1')
    .get(month) as { userId: number; displayName: string } | undefined;
  if (!winner) return null;
  for (const r of prepared('SELECT events FROM quest_rolls WHERE month = ? AND userId = ? ORDER BY id DESC').all(month, winner.userId) as { events: string }[]) {
    const fin = (JSON.parse(r.events) as QuestEvent[]).find((e) => e.t === 'finish') as Extract<QuestEvent, { t: 'finish' }> | undefined;
    if (fin?.prize) return { ...winner, prize: { rewardTitle: fin.prize.rewardTitle, coins: fin.prize.coins } };
  }
  return { ...winner, prize: null };
}

/** Someone's trail badges for a year (ENH-44): the months they reached the finish, and the ones they came first in.
 *  null when they haven't played the Quest Trail that year (a parent who doesn't do chores). */
export function trailBadges(userId: number, year: string): { year: string; finished: string[]; first: string[] } | null {
  const rows = prepared('SELECT month, finishedAt, place FROM quest_players WHERE userId = ? AND month LIKE ? ORDER BY month')
    .all(userId, `${year}-%`) as { month: string; finishedAt: string | null; place: number | null }[];
  if (!rows.length) return null;
  const finished = rows.filter((r) => r.finishedAt);
  return { year, finished: finished.map((r) => r.month), first: finished.filter((r) => r.place === 1).map((r) => r.month) };
}

/** Who wears the crown this month (ENH-44): whoever came first in the last month someone did, until the next winner. */
function crownFor(month: string): number | null {
  const row = prepared('SELECT userId FROM quest_players WHERE month < ? AND place = 1 ORDER BY month DESC LIMIT 1').get(month) as { userId: number } | undefined;
  return row?.userId ?? null;
}

/** Last month's results, until the viewer has seen the end-of-month screen. */
function lastMonthFor(viewerId: number, month: string) {
  const prev = getTrail(prevMonthOf(month));
  if (!prev?.closedAt) return null;
  const me = getPlayer(prev.month, viewerId);
  if (!me || me.endSeenAt) return null;
  const rows = prepared(`SELECT q.userId, u.displayName, u.role, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl, q.position, q.place, q.finishedAt, q.prizeWon FROM quest_players q
      JOIN users u ON u.id = q.userId WHERE q.month = ? ORDER BY q.place IS NULL, q.place, q.position DESC, u.displayName`).all(prev.month) as any[];
  // The prize as it was won, the viewer's coins and their badges this year
  const prize = prizeWonIn(prev.month)?.prize ?? null;
  const myCoins = (prepared('SELECT COALESCE(SUM(coins), 0) AS n FROM quest_rolls WHERE month = ? AND userId = ?').get(prev.month, viewerId) as { n: number }).n;
  const mine = trailBadges(viewerId, prev.month.slice(0, 4));
  return {
    month: prev.month, world: prev.world, length: prev.length, prize, myCoins, badges: mine?.finished ?? [], firsts: mine?.first ?? [],
    players: rows.map((r) => ({
      userId: r.userId, displayName: r.displayName, isKid: r.role === 'child', ...avatarOf(r),
      position: r.position, place: r.place, finishedAt: r.finishedAt, prizeWon: !!r.prizeWon,
    })),
  };
}

export function markEndSeen(viewerId: number, now: Date = new Date()): void {
  const prev = prevMonthOf(dateStr(now).slice(0, 7));
  prepared('UPDATE quest_players SET endSeenAt = ? WHERE month = ? AND userId = ?').run(now.toISOString(), prev, viewerId);
}

/** The background job (every 30 s, each family): the new month's trail and today's vacation stars. */
export function questJob(now: Date = new Date()): void {
  ensureTrail(now);
}
