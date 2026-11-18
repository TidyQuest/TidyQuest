import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, createAdmin, createUser, homeToday } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { at, dateStr } from '../utils/clock';
import { closeTrail, ensureTrail, layoutFor, questState, saveQuestSettings, setQuestDie, starsFor, takeTurn, type Trail } from '../utils/quest';

// Quest Trail (NEW-40). Most tests play a month in 2030 on its own clock, so they don't depend on today's date.
let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});
afterEach(() => setQuestDie());

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
/** A moment in March 2030 on the family's clock */
const march = (day: number, hours = 12) => at(2030, 2, day, hours);
/** The die always shows these, in order */
const loadDie = (...faces: number[]) => { let i = 0; setQuestDie(() => faces[i++ % faces.length] - 1); };

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const teen = await createUser(agent, admin.token, { username: 'teen', displayName: 'Teen', password: 'pass123', role: 'member' });
  // Parents play only with "Participates in tasks" on: this one doesn't
  db.prepare('UPDATE users SET isParticipant = 0 WHERE id = ?').run(admin.user.id);
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'House', roomType: 'other' })).body.id as number;
  const chores: number[] = [];
  for (const name of ['Dishes', 'Sweep', 'Laundry', 'Trash']) {
    chores.push((await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name, effort: 1, frequencyDays: 1 })).body.id);
  }
  return { admin, kid, teen, chores };
}

/** A chore done at a moment (approved unless said otherwise) */
const done = (userId: number, taskId: number, when: Date, status = 'approved') =>
  Number(db.prepare('INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 0, ?)')
    .run(taskId, userId, when.toISOString(), status).lastInsertRowid);
const trailOf = (month: string) => db.prepare('SELECT * FROM quest_trails WHERE month = ?').get(month) as Trail;
const player = (month: string, userId: number) => db.prepare('SELECT * FROM quest_players WHERE month = ? AND userId = ?').get(month, userId) as any;
const stars = (userId: number, now: Date) => starsFor(trailOf(dateStr(now).slice(0, 7)), player(dateStr(now).slice(0, 7), userId), now);
const coins = (userId: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number }).coins;
const moveTo = (month: string, userId: number, position: number) => db.prepare('UPDATE quest_players SET position = ? WHERE month = ? AND userId = ?').run(position, month, userId);
/**
 * A trail for March 2030 that carries on from February, so it's the whole month. Someone finished February on
 * the 25th (not early, and someone did), so March stays at 80 spaces.
 */
function wholeMarch() {
  db.prepare("INSERT INTO quest_trails (month, world, length, spaces, startDay, closedAt) VALUES ('2030-02', 'summit', 80, '{}', '2030-02-01', '2030-03-01')").run();
  const someone = (db.prepare("SELECT id FROM users WHERE role != 'admin' ORDER BY id LIMIT 1").get() as { id: number }).id;
  db.prepare("INSERT INTO quest_players (month, userId, position, joinDay, finishedAt, place) VALUES ('2030-02', ?, 80, '2030-02-01', ?, 1)")
    .run(someone, at(2030, 1, 25, 12).toISOString());
  return ensureTrail(march(1, 8))!;
}

