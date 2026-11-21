import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { setNotifyTransport, type Delivery } from '../utils/notify';
import { runScheduledNotifications } from '../utils/notifySchedule';
import { at } from '../utils/clock';
import { ensureTrail, setQuestDie } from '../utils/quest';

// Quest Trail's two alerts (NEW-40 part 3): "3 days left" with the evening nudge, the results on the 1st with the morning summary.
let agent: supertest.Agent;
let db: InstanceType<typeof Database>;
let sent: Delivery[];

beforeEach(() => {
  ({ agent, db } = createTestApp());
  sent = [];
  setNotifyTransport(async (d) => { sent.push(d); return { ok: true }; });
  setQuestDie(() => 2); // every roll is a 3
});
afterEach(() => { setNotifyTransport(); setQuestDie(); });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const setting = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
const march = (day: number, hour = 12, minute = 0) => at(2030, 2, day, hour, minute);
/** Only the Quest Trail messages, as [who, text] */
const quest = () => sent.filter((d) => /^(🎲|🏁|🏆)/.test(d.message)).map((d) => [d.target, d.message]);

/** Kid and Teen play (the parent doesn't), each with their own channel; Teen has finished March, Kid has a star to roll. */
async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const teen = await createUser(agent, admin.token, { username: 'teen', displayName: 'Teen', password: 'pass123', role: 'member' });
  db.prepare('UPDATE users SET isParticipant = 0 WHERE id = ?').run(admin.user.id);
  setting('notificationsEnabled', '1');
  setting('ntfyEnabled', '1');
  db.prepare("UPDATE users SET ntfyTopic = 'kid-topic' WHERE id = ?").run(kid.user.id);
  db.prepare("UPDATE users SET ntfyTopic = 'teen-topic' WHERE id = ?").run(teen.user.id);
  db.prepare("UPDATE users SET ntfyTopic = 'admin-topic' WHERE id = ?").run(admin.user.id);
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'House', roomType: 'other' })).body.id as number;
  const chore = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 1, frequencyDays: 30 })).body.id as number;
  const trail = ensureTrail(march(1, 8))!;
  db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 0, 'approved')")
    .run(chore, kid.user.id, march(10).toISOString());
  db.prepare('UPDATE quest_players SET position = ?, finishedAt = ?, place = 1 WHERE month = ? AND userId = ?')
    .run(trail.length, march(20).toISOString(), trail.month, teen.user.id);
  return { admin, kid, teen, trail };
}

describe('Quest Trail alerts', () => {
  it('"3 days left" goes once, in the evening of the 29th, to whoever is still on the way', async () => {
    const { trail } = await family();
    await runScheduledNotifications(march(28, 19, 5));
    await runScheduledNotifications(march(29, 18, 59));
    expect(quest()).toEqual([]);
    await runScheduledNotifications(march(29, 19, 5));
    await runScheduledNotifications(march(29, 19, 30));
    expect(quest()).toEqual([
      ['kid-topic', `🎲 3 days left on the Quest Trail! You have 1 ⭐ to roll and ${trail.length} spaces to the finish.`],
    ]);
  });

  it('says how to earn a star when there is none to roll, and skips whoever is on vacation', async () => {
    const { kid, teen, trail } = await family();
    db.prepare('UPDATE quest_players SET finishedAt = NULL, place = NULL, position = 30 WHERE month = ? AND userId = ?').run(trail.month, teen.user.id);
    db.prepare('UPDATE users SET isVacationMode = 1 WHERE id = ?').run(kid.user.id);
    await runScheduledNotifications(march(29, 19, 5));
    expect(quest()).toEqual([
      ['teen-topic', `🎲 3 days left on the Quest Trail! ${trail.length - 30} spaces to the finish. Do a chore to earn a star.`],
    ]);
  });

  it('nothing when the nudges are switched off, or Quest Trail is', async () => {
    await family();
    setting('notificationTypes', JSON.stringify({ nudge: false }));
    await runScheduledNotifications(march(29, 19, 5));
    setting('notificationTypes', '{}');
    setting('features', JSON.stringify({ questTrail: false }));
    await runScheduledNotifications(march(29, 19, 10));
    expect(quest()).toEqual([]);
  });

  it('on the 1st, the morning brings last month\'s results to everyone who played (leftover stars rolled first)', async () => {
    const { trail } = await family();
    await runScheduledNotifications(at(2030, 3, 1, 6, 0));
    expect(quest()).toEqual([]);
    await runScheduledNotifications(at(2030, 3, 1, 7, 5));
    await runScheduledNotifications(at(2030, 3, 1, 7, 30));
    expect(quest()).toEqual([
      ['kid-topic', `🏁 The Quest Trail is over: Teen reached the finish first!\nYou got to space 3 of ${trail.length}.\nA new map opens today. Everyone starts again at Start!`],
      ['teen-topic', "🏆 You won this month's Quest Trail!\nA new map opens today. Everyone starts again at Start!"],
    ]);
  });

  it('says so when nobody reached the finish', async () => {
    const { teen, trail } = await family();
    db.prepare('UPDATE quest_players SET finishedAt = NULL, place = NULL, position = 50 WHERE month = ? AND userId = ?').run(trail.month, teen.user.id);
    await runScheduledNotifications(at(2030, 3, 1, 7, 5));
    expect(quest().map(([who, text]) => [who, text.split('\n')[0]])).toEqual([
      ['kid-topic', '🏁 The Quest Trail is over. Nobody reached the finish this time.'],
      ['teen-topic', '🏁 The Quest Trail is over. Nobody reached the finish this time.'],
    ]);
  });
});
