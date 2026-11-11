import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';

// Code sweep 2026-11-08, batch S5: rewards and family-member loose ends (BUG-44)

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const coins = (userId: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number }).coins;

async function family() {
  const dad = await createAdmin(agent);
  const kid = (username: string, displayName: string) => createUser(agent, dad.token, { username, displayName, password: 'pass123', role: 'child' });
  const cecil = await kid('cecil', 'Cecil');
  const cylis = await kid('cylis', 'Cylis');
  db.prepare("UPDATE users SET coins = 2000 WHERE role = 'child'").run();
  return { dad, cecil, cylis };
}

async function reward(adminToken: string, title: string, costCoins: number, rules?: Record<string, unknown>) {
  const id = (await agent.post('/api/rewards').set(auth(adminToken)).send({ title, costCoins })).body.id as number;
  if (rules) await agent.put(`/api/rewards/${id}/rules`).set(auth(adminToken)).send(rules).expect(200);
  return id;
}

const chipIn = (token: string, rewardId: number, amount: number) =>
  agent.post(`/api/rewards/${rewardId}/contribute`).set(auth(token)).send({ amount }).expect(200);
const catalog = async (token: string) => (await agent.get('/api/rewards').set(auth(token))).body.rewards as Array<{ id: number }>;
const requests = (rewardId: number) =>
  db.prepare('SELECT id, userId, costCoins, status FROM reward_redemptions WHERE rewardId = ?').all(rewardId) as Array<{ id: number; userId: number; costCoins: number; status: string }>;
const chipIns = (rewardId: number) =>
  db.prepare('SELECT userId, amount, redemptionId FROM reward_contributions WHERE rewardId = ? ORDER BY id').all(rewardId) as Array<{ userId: number; amount: number; redemptionId: number | null }>;

describe('Lowering a shared reward\'s price below what is in the pot', () => {
  it('asks for the new price and gives back the rest, newest chip-ins first', async () => {
    const { dad, cecil, cylis } = await family();
    const pizza = await reward(dad.token, 'Pizza Night', 100, { isShared: true });
    await chipIn(cecil.token, pizza, 50);
    await chipIn(cylis.token, pizza, 30);

    await agent.put(`/api/rewards/${pizza}`).set(auth(dad.token)).send({ title: 'Pizza Night', costCoins: 60 }).expect(200);

    const [request] = requests(pizza);
    expect(request).toMatchObject({ costCoins: 60, status: 'requested', userId: cylis.user.id });
    expect([coins(cecil.user.id), coins(cylis.user.id)]).toEqual([1950, 1990]);
    expect(chipIns(pizza)).toEqual([
      { userId: cecil.user.id, amount: 50, redemptionId: request.id },
      { userId: cylis.user.id, amount: 10, redemptionId: request.id },
    ]);

    // Turned down: everyone is back where they started
    await agent.put(`/api/rewards/redemptions/${request.id}`).set(auth(dad.token)).send({ status: 'rejected' }).expect(200);
    expect([coins(cecil.user.id), coins(cylis.user.id)]).toEqual([2000, 2000]);
  });

  it('leaves out someone whose whole chip-in went back', async () => {
    const { dad, cecil, cylis } = await family();
    const pizza = await reward(dad.token, 'Pizza Night', 100, { isShared: true });
    await chipIn(cecil.token, pizza, 50);
    await chipIn(cylis.token, pizza, 30);

    await agent.put(`/api/rewards/${pizza}`).set(auth(dad.token)).send({ title: 'Pizza Night', costCoins: 40 }).expect(200);

    const [request] = requests(pizza);
    expect(request).toMatchObject({ costCoins: 40, userId: cecil.user.id });
    expect([coins(cecil.user.id), coins(cylis.user.id)]).toEqual([1960, 2000]);
    expect(chipIns(pizza)).toEqual([{ userId: cecil.user.id, amount: 40, redemptionId: request.id }]);
  });

  it('does the same when the price comes from a spreadsheet', async () => {
    const { dad, cecil, cylis } = await family();
    const pizza = await reward(dad.token, 'Pizza Night', 100, { isShared: true });
    await chipIn(cecil.token, pizza, 50);
    await chipIn(cylis.token, pizza, 30);

    await agent.post('/api/csv/rewards/import').set(auth(dad.token)).send({ csv: 'title,cost\nPizza Night,60', dryRun: false }).expect(200);

    expect(requests(pizza)).toMatchObject([{ costCoins: 60, status: 'requested' }]);
    expect([coins(cecil.user.id), coins(cylis.user.id)]).toEqual([1950, 1990]);
  });
});

