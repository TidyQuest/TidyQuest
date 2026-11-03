import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import express, { type Express } from 'express';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { familyDir } from '../hosted/families';
import { addTestFamily, createAdmin, createTestApp, createUser, familyCodeOf } from './setup';

// The isolation sweep (HOSTED.md §11, backlog NEW-14). Family B gets marker text in every table, and its ids
// start above 7,340,000 so they can't be mistaken for A's. Then every GET route is called as A's parent, as
// A's kid and with no login, with A's ids and with B's, and none of B's markers, ids, family id or code may
// come back. B's ids in A's changes and deletes answer 404 and leave B's database and files as they were.
type Db = InstanceType<typeof Database>;
type Login = { user: any; token: string };
type Family = { id: string; db: Db; code: string; marker: string; admin: Login; kid: Login; teen: Login; ids: Record<string, number> };

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const HOUR = 60 * 60 * 1000;
const B_IDS_FROM = 7_340_000;
const B_ID = /(?<![\w.])734\d{4}(?![\w.])/g;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const at = (ms: number) => new Date(Date.now() + ms).toISOString();
const day = (days: number) => at(days * 24 * HOUR).slice(0, 10);

let agent: supertest.Agent;
let app: Express;
let A: Family;
let B: Family;

/** A seeding call, which must work. */
async function step(method: 'post' | 'put' | 'delete', url: string, token: string, body: object = {}): Promise<any> {
  const res = await agent[method](url).set(auth(token)).send(body);
  if (res.status >= 300) throw new Error(`Seeding: ${method.toUpperCase()} ${url} answered ${res.status} ${res.text}`);
  return res.body;
}

