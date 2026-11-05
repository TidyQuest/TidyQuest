import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type supertest from 'supertest';
import { createTestApp, createAdmin, createUser, familyField } from './setup';
import { nicePrice, rewardPrice, weeklyGoal, PRESET_DESCRIPTIONS, STARTER_CHORES, STARTER_REWARDS } from '../setup/starter';

// NEW-17: the setup wizard turns kids' ages, rooms and an allowance into chores, rewards and weekly goals
let agent: supertest.Agent;
let db: Database.Database;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const count = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
const DAY = 86400000;
/** The 8 rewards a new family starts with (database.ts seeds them; the test database doesn't) */
const seedStarterRewards = () => {
  for (const [title, description] of Object.entries(PRESET_DESCRIPTIONS)) {
    db.prepare('INSERT INTO rewards (title, description, costCoins, isPreset, isActive) VALUES (?, ?, 40, 1, 1)').run(title, description);
  }
};

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

/** Ava (6–8, no login), Max (13+, logs in, $10 a week), a kitchen and their own rooms */
const familyWithKids = () => ({
  people: [
    { ref: 'me', kind: 'adult' },
    { ref: 'ava', kind: 'kid', displayName: 'Ava', ageGroup: '6-8', logsIn: false },
    { ref: 'max', kind: 'kid', displayName: 'Max', ageGroup: '13+', logsIn: true, username: 'max', password: 'max1', allowance: 10 },
  ],
  rooms: [
    { key: 'kitchen', starter: 'kitchen', name: 'Kitchen' },
    { key: 'own:ava', starter: 'own', name: "Ava's room", owner: 'ava' },
    { key: 'own:max', starter: 'own', name: "Max's room", owner: 'max' },
  ],
  chores: [
    { id: 'starter.morning_routine', room: 'own:ava', people: ['ava'] }, // 1 day, effort 1: 35 a week
    { id: 'starter.room_tidy', room: 'own:ava', people: ['ava'] }, // 3 days, effort 2: 23.3
    { id: 'starter.own_laundry', room: 'own:max', people: ['max'] }, // 7 days, effort 4: 20
    { id: 'starter.set_clear_table', room: 'kitchen', people: ['ava'] }, // 1 day, effort 2: 70
    { id: 'kitchen.empty_household_waste', room: 'kitchen', people: ['max'] }, // 2 days, effort 1: 17.5
    { id: 'kitchen.clean_counters', room: 'kitchen', people: ['me'] }, // 1 day, effort 1: 35
    { id: 'kitchen.mop_floor', room: 'kitchen', people: ['ava', 'max'] }, // 7 days, effort 4, shared: 10 each
  ],
  rewards: [
    { id: 'movie_night' },
    { id: 'friend_over', title: 'Have a friend over', description: 'Pick a day with a parent.' },
    { id: 'sticker', title: 'Pick a sticker' }, // only for 3–5: nobody here
  ],
  cashTitles: ['$1 cash', '$5 cash'],
  goals: [{ person: 'ava', title: 'Weekly goal' }, { person: 'max', title: 'Weekly goal' }],
});
// Weekly coins: Ava 35 + 23.3 + 70 + 10 = 138.3, Max 20 + 17.5 + 10 = 47.5, the parent 35

