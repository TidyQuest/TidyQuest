import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, homeToday } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { localDateStr } from '../utils/dateHelpers';

// BUG-50: taking back a Done puts the streak back as it was before that Done
let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const daysAgo = (n: number) => localDateStr(homeToday(-n, 12));
const kidRow = (id: number) => db.prepare('SELECT currentStreak, lastActiveDate, streakShields, brokenStreak FROM users WHERE id = ?').get(id) as
  { currentStreak: number; lastActiveDate: string | null; streakShields: number; brokenStreak: number | null };
const setKid = (id: number, f: { streak: number; last: string; shields?: number }) =>
  db.prepare('UPDATE users SET currentStreak = ?, lastActiveDate = ?, streakShields = ? WHERE id = ?').run(f.streak, f.last, f.shields ?? 0, id);
const lastCompletion = (userId: number) =>
  (db.prepare('SELECT id FROM task_completions WHERE userId = ? ORDER BY id DESC LIMIT 1').get(userId) as { id: number }).id;

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Quests', roomType: 'other' })).body.id as number;
  const quest = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Any job', effort: 1, onDemand: true, customCoins: 5 })).body.id as number;
  const quest2 = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Other job', effort: 1, onDemand: true, customCoins: 5 })).body.id as number;
  // A daily chore nobody has done for days, so every recent day had something due
  const daily = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Bins out', effort: 1, frequencyDays: 1 })).body.id as number;
  db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date(Date.now() - 20 * 86400000).toISOString(), daily);
  return { admin, kid, quest, quest2 };
}
const complete = (token: string, taskId: number) => agent.post(`/api/tasks/${taskId}/complete`).set(auth(token)).expect(200);
const takeBack = (token: string, completionId: number) => agent.delete(`/api/completions/${completionId}`).set(auth(token)).expect(200);

describe('Taking back a Done puts the streak back (BUG-50)', () => {
  it('a lapsed streak that a Done reset to 1 comes back', async () => {
    const { admin, kid, quest } = await family();
    setKid(kid.user.id, { streak: 61, last: daysAgo(14) });
    await complete(kid.token, quest);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 1, lastActiveDate: daysAgo(0), brokenStreak: 61 });

    await takeBack(admin.token, lastCompletion(kid.user.id));
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 61, lastActiveDate: daysAgo(14), brokenStreak: null });
  });

  it('a live streak that a Done raised goes back down', async () => {
    const { admin, kid, quest } = await family();
    setKid(kid.user.id, { streak: 61, last: daysAgo(1) });
    await complete(kid.token, quest);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 62, lastActiveDate: daysAgo(0) });

    await takeBack(admin.token, lastCompletion(kid.user.id));
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 61, lastActiveDate: daysAgo(1) });
  });

  it('another Done the same day keeps the day counted, whichever is taken back first', async () => {
    const { admin, kid, quest, quest2 } = await family();
    setKid(kid.user.id, { streak: 61, last: daysAgo(1) });
    await complete(kid.token, quest);
    const first = lastCompletion(kid.user.id);
    await complete(kid.token, quest2);
    const second = lastCompletion(kid.user.id);
    expect(kidRow(kid.user.id).currentStreak).toBe(62);

    await takeBack(admin.token, first);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 62, lastActiveDate: daysAgo(0) });
    await takeBack(admin.token, second);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 61, lastActiveDate: daysAgo(1) });
  });

  it('gives back a shield the Done used and takes back one it earned', async () => {
    const { admin, kid, quest } = await family();
    // Two missed days, two shields: the Done uses both and carries the streak on
    setKid(kid.user.id, { streak: 10, last: daysAgo(3), shields: 2 });
    await complete(kid.token, quest);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 11, streakShields: 0 });
    await takeBack(admin.token, lastCompletion(kid.user.id));
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 10, lastActiveDate: daysAgo(3), streakShields: 2 });

    // Day 7 earns a shield; taking the Done back takes it away again
    setKid(kid.user.id, { streak: 6, last: daysAgo(1), shields: 0 });
    await complete(kid.token, quest);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 7, streakShields: 1 });
    await takeBack(admin.token, lastCompletion(kid.user.id));
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 6, streakShields: 0 });
  });

  it('leaves the streak alone when it has moved on since (a later day counted)', async () => {
    const { admin, kid, quest } = await family();
    setKid(kid.user.id, { streak: 5, last: daysAgo(1) });
    await complete(kid.token, quest);
    // As if the Done was yesterday's and today has counted since
    db.prepare('UPDATE users SET currentStreak = 7, lastActiveDate = ? WHERE id = ?').run(daysAgo(-1), kid.user.id);
    await takeBack(admin.token, lastCompletion(kid.user.id));
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 7, lastActiveDate: daysAgo(-1) });
  });
});