/** A family with something in every table, each text saying `marker`. */
async function seed(familyId: string, db: Db, m: string): Promise<Family> {
  const admin = await createAdmin(agent, 'admin', 'admin123', `${m} parent`, familyId);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: `${m} kid`, password: 'pass123', familyId });
  const teen = await createUser(agent, admin.token, { username: 'teen', displayName: `${m} teen`, password: 'pass123', familyId });
  const p = admin.token;
  const k = kid.user.id;
  const ids: Record<string, number> = { users: k };

  await step('put', '/api/features', p, { features: { rescue: true } });
  await step('put', '/api/users/strict-mode-config', p, { strictMode: true });
  await step('put', '/api/leaderboard/family-goal', p, { target: 100, prize: `${m} prize` });
  ids.zones = (await step('post', '/api/zones', p, { name: `${m} zone` })).id;
  ids.rooms = (await step('post', '/api/rooms', p, { name: `${m} room`, roomType: 'other' })).id;
  const chore = async (name: string, extra: object = {}): Promise<number> =>
    (await step('post', `/api/rooms/${ids.rooms}/tasks`, p, { name: `${m} ${name}`, notes: `${m} notes`, effort: 1, ...extra })).id;
  ids.tasks = await chore('chore', { assignedUserIds: [k] });
  const onDemand = await chore('chore on demand', { onDemand: true });
  const snoozed = await chore('snoozed chore');
  const paused = await chore('paused chore');
  const deleted = await chore('deleted chore');
  const rescued = await chore('rescued chore');
  const team1 = await chore('team chore', { customCoins: 20 });
  const team2 = await chore('second team chore', { customCoins: 20 });
  await step('post', '/api/todos', p, { name: `${m} todo`, doBy: day(2), assignedUserIds: [k], customCoins: 15 });

  // Done, approved and cheered; then one waiting for approval, with a proof photo
  const done = await step('post', `/api/tasks/${ids.tasks}/complete`, kid.token, { note: `${m} note` });
  await step('post', `/api/completions/${done.completionId}/approve`, p, { note: `${m} approval` });
  await step('post', '/api/cheers', teen.token, { completionId: done.completionId, emoji: '👏' });
  ids.task_completions = (await step('post', `/api/tasks/${onDemand}/complete`, kid.token, { note: `${m} waiting` })).completionId;
  const photo = await agent.post(`/api/completions/${ids.task_completions}/photo`).set(auth(kid.token))
    .attach('photo', PNG, { filename: 'proof.png', contentType: 'image/png' });
  expect(photo.status, photo.text).toBe(200);
  const avatar = await agent.post(`/api/users/${k}/avatar-upload`).set(auth(p))
    .attach('avatar', PNG, { filename: 'kid.png', contentType: 'image/png' });
  expect(avatar.status, avatar.text).toBe(200);

  await step('post', `/api/tasks/${ids.tasks}/pin`, kid.token);
  await step('post', `/api/tasks/${snoozed}/snooze`, p, { days: 3 });
  await step('post', `/api/tasks/${paused}/pause`, p);
  await step('delete', `/api/tasks/${deleted}`, p);
  ids.trash = (db.prepare('SELECT MAX(id) AS id FROM trash').get() as { id: number }).id;
  await step('put', '/api/rescue', p, { taskId: rescued });

  // Coins, rewards and what they buy
  await step('post', `/api/users/${k}/adjust-coins`, p, { amount: 200, reason: `${m} reason` });
  ids.rewards = (await step('post', '/api/rewards', p, { title: `${m} reward`, description: `${m} description`, costCoins: 10 })).id;
  await step('put', `/api/rewards/${ids.rewards}/rules`, p, { visibleTo: [k], prices: { [k]: 8 } });
  await step('put', `/api/rewards/${ids.rewards}/category`, p, { category: `${m} category` });
  ids.reward_redemptions = (await step('post', `/api/rewards/${ids.rewards}/redeem`, kid.token)).redemption.id;
  const shared = (await step('post', '/api/rewards', p, { title: `${m} shared reward`, costCoins: 50 })).id;
  await step('put', `/api/rewards/${shared}/rules`, p, { isShared: true });
  await step('post', `/api/rewards/${shared}/contribute`, kid.token, { amount: 5 });
  await step('post', '/api/shields/give', p, { userId: k });
  ids.coin_boosts = (await step('post', '/api/boosts', p, { title: `${m} boost`, multiplier: 2, startAt: at(-HOUR), endAt: at(HOUR) })).id;
  ids.custom_badges = (await step('post', '/api/achievements/custom', p,
    { title: `${m} badge`, description: `${m} badge`, metric: 'task_count', threshold: 1, taskIds: [ids.tasks] })).id;
  ids.user_goals = (await step('post', `/api/users/${k}/goals`, p,
    { title: `${m} goal`, goalCoins: 10, startAt: at(-HOUR), endAt: at(48 * HOUR), rewardCoins: 5 })).id;
  await step('put', `/api/notify/people/${k}`, p, { ntfyTopic: `${m.toLowerCase()}-topic` });

  // Team-ups: one for anyone, declined; one with an invite, joined
  const teamupId = (body: any): number => body.id ?? body.teamup?.id;
  const declined = teamupId(await step('post', '/api/teamups', kid.token, { taskId: team1 }));
  await step('post', `/api/teamups/${declined}/decline`, teen.token);
  ids.teamups = teamupId(await step('post', '/api/teamups', kid.token, { taskId: team2, partnerId: teen.user.id }));
  await step('post', `/api/teamups/${ids.teamups}/join`, teen.token);

  // What only the background jobs (and the mascot shop, after hatching) write
  db.prepare('INSERT INTO chore_overdue_days (day, taskId, roomId, dueAt, daysOverdue) VALUES (?, ?, ?, ?, 2)').run(day(-1), ids.tasks, ids.rooms, at(-48 * HOUR));
  db.prepare("INSERT INTO notification_log (sentAt, userId, channel, kind, message, ok, dedupeKey) VALUES (?, ?, 'ntfy', 'reminder', ?, 1, ?)").run(at(-HOUR), k, `${m} sent`, `${m} sent`);
  db.prepare("INSERT INTO notification_queue (userId, kind, message, notBefore, dedupeKey) VALUES (?, 'reminder', ?, ?, ?)").run(k, `${m} queued`, at(HOUR), `${m} queued`);
  db.prepare('INSERT INTO task_due_notifications (taskId, dueDate) VALUES (?, ?)').run(ids.tasks, day(0));
  db.prepare('INSERT INTO user_achievement_notifications (userId, achievementId) VALUES (?, ?)').run(k, `${m} achievement`);
  db.prepare('INSERT INTO mascot_purchases (userId, itemId, price) VALUES (?, ?, 5)').run(k, `${m} item`);

  return { id: familyId, db, code: familyCodeOf(familyId), marker: m, admin, kid, teen, ids };
}

