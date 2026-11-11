import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { flushNotificationQueue, notifyPeople, setNotifyTransport, type Delivery } from '../utils/notify';
import { runScheduledNotifications } from '../utils/notifySchedule';
import { sendDueTaskNotificationsIfNeeded } from '../utils/notifications';
import { sendCoinBoostNotificationsIfNeeded } from '../utils/boosts';
import { todaysMission } from '../utils/rescue';
import { at as homeAt, wall } from '../utils/clock';

// Code sweep 2026-11-08, batch S4: notifications (BUG-40 to 43, BUG-49)

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;
let sent: Delivery[];

beforeEach(() => {
  ({ agent, db } = createTestApp());
  sent = [];
  setNotifyTransport(async (d) => { sent.push(d); return { ok: true }; });
});
afterEach(() => setNotifyTransport());

const HOUR = 3600000;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const setting = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
// Wednesday Oct 14 2026
const at = (hour: number, minute = 0, day = 14) => homeAt(2026, 9, day, hour, minute);
const channel = (topic: string | null, userId: number) => db.prepare('UPDATE users SET ntfyTopic = ? WHERE id = ?').run(topic, userId);
/** Sends started by a request finish after its answer */
const settle = () => new Promise((r) => setTimeout(r, 40));
const to = (topic: string) => sent.filter((d) => d.target === topic).map((d) => d.message);
/** Quiet hours that cover the real "now" (from an hour ago until two hours from now) */
function quietNow() {
  const hm = (d: Date) => { const w = wall(d); return `${String(w.hours).padStart(2, '0')}:${String(w.minutes).padStart(2, '0')}`; };
  setting('quietStart', hm(new Date(Date.now() - HOUR)));
  setting('quietEnd', hm(new Date(Date.now() + 2 * HOUR)));
}
const queued = () => db.prepare('SELECT COUNT(*) AS n FROM notification_queue').get() as { n: number };

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const sis = await createUser(agent, admin.token, { username: 'sis', displayName: 'Sis', password: 'pass123', role: 'child' });
  setting('notificationsEnabled', '1');
  channel('dad-topic', admin.user.id);
  channel('kid-topic', kid.user.id);
  channel('sis-topic', sis.user.id);
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Garage', roomType: 'other' })).body.id as number;
  const mk = async (name: string, extra: object = {}) =>
    (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name, effort: 1, frequencyDays: 1, ...extra })).body.id as number;
  return { admin, kid, sis, room, mk };
}

describe('BUG-40: badge notifications after a normal Done', () => {
  it('tells the kid and the parents when a Done earns a badge', async () => {
    const { kid, mk } = await family();
    const task = await mk('Sweep');
    const done = await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).send({});
    expect(done.body.newAchievements.length).toBeGreaterThan(0);
    await settle();
    expect(to('kid-topic').filter((m) => m.startsWith('🏆 You earned a badge'))).toHaveLength(done.body.newAchievements.length);
    expect(to('dad-topic').filter((m) => m.startsWith('🏆 Kid earned a badge'))).toHaveLength(done.body.newAchievements.length);
  });

  it('tells everyone on a team-up, the person who tapped Done included', async () => {
    const { kid, sis, mk } = await family();
    const tub = await mk('Clean the tub', { onDemand: true, showInDashboard: true, customCoins: 12 });
    const team = (await agent.post('/api/teamups').set(auth(kid.token)).send({ taskId: tub, partnerId: sis.user.id })).body.teamup;
    await agent.post(`/api/teamups/${team.id}/join`).set(auth(sis.token)).expect(200);
    sent = [];
    const done = await agent.post(`/api/tasks/${tub}/complete`).set(auth(kid.token)).send({});
    expect(done.body.newAchievements.length).toBeGreaterThan(0);
    await settle();
    expect(to('kid-topic').filter((m) => m.startsWith('🏆 You earned a badge')).length).toBeGreaterThan(0);
    expect(to('sis-topic').filter((m) => m.startsWith('🏆 You earned a badge')).length).toBeGreaterThan(0);
  });
});

