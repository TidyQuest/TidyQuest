import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, homeToday } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { localDateStr } from '../utils/dateHelpers';
import { calculateHealth } from '../utils/health';

// Code sweep 2026-11-08, batch S2b: streak days, Rescue Mission and Team-ups, small chore and room mistakes
// (BUG-29, 30, 32, 33, 46)

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const iso = (daysAgo: number, hours = 12) => homeToday(-daysAgo, hours).toISOString();
const day = (daysAgo: number) => localDateStr(homeToday(-daysAgo, 12));
const person = (id: number) => db.prepare('SELECT coins, currentStreak, lastActiveDate, streakShields FROM users WHERE id = ?').get(id) as
  { coins: number; currentStreak: number; lastActiveDate: string | null; streakShields: number };
const done = (token: string, taskId: number, body: object = {}) => agent.post(`/api/tasks/${taskId}/complete`).set(auth(token)).send(body);
// Just after midnight, so a daily chore is due again whatever time the tests run
const backdate = (completionId: number, daysAgo: number) =>
  db.prepare('UPDATE task_completions SET completedAt = ? WHERE id = ?').run(homeToday(-daysAgo, 0, 1).toISOString(), completionId);

async function family(strict = false) {
  const admin = await createAdmin(agent);
  const kidA = await createUser(agent, admin.token, { username: 'kida', displayName: 'Kid A', password: 'pass123', role: 'child' });
  const kidB = await createUser(agent, admin.token, { username: 'kidb', displayName: 'Kid B', password: 'pass123', role: 'child' });
  if (strict) await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Room', roomType: 'other' })).body.id as number;
  const add = async (body: object, inRoom = room) => {
    const id = (await agent.post(`/api/rooms/${inRoom}/tasks`).set(auth(admin.token)).send({ effort: 1, customCoins: 10, ...body })).body.id as number;
    db.prepare("UPDATE tasks SET createdAt = datetime('now', '-20 days') WHERE id = ?").run(id);
    return id;
  };
  return { admin, kidA, kidB, room, add };
}

describe('BUG-29: streaks count the day the chore was done', () => {
  it('three days approved at once add three days, in whatever order they are approved', async () => {
    const { admin, kidA, add } = await family(true);
    const dishes = await add({ name: 'Dishes', frequencyDays: 1 });
    const ids: number[] = [];
    for (const ago of [3, 2, 1]) {
      const res = await done(kidA.token, dishes).expect(200);
      backdate(res.body.completionId, ago);
      ids.push(res.body.completionId);
    }
    await agent.post('/api/completions/approve-batch').set(auth(admin.token)).send({ ids: [...ids].reverse() }).expect(200);
    expect(person(kidA.user.id)).toMatchObject({ currentStreak: 3, lastActiveDate: day(1), coins: 30 });

    const today = await done(kidA.token, dishes).expect(200);
    await agent.post(`/api/completions/${today.body.completionId}/approve`).set(auth(admin.token)).expect(200);
    expect(person(kidA.user.id)).toMatchObject({ currentStreak: 4, lastActiveDate: day(0) });
  });

  it('counts each day when a parent approves them one by one, newest first', async () => {
    const { admin, kidA, add } = await family(true);
    const dishes = await add({ name: 'Dishes', frequencyDays: 1 });
    const ids: number[] = [];
    for (const ago of [2, 1, 0]) {
      const res = await done(kidA.token, dishes).expect(200);
      if (ago) backdate(res.body.completionId, ago);
      ids.push(res.body.completionId);
    }
    for (const id of [...ids].reverse()) await agent.post(`/api/completions/${id}/approve`).set(auth(admin.token)).expect(200);
    expect(person(kidA.user.id)).toMatchObject({ currentStreak: 3, lastActiveDate: day(0) });
    // A second chore on a day that already counted adds nothing
    const more = await add({ name: 'Trash', frequencyDays: 1 });
    const late = await done(kidA.token, more).expect(200);
    backdate(late.body.completionId, 1);
    await agent.post(`/api/completions/${late.body.completionId}/approve`).set(auth(admin.token)).expect(200);
    expect(person(kidA.user.id).currentStreak).toBe(3);
  });

  it("an Anytime quest doesn't make a day count as missed", async () => {
    const { kidA, add } = await family();
    await add({ name: 'Wash the car', frequencyDays: 7, onDemand: true });
    const weekly = await add({ name: 'Vacuum', frequencyDays: 7 });
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(iso(6), weekly); // due again tomorrow
    db.prepare('UPDATE users SET currentStreak = 5, lastActiveDate = ? WHERE id = ?').run(day(3), kidA.user.id);
    await done(kidA.token, weekly, {}).expect(409); // not due yet: nothing was due these three days
    const quest = await add({ name: 'Help a sibling', frequencyDays: 7, onDemand: true });
    await done(kidA.token, quest).expect(200);
    expect(person(kidA.user.id).currentStreak).toBe(6);
  });
});