/** B's new rows get ids above B_IDS_FROM. */
function raiseIds(db: Db): void {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%AUTOINCREMENT%'").all() as { name: string }[];
  for (const { name } of tables) {
    db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(name);
    db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(name, B_IDS_FROM);
  }
}

const tablesOf = (db: Db) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((t) => t.name);

/** Everything in B's database and folder, to compare before and after A's changes. */
function snapshot(f: Family): string {
  const tables = Object.fromEntries(tablesOf(f.db).map((t) => [t, f.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
  const files = ['avatars', 'proofs'].map((kind) => fs.readdirSync(path.join(familyDir(f.id), kind)).sort());
  return JSON.stringify({ tables, files });
}

/** Where each router is mounted. Express 5 keeps no mount path on its layers, so note it as routers are
 * added; createApp() mounts them all in beforeAll, after this runs. */
const mounts = new WeakMap<object, string>();
const routerUse = express.Router.prototype.use;
express.Router.prototype.use = function (this: unknown, ...args: any[]) {
  if (typeof args[0] === 'string') for (const fn of args.slice(1).flat()) if (fn) mounts.set(fn, args[0] === '/' ? '' : args[0]);
  return routerUse.apply(this, args as any);
};
afterAll(() => { express.Router.prototype.use = routerUse; });

/** Each route the app answers. */
function routesOf(server: Express): { method: string; path: string }[] {
  const out: { method: string; path: string }[] = [];
  const walk = (stack: any[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) out.push({ method, path: (prefix + layer.route.path).replace(/(.)\/$/, '$1') });
      } else if (layer.name === 'router') walk(layer.handle.stack, prefix + (mounts.get(layer.handle) ?? ''));
    }
  };
  walk((server as any).router.stack, '');
  return out;
}

// Photo links read the photos cookie, not the login header (NEW-29); hosted.test.ts and photo-access.test.ts
// check that another family's cookie, or none, gets a 404.
const NOT_SWEPT = ['/api/files/:familyId/:kind/:name'];
// Changes that answer something else than 404 for an id A doesn't have, and why
const NOT_404: Record<string, number> = {
  'PUT /api/users/:id/settings': 403, // only ever your own: every other id is refused
};
const routes = () => routesOf(app).filter((r) => !NOT_SWEPT.includes(r.path));

/** Which table a route's id belongs to. */
function tableOf(route: string, param: string): string {
  if (param === 'roomId') return 'rooms';
  if (param === 'completionId') return 'task_completions';
  if (param === 'goalId') return 'user_goals';
  if (route.includes('/redemptions/')) return 'reward_redemptions';
  const byPrefix: Record<string, string> = {
    rooms: 'rooms', zones: 'zones', tasks: 'tasks', users: 'users', achievements: 'custom_badges', rewards: 'rewards',
    boosts: 'coin_boosts', trash: 'trash', notify: 'users', teamups: 'teamups',
  };
  const table = byPrefix[route.split('/')[2]];
  if (!table) throw new Error(`The sweep doesn't know what :${param} in ${route} is: add it to tableOf`);
  return table;
}

/** The route with f's ids in place of its parameters. */
function fill(route: string, f: Family): string {
  return route.replace(/:(\w+)/g, (_, param: string) => {
    if (param === 'roomType') return 'other';
    if (route.startsWith('/api/operator/')) return f.id;
    return String(f.ids[tableOf(route, param)]);
  });
}

/** Query parameters that name B every way a request could, which no route may follow. */
const probe = () => new URLSearchParams({
  family: B.id, familyId: B.id, familyCode: B.code, fid: B.id,
  userId: String(B.ids.users), roomId: String(B.ids.rooms), taskId: String(B.ids.tasks), id: String(B.ids.tasks),
}).toString();

/** Anything of B's in a response: markers, family id or code, or ids (other than ones the request named). */
function leaks(text: string, named: string): string[] {
  const found = [B.marker, B.id, B.code].filter((s) => text.includes(s));
  for (const id of text.match(B_ID) ?? []) if (!named.includes(id)) found.push(`id ${id}`);
  return found;
}

beforeAll(async () => {
  const t = createTestApp({ hosted: true });
  agent = t.agent;
  app = t.app;
  A = await seed(t.familyId!, t.db, 'MARKER-A');
  const b = addTestFamily('MARKER-B family');
  raiseIds(b.db);
  B = await seed(b.familyId, b.db, 'MARKER-B');
});

describe("Hosted mode: the isolation sweep (one family never reaches another's data)", () => {
  it('has something of B in every table, and only B ids above 7,340,000', () => {
    const marked = (row: Record<string, unknown>) => Object.values(row).some((v) =>
      typeof v === 'string' ? v.includes(B.marker) || v.includes(B.id) : typeof v === 'number' && v > B_IDS_FROM);
    const empty = tablesOf(B.db).filter((t) => !(B.db.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[]).some(marked));
    expect(empty, 'tables the sweep leaves without B data: seed them in seed()').toEqual([]);
    expect(Math.max(...Object.values(A.ids))).toBeLessThan(B_IDS_FROM);
    expect(Math.min(...Object.values(B.ids))).toBeGreaterThan(B_IDS_FROM);
  });

  it("finds the app's routes", () => {
    const all = routes();
    expect(all.length).toBeGreaterThan(150);
    expect(all.filter((r) => r.method === 'get').length).toBeGreaterThan(45);
    // With its router's mount path in front: a bare "/:id" would answer 404 and the sweep would prove nothing
    expect(all.filter((r) => !r.path.startsWith('/api/'))).toEqual([]);
  });

  it("shows none of B's data to A's parent, A's kid or someone signed out, on any GET route", async () => {
    const seen: string[] = [];
    for (const { path: route } of routes().filter((r) => r.method === 'get')) {
      const urls = [fill(route, A), `${fill(route, A)}?${probe()}`];
      if (route.includes(':')) urls.push(fill(route, B));
      for (const url of urls) {
        for (const [who, token] of [['parent', A.admin.token], ['kid', A.kid.token], ['nobody', '']] as const) {
          const res = token ? await agent.get(url).set(auth(token)) : await agent.get(url);
          if (res.status >= 500) seen.push(`${who} GET ${url}: ${res.status}`);
          for (const leak of leaks(res.text, url)) seen.push(`${who} GET ${url}: ${leak}`);
        }
      }
    }
    expect(seen).toEqual([]);
  });

  it("answers 404 to A's changes and deletes of B's ids, and leaves B as it was", async () => {
    const before = snapshot(B);
    // Enough for each route's checks of the request, so it gets as far as looking the id up
    const body = {
      name: 'Changed by A', title: 'Changed by A', displayName: 'Changed by A', note: 'Changed by A', reason: 'Changed by A',
      effort: 1, costCoins: 1, amount: 1, days: 1, emoji: '👏', role: 'member', status: 'approved', newPassword: 'changed-by-a',
      familyId: B.id, familyCode: B.code,
    };
    const wrong: string[] = [];
    for (const { method, path: route } of routes().filter((r) => r.method !== 'get' && r.path.includes(':'))) {
      const url = fill(route, B);
      const res = await (agent as any)[method](url).set(auth(A.admin.token)).send(body);
      // A family's login can't open the operator page at all
      const expected = route.startsWith('/api/operator/') ? 401 : NOT_404[`${method.toUpperCase()} ${route}`] ?? 404;
      if (res.status !== expected) wrong.push(`${method.toUpperCase()} ${url}: ${res.status} ${res.text.slice(0, 80)}`);
    }
    expect(wrong).toEqual([]);
    expect(snapshot(B)).toBe(before);
  });
});