describe('Quest Trail: stars', () => {
  it('gives a star for a day with a chore, a bonus at 3, and no more; each chore counts once a day', async () => {
    const { kid, chores } = await family();
    wholeMarch();
    const id = kid.user.id;
    done(id, chores[0], march(3, 9));
    expect(stars(id, march(3, 20))).toMatchObject({ earned: 1, today: { chores: 1, stars: 1 } });
    done(id, chores[0], march(3, 10)); // the same chore again
    done(id, chores[1], march(3, 11));
    expect(stars(id, march(3, 20))).toMatchObject({ earned: 1, today: { chores: 2, stars: 1 } });
    done(id, chores[2], march(3, 12));
    done(id, chores[3], march(3, 13));
    expect(stars(id, march(3, 20))).toMatchObject({ earned: 2, today: { chores: 4, stars: 2 } });
    done(id, chores[0], march(4, 9));
    expect(stars(id, march(4, 20)).earned).toBe(3);
  });

  it('counts a chore through the app, and taking the Done back takes the star back (paid back by the next one if rolled)', async () => {
    const { admin, kid, chores } = await family();
    const now = homeToday(0, 12);
    const month = dateStr(now).slice(0, 7);
    const c = await agent.post(`/api/tasks/${chores[0]}/complete`).set(auth(kid.token)).send({});
    expect(c.status).toBe(200);
    const state = (await agent.get('/api/quest').set(auth(kid.token))).body;
    expect(state.enabled).toBe(true);
    expect(state.me).toMatchObject({ starsLeft: 1, owed: 0, today: { chores: 1, stars: 1 } });
    loadDie(2);
    expect((await agent.post('/api/quest/roll').set(auth(kid.token)).send({})).body).toMatchObject({ roll: 2, starsLeft: 0 });
    const completionId = db.prepare('SELECT id FROM task_completions WHERE userId = ?').get(kid.user.id) as { id: number };
    await agent.delete(`/api/completions/${completionId.id}`).set(auth(admin.token)).expect(200);
    expect((await agent.get('/api/quest').set(auth(kid.token))).body.me).toMatchObject({ starsLeft: 0, owed: 1 });
    expect((await agent.post('/api/quest/roll').set(auth(kid.token)).send({})).status).toBe(409);
    expect(player(month, kid.user.id).position).toBe(2); // a roll already made stays made
  });

  it('in Strict Mode waits for the approval, then counts the day the chore was done', async () => {
    const { kid, chores } = await family();
    wholeMarch();
    const id = done(kid.user.id, chores[0], march(5, 18), 'pending');
    expect(stars(kid.user.id, march(6, 9)).earned).toBe(0);
    db.prepare("UPDATE task_completions SET status = 'approved' WHERE id = ?").run(id);
    expect(stars(kid.user.id, march(6, 9))).toMatchObject({ earned: 1, today: { stars: 0 } });
  });

  it('gives the day\'s star on your own vacation, but not when everyone is away', async () => {
    const { kid, teen } = await family();
    wholeMarch();
    db.prepare("UPDATE users SET isVacationMode = 1, vacationEndDate = '2030-03-20' WHERE id = ?").run(kid.user.id);
    ensureTrail(march(8));
    expect(stars(kid.user.id, march(8)).earned).toBe(1);
    expect(stars(teen.user.id, march(8)).earned).toBe(0);
    // Both away: nobody's home, so no free stars
    db.prepare("UPDATE users SET isVacationMode = 1, vacationEndDate = '2030-03-20' WHERE id = ?").run(teen.user.id);
    ensureTrail(march(9));
    expect(stars(kid.user.id, march(9)).earned).toBe(1);
    // The whole family on vacation: none either
    db.prepare("UPDATE users SET isVacationMode = 0 WHERE id = ?").run(teen.user.id);
    db.prepare("UPDATE app_settings SET value = '1' WHERE key = 'vacationMode'").run();
    db.prepare("UPDATE app_settings SET value = '2030-03-20' WHERE key = 'vacationEndDate'").run();
    ensureTrail(march(10));
    expect(stars(kid.user.id, march(10)).earned).toBe(1);
  });

  it('gives a chore card\'s star once a chore is done after landing on it', async () => {
    const { kid, chores } = await family();
    const t = wholeMarch();
    const id = kid.user.id;
    done(id, chores[0], march(2, 9));
    loadDie(6); // 0 → 6, a chore card
    expect(takeTurn(t, id, { rolledBy: id, now: march(2, 10) })).toMatchObject({ to: 6, events: [{ t: 'move' }, { t: 'card', fresh: true }] });
    expect(stars(id, march(2, 11)).today.card).toBe('open');
    done(id, chores[0], march(2, 12)); // the same chore again doesn't add a day star, but it is a chore after the card
    expect(stars(id, march(2, 13))).toMatchObject({ earned: 2, used: 1, today: { card: 'done' } });
  });

  it('lets parents give a star, and only parents', async () => {
    const { admin, kid } = await family();
    expect((await agent.post('/api/quest/stars').set(auth(kid.token)).send({ userId: kid.user.id })).status).toBe(403);
    const res = await agent.post('/api/quest/stars').set(auth(admin.token)).send({ userId: kid.user.id });
    expect(res.status).toBe(200);
    expect(res.body.players.find((p: any) => p.userId === kid.user.id).starsLeft).toBe(1);
  });
});

