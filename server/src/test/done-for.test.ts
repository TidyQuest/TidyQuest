import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import { setNotifyTransport, flushNotificationQueue, type Delivery } from '../utils/notify';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';

// FIX-37: a grown-up's Done on a chore anyone can do, "Change" and "Done for someone…"
let agent: supertest.Agent;
let db: InstanceType<typeof Database>;
let sent: Delivery[];

beforeEach(() => {
  ({ agent, db } = createTestApp());
  sent = [];
  setNotifyTransport(async (d) => { sent.push(d); return { ok: true }; });
});
afterEach(() => setNotifyTransport());

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const setting = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
const user = (id: number) => db.prepare('SELECT coins, currentStreak, lastActiveDate FROM users WHERE id = ?').get(id) as { coins: number; currentStreak: number; lastActiveDate: string | null };
const badges = (id: number) => (db.prepare('SELECT achievementId FROM user_achievement_notifications WHERE userId = ?').all(id) as Array<{ achievementId: string }>).map((b) => b.achievementId);

async function family() {
  const admin = await createAdmin(agent);
  db.prepare('UPDATE users SET isParticipant = 1 WHERE id = ?').run(admin.user.id);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Cecil', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'other' })).body.id as number;
  const chore = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Wipe counters', effort: 1, frequencyDays: 1, customCoins: 10 })).body.id as number;
  return { admin, kid, room, chore };
}

describe('Change after a grown-up\'s Done (FIX-37)', () => {
  it('one tap with no Change counts as the grown-up\'s', async () => {
    const { admin, chore } = await family();
    const res = await agent.post(`/api/tasks/${chore}/complete`).set(auth(admin.token)).send({ changeable: true }).expect(200);
    expect(res.body.changeable).toBe(true);
    expect(user(admin.user.id).coins).toBe(10);
  });

  it('Change moves the coins, streak, badge and alert to the kid and leaves nothing on the grown-up', async () => {
    const { admin, kid, chore } = await family();
    for (const [k, v] of [['notificationsEnabled', '1'], ['ntfyEnabled', '1'], ['ntfyTopic', 'family']]) setting(k, v);
    db.prepare("UPDATE users SET ntfyTopic = 'dad-phone' WHERE id = ?").run(admin.user.id);
    db.prepare("UPDATE users SET ntfyTopic = 'kid-phone' WHERE id = ?").run(kid.user.id);
    const before = user(admin.user.id);

    const done = await agent.post(`/api/tasks/${chore}/complete`).set(auth(admin.token)).send({ changeable: true }).expect(200);
    expect(done.body.newAchievements.length).toBeGreaterThan(0); // the first chore earns a badge
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.filter((d) => d.message.startsWith('🏆'))).toHaveLength(0); // the badge alert waits

    const change = await agent.post(`/api/completions/${done.body.completionId}/change`).set(auth(admin.token))
      .send({ userIds: [kid.user.id] }).expect(200);
    expect(change.body.changed[0].userId).toBe(kid.user.id);

    const dad = user(admin.user.id);
    expect(dad.coins).toBe(before.coins);
    expect(dad.currentStreak).toBe(before.currentStreak);
    expect(badges(admin.user.id)).toEqual([]);
    expect(user(kid.user.id).coins).toBe(10);
    expect(user(kid.user.id).currentStreak).toBe(1);
    expect(badges(kid.user.id).length).toBeGreaterThan(0);
    const rows = db.prepare('SELECT userId, markedByUserId FROM task_completions WHERE taskId = ?').all(chore) as any[];
    expect(rows).toEqual([{ userId: kid.user.id, markedByUserId: admin.user.id }]);

    // Dad's held badge alert never goes out; Cecil hears it was done for them
    await new Promise((r) => setTimeout(r, 20));
    await flushNotificationQueue(new Date(Date.now() + 5 * 60_000));
    expect(sent.some((d) => d.target === 'dad-phone' && d.message.startsWith('🏆 You'))).toBe(false);
    expect(sent.some((d) => d.target === 'kid-phone' && d.message === '✅ Admin marked “Wipe counters” done for you')).toBe(true);
  });

  it('a held badge alert goes out once the Change time has passed', async () => {
    const { admin, chore } = await family();
    for (const [k, v] of [['notificationsEnabled', '1'], ['ntfyEnabled', '1'], ['ntfyTopic', 'family']]) setting(k, v);
    db.prepare("UPDATE users SET ntfyTopic = 'dad-phone' WHERE id = ?").run(admin.user.id);
    await agent.post(`/api/tasks/${chore}/complete`).set(auth(admin.token)).send({ changeable: true }).expect(200);
    await new Promise((r) => setTimeout(r, 20));
    await flushNotificationQueue(new Date());
    expect(sent.filter((d) => d.target === 'dad-phone')).toHaveLength(0);
    await flushNotificationQueue(new Date(Date.now() + 2 * 60_000));
    expect(sent.some((d) => d.target === 'dad-phone' && d.message.startsWith('🏆'))).toBe(true);
  });

  it('Activity shows who marked it done', async () => {
    const { admin, kid, chore } = await family();
    await agent.post(`/api/tasks/${chore}/complete`).set(auth(admin.token)).send({ onBehalfOfUserId: kid.user.id }).expect(200);
    const res = await agent.get('/api/history').set(auth(admin.token)).expect(200);
    const row = (res.body.history ?? res.body).find((h: any) => h.taskId === chore);
    expect(row.markedByName).toBe('Admin');
    expect(row.approvedByName).toBeNull();
  });

  it('is all or nothing: one person who can\'t take it leaves the grown-up\'s Done as it was', async () => {
    const { admin, kid, chore } = await family();
    const other = await createUser(agent, admin.token, { username: 'kid2', displayName: 'Cylis', password: 'pass123', role: 'child' });
    const done = await agent.post(`/api/tasks/${chore}/complete`).set(auth(admin.token)).send({ changeable: true }).expect(200);
    // "First to do it" chore: only one person can have it, so the second fails
    const res = await agent.post(`/api/completions/${done.body.completionId}/change`).set(auth(admin.token))
      .send({ userIds: [kid.user.id, other.user.id] });
    expect(res.status).toBe(409);
    expect(user(admin.user.id).coins).toBe(10);
    expect(user(kid.user.id).coins).toBe(0);
    expect(db.prepare('SELECT userId FROM task_completions WHERE taskId = ?').all(chore)).toEqual([{ userId: admin.user.id }]);
  });

  it('only the grown-up who did it can change it, a kid can\'t, and not after ten minutes', async () => {
    const { admin, kid, chore } = await family();
    const member = await createUser(agent, admin.token, { username: 'gran', displayName: 'Gran', password: 'pass123', role: 'member' });
    const done = await agent.post(`/api/tasks/${chore}/complete`).set(auth(member.token)).send({ changeable: true }).expect(200);
    expect(done.body.changeable).toBe(true);
    const url = `/api/completions/${done.body.completionId}/change`;
    expect((await agent.post(url).set(auth(kid.token)).send({ userIds: [kid.user.id] })).status).toBe(403);
    expect((await agent.post(url).set(auth(admin.token)).send({ userIds: [kid.user.id] })).body.error).toBe('not_changeable');
    db.prepare('UPDATE task_completions SET completedAt = ? WHERE id = ?').run(new Date(Date.now() - 11 * 60_000).toISOString(), done.body.completionId);
    expect((await agent.post(url).set(auth(member.token)).send({ userIds: [kid.user.id] })).body.error).toBe('change_too_late');
  });

  it('a kid\'s Done is never changeable', async () => {
    const { kid, chore } = await family();
    const done = await agent.post(`/api/tasks/${chore}/complete`).set(auth(kid.token)).send({ changeable: true }).expect(200);
    expect(done.body.changeable).toBeUndefined();
  });

  it('Strict Mode: the kid gets it straight away, no approval needed', async () => {
    const { admin, kid, chore } = await family();
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
    const done = await agent.post(`/api/tasks/${chore}/complete`).set(auth(admin.token)).send({ changeable: true }).expect(200);
    const change = await agent.post(`/api/completions/${done.body.completionId}/change`).set(auth(admin.token)).send({ userIds: [kid.user.id] }).expect(200);
    expect(change.body.changed[0].pendingApproval).toBe(false);
    expect(user(kid.user.id).coins).toBe(10);
  });
});

