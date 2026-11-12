import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import type Database from 'better-sqlite3';
import { serveClient, stopServer } from '../index';
import { createTestApp, createAdmin, createUser, tokenFamily, HOSTED_RUN } from './setup';

// Batch S3 (2026-11-08 code sweep): staying signed in, updates and restarts
let agent: supertest.Agent;
let db: Database.Database;
let app: express.Express;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const me = (token: string) => agent.get('/api/auth/me').set(auth(token));
const DAY = 24 * 60 * 60;
/** This person's login token as it was signed so many days ago. */
const tokenFrom = (person: { user: { id: number }; token: string }, daysAgo: number) =>
  jwt.sign({ userId: person.user.id, v: (jwt.decode(person.token) as { v: number }).v, iat: Math.floor(Date.now() / 1000) - daysAgo * DAY, ...tokenFamily() }, process.env.JWT_SECRET!, { expiresIn: '30d' });

beforeEach(() => {
  ({ agent, db, app } = createTestApp());
});

describe('BUG-47: the sign-in renews itself', () => {
  it('a token signed 29 days ago comes back renewed for another 30 days', async () => {
    const admin = await createAdmin(agent);
    const res = await me(tokenFrom(admin, 29));
    expect(res.status).toBe(200);
    expect(res.body.renewedToken).toBeTruthy();
    const fresh = jwt.decode(res.body.renewedToken) as { exp: number; userId: number };
    expect(fresh.userId).toBe(admin.user.id);
    expect(fresh.exp - Date.now() / 1000).toBeGreaterThan(29 * DAY);
    const again = await me(res.body.renewedToken);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(admin.user.id);
  });

  it('a token from today is left alone', async () => {
    const admin = await createAdmin(agent);
    const res = await me(admin.token);
    expect(res.status).toBe(200);
    expect(res.body.renewedToken).toBeUndefined();
  });

  it('a token from before "Log out everywhere" is refused, not renewed', async () => {
    const admin = await createAdmin(agent);
    const old = tokenFrom(admin, 5);
    expect((await me(old)).body.renewedToken).toBeTruthy();
    await agent.post('/api/auth/logout-others').set(auth(admin.token)).expect(200);
    const res = await me(old);
    expect(res.status).toBe(401);
    expect(res.body.renewedToken).toBeUndefined();
  });

  it('a token past its 30 days is still refused', async () => {
    const admin = await createAdmin(agent);
    expect((await me(tokenFrom(admin, 31))).status).toBe(401);
  });
});

describe('BUG-48: updates and restarts', () => {
  let dir: string;
  let site: supertest.Agent;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-client-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>TidyQuest</title>');
    fs.writeFileSync(path.join(dir, 'assets', 'app-abc.js'), 'console.log(1)');
    serveClient(app, dir);
    site = supertest(app);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('serves the app and its pieces', async () => {
    const piece = await site.get('/assets/app-abc.js');
    expect(piece.status).toBe(200);
    expect(piece.text).toContain('console.log');
    const page = await site.get('/rooms/3');
    expect(page.status).toBe(200);
    expect(page.text).toContain('TidyQuest');
  });

  it('answers "not found" for a piece of an older version, not the home page', async () => {
    const res = await site.get('/assets/guide.fr-old123.js');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('<title>');
  });

  it.skipIf(HOSTED_RUN)('stopping the server lets a running request finish, then closes the database', async () => {
    let release = () => {};
    const slowApp = express();
    slowApp.get('/slow', (_req, res) => { release = () => res.json({ ok: true }); });
    const server = http.createServer(slowApp);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    const inFlight = fetch(`http://127.0.0.1:${port}/slow`).then((r) => r.json());
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stopped = stopServer(server);
    expect(server.listening).toBe(false);
    release();
    expect(await inFlight).toEqual({ ok: true });
    await stopped;
    expect(db.open).toBe(false);
  });
});

describe('BUG-37: no Done that will be refused', () => {
  it("keeps a take-turns chore out of One thing at a time while it's a sibling's turn", async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'cecil', displayName: 'Cecil', password: 'pass123', role: 'child' });
    const twin = await createUser(agent, admin.token, { username: 'cylis', displayName: 'Cylis', password: 'pass123', role: 'child' });
    const roomId = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'House', roomType: 'other' })).body.id as number;
    const taskId = (await agent.post(`/api/rooms/${roomId}/tasks`).set(auth(admin.token))
      .send({ name: 'Feed the dog', effort: 1, frequencyDays: 1, health: 0, assignedUserIds: [kid.user.id, twin.user.id], assignmentMode: 'rotating' }).expect(201)).body.id as number;
    const line = async (token: string) => ((await agent.get('/api/dashboard').set(auth(token)).expect(200)).body.focus.line as { id: number }[]).map((t) => t.id);

    const lines = { [kid.user.id]: await line(kid.token), [twin.user.id]: await line(twin.token) };
    const turn = (db.prepare('SELECT rotationCurrentUserId FROM tasks WHERE id = ?').get(taskId) as { rotationCurrentUserId: number }).rotationCurrentUserId;
    const waiting = turn === kid.user.id ? twin : kid;
    expect(lines[turn]).toEqual([taskId]);
    expect(lines[waiting.user.id]).toEqual([]);
    // ...and the server would have refused it
    await agent.post(`/api/tasks/${taskId}/complete`).set(auth(waiting.token)).send({}).expect(409);
  });
});
