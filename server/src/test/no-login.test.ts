import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import type supertest from 'supertest';
import { createTestApp, createAdmin, createUser, familyField, HOSTED_RUN } from './setup';
import { flushNotificationQueue, notifyPeople, setNotifyTransport, type Delivery } from '../utils/notify';

// ENH-16: family members who don't log in. A parent does everything for them.
let agent: supertest.Agent;
let db: Database.Database;
let sent: Delivery[];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const login = (username: string, password: string) => agent.post('/api/auth/login').send({ username, password, ...familyField() });
const coins = (userId: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number }).coins;
const setCoins = (userId: number, n: number) => db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(n, userId);

beforeEach(() => {
  ({ agent, db } = createTestApp());
  sent = [];
  setNotifyTransport(async (d) => { sent.push(d); return { ok: true }; });
});
afterEach(() => setNotifyTransport());

/** A parent, and Cecil added without a login */
async function family() {
  const admin = await createAdmin(agent);
  const res = await agent.post('/api/users').set(auth(admin.token)).send({ displayName: 'Cecil Jr.', canLogIn: false });
  expect(res.status).toBe(201);
  return { admin, cecil: res.body as { id: number; username: string; canLogIn: number } };
}

async function reward(token: string, title: string, costCoins: number, rules?: Record<string, unknown>) {
  const id = (await agent.post('/api/rewards').set(auth(token)).send({ title, costCoins })).body.id as number;
  if (rules) expect((await agent.put(`/api/rewards/${id}/rules`).set(auth(token)).send(rules)).status).toBe(200);
  return id;
}

describe("Adding someone who doesn't log in", () => {
  it('needs no username or password, and they can neither log in nor show on the login screen', async () => {
    const { admin, cecil } = await family();
    expect(cecil).toMatchObject({ username: 'ceciljr', canLogIn: 0 });
    // A second one with the same name gets a free username
    const again = await agent.post('/api/users').set(auth(admin.token)).send({ displayName: 'Cecil Jr.', canLogIn: false });
    expect(again.body.username).toBe('ceciljr2');

    const res = await login('ceciljr', 'anything');
    // Hosted mode answers like a wrong password, so a family code can't be confirmed with a name
    expect(res.status).toBe(HOSTED_RUN ? 401 : 403);
    if (!HOSTED_RUN) {
      expect(res.body.code).toBe('no-login');
      const names = (await agent.get('/api/auth/avatars')).body.map((u: { username: string }) => u.username);
      expect(names).toContain('admin');
      expect(names).not.toContain('ceciljr');
    }
  });

  it('still needs a username and password for someone who logs in', async () => {
    const { admin } = await family();
    expect((await agent.post('/api/users').set(auth(admin.token)).send({ displayName: 'Wyatt' })).status).toBe(400);
  });

  it('is never a parent', async () => {
    const { admin, cecil } = await family();
    const res = await agent.post('/api/users').set(auth(admin.token)).send({ displayName: 'Mom', role: 'admin', canLogIn: false });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('parent_logs_in');
    // Nor can someone without a login be made a parent, or a parent lose theirs
    expect((await agent.put(`/api/users/${cecil.id}/role`).set(auth(admin.token)).send({ role: 'admin' })).body.code).toBe('parent_logs_in');
    const self = await agent.put(`/api/users/${admin.user.id}/login`).set(auth(admin.token)).send({ canLogIn: false });
    expect(self.status).toBe(400);
    expect((await login('admin', 'admin123')).status).toBe(200);
  });
});

describe('The "Can log in" switch', () => {
  it('signs them out everywhere when turned off, and asks for a password to turn it back on', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'wyatt', displayName: 'Wyatt', password: 'wyatt1' });
    expect((await agent.get('/api/auth/me').set(auth(kid.token))).status).toBe(200);

    const off = await agent.put(`/api/users/${kid.user.id}/login`).set(auth(admin.token)).send({ canLogIn: false });
    expect(off.status).toBe(200);
    expect(off.body.canLogIn).toBe(0);
    expect((await agent.get('/api/auth/me').set(auth(kid.token))).status).toBe(401);
    // The old password no longer works either
    expect((await login('wyatt', 'wyatt1')).status).toBe(HOSTED_RUN ? 401 : 403);
    // A parent can't hand out a password while it's off: turning it on does that
    expect((await agent.put(`/api/users/${kid.user.id}/password`).set(auth(admin.token)).send({ newPassword: 'abcd' })).body.code).toBe('cannot_log_in');

    const noPassword = await agent.put(`/api/users/${kid.user.id}/login`).set(auth(admin.token)).send({ canLogIn: true });
    expect(noPassword.status).toBe(400);
    expect(noPassword.body.code).toBe('password_needed');
    const on = await agent.put(`/api/users/${kid.user.id}/login`).set(auth(admin.token)).send({ canLogIn: true, password: 'new-pass' });
    expect(on.body.canLogIn).toBe(1);
    expect((await login('wyatt', 'wyatt1')).status).toBe(401);
    expect((await login('wyatt', 'new-pass')).status).toBe(200);
  });

  it('only a parent can flip it', async () => {
    const admin = await createAdmin(agent);
    const mom = await createUser(agent, admin.token, { username: 'mom', displayName: 'Mom', password: 'mom1', role: 'member' });
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });
    expect((await agent.put(`/api/users/${kid.user.id}/login`).set(auth(mom.token)).send({ canLogIn: false })).status).toBe(403);
    expect((await agent.put(`/api/users/${kid.user.id}/login`).set(auth(kid.token)).send({ canLogIn: false })).status).toBe(403);
    expect((await agent.get('/api/auth/me').set(auth(kid.token))).status).toBe(200);
  });
});