describe('Quest Trail: players and the trail', () => {
  it('plays everyone who participates; parents only with it switched on', async () => {
    const { admin, kid, teen } = await family();
    wholeMarch();
    const ids = () => (questState(kid.user.id, march(2)).players as any[]).map((p) => p.userId).sort();
    expect(ids()).toEqual([kid.user.id, teen.user.id].sort());
    db.prepare('UPDATE users SET isParticipant = 1 WHERE id = ?').run(admin.user.id);
    expect(ids()).toEqual([admin.user.id, kid.user.id, teen.user.id].sort());
    expect(questState(admin.user.id, march(2)).me).not.toBeNull();
  });

  it('starts a late joiner level with whoever is last', async () => {
    const { admin, kid, teen } = await family();
    wholeMarch();
    moveTo('2030-03', kid.user.id, 30);
    moveTo('2030-03', teen.user.id, 12);
    db.prepare('UPDATE users SET isParticipant = 1 WHERE id = ?').run(admin.user.id);
    ensureTrail(march(10));
    expect(player('2030-03', admin.user.id)).toMatchObject({ position: 12, joinDay: '2030-03-10' });
  });

  it('makes a shorter trail for the days left when the game starts partway through a month', async () => {
    await family();
    const t = ensureTrail(at(2030, 3, 18, 9))!; // April 18: 13 days left of 30
    expect(t).toMatchObject({ month: '2030-04', world: 'blossom', length: 35, startDay: '2030-04-18' });
  });

  it('makes next month\'s trail longer when someone finished before the 20th, shorter when nobody finished', async () => {
    const { kid } = await family();
    wholeMarch();
    db.prepare("UPDATE quest_players SET finishedAt = ?, place = 1 WHERE month = '2030-03' AND userId = ?").run(march(15).toISOString(), kid.user.id);
    expect(ensureTrail(at(2030, 3, 1, 8))!.length).toBe(90);
    expect(ensureTrail(at(2030, 4, 1, 8))!.length).toBe(80); // nobody finished in April
    saveQuestSettings({ length: 50 });
    expect(ensureTrail(at(2030, 5, 1, 8))!.length).toBe(50);
  });

  it('lays out every length with shortcuts and slides that never lead onto another special space', () => {
    expect(layoutFor(80)[10]).toEqual({ t: 'up', to: 18 });
    for (const length of [20, 35, 40, 60, 80, 100, 120]) {
      const spaces = layoutFor(length);
      for (const [k, s] of Object.entries(spaces)) {
        expect(Number(k)).toBeGreaterThan(0);
        expect(Number(k)).toBeLessThan(length);
        if (s.t === 'up' || s.t === 'down') {
          expect(spaces[s.to]).toBeUndefined();
          expect(s.t === 'up' ? s.to > Number(k) : s.to < Number(k)).toBe(true);
        }
      }
    }
  });
});