describe('Deleting a family member', () => {
  it('gives the others their chip-ins back when the leaver\'s shared request was waiting', async () => {
    const { dad, cecil, cylis } = await family();
    const pizza = await reward(dad.token, 'Pizza Night', 100, { isShared: true });
    await chipIn(cecil.token, pizza, 60);
    await chipIn(cylis.token, pizza, 40); // fills the pot: the request is Cylis's
    expect(requests(pizza)).toMatchObject([{ userId: cylis.user.id, status: 'requested' }]);

    await agent.delete(`/api/users/${cylis.user.id}`).set(auth(dad.token)).expect(200);

    expect(coins(cecil.user.id)).toBe(2000);
    expect(chipIns(pizza)).toEqual([]);
    // The pot is open again
    await chipIn(cecil.token, pizza, 10);
    expect(chipIns(pizza)).toEqual([{ userId: cecil.user.id, amount: 10, redemptionId: null }]);
  });

  it('keeps a shared reward that was already approved as it is', async () => {
    const { dad, cecil, cylis } = await family();
    const pizza = await reward(dad.token, 'Pizza Night', 100, { isShared: true });
    await chipIn(cecil.token, pizza, 60);
    await chipIn(cylis.token, pizza, 40);
    await agent.put(`/api/rewards/redemptions/${requests(pizza)[0].id}`).set(auth(dad.token)).send({ status: 'approved' }).expect(200);

    await agent.delete(`/api/users/${cylis.user.id}`).set(auth(dad.token)).expect(200);

    expect(coins(cecil.user.id)).toBe(1940);
  });

  it('hides a reward that was only for them, instead of showing it to everyone', async () => {
    const { dad, cecil, cylis } = await family();
    const ds = await reward(dad.token, 'Nintendo DS Lite', 1250, { visibleTo: [cylis.user.id] });
    const both = await reward(dad.token, 'Movie night', 300, { visibleTo: [cylis.user.id, cecil.user.id] });
    const everyone = await reward(dad.token, 'Ice cream', 40);

    await agent.delete(`/api/users/${cylis.user.id}`).set(auth(dad.token)).expect(200);

    const ids = (await catalog(cecil.token)).map((r) => r.id);
    expect(ids).not.toContain(ds);
    expect(ids).toContain(both);
    expect(ids).toContain(everyone);
    expect(db.prepare('SELECT isActive FROM rewards WHERE id = ?').get(ds)).toEqual({ isActive: 0 });
    expect((await agent.post(`/api/rewards/${ds}/redeem`).set(auth(cecil.token))).status).toBe(404);
  });

  it('keeps such a reward hidden when it comes back from the trash', async () => {
    const { dad, cecil, cylis } = await family();
    const ds = await reward(dad.token, 'Nintendo DS Lite', 1250, { visibleTo: [cylis.user.id] });
    const { trashId } = (await agent.delete(`/api/rewards/${ds}`).set(auth(dad.token)).expect(200)).body;

    await agent.delete(`/api/users/${cylis.user.id}`).set(auth(dad.token)).expect(200);
    await agent.post(`/api/trash/${trashId}/restore`).set(auth(dad.token)).expect(200);

    expect((await catalog(cecil.token)).map((r) => r.id)).not.toContain(ds);
  });
});

describe('Home\'s leaderboard card', () => {
  const board = async (token: string) => (await agent.get('/api/leaderboard?period=week').set(auth(token))).body as Array<{ id: number; points: number }>;

  it('leaves out parents who don\'t do chores, as the Board page does', async () => {
    const { dad, cecil, cylis } = await family();
    const mom = await createUser(agent, dad.token, { username: 'mom', displayName: 'Mom', password: 'pass12345', role: 'admin' });
    db.prepare('UPDATE users SET isParticipant = 0 WHERE id IN (?, ?)').run(dad.user.id, mom.user.id);

    expect((await board(cecil.token)).map((u) => u.id).sort()).toEqual([cecil.user.id, cylis.user.id].sort());

    // A parent who did a chore this week is on it
    const room = Number(db.prepare("INSERT INTO rooms (name, roomType) VALUES ('Kitchen', 'kitchen')").run().lastInsertRowid);
    const task = Number(db.prepare("INSERT INTO tasks (roomId, name, frequencyDays, effort) VALUES (?, 'Dishes', 1, 1)").run(room).lastInsertRowid);
    db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 7, 'approved')")
      .run(task, mom.user.id, new Date(Date.now() - 1000).toISOString());
    const now = await board(cecil.token);
    expect(now.find((u) => u.id === mom.user.id)).toMatchObject({ points: 7 });
    expect(now.find((u) => u.id === dad.user.id)).toBeUndefined();
  });

  it('sends no usernames', async () => {
    const { cecil } = await family();
    for (const row of await board(cecil.token)) expect(row).not.toHaveProperty('username');
  });
});

describe('Adding a family member whose username differs only in capitals or spaces', () => {
  it('refuses a username that is already taken in other capitals', async () => {
    const { dad } = await family();
    const add = (username: string) => agent.post('/api/users').set(auth(dad.token)).send({ username, displayName: 'Cecil Two', password: 'pass123', role: 'child' });
    expect((await add('Cecil')).status).toBe(409);
    expect((await add(' cecil ')).status).toBe(409);
    expect(db.prepare("SELECT COUNT(*) AS n FROM users WHERE username = 'cecil' COLLATE NOCASE").get()).toEqual({ n: 1 });
  });

  it('trims spaces around a new username and name', async () => {
    const { dad } = await family();
    const res = await agent.post('/api/users').set(auth(dad.token)).send({ username: '  wyatt ', displayName: '  Wyatt ', password: 'pass123', role: 'child' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: 'wyatt', displayName: 'Wyatt' });
  });

  it('refuses a username or name that is only spaces', async () => {
    const { dad } = await family();
    const add = (body: Record<string, unknown>) => agent.post('/api/users').set(auth(dad.token)).send({ password: 'pass123', role: 'child', ...body });
    expect((await add({ username: '   ', displayName: 'Wyatt' })).status).toBe(400);
    expect((await add({ username: 'wyatt', displayName: '   ' })).status).toBe(400);
  });
});