describe('BUG-41: messages held for quiet hours', () => {
  it("drops a held reminder when the chore got done, and keeps the one that's still true", async () => {
    const { kid, mk } = await family();
    setting('quietStart', '20:30'); setting('quietEnd', '07:00');
    const cat = await mk('Feed the cat', { assignedUserIds: [kid.user.id], reminderTime: '19:00' });
    await mk('Bins out', { assignedUserIds: [kid.user.id], reminderTime: '19:00' });
    await runScheduledNotifications(at(19, 0));
    expect(to('kid-topic').filter((m) => m.startsWith('⏰'))).toEqual(['⏰ Reminder: Feed the cat', '⏰ Reminder: Bins out']);
    sent = [];
    await runScheduledNotifications(at(21, 0)); // "still not done" to the kid: held
    await runScheduledNotifications(at(23, 0)); // and to the parent: held
    expect(sent).toEqual([]);
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(at(21, 30).toISOString(), cat);
    await flushNotificationQueue(at(7, 0, 15));
    expect(sent.map((d) => [d.target, d.message])).toEqual([
      ['kid-topic', '⏰ Still not done: Bins out'],
      ['dad-topic', '⚠️ Still not done: Bins out (Kid)'],
    ]);
    expect(queued().n).toBe(0);
  });

  it('drops a held "for tomorrow" reminder and evening nudge once their day is over', async () => {
    const { kid, mk } = await family();
    setting('quietStart', '18:00'); setting('quietEnd', '07:00');
    const bins = await mk('Bins to the curb', { frequencyDays: 7, assignedUserIds: [kid.user.id], reminderTime: '19:00', reminderDayBefore: true });
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(at(19, 0, 8).toISOString(), bins); // due tomorrow (Thursday)
    db.prepare("UPDATE users SET currentStreak = 4, lastActiveDate = '2026-10-13' WHERE id = ?").run(kid.user.id);
    await runScheduledNotifications(at(19, 0)); // held: "For tomorrow" and the evening nudge
    expect(queued().n).toBe(2);
    await flushNotificationQueue(at(7, 0, 15));
    expect(sent).toEqual([]);
    expect(queued().n).toBe(0);
  });

  it('sends the second reminder in place of a first one that never left the queue', async () => {
    const { kid, mk } = await family();
    setting('quietStart', '18:00'); setting('quietEnd', '07:00');
    await mk('Feed the cat', { assignedUserIds: [kid.user.id], reminderTime: '19:00' });
    await runScheduledNotifications(at(19, 0));
    await runScheduledNotifications(at(21, 0));
    await flushNotificationQueue(at(7, 0, 15));
    expect(to('kid-topic').filter((m) => m.startsWith('⏰'))).toEqual(['⏰ Still not done: Feed the cat']);
  });

  it('drops a held message when its kind was switched off in the meantime', async () => {
    const { kid } = await family();
    setting('quietStart', '21:00'); setting('quietEnd', '07:00');
    const hold = () => notifyPeople([kid.user.id], 'outcome', () => 'late news', { now: at(22) });
    await hold();
    db.prepare('UPDATE users SET notifyPrefs = ? WHERE id = ?').run(JSON.stringify({ outcome: false }), kid.user.id); // the person
    await flushNotificationQueue(at(7, 0, 15));
    db.prepare('UPDATE users SET notifyPrefs = NULL WHERE id = ?').run(kid.user.id);
    await hold();
    setting('notificationTypes', JSON.stringify({ outcome: false })); // the family
    await flushNotificationQueue(at(7, 0, 15));
    setting('notificationTypes', '{}');
    await hold();
    setting('notificationsEnabled', '0'); // everything
    await flushNotificationQueue(at(7, 0, 15));
    expect(sent).toEqual([]);
    expect(queued().n).toBe(0);
    setting('notificationsEnabled', '1');
    await hold();
    await flushNotificationQueue(at(7, 0, 15));
    expect(sent.map((d) => d.message)).toEqual(['late news']);
  });

  it('drops a held team-up invite that was called off, and a held approval request already handled', async () => {
    const { admin, kid, sis, mk } = await family();
    const third = await createUser(agent, admin.token, { username: 'bro', displayName: 'Bro', password: 'pass123', role: 'child' });
    channel('bro-topic', third.user.id);
    const tub = await mk('Clean the tub', { onDemand: true, showInDashboard: true, customCoins: 12 });
    const floor = await mk('Mop the floor', { onDemand: true, showInDashboard: true, customCoins: 12 });
    quietNow();
    await agent.post('/api/teamups').set(auth(kid.token)).send({ taskId: tub, partnerId: sis.user.id }).expect(200);
    const off = (await agent.post('/api/teamups').set(auth(sis.token)).send({ taskId: floor, partnerId: third.user.id })).body.teamup;
    await agent.post(`/api/teamups/${off.id}/leave`).set(auth(sis.token)).expect(200); // Sis changed her mind
    // Strict Mode: a Done waits for a parent, who approves it from the app before the message would arrive
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true }).expect(200);
    const sweep = await mk('Sweep');
    const rake = await mk('Rake');
    const waiting = (await agent.post(`/api/tasks/${sweep}/complete`).set(auth(kid.token)).send({})).body.completionId;
    await agent.post(`/api/tasks/${rake}/complete`).set(auth(kid.token)).send({}).expect(200);
    await settle();
    expect(sent).toEqual([]);
    await agent.post(`/api/completions/${waiting}/approve`).set(auth(admin.token)).send({}).expect(200);
    await settle();
    db.prepare('UPDATE notification_queue SET notBefore = ?').run(new Date().toISOString());
    await flushNotificationQueue(new Date());
    expect(to('sis-topic').filter((m) => m.includes('Clean the tub'))).toHaveLength(1); // still open: goes out
    expect(to('bro-topic')).toEqual([]);
    expect(to('dad-topic').filter((m) => m.includes('Sweep'))).toEqual([]);
    expect(to('dad-topic').filter((m) => m.includes('Rake'))).toHaveLength(1); // still waiting: goes out
  });

  it('drops a held "last hour of double coins" when the event is over', async () => {
    const { admin } = await family();
    quietNow();
    const boost = (await agent.post('/api/boosts').set(auth(admin.token))
      .send({ title: 'Party', multiplier: 2, startAt: new Date(Date.now() - 3 * HOUR).toISOString(), endAt: new Date(Date.now() + HOUR / 2).toISOString() })).body.id;
    db.prepare('UPDATE coin_boosts SET notifiedStart = 1, notifiedEnding = 0 WHERE id = ?').run(boost);
    await sendCoinBoostNotificationsIfNeeded(new Date());
    expect(queued().n).toBeGreaterThan(0);
    await flushNotificationQueue(new Date(Date.now() + 3 * HOUR));
    expect(sent).toEqual([]);
    expect(queued().n).toBe(0);
  });
});

