import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, homeToday } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { MAX_RETURNS, notifyCardFor } from '../utils/notifyCard';

// The "turn on notifications" card on Today (ENH-31): for people with no channel of their own, after a chore

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;
let task: number;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const setting = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);

beforeEach(() => {
  ({ agent, db } = createTestApp());
  setting('notificationsEnabled', '1');
  const room = Number(db.prepare("INSERT INTO rooms (name, roomType) VALUES ('Kitchen', 'kitchen')").run().lastInsertRowid);
  task = Number(db.prepare("INSERT INTO tasks (roomId, name, effort) VALUES (?, 'Wash Dishes', 1)").run(room).lastInsertRowid);
});

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  return { admin, kid };
}

const did = (userId: number, when: Date = homeToday(0, 0, 0, 1), status = 'approved') =>
  db.prepare('INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 1, ?)').run(task, userId, when.toISOString(), status);
const card = async (token: string) => (await agent.get('/api/dashboard').set(auth(token)).expect(200)).body.notifyCard;
const answer = (token: string, a: string) => agent.post('/api/notify/card').set(auth(token)).send({ answer: a });

describe('Who sees the card', () => {
  it('shows after their first chore of the day, with kid or parent wording', async () => {
    const { admin, kid } = await family();
    expect(await card(kid.token)).toBeNull();
    did(kid.user.id);
    did(admin.user.id);
    expect(await card(kid.token)).toBe('kid');
    expect(await card(admin.token)).toBe('parent');
  });

  it('counts a chore still waiting for approval, but not one from yesterday', async () => {
    const { kid } = await family();
    did(kid.user.id, homeToday(-1, 12));
    expect(await card(kid.token)).toBeNull();
    did(kid.user.id, homeToday(0, 0, 0, 1), 'pending');
    expect(await card(kid.token)).toBe('kid');
  });

  it('is hidden for someone with a channel of their own', async () => {
    const { kid } = await family();
    did(kid.user.id);
    db.prepare("UPDATE users SET ntfyTopic = 'kid-topic' WHERE id = ?").run(kid.user.id);
    expect(await card(kid.token)).toBeNull();
  });

  it('is hidden while notifications or phone notifications are off, and for people who can\'t log in', async () => {
    const { kid } = await family();
    did(kid.user.id);
    setting('notificationsEnabled', '0');
    expect(await card(kid.token)).toBeNull();
    setting('notificationsEnabled', '1');
    setting('features', JSON.stringify({ webPush: false }));
    expect(await card(kid.token)).toBeNull();
    db.prepare('DELETE FROM app_settings WHERE key = ?').run('features');
    expect(notifyCardFor(kid.user.id)).toBe('kid');
    db.prepare('UPDATE users SET canLogIn = 0 WHERE id = ?').run(kid.user.id);
    expect(notifyCardFor(kid.user.id)).toBeNull();
  });
});

describe('Answering the card', () => {
  it('Turn on hides it for good, on every device', async () => {
    const { kid } = await family();
    did(kid.user.id);
    await answer(kid.token, 'done').expect(200);
    expect(await card(kid.token)).toBeNull();
    expect(notifyCardFor(kid.user.id, homeToday(30, 12))).toBeNull();
  });

  it('Not now hides it for 7 days, and it comes back at most 3 times', async () => {
    const { kid } = await family();
    did(kid.user.id);
    for (let i = 0; i <= MAX_RETURNS; i++) {
      await answer(kid.token, 'snooze').expect(200);
      expect(await card(kid.token)).toBeNull();
      // A week later it's back, until it has come back MAX_RETURNS times
      const later = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60_000);
      did(kid.user.id, later);
      expect(notifyCardFor(kid.user.id, later)).toBe(i < MAX_RETURNS ? 'kid' : null);
      // Pretend that week has passed
      db.prepare("UPDATE users SET notifyCard = json_set(notifyCard, '$.until', ?) WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), kid.user.id);
    }
  });

  it('refuses anything else', async () => {
    const { kid } = await family();
    await answer(kid.token, 'maybe').expect(400);
  });
});

describe('Who gets what', () => {
  it('says whether a family channel is on', async () => {
    const { admin } = await family();
    const people = async () => (await agent.get('/api/notify/people').set(auth(admin.token)).expect(200)).body;
    expect((await people())[0].familyChannel).toBe(false);
    setting('ntfyEnabled', '1');
    setting('ntfyTopic', 'family-topic');
    expect((await people())[0].familyChannel).toBe(true);
  });
});
