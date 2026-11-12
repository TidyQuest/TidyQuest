import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import { initDatabase } from '../database';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';

// BUG-22: a backup round trip must not pay badge bonuses or today's Rescue Mission again, resend reminders,
// or bring back the starter rewards.

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('badgeBonusCoins', '5')").run();
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Room', roomType: 'other' })).body.id;
  const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 1, onDemand: true })).body.id as number;
  return { admin, kid, task };
}

const badges = (userId: number) =>
  db.prepare('SELECT achievementId, sentAt FROM user_achievement_notifications WHERE userId = ? ORDER BY achievementId').all(userId) as { achievementId: string; sentAt: string }[];
const bonuses = (userId: number) =>
  (db.prepare("SELECT COUNT(*) AS n FROM coin_adjustments WHERE userId = ? AND reason LIKE '🏅%'").get(userId) as { n: number }).n;

async function roundTrip(token: string, edit: (backup: any) => void = () => {}) {
  const backup = (await agent.get('/api/export').set(auth(token))).body;
  edit(backup);
  expect((await agent.post('/api/import').set(auth(token)).send(backup)).status).toBe(200);
  return backup;
}

describe('Backup round trip keeps what already happened (BUG-22)', () => {
  it('keeps earned badges, so their bonuses are not paid again', async () => {
    const { admin, kid, task } = await family();
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).send({}).expect(200);
    const earned = badges(kid.user.id);
    expect(earned.length).toBeGreaterThan(0);
    expect(bonuses(kid.user.id)).toBe(earned.length);

    const backup = await roundTrip(admin.token);
    expect(backup.earnedBadges.length).toBeGreaterThan(0);
    expect(badges(kid.user.id)).toEqual(earned);

    // The next chore pays only for badges that are really new
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).send({}).expect(200);
    expect(bonuses(kid.user.id)).toBe(badges(kid.user.id).length);
  });

  it('keeps everyone\'s badges (by username) when importing an older backup without them', async () => {
    const { admin, kid, task } = await family();
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).send({}).expect(200);
    const earned = badges(kid.user.id);
    await roundTrip(admin.token, (backup) => { delete backup.earnedBadges; });
    expect(badges(kid.user.id)).toEqual(earned);
  });

  it('keeps today\'s Rescue Mission, sent reminders and the notification log', async () => {
    const { admin, kid, task } = await family();
    db.prepare("INSERT INTO rescue_missions (day, taskId, multiplier, completedBy, completionId) VALUES ('2026-11-09', ?, 2, ?, 7)").run(task, kid.user.id);
    db.prepare("INSERT INTO task_due_notifications (taskId, dueDate) VALUES (?, '2026-11-09')").run(task);
    db.prepare("INSERT INTO notification_log (sentAt, userId, channel, kind, message, ok, dedupeKey) VALUES ('2026-11-09T08:00:00Z', ?, 'ntfy', 'due', 'Dishes', 1, 'due:1')").run(kid.user.id);

    await roundTrip(admin.token);
    expect(db.prepare('SELECT day, taskId, completedBy FROM rescue_missions').all()).toEqual([{ day: '2026-11-09', taskId: task, completedBy: kid.user.id }]);
    expect(db.prepare('SELECT taskId, dueDate FROM task_due_notifications').all()).toEqual([{ taskId: task, dueDate: '2026-11-09' }]);
    expect(db.prepare('SELECT userId, dedupeKey FROM notification_log').all()).toEqual([{ userId: kid.user.id, dedupeKey: 'due:1' }]);
  });

  it('puts the starter rewards in a new database only', async () => {
    initDatabase();
    expect((db.prepare('SELECT COUNT(*) AS n FROM rewards').get() as { n: number }).n).toBeGreaterThan(0);
  });

  it('does not bring the starter rewards back after a backup without rewards, or after removing them all', async () => {
    const { admin } = await family();
    await roundTrip(admin.token, (backup) => { backup.rewards = []; backup.rewardRedemptions = []; });
    initDatabase();
    expect(db.prepare('SELECT COUNT(*) AS n FROM rewards').get()).toEqual({ n: 0 });
  });
});