describe('BUG-42: starter chores in the reader\'s language', () => {
  /** As the room defaults and starter packs save them: an English name plus a translation key */
  const starter = (task: number) => { db.prepare("UPDATE tasks SET translationKey = 'kitchen.wash_dishes' WHERE id = ?").run(task); return task; };
  it('names a starter chore in French for a French reader, in English for the others', async () => {
    const { admin, kid, mk } = await family();
    db.prepare("UPDATE users SET language = 'fr' WHERE id = ?").run(kid.user.id);
    setting('eveningTime', '16:00');
    starter(await mk('Wash Dishes', { assignedUserIds: [kid.user.id], reminderTime: '19:00' }));
    await runScheduledNotifications(at(7, 0));
    await runScheduledNotifications(at(19, 0));
    await runScheduledNotifications(at(23, 0));
    expect(to('kid-topic')).toHaveLength(2);
    for (const m of to('kid-topic')) { expect(m).toContain('Faire la vaisselle'); expect(m).not.toContain('Wash Dishes'); }
    expect(to('dad-topic')).toEqual(['⚠️ Still not done: Wash dishes (Kid)']); // the English file's wording, as the app shows it
    void admin;
  });

  it('does the same for approvals, cheers and team-up invites', async () => {
    const { admin, kid, sis, mk } = await family();
    db.prepare("UPDATE users SET language = 'fr' WHERE id IN (?, ?)").run(admin.user.id, sis.user.id);
    const dishes = starter(await mk('Wash Dishes', { onDemand: true, showInDashboard: true, customCoins: 12 }));
    await agent.post('/api/teamups').set(auth(kid.token)).send({ taskId: dishes, partnerId: sis.user.id }).expect(200);
    await agent.post(`/api/teamups/${(db.prepare('SELECT id FROM teamups').get() as { id: number }).id}/leave`).set(auth(kid.token)).expect(200);
    const done = (await agent.post(`/api/tasks/${dishes}/complete`).set(auth(kid.token)).send({})).body.completionId;
    await agent.post('/api/cheers').set(auth(sis.token)).send({ completionId: done, emoji: '👏' }).expect(200);
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true }).expect(200);
    await agent.post(`/api/tasks/${dishes}/complete`).set(auth(kid.token)).send({}).expect(200);
    await settle();
    expect(to('sis-topic').filter((m) => m.includes('Faire la vaisselle'))).toHaveLength(1); // the invite
    expect(to('kid-topic').filter((m) => m.includes('Wash dishes') && m.includes('👏'))).toHaveLength(1); // the cheer, in English
    expect(to('dad-topic').filter((m) => m.includes('Faire la vaisselle'))).toHaveLength(1); // waiting for approval
    expect(sent.filter((d) => d.target !== 'kid-topic' && /wash dishes/i.test(d.message))).toEqual([]);
  });
});