describe('Notifications', () => {
  it('sends them nothing on any channel, and picks up their settings again when login is back on', async () => {
    const { admin, cecil } = await family();
    const set = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
    set('notificationsEnabled', '1');
    set('ntfyEnabled', '1');
    set('ntfyTopic', 'family-topic');
    db.prepare("UPDATE users SET ntfyTopic = 'cecil-topic' WHERE id = ?").run(cecil.id);

    // Their own channel, the family channel in their place, and messages for all kids
    await notifyPeople([cecil.id], 'outcome', () => 'for Cecil');
    await notifyPeople([cecil.id], 'achievementUnlocked', () => 'badge');
    await notifyPeople('kids', 'summary', () => 'morning');
    expect(sent).toEqual([]);
    // Something held for quiet hours before the switch isn't sent afterwards
    db.prepare("INSERT INTO notification_queue (userId, kind, message, notBefore) VALUES (?, 'outcome', 'held', '2000-01-01T00:00:00.000Z')").run(cecil.id);
    await flushNotificationQueue();
    expect(sent).toEqual([]);
    // The parents still hear about them
    await notifyPeople('parents', 'choreApproval', () => 'Cecil did the dishes');
    expect(sent.map((d) => d.message)).toEqual(['Cecil did the dishes']);
    // Settings → Notifications shows they get nothing, and a test send has nowhere to go
    const people = (await agent.get('/api/notify/people').set(auth(admin.token))).body as Array<{ id: number; canLogIn: boolean }>;
    expect(people.find((p) => p.id === cecil.id)?.canLogIn).toBe(false);
    expect(people.find((p) => p.id === admin.user.id)?.canLogIn).toBe(true);
    expect((await agent.post(`/api/notify/people/${cecil.id}/test`).set(auth(admin.token))).body.error).toBe('no_channels');

    sent = [];
    await agent.put(`/api/users/${cecil.id}/login`).set(auth(admin.token)).send({ canLogIn: true, password: 'cecil1' });
    await notifyPeople([cecil.id], 'outcome', () => 'for Cecil');
    expect(sent.map((d) => [d.target, d.message])).toEqual([['cecil-topic', 'for Cecil']]);
  });

  it('turning login off drops what was waiting for quiet hours', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });
    db.prepare("INSERT INTO notification_queue (userId, kind, message, notBefore) VALUES (?, 'outcome', 'held', '2999-01-01T00:00:00.000Z')").run(kid.user.id);
    await agent.put(`/api/users/${kid.user.id}/login`).set(auth(admin.token)).send({ canLogIn: false });
    expect(db.prepare('SELECT COUNT(*) AS n FROM notification_queue WHERE userId = ?').get(kid.user.id)).toEqual({ n: 0 });
  });
});

