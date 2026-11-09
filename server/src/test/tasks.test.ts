import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

/** Helper: create a room of type 'other' (no default tasks) and return its id */
async function createRoom(token: string, name = 'Test Room') {
  const res = await agent
    .post('/api/rooms')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, roomType: 'other' });
  return res.body.id as number;
}

/** Helper: create a task in a room and return its id */
async function createTask(
  token: string,
  roomId: number,
  overrides: Record<string, unknown> = {},
) {
  const res = await agent
    .post(`/api/rooms/${roomId}/tasks`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Task', effort: 3, frequencyDays: 1, ...overrides });
  return res.body.id as number;
}

describe('Tasks routes', () => {
  it('Admin can create task → 201', async () => {
    const { token } = await createAdmin(agent);
    const roomId = await createRoom(token);

    const res = await agent
      .post(`/api/rooms/${roomId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Task', effort: 3, frequencyDays: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name', 'Test Task');
    expect(res.body).toHaveProperty('effort', 3);
  });

  it('Creating a task with custom coins stores them; blank means none (FIX-29)', async () => {
    const { token } = await createAdmin(agent);
    const roomId = await createRoom(token);
    const withCoins = await createTask(token, roomId, { name: 'Mow the lawn', customCoins: 25 });
    const blank = await createTask(token, roomId, { name: 'Sweep', customCoins: '' });
    const coins = (id: number) => (db.prepare('SELECT customCoins FROM tasks WHERE id = ?').get(id) as { customCoins: number | null }).customCoins;
    expect(coins(withCoins)).toBe(25);
    expect(coins(blank)).toBeNull();
  });

  it('Member cannot create task → 403', async () => {
    const { token: adminToken } = await createAdmin(agent);
    const roomId = await createRoom(adminToken);
    const { token: memberToken } = await createUser(agent, adminToken, {
      username: 'member1',
      displayName: 'Member One',
      password: 'pass123',
      role: 'member',
    });

    const res = await agent
      .post(`/api/rooms/${roomId}/tasks`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Sneaky Task', effort: 1, frequencyDays: 7 });

    expect(res.status).toBe(403);
  });

  it('Admin can update task → 200', async () => {
    const { token } = await createAdmin(agent);
    const roomId = await createRoom(token);
    const taskId = await createTask(token, roomId);

    const res = await agent
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Task' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'Updated Task');
  });

  it('Renaming a task clears translationKey (#42)', async () => {
    const { token } = await createAdmin(agent);
    const roomId = await createRoom(token);
    const taskId = await createTask(token, roomId);

    // Simulate a default task with translationKey
    db.prepare('UPDATE tasks SET translationKey = ? WHERE id = ?').run('kitchen.wash_dishes', taskId);

    // Rename the task
    const res = await agent
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Custom Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('My Custom Name');
    expect(res.body.translationKey).toBeNull();
  });

  it('Member cannot delete task → 403', async () => {
    const { token: adminToken } = await createAdmin(agent);
    const roomId = await createRoom(adminToken);
    const taskId = await createTask(adminToken, roomId);
    const { token: memberToken } = await createUser(agent, adminToken, {
      username: 'member1',
      displayName: 'Member One',
      password: 'pass123',
      role: 'member',
    });

    const res = await agent
      .delete(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });

  it('Complete task → 200 + coins awarded', async () => {
    const { token } = await createAdmin(agent);
    const roomId = await createRoom(token);
    const taskId = await createTask(token, roomId, { effort: 3 });

    // Check coins before
    const meBefore = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    const coinsBefore = meBefore.body.coins;

    // Complete the task
    const completeRes = await agent
      .post(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${token}`);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body).toHaveProperty('coinsEarned', 15);

    // Verify coins increased
    const meAfter = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meAfter.body.coins).toBe(coinsBefore + 15);
  });

  it('Complete same task twice same day → 409', async () => {
    const { token } = await createAdmin(agent);
    const roomId = await createRoom(token);
    const taskId = await createTask(token, roomId);

    // First completion
    await agent
      .post(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${token}`);

    // Second completion same day
    const res = await agent
      .post(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'already_done_today');
  });

  it('Admin can reset completed task to dirty and complete it again', async () => {
    const { token } = await createAdmin(agent);
    const roomId = await createRoom(token);
    const taskId = await createTask(token, roomId, { effort: 3, frequencyDays: 7 });

    await agent
      .post(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${token}`);

    const resetRes = await agent
      .post(`/api/tasks/${taskId}/reset`)
      .set('Authorization', `Bearer ${token}`);

    expect(resetRes.status).toBe(200);
    expect(resetRes.body).toMatchObject({
      success: true,
      completionsRemoved: 1,
      coinsDeducted: 15,
    });

    const tasksAfterReset = await agent
      .get(`/api/rooms/${roomId}/tasks`)
      .set('Authorization', `Bearer ${token}`);
    const taskAfterReset = tasksAfterReset.body.find((t: any) => t.id === taskId);
    expect(taskAfterReset.health).toBe(0);
    expect(taskAfterReset.completedTodayBy).toBeNull();

    const completeAgainRes = await agent
      .post(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${token}`);

    expect(completeAgainRes.status).toBe(200);
    expect(completeAgainRes.body).toHaveProperty('coinsEarned', 15);
  });

  it('Member cannot reset task to dirty → 403', async () => {
    const { token: adminToken } = await createAdmin(agent);
    const roomId = await createRoom(adminToken);
    const taskId = await createTask(adminToken, roomId);
    const { token: memberToken } = await createUser(agent, adminToken, {
      username: 'member1',
      displayName: 'Member One',
      password: 'pass123',
      role: 'member',
    });

    const res = await agent
      .post(`/api/tasks/${taskId}/reset`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });

  it('Complete task not yet due → 409 (cooldown)', async () => {
    const { token } = await createAdmin(agent);
    const roomId = await createRoom(token);
    const taskId = await createTask(token, roomId, { frequencyDays: 7 });

    // Manually set lastCompletedAt to yesterday (health will be ~86, still > 0)
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(yesterday, taskId);

    // Also clear any same-day completions so 'already_done_today' doesn't fire first
    db.prepare('DELETE FROM task_completions WHERE taskId = ?').run(taskId);

    const res = await agent
      .post(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'not_yet_due');
  });

  it('Health calculation is correct', async () => {
    const { token } = await createAdmin(agent);
    const roomId = await createRoom(token);
    const taskId = await createTask(token, roomId, { frequencyDays: 7 });

    // Newly created task with no lastCompletedAt → health should be 0
    const tasksBefore = await agent
      .get(`/api/rooms/${roomId}/tasks`)
      .set('Authorization', `Bearer ${token}`);
    const taskBefore = tasksBefore.body.find((t: any) => t.id === taskId);
    expect(taskBefore.health).toBe(0);

    // Complete the task
    await agent
      .post(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${token}`);

    // After completion → health should be 100
    const tasksAfter = await agent
      .get(`/api/rooms/${roomId}/tasks`)
      .set('Authorization', `Bearer ${token}`);
    const taskAfter = tasksAfter.body.find((t: any) => t.id === taskId);
    expect(taskAfter.health).toBe(100);
  });
});
