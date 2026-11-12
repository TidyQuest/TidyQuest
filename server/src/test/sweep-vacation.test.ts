import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, homeToday } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { localDateStr } from '../utils/dateHelpers';
import { getGlobalVacation, getUserVacation } from '../utils/adminHelpers';
import { taskHealth } from '../utils/schedule';
import { settleAllStreaks } from '../utils/streaks';
import { endDueVacations } from '../utils/vacation';

// Code sweep 2026-11-08, batch S2c: vacations (BUG-29, 30, 45)

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const iso = (daysAgo: number, hours = 12) => homeToday(-daysAgo, hours).toISOString();
const day = (daysAgo: number) => localDateStr(homeToday(-daysAgo, 12));
const person = (id: number) => db.prepare('SELECT currentStreak, lastActiveDate, streakShields, isVacationMode, vacationEndDate FROM users WHERE id = ?').get(id) as
  { currentStreak: number; lastActiveDate: string | null; streakShields: number; isVacationMode: number; vacationEndDate: string | null };
const task = (id: number) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
const setting = (key: string) => (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
const daysAgoOf = (stored: string) => (Date.now() - new Date(stored).getTime()) / 86400000;

async function family() {
  const admin = await createAdmin(agent);
  const kidA = await createUser(agent, admin.token, { username: 'kida', displayName: 'Kid A', password: 'pass123', role: 'child' });
  const kidB = await createUser(agent, admin.token, { username: 'kidb', displayName: 'Kid B', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Room', roomType: 'other' })).body.id as number;
  const add = async (body: object, lastDoneDaysAgo: number) => {
    const id = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ effort: 1, customCoins: 10, ...body })).body.id as number;
    db.prepare("UPDATE tasks SET createdAt = datetime('now', '-30 days'), lastCompletedAt = ? WHERE id = ?").run(iso(lastDoneDaysAgo), id);
    return id;
  };
  /** The family went away `daysAgo` days ago */
  const familyAway = async (daysAgo: number) => {
    await agent.put('/api/users/vacation-config').set(auth(admin.token)).send({ vacationMode: true }).expect(200);
    db.prepare("UPDATE app_settings SET value = ? WHERE key = 'vacationStartDate'").run(iso(daysAgo));
  };
  const personAway = async (id: number, daysAgo: number) => {
    await agent.put(`/api/users/${id}/vacation`).set(auth(admin.token)).send({ isVacationMode: true }).expect(200);
    db.prepare('UPDATE users SET vacationStartDate = ? WHERE id = ?').run(iso(daysAgo), id);
  };
  const familyBack = () => agent.put('/api/users/vacation-config').set(auth(admin.token)).send({ vacationMode: false }).expect(200);
  return { admin, kidA, kidB, room, add, familyAway, personAway, familyBack };
}

describe('BUG-45: chores pick up where they left off after a vacation', () => {
  it('a family vacation does not count as neglect', async () => {
    const { add, familyAway, familyBack } = await family();
    const weekly = await add({ name: 'Vacuum', frequencyDays: 7 }, 9); // 2 days old when they left
    const during = await add({ name: 'Water plants', frequencyDays: 7 }, 1); // the sitter did it
    await familyAway(7);
    const frozen = taskHealth(task(weekly), getGlobalVacation());
    expect(frozen).toBeGreaterThan(60);
    await familyBack();
    expect(taskHealth(task(weekly))).toBe(frozen);
    expect(daysAgoOf(task(weekly).lastCompletedAt)).toBeCloseTo(2, 1);
    expect(task(during).lastCompletedAt).toBe(iso(1)); // untouched
  });

  it("one person's vacation moves only that person's chores", async () => {
    const { admin, kidA, kidB, add, personAway } = await family();
    const mine = await add({ name: 'Tidy desk', frequencyDays: 7, assignedUserIds: [kidA.user.id] }, 9);
    const both = await add({ name: 'Bathroom', frequencyDays: 7, assignedUserIds: [kidA.user.id, kidB.user.id] }, 9);
    const anyone = await add({ name: 'Trash', frequencyDays: 7 }, 9);
    await personAway(kidA.user.id, 7);
    await agent.put(`/api/users/${kidA.user.id}/vacation`).set(auth(admin.token)).send({ isVacationMode: false }).expect(200);
    expect(daysAgoOf(task(mine).lastCompletedAt)).toBeCloseTo(2, 1);
    expect(task(both).lastCompletedAt).toBe(iso(9));
    expect(task(anyone).lastCompletedAt).toBe(iso(9));
  });

  it('the family return date is that day in the family time zone, and ends the vacation when it comes', async () => {
    const { admin, add, familyAway } = await family();
    const weekly = await add({ name: 'Vacuum', frequencyDays: 7 }, 9);
    await familyAway(7);
    const tomorrow = day(-1);
    const saved = (await agent.put('/api/users/vacation-config').set(auth(admin.token)).send({ vacationEndDate: tomorrow }).expect(200)).body;
    expect(saved).toMatchObject({ vacationMode: true, vacationEndDate: tomorrow });
    expect(setting('vacationEndDate')).toBe(tomorrow);
    expect((await agent.put('/api/users/vacation-config').set(auth(admin.token)).send({ vacationEndDate: '2027-02-31' })).status).toBe(400);

    // A date saved the old way (midnight UTC) still means that day here
    db.prepare("UPDATE app_settings SET value = ? WHERE key = 'vacationEndDate'").run(`${tomorrow}T00:00:00.000Z`);
    expect(getGlobalVacation()).toMatchObject({ isVacation: true, endDate: tomorrow });

    // The day comes: over since that morning
    db.prepare("UPDATE app_settings SET value = ? WHERE key = 'vacationEndDate'").run(day(0));
    expect(getGlobalVacation().isVacation).toBe(false);
    expect(new Date(task(weekly).lastCompletedAt).getTime()).toBe(homeToday(-9, 12).getTime() + (homeToday(0).getTime() - homeToday(-7, 12).getTime()));
  });
});

