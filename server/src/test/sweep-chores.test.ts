import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, homeToday } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { localDateStr } from '../utils/dateHelpers';

// Code sweep 2026-11-08, batch S2a: shared chores, turns, double pay, undo (BUG-26, 27, 28, 46)

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const iso = (daysAgo: number, hours = 12) => homeToday(-daysAgo, hours).toISOString();
const taskRow = (id: number) => db.prepare('SELECT lastCompletedAt, rotationCurrentUserId, archivedAt FROM tasks WHERE id = ?').get(id) as
  { lastCompletedAt: string | null; rotationCurrentUserId: number | null; archivedAt: string | null };
const coins = (id: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(id) as { coins: number }).coins;
const done = (token: string, taskId: number, body: object = {}) => agent.post(`/api/tasks/${taskId}/complete`).set(auth(token)).send(body);
/** Move a completion back in time, as if it was tapped that many days ago */
const backdate = (completionId: number, daysAgo: number, hours = 12) =>
  db.prepare('UPDATE task_completions SET completedAt = ? WHERE id = ?').run(iso(daysAgo, hours), completionId);
const lastDone = (taskId: number, daysAgo: number | null) =>
  db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(daysAgo == null ? null : iso(daysAgo), taskId);

async function family(strict = false) {
  const admin = await createAdmin(agent);
  const kidA = await createUser(agent, admin.token, { username: 'kida', displayName: 'Kid A', password: 'pass123', role: 'child' });
  const kidB = await createUser(agent, admin.token, { username: 'kidb', displayName: 'Kid B', password: 'pass123', role: 'child' });
  if (strict) await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Room', roomType: 'other' })).body.id as number;
  const add = async (body: object) => {
    const id = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ effort: 1, customCoins: 10, ...body })).body.id as number;
    db.prepare("UPDATE tasks SET createdAt = datetime('now', '-20 days') WHERE id = ?").run(id);
    return id;
  };
  const both = [kidA.user.id, kidB.user.id];
  return { admin, kidA, kidB, room, add, both };
}