describe('BUG-30: health never goes over 100%', () => {
  it('a chore done during a vacation is 100%', () => {
    const start = iso(3);
    expect(calculateHealth(iso(1), 1, true, start)).toBe(100);
    expect(calculateHealth(iso(1), 7, false, null)).toBeLessThan(100);
  });
});

describe('BUG-32: Rescue Mission and Team-ups loose ends', () => {
  beforeEach(() => db.prepare("DELETE FROM app_settings WHERE key = 'features'").run()); // on, as in a real install
  const mission = async (token: string) => (await agent.get('/api/dashboard').set(auth(token))).body.rescueMission;
  const overdue = (id: number, days: number) => db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(iso(days), id);

  it('Reset to dirty opens the Rescue Mission again', async () => {
    const { admin, kidA, kidB, add } = await family();
    const t = await add({ name: 'Counters', frequencyDays: 1 }); overdue(t, 9);
    expect((await mission(kidA.token)).taskId).toBe(t);
    expect((await done(kidA.token, t).expect(200)).body.rescued).toBe(true);
    await agent.post(`/api/tasks/${t}/reset`).set(auth(admin.token)).expect(200);
    expect((await mission(kidB.token)).completedBy ?? null).toBeNull();
    expect((await done(kidB.token, t).expect(200)).body).toMatchObject({ rescued: true, coinsEarned: 20 });
  });

  it('picks another chore when the mission is deleted, paused or finished for good', async () => {
    const { admin, add } = await family();
    const a = await add({ name: 'A', frequencyDays: 1 }); overdue(a, 9);
    const b = await add({ name: 'B', frequencyDays: 1 }); overdue(b, 6);
    const c = await add({ name: 'C', frequencyDays: 1 }); overdue(c, 4);
    expect((await mission(admin.token)).taskId).toBe(a);
    await agent.delete(`/api/tasks/${a}`).set(auth(admin.token)).expect(200);
    expect((await mission(admin.token)).taskId).toBe(b);
    await agent.post(`/api/tasks/${b}/pause`).set(auth(admin.token)).send({}).expect(200);
    expect((await mission(admin.token)).taskId).toBe(c);
    await agent.delete(`/api/tasks/${c}`).set(auth(admin.token)).expect(200);
    expect(await mission(admin.token)).toBeNull();
  });

  it('switching Team-ups off frees a chore a team had claimed', async () => {
    const { admin, kidA, kidB, add } = await family();
    const tub = await add({ name: 'Tub', frequencyDays: 7, customCoins: 12 });
    const third = await createUser(agent, admin.token, { username: 'kidc', displayName: 'Kid C', password: 'pass123', role: 'child' });
    const team = (await agent.post('/api/teamups').set(auth(kidA.token)).send({ taskId: tub, partnerId: kidB.user.id })).body.teamup;
    await agent.post(`/api/teamups/${team.id}/join`).set(auth(kidB.token)).expect(200);
    expect((await done(third.token, tub)).body.error).toBe('claimed_by_team');
    await agent.put('/api/features').set(auth(admin.token)).send({ features: { teamups: false } }).expect(200);
    await done(third.token, tub).expect(200);
  });
});