describe('The family setting (FIX-37)', () => {
  it('defaults to "ask" when someone can\'t log in, otherwise "mine", and a parent can pick', async () => {
    const { admin } = await family();
    const dash = async () => (await agent.get('/api/dashboard').set(auth(admin.token)).expect(200)).body.grownUpDone;
    expect(await dash()).toEqual({ value: 'mine', chosen: false });
    await agent.post('/api/users').set(auth(admin.token)).send({ displayName: 'Baby', role: 'child', canLogIn: false }).expect((r) => { if (r.status >= 300) throw new Error(JSON.stringify(r.body)); });
    expect(await dash()).toEqual({ value: 'ask', chosen: false });
    await agent.put('/api/users/grown-up-done').set(auth(admin.token)).send({ value: 'mine' }).expect(200);
    expect(await dash()).toEqual({ value: 'mine', chosen: true });
    await agent.put('/api/users/grown-up-done').set(auth(admin.token)).send({ value: null }).expect(200);
    expect(await dash()).toEqual({ value: 'ask', chosen: false });
    expect((await agent.put('/api/users/grown-up-done').set(auth(admin.token)).send({ value: 'maybe' })).status).toBe(400);
  });

  it('only a parent can change it', async () => {
    const { admin } = await family();
    const member = await createUser(agent, admin.token, { username: 'gran', displayName: 'Gran', password: 'pass123', role: 'member' });
    expect((await agent.put('/api/users/grown-up-done').set(auth(member.token)).send({ value: 'ask' })).status).toBe(403);
  });
});