describe('Quest Trail: rolling', () => {
  it('moves by the roll and applies coins, shortcuts, slides and high fives', async () => {
    const { kid, teen, chores } = await family();
    const t = wholeMarch();
    const k = kid.user.id;
    for (let d = 1; d <= 6; d++) done(k, chores[0], march(d, 9));
    const now = march(6, 20);
    const start = coins(k);
    loadDie(3); // 0 → 3: +1 coin
    expect(takeTurn(t, k, { rolledBy: k, now })).toMatchObject({ roll: 3, to: 3, coins: 1, events: [{ t: 'move', from: 0, to: 3 }, { t: 'coins', n: 1 }] });
    expect(coins(k)).toBe(start + 1);
    loadDie(4); // 3 → 7
    takeTurn(t, k, { rolledBy: k, now });
    loadDie(3); // 7 → 10: shortcut to 18
    expect(takeTurn(t, k, { rolledBy: k, now })).toMatchObject({ to: 18, events: [{ t: 'move' }, { t: 'shortcut', from: 10, to: 18 }] });
    loadDie(3); // 18 → 21: slide to 16
    expect(takeTurn(t, k, { rolledBy: k, now })).toMatchObject({ to: 16, events: [{ t: 'move' }, { t: 'slide', from: 21, to: 16 }] });
    // A high five: land on the teen's space, a coin each
    moveTo('2030-03', teen.user.id, 20);
    const teenCoins = coins(teen.user.id), kidCoins = coins(k);
    loadDie(4);
    expect(takeTurn(t, k, { rolledBy: k, now })).toMatchObject({ to: 20, events: [{ t: 'move' }, { t: 'highFive', with: [teen.user.id] }] });
    expect([coins(k), coins(teen.user.id)]).toEqual([kidCoins + 1, teenCoins + 1]);
    expect(takeTurn(t, k, { rolledBy: k, now })).toMatchObject({ starsLeft: 0 });
    expect(takeTurn(t, k, { rolledBy: k, now })).toEqual({ error: 'no_stars' });
    expect(db.prepare("SELECT COUNT(*) AS n FROM coin_adjustments WHERE userId = ? AND reason LIKE 'Quest Trail%'").get(k)).toEqual({ n: 2 });
  });

  it('only lets a parent roll for someone else', async () => {
    const { admin, kid, teen } = await family();
    await agent.post('/api/quest/stars').set(auth(admin.token)).send({ userId: teen.user.id }).expect(200);
    expect((await agent.post('/api/quest/roll').set(auth(kid.token)).send({ userId: teen.user.id })).status).toBe(403);
    loadDie(1);
    expect((await agent.post('/api/quest/roll').set(auth(admin.token)).send({ userId: teen.user.id })).body).toMatchObject({ roll: 1, to: 1 });
  });

  it('gives the prize to the first to finish, once, then each star becomes coins', async () => {
    const { kid, teen, chores } = await family();
    const reward = db.prepare("INSERT INTO rewards (title, costCoins) VALUES ('Movie night', 50)").run().lastInsertRowid as number;
    saveQuestSettings({ prizeRewardId: reward, prizeCoins: 5, finisherCoins: 3, coinsPerStar: 2 });
    const t = wholeMarch();
    for (const u of [teen.user.id, kid.user.id]) { done(u, chores[0], march(2, 9)); done(u, chores[1], march(3, 9)); }
    moveTo('2030-03', teen.user.id, 78);
    moveTo('2030-03', kid.user.id, 77);
    loadDie(6);
    const before = coins(teen.user.id);
    expect(takeTurn(t, teen.user.id, { rolledBy: teen.user.id, now: march(3, 20) })).toMatchObject({
      to: 80, events: [{ t: 'move', to: 80 }, { t: 'finish', place: 1, coins: 3, prize: { rewardId: reward, coins: 5 } }],
    });
    expect(coins(teen.user.id)).toBe(before + 8);
    expect(db.prepare('SELECT rewardId, costCoins, status FROM reward_redemptions WHERE userId = ?').all(teen.user.id)).toEqual([{ rewardId: reward, costCoins: 0, status: 'requested' }]);
    expect(takeTurn(t, kid.user.id, { rolledBy: kid.user.id, now: march(3, 20) })).toMatchObject({ events: [{ t: 'move' }, { t: 'finish', place: 2, coins: 3, prize: null }] });
    expect(takeTurn(t, teen.user.id, { rolledBy: teen.user.id, now: march(3, 20) })).toMatchObject({ roll: 0, coins: 2, events: [{ t: 'cashIn', coins: 2 }] });
  });

  it('with "Prize only for kids" gives the prize to the first kid to finish', async () => {
    const { kid, teen, chores } = await family();
    saveQuestSettings({ prizeCoins: 10, prizeKidsOnly: true });
    const t = wholeMarch();
    for (const u of [teen.user.id, kid.user.id]) done(u, chores[0], march(2, 9));
    moveTo('2030-03', teen.user.id, 79);
    moveTo('2030-03', kid.user.id, 79);
    loadDie(1);
    expect(takeTurn(t, teen.user.id, { rolledBy: teen.user.id, now: march(2, 20) })).toMatchObject({ events: [{ t: 'move' }, { t: 'finish', place: 1, prize: null }] });
    expect(takeTurn(t, kid.user.id, { rolledBy: kid.user.id, now: march(2, 20) })).toMatchObject({ events: [{ t: 'move' }, { t: 'finish', place: 2, prize: { coins: 10 } }] });
  });

  it('has no prize until a parent picks one', async () => {
    const { kid, chores } = await family();
    const t = wholeMarch();
    done(kid.user.id, chores[0], march(2, 9));
    moveTo('2030-03', kid.user.id, 79);
    loadDie(1);
    expect(takeTurn(t, kid.user.id, { rolledBy: kid.user.id, now: march(2, 20) })).toMatchObject({ coins: 0, events: [{ t: 'move' }, { t: 'finish', place: 1, coins: 0, prize: null }] });
  });
});

