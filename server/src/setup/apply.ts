import bcrypt from 'bcryptjs';
import db from '../database';
import { createTask } from '../routes/tasks';
import { freeUsername, unusableHash } from '../routes/users';
import { getCoinsByEffortConfig } from '../utils/adminHelpers';
import { syncPrimaryGoal } from '../utils/goals';
import { currentLocalWeek } from '../utils/periods';
import { trashReward } from '../utils/trash';
import { tooManyPeople } from '../hosted/limits';
import {
  AGE_GROUPS, AgeGroup, Audience, CASH_AMOUNTS, KID_ROOM_COLORS, PRESET_DESCRIPTIONS, STARTER_REWARDS, STARTER_ROOMS,
  StarterChore, StarterRoomId, choreWeeklyCoins, coinsPerMoney, nicePrice, rewardPrice, starterChore, starterReward,
  weeklyGoal,
} from './starter';

// POST /api/setup (NEW-17): the wizard's picks become people, rooms, chores, rewards and weekly goals in one
// transaction. Everything is checked first, so a refused setup makes nothing. It only adds: existing people and
// rooms can be used ('u:<id>', 'r:<id>'), and the only thing removed is an untouched starter reward nobody bought.

export interface SetupPerson {
  /** 'me' (the parent doing setup), 'u:<id>' for someone already in the family, anything else for someone new */
  ref: string;
  kind: 'kid' | 'adult';
  displayName?: string;
  ageGroup?: AgeGroup;
  logsIn?: boolean;
  username?: string;
  password?: string;
  kidMode?: boolean;
  /** Weekly allowance in money when every chore is done (kids only; 0 or missing = none) */
  allowance?: number;
}

export interface SetupRoom {
  /** What chores point at: 'r:<id>' uses a room the family already has */
  key: string;
  starter: StarterRoomId | 'own' | 'quests';
  name?: string;
  /** A kid's own room or Quests room: their person ref */
  owner?: string;
}

export interface SetupBody {
  people: SetupPerson[];
  rooms: SetupRoom[];
  chores: Array<{ id: string; room: string; people: string[] }>;
  /** Starter rewards to have. Text comes in the parent's language, except the 8 presets (stored in English) */
  rewards: Array<{ id: string; title?: string; description?: string }>;
  /** One title per CASH_AMOUNTS ("$1 cash", "$5 cash"), for kids with an allowance */
  cashTitles?: string[];
  goals?: Array<{ person: string; title: string }>;
}

export type SetupResult =
  | { ok: true; made: { people: number; rooms: number; chores: number; rewards: number; goals: number; removedRewards: number } }
  | { ok: false; status: number; error: string; code: string };

const AVATAR_COLORS = ['#2563EB', '#DB2777', '#84CC16', '#F59E0B', '#7C3AED', '#0D9488', '#E11D48', '#4F46E5'];
const refused = (error: string, code: string, status = 400): SetupResult => ({ ok: false, status, error, code });
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isList = (v: unknown): v is any[] => Array.isArray(v);

