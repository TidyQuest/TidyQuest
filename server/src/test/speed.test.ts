import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import supertest from 'supertest';
import { serveClient } from '../index';
import type Database from 'better-sqlite3';
import { createTestApp, createAdmin, createUser } from './setup';

// ENH-22: compressed answers, and browsers keep the app's files. ENH-19: a faster Home. ENH-20: Home asks
// only when something changed.
let agent: supertest.Agent;
let app: express.Express;
let db: Database.Database;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  ({ agent, app, db } = createTestApp());
});

describe('ENH-22: compression', () => {
  it('a big data answer comes back gzipped and decodes to the same data', async () => {
    const admin = await createAdmin(agent);
    for (let i = 0; i < 5; i++) {
      await agent.post('/api/rooms').set(auth(admin.token)).send({ name: `Room number ${i} with a long name`, roomType: 'other' });
    }
    const plain = await agent.get('/api/rooms').set(auth(admin.token)).set('Accept-Encoding', 'identity');
    expect(plain.status).toBe(200);
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(Number(plain.headers['content-length'] ?? plain.text.length)).toBeGreaterThan(1024);
    const gz = await agent.get('/api/rooms').set(auth(admin.token)).set('Accept-Encoding', 'gzip');
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gz.body).toEqual(plain.body);
    expect(gz.headers['cache-control']).toBe('no-store');
  });
});

describe('ENH-22: cache headers on the app', () => {
  let dir: string;
  let site: supertest.Agent;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-client-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>TidyQuest</title>' + ' '.repeat(4000));
    fs.writeFileSync(path.join(dir, 'sw.js'), 'self.addEventListener("fetch", () => {});');
    fs.writeFileSync(path.join(dir, 'assets', 'app-abc.js'), 'console.log(1);'.repeat(500));
    fs.writeFileSync(path.join(dir, 'icon.png'), Buffer.alloc(5000, 7));
    serveClient(app, dir);
    site = supertest(app);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps /assets/ files for a year and compresses them', async () => {
    const res = await site.get('/assets/app-abc.js').set('Accept-Encoding', 'gzip');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('checks the start page, deep links, sw.js and the version every time', async () => {
    for (const url of ['/', '/index.html', '/rooms/3', '/sw.js']) {
      const res = await site.get(url);
      expect(res.status, url).toBe(200);
      expect(res.headers['cache-control'], url).toBe('no-cache');
    }
    expect((await site.get('/api/version')).headers['cache-control']).toBe('no-store');
  });

  it('does not squeeze a picture again', async () => {
    const res = await site.get('/icon.png').set('Accept-Encoding', 'gzip');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('a missing /assets/ file is still a 404 (BUG-48)', async () => {
    expect((await site.get('/assets/old-123.js')).status).toBe(404);
  });
});

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'cecil', displayName: 'Cecil', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Bathroom', roomType: 'other' })).body.id as number;
  const chore = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Clean Shower', effort: 1, onDemand: true, customCoins: 12 })).body.id as number;
  return { admin, kid, room, chore };
}
const dashboard = (token: string) => agent.get('/api/dashboard').set(auth(token));
const version = async (token: string) => (await agent.get('/api/dashboard/changes').set(auth(token)).expect(200)).body.v as string;

describe('ENH-19: a faster Home', () => {
  it("counts today's chores whatever format their time was stored in, and not older ones", async () => {
    const { admin, kid, chore } = await family();
    const add = (at: string) => db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 5, 'approved')").run(chore, kid.user.id, at);
    add(new Date(Date.now() - 60_000).toISOString().replace('T', ' ').slice(0, 19)); // SQLite's own 'YYYY-MM-DD HH:MM:SS'
    add(new Date(Date.now() - 3 * 24 * 3600_000).toISOString());
    const home = (await dashboard(admin.token)).body;
    expect(home.completedToday).toHaveLength(1);
    expect(home.today).toBeTruthy();
    const roomList = (await agent.get('/api/rooms').set(auth(admin.token))).body;
    expect(roomList).toBeTruthy();
  });

  it('still offers a team-up on a chore anyone can do, and not on one for a single person', async () => {
    const { admin, kid, room, chore } = await family();
    const solo = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Feed Fish', effort: 1, onDemand: true, customCoins: 12, assignedUserIds: [kid.user.id] })).body.id as number;
    const list = (await agent.get(`/api/rooms/${room}/tasks`).set(auth(kid.token)).expect(200)).body as any[];
    expect(list.find((x) => x.id === chore)?.teamUp?.canStart).toBe(true);
    expect(list.find((x) => x.id === solo)?.teamUp?.canStart).toBe(false);
    db.prepare('UPDATE tasks SET showInDashboard = 1 WHERE id IN (?, ?)').run(chore, solo);
    const home = (await dashboard(kid.token)).body;
    expect(home.onDemandQuests.find((x: any) => x.id === chore)?.teamUp?.canStart).toBe(true);
    expect(home.onDemandQuests.find((x: any) => x.id === solo)?.teamUp?.canStart).toBe(false);
  });

  it('a parent opening Home again writes nothing when nothing changed (goals, vacations)', async () => {
    const { admin } = await family();
    await dashboard(admin.token);
    const before = await version(admin.token);
    await dashboard(admin.token);
    await agent.get('/api/achievements').set(auth(admin.token));
    expect(await version(admin.token)).toBe(before);
  });

  it('drops the two copies of other lists nobody reads', async () => {
    const { admin } = await family();
    const home = (await dashboard(admin.token)).body;
    expect(home).not.toHaveProperty('nextTasks');
    expect(home).not.toHaveProperty('todaysQuests');
    expect(home).toHaveProperty('scheduledUpcoming');
  });
});

describe('ENH-20: anything changed?', () => {
  it('needs a sign-in', async () => {
    await agent.get('/api/dashboard/changes').expect(401);
  });

  it('stays put while people only look, and moves when someone does a chore', async () => {
    const { admin, kid, chore } = await family();
    const home = (await dashboard(kid.token)).body;
    const v = await version(kid.token);
    expect(home.dataVersion).toBe(v);
    await agent.get('/api/rooms').set(auth(kid.token));
    await agent.get('/api/leaderboard?period=week').set(auth(admin.token));
    expect(await version(admin.token)).toBe(v);
    await agent.post(`/api/tasks/${chore}/complete`).set(auth(kid.token)).expect(200);
    expect(await version(admin.token)).not.toBe(v);
  });
});