describe('setup wizard (NEW-17)', () => {
  it('opens by itself for a parent until the family has rooms', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });
    expect((await agent.get('/api/setup').set(auth(admin.token))).body.needed).toBe(true);
    expect((await agent.get('/api/dashboard').set(auth(admin.token))).body.setupNeeded).toBe(true);
    expect((await agent.get('/api/dashboard').set(auth(kid.token))).body.setupNeeded).toBe(false);
    expect((await agent.get('/api/setup').set(auth(kid.token))).status).toBe(403);
    expect((await agent.post('/api/setup').set(auth(kid.token)).send(familyWithKids())).status).toBe(403);

    // Rooms made some other way count too
    await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'kitchen', tasks: [] });
    expect((await agent.get('/api/setup').set(auth(admin.token))).body.needed).toBe(false);
  });

  it('"Not now" stops it opening by itself', async () => {
    const admin = await createAdmin(agent);
    expect((await agent.post('/api/setup/skip').set(auth(admin.token))).status).toBe(200);
    expect((await agent.get('/api/dashboard').set(auth(admin.token))).body.setupNeeded).toBe(false);
  });

  it('makes the people, rooms, chores, rewards and goals', async () => {
    const admin = await createAdmin(agent);
    seedStarterRewards();
    const res = await agent.post('/api/setup').set(auth(admin.token)).send(familyWithKids());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ people: 2, rooms: 3, chores: 7, rewards: 4, goals: 2, removedRewards: 7 });
    expect((await agent.get('/api/setup').set(auth(admin.token))).body.needed).toBe(false);

    // People: kids are children; Ava has no login, Max signs in with his own
    const ava = db.prepare("SELECT id, role, canLogIn FROM users WHERE displayName = 'Ava'").get() as any;
    const max = db.prepare("SELECT id, role, canLogIn FROM users WHERE displayName = 'Max'").get() as any;
    expect([ava.role, ava.canLogIn, max.role, max.canLogIn]).toEqual(['child', 0, 'child', 1]);
    expect((await agent.post('/api/auth/login').send({ username: 'max', password: 'max1', ...familyField() })).status).toBe(200);

    // Rooms: each kid's room is theirs
    const avaRoom = db.prepare("SELECT id, roomType, assignedUserId FROM rooms WHERE name = 'Ava''s room'").get() as any;
    expect([avaRoom.roomType, avaRoom.assignedUserId]).toEqual(['bedroom', ava.id]);

    // Chores keep their translation key and timer, and go to the people picked
    const tidy = db.prepare("SELECT id, roomId, translationKey, timerMinutes, frequencyDays, effort, allowEarlyCompletion, lastCompletedAt FROM tasks WHERE translationKey = 'starter.room_tidy'").get() as any;
    expect([tidy.roomId, tidy.timerMinutes, tidy.frequencyDays, tidy.effort, tidy.allowEarlyCompletion]).toEqual([avaRoom.id, 10, 3, 2, 1]);
    const mop = db.prepare("SELECT id, lastCompletedAt FROM tasks WHERE translationKey = 'kitchen.mop_floor'").get() as any;
    const mopPeople = (db.prepare('SELECT userId FROM task_assignees WHERE taskId = ? ORDER BY userId').all(mop.id) as any[]).map((r) => r.userId);
    expect(mopPeople).toEqual([ava.id, max.id]);

    // First due dates are spread: the first 7-day chore is due now, the second in half a week
    const daysAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / DAY;
    expect(daysAgo(tidy.lastCompletedAt)).toBeCloseTo(3, 1);
    const laundry = db.prepare("SELECT lastCompletedAt FROM tasks WHERE translationKey = 'starter.own_laundry'").get() as any;
    expect(daysAgo(laundry.lastCompletedAt)).toBeCloseTo(7, 1);
    expect(daysAgo(mop.lastCompletedAt)).toBeCloseTo(3.5, 1);

    // Rewards: everyone pays about the same weeks of their own chores
    const reward = (title: string) => db.prepare('SELECT id, costCoins, isPreset, description FROM rewards WHERE title = ? AND deletedAt IS NULL').get(title) as any;
    const prices = (id: number) => Object.fromEntries((db.prepare('SELECT userId, costCoins FROM reward_prices WHERE rewardId = ?').all(id) as any[]).map((r) => [r.userId, r.costCoins]));
    const seen = (id: number) => (db.prepare('SELECT userId FROM reward_visibility WHERE rewardId = ? ORDER BY userId').all(id) as any[]).map((r) => r.userId);
    // Movie night (half a week, everyone): Ava 70, Max 25, the parent 20; the usual price is the middle one
    const movie = reward('Movie Night Pick');
    expect([movie.costCoins, movie.isPreset]).toEqual([25, 1]);
    expect(prices(movie.id)).toEqual({ [ava.id]: 70, [admin.user.id]: 20 });
    expect(seen(movie.id)).toEqual([]);
    // A friend over (2 weeks, kids 6+): only the kids see it
    const friend = reward('Have a friend over');
    expect([friend.costCoins, friend.description]).toEqual([190, 'Pick a day with a parent.']);
    expect(prices(friend.id)).toEqual({ [ava.id]: 275, [max.id]: 100 });
    expect(seen(friend.id)).toEqual([ava.id, max.id]);
    // No 3–5 kid, so no sticker
    expect(reward('Pick a sticker')).toBeUndefined();
    // Cash: Max earns $10 for 47.5 coins a week
    expect([reward('$1 cash').costCoins, reward('$5 cash').costCoins]).toEqual([5, 25]);
    expect(seen(reward('$5 cash').id)).toEqual([max.id]);
    // The starter rewards nobody ticked went to Recently deleted
    expect(count('SELECT COUNT(*) AS n FROM rewards WHERE isPreset = 1 AND deletedAt IS NULL')).toBe(1);

    // Weekly goals repeat, at about 70% of their chores with a 10% bonus
    const goal = (userId: number) => db.prepare('SELECT goalCoins, rewardCoins, repeatWeekly, endAt FROM user_goals WHERE userId = ?').get(userId) as any;
    expect(goal(ava.id)).toMatchObject({ goalCoins: 100, rewardCoins: 15, repeatWeekly: 1 });
    expect(goal(max.id)).toMatchObject({ goalCoins: 35, rewardCoins: 5, repeatWeekly: 1 });
    expect(goal(ava.id).endAt).toBeTruthy();
  });

  it("a Quests room holds a kid's routines and anytime chores", async () => {
    const admin = await createAdmin(agent);
    const res = await agent.post('/api/setup').set(auth(admin.token)).send({
      people: [{ ref: 'me', kind: 'adult' }, { ref: 'ava', kind: 'kid', displayName: 'Ava', ageGroup: '9-12', logsIn: false }],
      rooms: [
        { key: 'own:ava', starter: 'own', name: "Ava's room", owner: 'ava' },
        { key: 'quests:ava', starter: 'quests', name: "Ava's Quests", owner: 'ava' },
      ],
      chores: [
        { id: 'starter.morning_routine', room: 'quests:ava', people: ['ava'] }, // daily, effort 1: 35 a week
        { id: 'starter.homework_done', room: 'quests:ava', people: ['ava'] }, // anytime, about 5 a week: 25
        { id: 'starter.room_tidy', room: 'own:ava', people: ['ava'] },
        { id: 'starter.room_tidy', room: 'quests:ava', people: ['ava'] }, // not a Quests chore
      ],
      rewards: [],
    });
    expect([res.status, res.body.code]).toEqual([400, 'bad_chore']);
    const body = {
      people: [{ ref: 'me', kind: 'adult' }, { ref: 'ava', kind: 'kid', displayName: 'Ava', ageGroup: '9-12', logsIn: false }],
      rooms: [{ key: 'quests:ava', starter: 'quests', name: "Ava's Quests", owner: 'ava' }],
      chores: [
        { id: 'starter.morning_routine', room: 'quests:ava', people: ['ava'] },
        { id: 'starter.homework_done', room: 'quests:ava', people: ['ava'] },
      ],
      rewards: [],
      goals: [{ person: 'ava', title: 'Weekly goal' }],
    };
    expect((await agent.post('/api/setup').set(auth(admin.token)).send(body)).status).toBe(201);
    const ava = db.prepare("SELECT id FROM users WHERE displayName = 'Ava'").get() as { id: number };
    const quests = db.prepare("SELECT roomType, assignedUserId FROM rooms WHERE name = 'Ava''s Quests'").get();
    expect(quests).toEqual({ roomType: 'other', assignedUserId: ava.id });
    const homework = db.prepare("SELECT onDemand, showInDashboard, repeatLimit, repeatPeriod FROM tasks WHERE translationKey = 'starter.homework_done'").get();
    expect(homework).toEqual({ onDemand: 1, showInDashboard: 1, repeatLimit: 1, repeatPeriod: 'day' });
    // 35 + 25 = 60 a week: a goal of 40 with a 5 bonus
    expect(db.prepare('SELECT goalCoins, rewardCoins FROM user_goals WHERE userId = ?').get(ava.id)).toEqual({ goalCoins: 40, rewardCoins: 5 });
  });

  it('works for a household without kids', async () => {
    const admin = await createAdmin(agent);
    const res = await agent.post('/api/setup').set(auth(admin.token)).send({
      people: [{ ref: 'me', kind: 'adult' }, { ref: 'sam', kind: 'adult', displayName: 'Sam', username: 'sam', password: 'sam1' }],
      rooms: [{ key: 'kitchen', starter: 'kitchen', name: 'Kitchen' }, { key: 'bathroom', starter: 'bathroom', name: 'Bathroom' }],
      chores: [
        { id: 'kitchen.clean_counters', room: 'kitchen', people: ['me', 'sam'] }, // 35 a week, shared: 17.5 each
        { id: 'kitchen.wash_dishes', room: 'kitchen', people: ['me'] }, // 70
        { id: 'bathroom.scrub_toilet', room: 'bathroom', people: ['sam'] }, // 15
      ],
      rewards: [{ id: 'sleep_in', title: 'Sleep in' }, { id: 'small_toy', title: 'A small toy' }],
      goals: [{ person: 'me', title: 'Weekly goal' }, { person: 'sam', title: 'Weekly goal' }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ people: 1, rooms: 2, chores: 3, rewards: 1, goals: 2 });
    const sam = db.prepare("SELECT id, role FROM users WHERE username = 'sam'").get() as any;
    expect(sam.role).toBe('admin');
    // Sleep in (half a week): the parent earns 87.5 a week -> 45, Sam 32.5 -> 15
    const sleep = db.prepare("SELECT id, costCoins FROM rewards WHERE title = 'Sleep in'").get() as any;
    expect(sleep.costCoins).toBe(30);
    expect(db.prepare('SELECT COUNT(*) AS n FROM reward_prices WHERE rewardId = ?').get(sleep.id)).toEqual({ n: 2 });
    expect(count('SELECT COUNT(*) AS n FROM user_goals')).toBe(2);
  });

  it('a refused setup makes nothing', async () => {
    const admin = await createAdmin(agent);
    const before = [count('SELECT COUNT(*) AS n FROM users'), count('SELECT COUNT(*) AS n FROM rooms'), count('SELECT COUNT(*) AS n FROM rewards WHERE deletedAt IS NULL')];
    const body = familyWithKids();
    (body.people[2] as any).username = 'admin';
    const res = await agent.post('/api/setup').set(auth(admin.token)).send(body);
    expect([res.status, res.body.code]).toEqual([409, 'username_taken']);
    expect([count('SELECT COUNT(*) AS n FROM users'), count('SELECT COUNT(*) AS n FROM rooms'), count('SELECT COUNT(*) AS n FROM rewards WHERE deletedAt IS NULL')]).toEqual(before);

    // A chore in the wrong room, or someone else's chore in a kid's room
    const wrongRoom = familyWithKids();
    wrongRoom.chores[0].room = 'kitchen';
    expect((await agent.post('/api/setup').set(auth(admin.token)).send(wrongRoom)).body.code).toBe('bad_chore');
    const notTheirs = familyWithKids();
    notTheirs.chores[0].people = ['max'];
    expect((await agent.post('/api/setup').set(auth(admin.token)).send(notTheirs)).body.code).toBe('bad_chore');
    // A kid without an age group, a login without a password
    const noAge = familyWithKids();
    delete (noAge.people[1] as any).ageGroup;
    expect((await agent.post('/api/setup').set(auth(admin.token)).send(noAge)).body.code).toBe('bad_age');
    const noPassword = familyWithKids();
    (noPassword.people[2] as any).password = '';
    expect((await agent.post('/api/setup').set(auth(admin.token)).send(noPassword)).body.code).toBe('password_needed');
    expect(count('SELECT COUNT(*) AS n FROM tasks')).toBe(0);
  });

  it('running it again only adds', async () => {
    const admin = await createAdmin(agent);
    seedStarterRewards();
    expect((await agent.post('/api/setup').set(auth(admin.token)).send(familyWithKids())).status).toBe(201);
    const kitchen = db.prepare("SELECT id FROM rooms WHERE name = 'Kitchen'").get() as { id: number };
    const ava = db.prepare("SELECT id FROM users WHERE displayName = 'Ava'").get() as { id: number };
    const res = await agent.post('/api/setup').set(auth(admin.token)).send({
      people: [{ ref: 'me', kind: 'adult' }, { ref: `u:${ava.id}`, kind: 'kid', ageGroup: '6-8' }],
      rooms: [{ key: `r:${kitchen.id}`, starter: 'kitchen' }],
      chores: [
        { id: 'kitchen.clean_counters', room: `r:${kitchen.id}`, people: ['me'] }, // already there
        { id: 'kitchen.wipe_stovetop', room: `r:${kitchen.id}`, people: ['me'] },
      ],
      rewards: [],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ people: 0, rooms: 0, chores: 1 });
    expect(count("SELECT COUNT(*) AS n FROM tasks WHERE translationKey = 'kitchen.clean_counters'")).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM users')).toBe(3);
    // The family's rewards are left alone: Movie night keeps its price and isn't removed
    const movie = db.prepare("SELECT costCoins, deletedAt FROM rewards WHERE title = 'Movie Night Pick'").get();
    expect(movie).toEqual({ costCoins: 25, deletedAt: null });
    expect((await agent.post('/api/setup').set(auth(admin.token)).send({ ...familyWithKids(), people: [{ ref: 'me', kind: 'adult' }], rooms: [], chores: [], cashTitles: [], goals: [] })).body)
      .toMatchObject({ rewards: 0, removedRewards: 0 });
  });

  it('keeps a starter reward someone already bought', async () => {
    const admin = await createAdmin(agent);
    seedStarterRewards();
    const movie = db.prepare("SELECT id FROM rewards WHERE title = 'Movie Night Pick'").get() as { id: number };
    db.prepare('INSERT INTO reward_redemptions (rewardId, userId, costCoins) VALUES (?, ?, 40)').run(movie.id, admin.user.id);
    const body = { ...familyWithKids(), rewards: [] };
    expect((await agent.post('/api/setup').set(auth(admin.token)).send(body)).body.removedRewards).toBe(7);
    expect(db.prepare('SELECT deletedAt FROM rewards WHERE id = ?').get(movie.id)).toEqual({ deletedAt: null });
  });

  it('starter lists hold together', () => {
    // Every chore id is unique within its room, kid chores name an age group, and shared-room chores have someone
    const seen = new Set<string>();
    for (const c of STARTER_CHORES) {
      expect(seen.has(`${c.room}/${c.id}`)).toBe(false);
      seen.add(`${c.room}/${c.id}`);
      if (c.room === 'own' || c.room === 'quests') expect(c.ages.length).toBeGreaterThan(0);
      if (c.perWeek) expect(c.room).toBe('quests');
      else expect(c.ages.length > 0 || c.adults).toBeTruthy();
    }
    expect(new Set(STARTER_REWARDS.map((r) => r.id)).size).toBe(STARTER_REWARDS.length);
    expect(STARTER_REWARDS.filter((r) => r.presetTitle)).toHaveLength(8);
    // Friendly prices
    expect([nicePrice(2), nicePrice(23.75), nicePrice(95), nicePrice(276)]).toEqual([5, 25, 100, 275]);
    expect(rewardPrice(0.5, 138.3)).toBe(70);
    expect(weeklyGoal(47.5)).toEqual({ goalCoins: 35, rewardCoins: 5 });
  });
});