/** The median of some numbers (the price for everyone without their own price) */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : nicePrice((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
}

export function applySetup(requesterId: number, raw: unknown): SetupResult {
  const body = (raw ?? {}) as Partial<SetupBody>;
  if (!isList(body.people) || !isList(body.rooms) || !isList(body.chores) || !isList(body.rewards)) {
    return refused('people, rooms, chores and rewards are required', 'bad_request');
  }
  if (body.people.length > 20 || body.rooms.length > 40 || body.chores.length > 300 || body.rewards.length > 60) {
    return refused('Too much at once', 'too_many');
  }
  const requester = db.prepare('SELECT id, role, language FROM users WHERE id = ?').get(requesterId) as { id: number; role: string; language: string } | undefined;
  if (!requester || requester.role !== 'admin') return refused('Admin only', 'admin_only', 403);

  // ── People ──
  interface Person extends SetupPerson { userId?: number; audience: Audience; plays: boolean }
  const people = new Map<string, Person>();
  const newNames = new Set<string>();
  for (const p of body.people as SetupPerson[]) {
    const ref = text(p?.ref, 40);
    if (!ref || people.has(ref)) return refused('Each person needs their own ref', 'bad_person');
    const kind = p.kind === 'kid' ? 'kid' : p.kind === 'adult' ? 'adult' : null;
    if (!kind) return refused('kind must be kid or adult', 'bad_person');
    if (kind === 'kid' && !AGE_GROUPS.includes(p.ageGroup as AgeGroup)) return refused('A kid needs an age group', 'bad_age');
    let userId: number | undefined;
    let plays = true;
    if (ref === 'me' || ref.startsWith('u:')) {
      userId = ref === 'me' ? requesterId : Number(ref.slice(2));
      const row = db.prepare('SELECT id, isParticipant FROM users WHERE id = ?').get(userId) as { id: number; isParticipant: number } | undefined;
      if (!row) return refused('Person not found', 'person_not_found', 404);
      plays = !!row.isParticipant;
    } else {
      const displayName = text(p.displayName, 40);
      if (!displayName) return refused('Each new person needs a name', 'name_needed');
      const logsIn = kind === 'adult' || p.logsIn !== false;
      if (logsIn) {
        const username = text(p.username, 40);
        if (!username || /\s/.test(username)) return refused('Each person who logs in needs a username', 'username_needed');
        if (typeof p.password !== 'string' || p.password.length < 4) return refused('Passwords need at least 4 characters', 'password_needed');
        const key = username.toLowerCase();
        if (newNames.has(key) || db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
          return refused(`The username ${username} is taken`, 'username_taken', 409);
        }
        newNames.add(key);
      }
    }
    const allowance = kind === 'kid' ? Math.max(0, Math.min(1000, Number(p.allowance) || 0)) : 0;
    people.set(ref, { ...p, ref, kind, userId, allowance, audience: kind === 'kid' ? p.ageGroup as AgeGroup : 'adult', plays });
  }
  const newPeople = [...people.values()].filter((p) => p.userId === undefined);
  const total = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n + newPeople.length;
  const tooMany = tooManyPeople(total);
  if (tooMany) return { ok: false, status: 403, ...tooMany };

  // ── Rooms ──
  const rooms = new Map<string, SetupRoom & { roomId?: number }>();
  for (const r of body.rooms as SetupRoom[]) {
    const key = text(r?.key, 40);
    if (!key || rooms.has(key)) return refused('Each room needs its own key', 'bad_room');
    const starter = r.starter === 'own' || r.starter === 'quests' ? r.starter : STARTER_ROOMS.find((s) => s.id === r.starter)?.id;
    if (!starter) return refused('Unknown room', 'bad_room');
    let roomId: number | undefined;
    if (key.startsWith('r:')) {
      roomId = Number(key.slice(2));
      if (!db.prepare('SELECT 1 FROM rooms WHERE id = ? AND deletedAt IS NULL').get(roomId)) return refused('Room not found', 'room_not_found', 404);
    } else if (!text(r.name, 60)) {
      return refused('Each new room needs a name', 'room_name_needed');
    }
    if (starter === 'own' || starter === 'quests') {
      const owner = people.get(text(r.owner, 40));
      if (!owner || owner.kind !== 'kid') return refused("A kid's room needs its kid", 'bad_room');
    }
    rooms.set(key, { ...r, key, starter, roomId });
  }

  // ── Chores ──
  const chores: Array<{ def: StarterChore; room: string; people: string[] }> = [];
  for (const c of body.chores as SetupBody['chores']) {
    const room = rooms.get(text(c?.room, 40));
    if (!room) return refused('A chore points at an unknown room', 'bad_chore');
    const def = starterChore(text(c.id, 60), room.starter);
    if (!def) return refused('Unknown chore', 'bad_chore');
    const refs = isList(c.people) ? [...new Set(c.people.map((r) => text(r, 40)))] : [];
    if (refs.some((r) => !people.has(r))) return refused('A chore points at an unknown person', 'bad_chore');
    if ((room.starter === 'own' || room.starter === 'quests') && (refs.length !== 1 || refs[0] !== room.owner)) return refused("A kid's own chores are theirs", 'bad_chore');
    chores.push({ def, room: room.key, people: refs });
  }

  // What each person earns a week if they do everything (sets their reward prices and weekly goal)
  const coinsByEffort = getCoinsByEffortConfig();
  const weekly = new Map<string, number>([...people.keys()].map((r) => [r, 0]));
  for (const c of chores) {
    for (const r of c.people) weekly.set(r, (weekly.get(r) ?? 0) + choreWeeklyCoins(c.def, coinsByEffort, c.people.length));
  }

  // ── Rewards ──
  const rewards: Array<{ id: string; title: string; description: string | null; weeks: number; ages: Audience[]; presetTitle?: string }> = [];
  for (const r of body.rewards as SetupBody['rewards']) {
    const def = starterReward(text(r?.id, 40));
    if (!def) return refused('Unknown reward', 'bad_reward');
    if (rewards.some((x) => x.id === def.id)) continue;
    const title = def.presetTitle ?? text(r.title, 80);
    if (!title) return refused('Each reward needs a title', 'bad_reward');
    const description = def.presetTitle ? PRESET_DESCRIPTIONS[def.presetTitle] : text(r.description, 200) || null;
    rewards.push({ id: def.id, title, description, weeks: def.weeks, ages: def.ages, presetTitle: def.presetTitle });
  }
  const cashTitles = isList(body.cashTitles) ? body.cashTitles.map((t) => text(t, 80)) : [];
  const allowanceKids = [...people.values()].filter((p) => (p.allowance ?? 0) > 0 && (weekly.get(p.ref) ?? 0) > 0);
  if (allowanceKids.length && (cashTitles.length !== CASH_AMOUNTS.length || cashTitles.some((t) => !t))) {
    return refused('Cash rewards need their titles', 'bad_reward');
  }

  const goals: Array<{ ref: string; title: string }> = [];
  for (const g of isList(body.goals) ? body.goals : []) {
    const ref = text(g?.person, 40);
    const title = text(g?.title, 80);
    if (!people.has(ref) || !title) return refused('A goal needs a person and a title', 'bad_goal');
    if (!goals.some((x) => x.ref === ref)) goals.push({ ref, title });
  }

  // The first run (no rooms yet) also sizes the 8 starter rewards and clears the unwanted ones; later runs leave the
  // family's rewards alone
  const todo = Number((db.prepare("SELECT value FROM app_settings WHERE key = 'todoRoomId'").get() as { value: string } | undefined)?.value) || 0;
  const firstRun = !db.prepare('SELECT 1 FROM rooms WHERE deletedAt IS NULL AND id != ?').get(todo);

  // ── Everything checked: make it ──
  const made = { people: 0, rooms: 0, chores: 0, rewards: 0, goals: 0, removedRewards: 0 };
  const save = db.transaction(() => {
    const usedColors = new Set((db.prepare('SELECT avatarColor FROM users').all() as Array<{ avatarColor: string }>).map((u) => u.avatarColor));
    const nextColor = () => AVATAR_COLORS.find((c) => !usedColors.has(c) && usedColors.add(c)) ?? '#F97316';
    // Usernames picked in this setup are reserved, so a kid without a login can't take one before its owner is added
    const reserve = (name: string) => { newNames.add(name.toLowerCase()); return name; };
    const insertUser = db.prepare(
      'INSERT INTO users (username, displayName, passwordHash, role, avatarColor, language, canLogIn, kidMode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const p of newPeople) {
      const displayName = text(p.displayName, 40);
      const logsIn = p.kind === 'adult' || p.logsIn !== false;
      const result = insertUser.run(
        logsIn ? text(p.username, 40) : reserve(freeUsername(displayName, newNames)),
        displayName,
        logsIn ? bcrypt.hashSync(p.password as string, 10) : unusableHash(),
        p.kind === 'adult' ? 'admin' : 'child',
        nextColor(),
        requester.language || 'en',
        logsIn ? 1 : 0,
        p.kind === 'kid' && logsIn && p.kidMode ? 1 : 0,
      );
      p.userId = Number(result.lastInsertRowid);
      made.people++;
    }
    const uid = (ref: string) => people.get(ref)!.userId!;

    let sortOrder = ((db.prepare('SELECT MAX(sortOrder) AS m FROM rooms').get() as { m: number | null }).m ?? 0) + 1;
    let kidRooms = 0;
    const insertRoom = db.prepare('INSERT INTO rooms (name, roomType, color, accentColor, assignedUserId, sortOrder) VALUES (?, ?, ?, ?, ?, ?)');
    for (const r of rooms.values()) {
      if (r.roomId) continue;
      const starter = r.starter === 'own' || r.starter === 'quests' ? null : STARTER_ROOMS.find((s) => s.id === r.starter)!;
      const colors = starter ?? KID_ROOM_COLORS[kidRooms++ % KID_ROOM_COLORS.length];
      const result = insertRoom.run(
        text(r.name, 60), starter?.type ?? (r.starter === 'quests' ? 'other' : 'bedroom'), colors.color, colors.accent,
        r.owner ? uid(r.owner) : null, sortOrder++,
      );
      r.roomId = Number(result.lastInsertRowid);
      made.rooms++;
    }

    // A family already using a room keeps its chores: the same starter chore isn't added twice
    const hasChore = db.prepare('SELECT 1 FROM tasks WHERE roomId = ? AND translationKey = ? AND deletedAt IS NULL AND archivedAt IS NULL');
    const toMake = chores.filter((c) => !hasChore.get(rooms.get(c.room)!.roomId, c.def.id));
    // Spread first due dates so a new family doesn't see every chore due on day one: daily ones are due now,
    // the rest of each frequency come due spread over its first period (health h = due in h% of the period)
    const perFrequency = new Map<number, number>();
    for (const c of toMake) if (!c.def.perWeek) perFrequency.set(c.def.frequencyDays, (perFrequency.get(c.def.frequencyDays) ?? 0) + 1);
    const seen = new Map<number, number>();
    const setExtras = db.prepare('UPDATE tasks SET translationKey = ?, timerMinutes = ? WHERE id = ?');
    for (const c of toMake) {
      const f = c.def.frequencyDays;
      const i = seen.get(f) ?? 0;
      if (!c.def.perWeek) seen.set(f, i + 1);
      // Anytime chores (homework, reading) have no schedule: they show on Home and count once a day
      const anytime = c.def.perWeek
        ? { onDemand: true, showInDashboard: true, repeatLimit: 1, repeatPeriod: 'day' }
        : { health: f <= 1 ? 0 : Math.round((100 * i) / perFrequency.get(f)!), allowEarlyCompletion: f > 1 && f <= 7 };
      const result = createTask(rooms.get(c.room)!.roomId!, {
        name: c.def.name,
        frequencyDays: f,
        effort: c.def.effort,
        assignedUserIds: c.people.map(uid),
        ...anytime,
      });
      if (result.status !== 201) throw new Error(`setup: chore ${c.def.id} refused (${JSON.stringify(result.body)})`);
      setExtras.run(c.def.id, c.def.timerMinutes ?? null, (result.body as { id: number }).id);
      made.chores++;
    }

    // Rewards: each person who can have one pays about `weeks` of their own chores
    const participants = (db.prepare("SELECT id FROM users WHERE isParticipant = 1 OR role != 'admin'").all() as Array<{ id: number }>).map((u) => u.id);
    const insertReward = db.prepare('INSERT INTO rewards (title, description, costCoins, isActive, isPreset, createdBy) VALUES (?, ?, ?, 1, ?, ?)');
    const saveRules = (rewardId: number, prices: Map<number, number>, base: number) => {
      db.prepare('DELETE FROM reward_visibility WHERE rewardId = ?').run(rewardId);
      db.prepare('DELETE FROM reward_prices WHERE rewardId = ?').run(rewardId);
      const ids = [...prices.keys()];
      if (participants.some((id) => !ids.includes(id))) {
        for (const id of ids) db.prepare('INSERT INTO reward_visibility (rewardId, userId) VALUES (?, ?)').run(rewardId, id);
      }
      for (const [id, cost] of prices) {
        if (cost !== base) db.prepare('INSERT INTO reward_prices (rewardId, userId, costCoins) VALUES (?, ?, ?)').run(rewardId, id, cost);
      }
    };
    const pricesFor = (audience: Person[], priceOf: (p: Person) => number) => {
      const prices = new Map<number, number>(audience.map((p) => [p.userId!, priceOf(p)]));
      return { prices, base: median([...prices.values()]) };
    };
    const earners = [...people.values()].filter((p) => p.plays && (weekly.get(p.ref) ?? 0) > 0);
    const presetRow = db.prepare('SELECT id FROM rewards WHERE title = ? AND isPreset = 1 AND deletedAt IS NULL ORDER BY id LIMIT 1');
    for (const r of rewards) {
      const audience = earners.filter((p) => r.ages.includes(p.audience));
      if (!audience.length) continue;
      const { prices, base } = pricesFor(audience, (p) => rewardPrice(r.weeks, weekly.get(p.ref)!));
      const existing = r.presetTitle ? presetRow.get(r.presetTitle) as { id: number } | undefined : undefined;
      if (existing && !firstRun) continue;
      let rewardId = existing?.id;
      if (rewardId) db.prepare('UPDATE rewards SET costCoins = ? WHERE id = ?').run(base, rewardId);
      else rewardId = Number(insertReward.run(r.title, r.description, base, r.presetTitle ? 1 : 0, requesterId).lastInsertRowid);
      saveRules(rewardId, prices, base);
      made.rewards++;
    }
    // A starter reward the family didn't tick goes to Recently deleted, unless someone already bought it
    const kept = new Set(rewards.map((r) => r.presetTitle).filter(Boolean));
    for (const def of firstRun ? STARTER_REWARDS : []) {
      if (!def.presetTitle || kept.has(def.presetTitle)) continue;
      const row = presetRow.get(def.presetTitle) as { id: number } | undefined;
      if (!row || db.prepare('SELECT 1 FROM reward_redemptions WHERE rewardId = ?').get(row.id)) continue;
      trashReward(row.id, requesterId);
      made.removedRewards++;
    }
    // Cash out: a kid who does every chore earns their allowance a week
    CASH_AMOUNTS.forEach((amount, i) => {
      if (!allowanceKids.length) return;
      const { prices, base } = pricesFor(allowanceKids, (p) => nicePrice(amount * coinsPerMoney(weekly.get(p.ref)!, p.allowance!)));
      const rewardId = Number(insertReward.run(cashTitles[i], null, base, 0, requesterId).lastInsertRowid);
      saveRules(rewardId, prices, base);
      made.rewards++;
    });

    // Weekly goals that repeat, sized to what their chores pay
    const insertGoal = db.prepare(
      'INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt, rewardCoins, repeatWeekly, createdBy) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
    );
    const week = currentLocalWeek();
    for (const g of goals) {
      const p = people.get(g.ref)!;
      const w = weekly.get(g.ref) ?? 0;
      if (!p.plays || w <= 0) continue;
      const { goalCoins, rewardCoins } = weeklyGoal(w);
      insertGoal.run(p.userId, g.title, goalCoins, week.startAt, week.endAt, rewardCoins, requesterId);
      syncPrimaryGoal(p.userId!);
      made.goals++;
    }

    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updatedAt) VALUES ('setupDone', ?, datetime('now'))").run(new Date().toISOString());
  });
  try {
    save();
  } catch (err) {
    // Nothing was saved (the transaction rolled back); say so in JSON rather than a bare 500
    console.error('[setup] save failed:', err);
    return refused('Nothing was saved. Please try again.', 'save_failed', 500);
  }
  return { ok: true, made };
}

/** The wizard opens by itself for a parent whose family has no rooms yet (besides To-dos) and hasn't done or skipped it */
export function setupNeeded(): boolean {
  if (db.prepare("SELECT 1 FROM app_settings WHERE key = 'setupDone'").get()) return false;
  const todo = Number((db.prepare("SELECT value FROM app_settings WHERE key = 'todoRoomId'").get() as { value: string } | undefined)?.value) || 0;
  return !db.prepare('SELECT 1 FROM rooms WHERE deletedAt IS NULL AND id != ?').get(todo);
}

export function skipSetup(): void {
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updatedAt) VALUES ('setupDone', 'skipped', datetime('now'))").run();
}