describe('BUG-33: small chore and room mistakes', () => {
  it('Scheduled says Tomorrow for a chore due early tomorrow', async () => {
    const { admin, add } = await family();
    const t = await add({ name: 'Feed the cat', frequencyDays: 1 });
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(homeToday(0, 0, 0, 1).toISOString(), t);
    const body = (await agent.get('/api/dashboard').set(auth(admin.token))).body;
    const listed = (body.scheduledUpcoming as Array<{ id: number; dueInDays: number }>).find((x) => x.id === t);
    expect(listed?.dueInDays).toBe(1);
  });

  it("giving a room an owner ignores finished to-dos and chores in the trash", async () => {
    const { admin, kidA, kidB, room, add } = await family();
    const fixIt = await add({ name: 'Fix the shelf', oneTime: true, assignedUserIds: [kidB.user.id] });
    await done(kidB.token, fixIt).expect(200); // finished: archived
    const old = await add({ name: 'Old chore', frequencyDays: 7, assignedUserIds: [kidB.user.id] });
    await agent.delete(`/api/tasks/${old}`).set(auth(admin.token)).expect(200); // in the trash
    await add({ name: 'Sweep', frequencyDays: 7 });

    await agent.put(`/api/rooms/${room}`).set(auth(admin.token)).send({ assignedUserId: kidA.user.id }).expect(200);
    const who = (taskId: number) => (db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?').all(taskId) as { userId: number }[]).map((r) => r.userId);
    expect(who(fixIt)).toEqual([kidB.user.id]);
    expect(who(old)).toEqual([kidB.user.id]);
  });

  it('the chores spreadsheet keeps one-time chores and their do-by dates', async () => {
    const { admin, room, add } = await family();
    await add({ name: 'Fix the door', oneTime: true, doBy: '2027-03-01' });
    await add({ name: 'Sweep', frequencyDays: 7 });
    const csv = (await agent.get('/api/csv/tasks').set(auth(admin.token)).expect(200)).text;
    expect(csv.split('\n')[0]).toContain('one_time');
    expect(csv.split('\n')[0]).toContain('do_by');

    // Into an empty house: the to-do is still a to-do
    db.prepare('DELETE FROM tasks').run();
    const applied = (await agent.post('/api/csv/tasks/import').set(auth(admin.token)).send({ csv, dryRun: false }).expect(200)).body;
    expect(applied.summary).toMatchObject({ add: 2, error: 0 });
    const rows = db.prepare('SELECT name, oneTime, doBy FROM tasks WHERE roomId = ? ORDER BY name').all(room);
    expect(rows).toEqual([{ name: 'Fix the door', oneTime: 1, doBy: '2027-03-01' }, { name: 'Sweep', oneTime: 0, doBy: null }]);

    const bad = (await agent.post('/api/csv/tasks/import').set(auth(admin.token)).send({ csv: 'room,task,one_time,do_by\nRoom,Paint,yes,2027-02-31' }).expect(200)).body;
    expect(bad.summary.error).toBe(1);
  });
});

describe('BUG-46: dates that do not exist', () => {
  it('refuses Feb 31 as a do-by or start date', async () => {
    const { admin, room } = await family();
    const post = (body: object) => agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'X', effort: 1, ...body });
    expect((await post({ oneTime: true, doBy: '2027-02-31' })).body.error).toBe('invalid_do_by');
    expect((await post({ frequencyDays: 7, startsOn: '2027-02-31' })).body.error).toBe('invalid_starts_on');
    expect((await post({ oneTime: true, doBy: '2028-02-29' })).status).toBe(201);
  });
});