describe('BUG-26: shared chores, one share each', () => {
  it('pays each person once a week, and turns clean when both have done it on different days', async () => {
    const { kidA, kidB, add, both } = await family();
    const task = await add({ name: 'Bathroom', frequencyDays: 7, assignedUserIds: both, assignmentMode: 'shared' });

    const first = await done(kidA.token, task).expect(200);
    backdate(first.body.completionId, 2); // Kid A did it on Monday
    expect(taskRow(task).lastCompletedAt).toBeNull(); // Kid B's share is still open

    expect((await done(kidA.token, task)).body.error).toBe('not_yet_due'); // not again on Wednesday
    expect(coins(kidA.user.id)).toBe(5);

    await done(kidB.token, task).expect(200);
    expect(coins(kidB.user.id)).toBe(5);
    expect(localDateStr(new Date(taskRow(task).lastCompletedAt!))).toBe(localDateStr()); // clean now
    expect((await done(kidA.token, task)).status).toBe(409);
  });

  it("doesn't count someone who isn't on the chore", async () => {
    const { admin, kidA, add, both } = await family();
    const task = await add({ name: 'Bathroom', frequencyDays: 7, assignedUserIds: both, assignmentMode: 'shared' });
    await done(kidA.token, task).expect(200);
    await done(admin.token, task).expect(200);
    expect(taskRow(task).lastCompletedAt).toBeNull(); // Kid B hasn't done theirs
  });

  it("a share lasts one round: a daily chore can be done again tomorrow though the other person never does theirs", async () => {
    const { kidA, add, both } = await family();
    const task = await add({ name: 'Dishes', frequencyDays: 1, assignedUserIds: both, assignmentMode: 'shared' });
    backdate((await done(kidA.token, task).expect(200)).body.completionId, 2);
    await done(kidA.token, task).expect(200);
    expect(coins(kidA.user.id)).toBe(10);
  });

  it('shows whose share is done on later days too', async () => {
    const { admin, kidA, room, add, both } = await family();
    const task = await add({ name: 'Bathroom', frequencyDays: 7, assignedUserIds: both, assignmentMode: 'shared' });
    backdate((await done(kidA.token, task).expect(200)).body.completionId, 2);
    const list = (await agent.get(`/api/rooms/${room}/tasks`).set(auth(admin.token))).body as Array<{ id: number; sharedCompletions: Array<{ userId: number }> }>;
    expect(list.find((t) => t.id === task)!.sharedCompletions.map((c) => c.userId)).toEqual([kidA.user.id]);
    const rooms = (await agent.get('/api/rooms').set(auth(admin.token))).body as Array<{ tasks: Array<{ id: number; sharedCompletions: Array<{ userId: number }> }> }>;
    expect(rooms.flatMap((r) => r.tasks).find((t) => t.id === task)!.sharedCompletions.map((c) => c.userId)).toEqual([kidA.user.id]);
  });

  it('Reset to dirty opens every share again', async () => {
    const { admin, kidA, kidB, add, both } = await family();
    const task = await add({ name: 'Bathroom', frequencyDays: 7, assignedUserIds: both, assignmentMode: 'shared' });
    const a = await done(kidA.token, task).expect(200);
    const b = await done(kidB.token, task).expect(200);
    backdate(a.body.completionId, 1); backdate(b.body.completionId, 1, 13); lastDone(task, 1);
    await agent.post(`/api/tasks/${task}/reset`).set(auth(admin.token)).expect(200);
    await done(kidA.token, task).expect(200);
    await done(kidB.token, task).expect(200);
    expect(localDateStr(new Date(taskRow(task).lastCompletedAt!))).toBe(localDateStr());
  });

  it('undoing the share that finished the round reopens only that share', async () => {
    const { admin, kidA, kidB, add, both } = await family();
    const task = await add({ name: 'Bathroom', frequencyDays: 7, assignedUserIds: both, assignmentMode: 'shared' });
    lastDone(task, 10);
    const before = taskRow(task).lastCompletedAt;
    await done(kidA.token, task).expect(200);
    const b = await done(kidB.token, task).expect(200);
    await agent.delete(`/api/completions/${b.body.completionId}`).set(auth(admin.token)).expect(200);
    expect(taskRow(task).lastCompletedAt).toBe(before); // overdue again, not "done when Kid A did it"
    expect((await done(kidA.token, task)).status).toBe(409); // Kid A's share still stands
    await done(kidB.token, task).expect(200);
    expect(localDateStr(new Date(taskRow(task).lastCompletedAt!))).toBe(localDateStr());
  });
});

describe('BUG-46: undo keeps the last-done date it never changed', () => {
  it('taking back a waiting Done leaves the chore as it was', async () => {
    const { kidA, add } = await family(true);
    const task = await add({ name: 'Plants', frequencyDays: 7 });
    lastDone(task, 10);
    const before = taskRow(task).lastCompletedAt;
    const res = await done(kidA.token, task).expect(200);
    expect(res.body.pendingApproval).toBe(true);
    await agent.delete(`/api/completions/${res.body.completionId}`).set(auth(kidA.token)).expect(200);
    expect(taskRow(task).lastCompletedAt).toBe(before);
  });

  it('undoing an approved Done puts back the date it replaced', async () => {
    const { admin, kidA, add } = await family();
    const task = await add({ name: 'Plants', frequencyDays: 7 });
    lastDone(task, 10); // set with the health slider: no completion behind it
    const before = taskRow(task).lastCompletedAt;
    const res = await done(kidA.token, task).expect(200);
    await agent.delete(`/api/completions/${res.body.completionId}`).set(auth(admin.token)).expect(200);
    expect(taskRow(task).lastCompletedAt).toBe(before);
    expect(coins(kidA.user.id)).toBe(0);
  });

  it('undoing a one-time chore still brings it back', async () => {
    const { admin, kidA, add } = await family();
    const task = await add({ name: 'Fix the door', oneTime: true });
    const res = await done(kidA.token, task).expect(200);
    expect(taskRow(task).archivedAt).toBeTruthy();
    await agent.delete(`/api/completions/${res.body.completionId}`).set(auth(admin.token)).expect(200);
    expect(taskRow(task).archivedAt).toBeNull();
  });
});