describe('BUG-43: reminders across midnight', () => {
  it('sends the later stages of an evening reminder after midnight', async () => {
    const { kid, mk } = await family();
    setting('eveningTime', '16:00');
    await mk('Lock up', { assignedUserIds: [kid.user.id], reminderTime: '20:00' });
    await mk('Lights out', { assignedUserIds: [kid.user.id], reminderTime: '22:30' });
    for (const [h, m, d] of [[20, 0, 14], [22, 0, 14], [22, 30, 14], [0, 0, 15], [0, 30, 15], [2, 30, 15]]) await runScheduledNotifications(at(h, m, d));
    expect(sent.map((d) => [d.target, d.message])).toEqual([
      ['kid-topic', '⏰ Reminder: Lock up'],
      ['kid-topic', '⏰ Still not done: Lock up'],
      ['kid-topic', '⏰ Reminder: Lights out'],
      ['dad-topic', '⚠️ Still not done: Lock up (Kid)'],
      ['kid-topic', '⏰ Still not done: Lights out'],
      ['dad-topic', '⚠️ Still not done: Lights out (Kid)'],
    ]);
  });

  it("says nothing after midnight about a chore that was done before it", async () => {
    const { kid, mk } = await family();
    setting('eveningTime', '16:00');
    const task = await mk('Lock up', { assignedUserIds: [kid.user.id], reminderTime: '20:00' });
    await runScheduledNotifications(at(20, 0));
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(at(20, 30).toISOString(), task);
    await runScheduledNotifications(at(22, 0));
    await runScheduledNotifications(at(0, 0, 15));
    expect(sent.map((d) => d.message)).toEqual(['⏰ Reminder: Lock up']);
  });
});