describe("BUG-30: a person's vacation ends on its return date", () => {
  it('ends by itself, and not before', async () => {
    const { admin, kidA, personAway } = await family();
    await personAway(kidA.user.id, 5);
    const put = (vacationEndDate: string | null) => agent.put(`/api/users/${kidA.user.id}/vacation`).set(auth(admin.token)).send({ vacationEndDate });
    expect((await put('2027-02-31')).status).toBe(400);
    expect((await put(day(-1)).expect(200)).body.vacationEndDate).toBe(day(-1));
    endDueVacations();
    expect(getUserVacation(kidA.user.id).isVacation).toBe(true);

    db.prepare('UPDATE users SET vacationEndDate = ? WHERE id = ?').run(day(0), kidA.user.id);
    expect(getUserVacation(kidA.user.id).isVacation).toBe(false);
    expect(person(kidA.user.id)).toMatchObject({ isVacationMode: 0, vacationEndDate: null });
  });

  it("the server's minute check ends it even when nobody opens the app", async () => {
    const { kidA, personAway } = await family();
    await personAway(kidA.user.id, 5);
    db.prepare('UPDATE users SET vacationEndDate = ? WHERE id = ?').run(day(1), kidA.user.id);
    endDueVacations();
    expect(person(kidA.user.id).isVacationMode).toBe(0);
  });
});

describe('BUG-29: a vacation protects the streak after it ends too', () => {
  it('the streak carries on, and no shield is used for the days away', async () => {
    const { kidA, add, familyAway, familyBack } = await family();
    const daily = await add({ name: 'Dishes', frequencyDays: 1 }, 8);
    await add({ name: 'Trash', frequencyDays: 1 }, 8); // stays overdue: every day away had a chore due
    db.prepare('UPDATE users SET currentStreak = 5, lastActiveDate = ?, streakShields = 1 WHERE id = ?').run(day(8), kidA.user.id);
    await familyAway(7);
    await familyBack();
    settleAllStreaks(new Date(Date.now() + 1)); // the nightly shield check
    expect(person(kidA.user.id)).toMatchObject({ currentStreak: 5, streakShields: 1 });
    await agent.post(`/api/tasks/${daily}/complete`).set(auth(kidA.token)).send({}).expect(200);
    expect(person(kidA.user.id)).toMatchObject({ currentStreak: 6, streakShields: 1, lastActiveDate: day(0) });
  });

  it("a person's own vacation does the same, and a streak already lost before it stays lost", async () => {
    const { admin, kidA, kidB, add, personAway } = await family();
    const daily = await add({ name: 'Dishes', frequencyDays: 1 }, 12);
    await add({ name: 'Trash', frequencyDays: 1 }, 12); // stays overdue: every day had a chore due
    db.prepare('UPDATE users SET currentStreak = 5, lastActiveDate = ? WHERE id = ?').run(day(6), kidA.user.id);
    db.prepare('UPDATE users SET currentStreak = 5, lastActiveDate = ? WHERE id = ?').run(day(10), kidB.user.id); // missed 4 days before leaving
    for (const kid of [kidA, kidB]) {
      await personAway(kid.user.id, 5);
      await agent.put(`/api/users/${kid.user.id}/vacation`).set(auth(admin.token)).send({ isVacationMode: false }).expect(200);
    }
    await agent.post(`/api/tasks/${daily}/complete`).set(auth(kidA.token)).send({}).expect(200);
    expect(person(kidA.user.id).currentStreak).toBe(6);
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(iso(12), daily);
    db.prepare('DELETE FROM task_completions').run();
    await agent.post(`/api/tasks/${daily}/complete`).set(auth(kidB.token)).send({}).expect(200);
    expect(person(kidB.user.id).currentStreak).toBe(1);
  });
});