describe('A parent does it for them', () => {
  it("a parent's Done counts as approved straight away, even in Strict Mode", async () => {
    const { admin, cecil } = await family();
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'other', tasks: [] })).body.id;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 2, frequencyDays: 1 })).body.id;
    const res = await agent.post(`/api/tasks/${task}/complete`).set(auth(admin.token)).send({ onBehalfOfUserId: cecil.id });
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT status, coinsEarned FROM task_completions WHERE taskId = ? AND userId = ?').get(task, cecil.id) as { status: string; coinsEarned: number };
    expect(row.status).toBe('approved');
    expect(coins(cecil.id)).toBe(row.coinsEarned);
    expect(row.coinsEarned).toBeGreaterThan(0);
  });

  it("buys a reward for someone with that person's coins, price and limits, approved straight away", async () => {
    const { admin, cecil } = await family();
    setCoins(cecil.id, 100);
    setCoins(admin.user.id, 1000);
    const movie = await reward(admin.token, 'Movie night', 50, { prices: { [cecil.id]: 30 }, limit: { count: 1, period: 'week', scope: 'person' } });

    // The shop as Cecil sees it: their price and their coins
    const shop = await agent.get(`/api/rewards?for=${cecil.id}`).set(auth(admin.token));
    expect(shop.body.coins).toBe(100);
    expect(shop.body.rewards.find((r: { id: number }) => r.id === movie)).toMatchObject({ costCoins: 30, regularCostCoins: 50 });

    const res = await agent.post(`/api/rewards/${movie}/redeem`).set(auth(admin.token)).send({ forUserId: cecil.id });
    expect(res.status).toBe(200);
    expect(res.body.coins).toBe(70);
    expect(res.body.redemption).toMatchObject({ userId: cecil.id, costCoins: 30, status: 'approved', boughtBy: admin.user.id });
    expect(coins(admin.user.id)).toBe(1000);
    // Their weekly limit is used up, not the parent's
    expect((await agent.post(`/api/rewards/${movie}/redeem`).set(auth(admin.token)).send({ forUserId: cecil.id })).status).toBe(409);
    expect((await agent.post(`/api/rewards/${movie}/redeem`).set(auth(admin.token)).send({})).status).toBe(200);
    // Nobody was asked to approve it
    expect(sent).toEqual([]);

    // It's theirs in their list, Activity and Insights, bought by the parent
    expect((await agent.get(`/api/rewards?for=${cecil.id}`).set(auth(admin.token))).body.mine[0]).toMatchObject({ title: 'Movie night', boughtByName: 'Admin' });
    const activity = (await agent.get('/api/history').query({ limit: 100, userId: cecil.id }).set(auth(admin.token))).body.history;
    expect(activity.find((h: { type: string }) => h.type === 'rewardPurchase')).toMatchObject({ userId: cecil.id, rewardTitle: 'Movie night', coinsEarned: -30, boughtByName: 'Admin' });
    const bought = (await agent.get('/api/insights/coins').set(auth(admin.token))).body.bought as number[][];
    expect(bought.find((b) => b[1] === cecil.id)?.slice(0, 4)).toEqual([movie, cecil.id, res.body.redemption.id, 30]);
    expect(bought.find((b) => b[1] === cecil.id)?.[6]).toBe(admin.user.id);
    expect(bought.find((b) => b[1] === admin.user.id)?.[6]).toBe(0);
  });

  it("can't spend more than they have", async () => {
    const { admin, cecil } = await family();
    setCoins(cecil.id, 10);
    setCoins(admin.user.id, 1000);
    const movie = await reward(admin.token, 'Movie night', 50);
    expect((await agent.post(`/api/rewards/${movie}/redeem`).set(auth(admin.token)).send({ forUserId: cecil.id })).body.error).toBe('Not enough coins');
    expect(coins(cecil.id)).toBe(10);
  });

  it('also works for someone who logs in, and only a parent can buy for someone else', async () => {
    const admin = await createAdmin(agent);
    const mom = await createUser(agent, admin.token, { username: 'mom', displayName: 'Mom', password: 'mom1', role: 'member' });
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });
    setCoins(kid.user.id, 100);
    setCoins(mom.user.id, 100);
    const ice = await reward(admin.token, 'Ice cream', 20);

    expect((await agent.post(`/api/rewards/${ice}/redeem`).set(auth(mom.token)).send({ forUserId: kid.user.id })).status).toBe(403);
    expect((await agent.post(`/api/rewards/${ice}/redeem`).set(auth(kid.token)).send({ forUserId: mom.user.id })).status).toBe(403);
    expect((await agent.get(`/api/rewards?for=${mom.user.id}`).set(auth(kid.token))).status).toBe(403);
    expect(coins(kid.user.id)).toBe(100);

    const res = await agent.post(`/api/rewards/${ice}/redeem`).set(auth(admin.token)).send({ forUserId: kid.user.id });
    expect(res.body.redemption).toMatchObject({ status: 'approved', boughtBy: admin.user.id });
    // The kid sees it in their own list, and can't cancel what a parent already handed out
    const mine = (await agent.get('/api/rewards').set(auth(kid.token))).body.mine;
    expect(mine[0]).toMatchObject({ title: 'Ice cream', status: 'approved', boughtByName: 'Admin' });
    expect((await agent.post(`/api/rewards/redemptions/${res.body.redemption.id}/cancel`).set(auth(kid.token))).status).toBe(400);
    // A kid's own purchase still waits for a parent
    expect((await agent.post(`/api/rewards/${ice}/redeem`).set(auth(kid.token)).send({})).body.redemption).toMatchObject({ status: 'requested', boughtBy: null });
  });

  it("can't be invited to a team-up they could never answer", async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });
    const cecil = (await agent.post('/api/users').set(auth(admin.token)).send({ displayName: 'Cecil', canLogIn: false })).body;
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Yard', roomType: 'other', tasks: [] })).body.id;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Leaves', effort: 3, frequencyDays: 7 })).body.id;
    const res = await agent.post('/api/teamups').set(auth(kid.token)).send({ taskId: task, partnerId: cecil.id });
    expect(res.body.error).toBe('invalid_partner');
  });
});