describe('BUG-49: vacations and chores waiting for approval', () => {
  /** A day's worth of timed checks; `minute` keeps each call in a minute that wasn't checked yet */
  async function aDay(minute: number) {
    await runScheduledNotifications(at(7, minute)); // morning list, Rescue Mission
    await sendDueTaskNotificationsIfNeeded(at(9, minute)); // due today
    await runScheduledNotifications(at(17, minute)); // reminder
    await runScheduledNotifications(at(19, minute)); // second reminder, evening nudge
    await runScheduledNotifications(at(21, minute)); // parents: still not done
  }
  const lastDone = (task: number, day: number) => db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(at(12, 0, day).toISOString(), task);

  it('sends nothing about chores while the family is on vacation', async () => {
    const { admin, kid, mk } = await family();
    db.prepare("DELETE FROM app_settings WHERE key = 'features'").run(); // Rescue Mission on
    lastDone(await mk('Feed the cat', { assignedUserIds: [kid.user.id], reminderTime: '17:00' }), 13);
    lastDone(await mk('Sweep'), 10);
    db.prepare("UPDATE users SET currentStreak = 4, lastActiveDate = '2026-10-13' WHERE id = ?").run(kid.user.id);
    await agent.put('/api/users/vacation-config').set(auth(admin.token)).send({ vacationMode: true }).expect(200);
    await aDay(0);
    expect(sent).toEqual([]);
    expect(todaysMission(at(12))).toBeNull(); // no mission is picked either
    await agent.put('/api/users/vacation-config').set(auth(admin.token)).send({ vacationMode: false }).expect(200);
    lastDone(await mk('Bins out', { assignedUserIds: [kid.user.id], reminderTime: '17:00' }), 13);
    await aDay(1);
    expect(sent.length).toBeGreaterThanOrEqual(6); // back home: everything flows again
  });

  it('leaves out the person on their own vacation, and tells the others as usual', async () => {
    const { admin, kid, sis, mk } = await family();
    db.prepare("DELETE FROM app_settings WHERE key = 'features'").run();
    lastDone(await mk('Feed the cat', { assignedUserIds: [kid.user.id], reminderTime: '17:00' }), 9); // the most forgotten chore
    lastDone(await mk('Water plants', { assignedUserIds: [sis.user.id], reminderTime: '17:00' }), 11);
    db.prepare("UPDATE users SET currentStreak = 4, lastActiveDate = '2026-10-13' WHERE role = 'child'").run();
    await agent.put(`/api/users/${kid.user.id}/vacation`).set(auth(admin.token)).send({ isVacationMode: true }).expect(200);
    await aDay(0);
    expect(to('kid-topic')).toEqual([]);
    expect(sent.filter((d) => d.message.includes('Feed the cat'))).toEqual([]); // nor the parents about Kid's chore
    expect(to('sis-topic').filter((m) => m.includes('Water plants'))).toHaveLength(5); // Rescue Mission, morning, two reminders, evening
    expect(to('dad-topic')).toEqual(['⚠️ Still not done: Water plants (Sis)']);
    // The Rescue Mission is a chore someone at home can do
    expect(db.prepare('SELECT name FROM tasks WHERE id = ?').get(todaysMission(at(12))!.taskId)).toEqual({ name: 'Water plants' });
  });

  it('treats a chore waiting for approval as done', async () => {
    const { admin, kid, mk } = await family();
    const cat = await mk('Feed the cat', { assignedUserIds: [kid.user.id], reminderTime: '17:00' });
    lastDone(cat, 13);
    const fish = await mk('Feed the fish', { assignedUserIds: [kid.user.id] });
    lastDone(fish, 13);
    setting('notificationTime', '18:00');
    await runScheduledNotifications(at(17, 0));
    expect(to('kid-topic')).toEqual(['⏰ Reminder: Feed the cat']);
    const wait = db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 5, 'pending')");
    wait.run(cat, kid.user.id, at(18).toISOString());
    wait.run(fish, kid.user.id, at(8).toISOString());
    sent = [];
    await sendDueTaskNotificationsIfNeeded(at(18, 30)); // "due today", late in its day on purpose
    await runScheduledNotifications(at(19, 0));
    await runScheduledNotifications(at(21, 0));
    expect(sent).toEqual([]);
    void admin;
  });
});
