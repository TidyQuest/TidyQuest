import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { dateStr } from '../utils/clock';

// The Today page (ENH-26): /api/dashboard sorts every chore into Overdue, Today, Any time or Later.

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 86400000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
// A do-by date on the family's clock (CI also runs with the family in another time zone)
const day = (plus: number) => dateStr(Date.now() + plus * DAY);

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'House', roomType: 'other' })).body.id as number;
  const mk = async (name: string, body: object) => (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name, effort: 1, ...body })).body.id as number;
  const last = (id: number, when: string) => db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(when, id);
  return { admin, kid, room, mk, last };
}
const today = async (token: string) => (await agent.get('/api/dashboard').set(auth(token))).body.today;
const names = (list: any[]) => list.map((q) => q.name);

describe('Today page lists', () => {
  it('sorts chores into Overdue, Today, Any time and Later', async () => {
    const { kid, mk, last } = await family();
    const late = await mk('Unload the dishwasher', { frequencyDays: 1 });
    const later = await mk('Mop', { frequencyDays: 7 });
    const far = await mk('Wash windows', { frequencyDays: 90 });
    await mk('Brand new', { frequencyDays: 7 }); // never done, added today: due today
    await mk('Wash the car', { onDemand: true, showInDashboard: true });
    await mk('Hidden anytime', { onDemand: true, showInDashboard: false });
    last(late, ago(3.5));  // due 2.5 days ago
    last(later, ago(2));   // due in 5 days
    last(far, ago(1));     // due in 89 days: beyond the next 30
    const t = await today(kid.token);
    expect(t.overdue.map((q: any) => [q.name, q.overdueDays >= 2 && q.overdueDays <= 3])).toEqual([['Unload the dishwasher', true]]);
    expect(names(t.today)).toEqual(['Brand new']);
    expect(names(t.anytime)).toEqual(['Wash the car']);
    expect(names(t.later)).toEqual(['Mop']);
  });

  it('is not cut off at ten chores', async () => {
    const { kid, mk, last } = await family();
    for (let i = 0; i < 14; i++) last(await mk(`Chore ${i}`, { frequencyDays: 1 }), ago(3));
    expect((await today(kid.token)).overdue).toHaveLength(14);
  });

  it('counts a chore never done as overdue from the day after it was added', async () => {
    const { kid, mk } = await family();
    const id = await mk('Dust shelves', { frequencyDays: 7 });
    db.prepare('UPDATE tasks SET createdAt = ? WHERE id = ?').run(ago(3), id);
    const t = await today(kid.token);
    expect(t.overdue.map((q: any) => [q.name, q.overdueDays])).toEqual([['Dust shelves', 3]]);
    expect(t.today).toEqual([]);
  });

  it('puts to-dos by their do-by date, and ones without a date under Any time', async () => {
    const { admin, kid } = await family();
    const add = (name: string, doBy?: string) => agent.post('/api/todos').set(auth(admin.token)).send({ name, doBy }).expect(201);
    await add('Fix the screen door');
    await add('Return library books', day(0));
    await add('Buy a gift', day(5));
    await add('Renew passport', day(60));
    db.prepare("INSERT INTO tasks (roomId, name, effort, frequencyDays, oneTime, doBy) SELECT roomId, 'Call the plumber', 1, 1, 1, ? FROM tasks WHERE oneTime = 1 LIMIT 1").run(day(-2));
    const t = await today(kid.token);
    expect(t.overdue.map((q: any) => [q.name, q.overdueDays])).toEqual([['Call the plumber', 2]]);
    expect(names(t.today)).toEqual(['Return library books']);
    expect(names(t.anytime)).toEqual(['Fix the screen door']);
    expect(names(t.later)).toEqual(['Buy a gift']);

    await agent.put('/api/features').set(auth(admin.token)).send({ features: { todos: false } }).expect(200);
    const off = await today(kid.token);
    expect([...off.overdue, ...off.today, ...off.anytime, ...off.later]).toEqual([]);
  });

  it('moves a snoozed overdue chore to Later for that person only, and marks pins', async () => {
    const { admin, kid, mk, last } = await family();
    const id = await mk('Scoop the litter', { frequencyDays: 1 });
    last(id, ago(4));
    await agent.post(`/api/tasks/${id}/snooze`).set(auth(kid.token)).send({ days: 3 }).expect(200);
    await agent.post(`/api/tasks/${id}/pin`).set(auth(admin.token)).expect(200);
    const mine = await today(kid.token);
    expect(mine.overdue).toEqual([]);
    expect(mine.later.map((q: any) => [q.name, q.snoozed, !!q.pinned])).toEqual([['Scoop the litter', true, false]]);
    const dads = await today(admin.token);
    expect(dads.overdue.map((q: any) => [q.name, q.pinned])).toEqual([['Scoop the litter', true]]);
    await agent.delete(`/api/tasks/${id}/snooze`).set(auth(kid.token)).expect(200);
    expect(names((await today(kid.token)).overdue)).toEqual(['Scoop the litter']);
  });

  it('lists a chore due later today only when it may be done early', async () => {
    const { kid, mk, last } = await family();
    const early = await mk('Evening reset', { frequencyDays: 1, allowEarlyCompletion: true });
    const fixed = await mk('Take out trash', { frequencyDays: 1 });
    // Both come due one minute from now (so later today, unless the test runs in the last minute of the day)
    const soon = new Date(Date.now() - DAY + 60000);
    if (dateStr(Date.now() + 60000) === dateStr()) {
      last(early, soon.toISOString()); last(fixed, soon.toISOString());
      const t = await today(kid.token);
      expect(names(t.today)).toEqual(['Evening reset']);
      expect(names(t.later)).toEqual(['Take out trash']);
    }
  });
});