describe('BUG-27: rotating chores keep track of the turn', () => {
  it('editing the chore keeps the turn; it only resets when that person leaves the chore', async () => {
    const { admin, kidA, kidB, add, both } = await family();
    const task = await add({ name: 'Trash', frequencyDays: 1, assignedUserIds: both, assignmentMode: 'rotating' });
    await done(kidA.token, task).expect(200);
    expect(taskRow(task).rotationCurrentUserId).toBe(kidB.user.id);

    await agent.put(`/api/tasks/${task}`).set(auth(admin.token)).send({ notes: 'Bins out by 7', assignmentMode: 'rotating', assignedUserIds: both }).expect(200);
    expect(taskRow(task).rotationCurrentUserId).toBe(kidB.user.id);

    await agent.put(`/api/tasks/${task}`).set(auth(admin.token)).send({ assignmentMode: 'rotating', assignedUserIds: [kidA.user.id, admin.user.id] }).expect(200);
    expect(taskRow(task).rotationCurrentUserId).toBe(kidA.user.id);
  });

  it('switching a chore to rotating starts with the first person', async () => {
    const { admin, kidA, kidB, add, both } = await family();
    const task = await add({ name: 'Trash', frequencyDays: 1, assignedUserIds: both });
    await agent.put(`/api/tasks/${task}`).set(auth(admin.token)).send({ assignmentMode: 'rotating', assignedUserIds: [kidB.user.id, kidA.user.id] }).expect(200);
    expect(taskRow(task).rotationCurrentUserId).toBe(kidB.user.id);
  });

  it('undoing a Done gives the turn back', async () => {
    const { admin, kidA, kidB, add, both } = await family();
    const task = await add({ name: 'Trash', frequencyDays: 1, assignedUserIds: both, assignmentMode: 'rotating' });
    const res = await done(kidA.token, task).expect(200);
    expect(taskRow(task).rotationCurrentUserId).toBe(kidB.user.id);
    await agent.delete(`/api/completions/${res.body.completionId}`).set(auth(admin.token)).expect(200);
    expect(taskRow(task).rotationCurrentUserId).toBe(kidA.user.id);
    await done(kidA.token, task).expect(200);
    expect(taskRow(task).rotationCurrentUserId).toBe(kidB.user.id);
  });

  it("taking back a waiting Done doesn't move the turn", async () => {
    const { kidA, add, both } = await family(true);
    const task = await add({ name: 'Trash', frequencyDays: 1, assignedUserIds: both, assignmentMode: 'rotating' });
    const res = await done(kidA.token, task).expect(200);
    await agent.delete(`/api/completions/${res.body.completionId}`).set(auth(kidA.token)).expect(200);
    expect(taskRow(task).rotationCurrentUserId).toBe(kidA.user.id);
  });
});

describe('BUG-28: one chore, one payment', () => {
  it('a Done waiting for approval keeps others from doing the chore again', async () => {
    const { admin, kidA, kidB, add } = await family(true);
    const task = await add({ name: 'Vacuum', frequencyDays: 7 });
    backdate((await done(kidA.token, task).expect(200)).body.completionId, 1);
    expect((await done(kidB.token, task)).body.error).toBe('not_yet_due');
    await agent.post('/api/completions/approve-batch').set(auth(admin.token)).send({ ids: [1] });
    expect(coins(kidA.user.id) + coins(kidB.user.id)).toBe(10);
  });

  it('a daily chore waiting since the day before can be done again', async () => {
    const { kidA, kidB, add } = await family(true);
    const task = await add({ name: 'Dishes', frequencyDays: 1 });
    backdate((await done(kidA.token, task).expect(200)).body.completionId, 2);
    await done(kidB.token, task).expect(200);
  });

  it("a late log can't pay for a weekly chore that was done since", async () => {
    const { admin, add } = await family();
    const weekly = await add({ name: 'Vacuum', frequencyDays: 7 });
    await done(admin.token, weekly).expect(200);
    const late = await done(admin.token, weekly, { doneOn: localDateStr(homeToday(-1, 12)) });
    expect(late.body.error).toBe('not_yet_due');

    const daily = await add({ name: 'Dishes', frequencyDays: 1 });
    await done(admin.token, daily).expect(200);
    await done(admin.token, daily, { doneOn: localDateStr(homeToday(-1, 12)) }).expect(200);
  });
});