describe('Quest Trail: the end of the month', () => {
  it('rolls leftover stars, opens the new world and shows last month until it is seen', async () => {
    const { kid, teen, chores } = await family();
    wholeMarch();
    for (let d = 1; d <= 3; d++) done(kid.user.id, chores[0], march(d, 9));
    loadDie(2);
    ensureTrail(at(2030, 3, 1, 0, 0, 30)); // just after midnight on April 1
    expect(trailOf('2030-03').closedAt).not.toBeNull();
    expect(player('2030-03', kid.user.id).position).toBe(6);
    expect(db.prepare("SELECT COUNT(*) AS n FROM quest_rolls WHERE month = '2030-03' AND auto = 1").get()).toEqual({ n: 3 });
    expect(trailOf('2030-04')).toMatchObject({ world: 'blossom', startDay: '2030-04-01' });
    const state = questState(teen.user.id, at(2030, 3, 1, 9));
    expect(state.lastMonth).toMatchObject({ month: '2030-03', players: [{ userId: kid.user.id, position: 6 }, { userId: teen.user.id, position: 0 }] });
    expect(player('2030-04', kid.user.id).position).toBe(0);
    db.prepare("UPDATE quest_players SET endSeenAt = 'x' WHERE month = '2030-03' AND userId = ?").run(teen.user.id);
    expect(questState(teen.user.id, at(2030, 3, 1, 9)).lastMonth).toBeNull();
    expect(questState(kid.user.id, at(2030, 3, 1, 9)).lastMonth).not.toBeNull();
  });

  it('closes a trail only once', async () => {
    const { kid, chores } = await family();
    const t = wholeMarch();
    done(kid.user.id, chores[0], march(2, 9));
    closeTrail(t, at(2030, 3, 1, 1));
    closeTrail(t, at(2030, 3, 1, 2));
    expect(db.prepare("SELECT COUNT(*) AS n FROM quest_rolls WHERE month = '2030-03'").get()).toEqual({ n: 1 });
  });
});

describe('Quest Trail: switch, settings and backups', () => {
  it('is off with its Features switch', async () => {
    const { admin, kid } = await family();
    await agent.put('/api/features').set(auth(admin.token)).send({ features: { questTrail: false } }).expect(200);
    expect((await agent.get('/api/quest').set(auth(kid.token))).body).toEqual({ enabled: false });
    expect((await agent.post('/api/quest/roll').set(auth(kid.token)).send({})).status).toBe(404);
  });

  it('lets only parents change the settings, and checks them', async () => {
    const { admin, kid } = await family();
    expect((await agent.put('/api/quest/settings').set(auth(kid.token)).send({ fog: false })).status).toBe(403);
    expect((await agent.put('/api/quest/settings').set(auth(admin.token)).send({ length: 500 })).body).toEqual({ error: 'invalid_setting', field: 'length' });
    expect((await agent.put('/api/quest/settings').set(auth(admin.token)).send({ prizeRewardId: 9999 })).status).toBe(400);
    const res = await agent.put('/api/quest/settings').set(auth(admin.token)).send({ fog: false, timeOfDay: 'night', coinsPerStar: 3 });
    expect(res.body).toMatchObject({ fog: false, timeOfDay: 'night', coinsPerStar: 3, length: 'auto', prizeRewardId: null });
    expect((await agent.get('/api/quest').set(auth(kid.token))).body).toMatchObject({ fog: false, timeOfDay: 'night', coinsPerStar: 3 });
  });

  it('keeps the game through an export and import', async () => {
    const { admin, kid } = await family();
    await agent.post('/api/quest/stars').set(auth(admin.token)).send({ userId: kid.user.id }).expect(200);
    loadDie(5);
    await agent.post('/api/quest/roll').set(auth(kid.token)).send({}).expect(200);
    const backup = (await agent.get('/api/export').set(auth(admin.token))).body;
    expect(backup.questRolls).toHaveLength(1);
    db.prepare('DELETE FROM quest_rolls').run();
    db.prepare('DELETE FROM quest_players').run();
    expect((await agent.post('/api/import').set(auth(admin.token)).send(backup)).status).toBe(200);
    expect((await agent.get('/api/quest').set(auth(kid.token))).body.players.find((p: any) => p.userId === kid.user.id)).toMatchObject({ position: 5, starsLeft: 0 });
  });
});
