import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, familyField, photoCookie as cookieOf } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { isHosted } from '../hosted/context';

// NEW-29: proof photos (and hosted avatars) load only with the photos cookie of someone allowed to see them.
// Runs self-hosted, and as one hosted family under HOSTED=1; hosted.test.ts covers other families and suspension.

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** The photos cookie from an answer, as a Cookie header value ('' when it set none). */
function cookieFrom(res: supertest.Response): string {
  const set = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('tq_files='));
  return set ? set.split(';')[0] : '';
}

const photoCookie = (token: string) => cookieOf(agent, token);

const load = (url: string, cookie?: string) => {
  const req = agent.get(url);
  return cookie ? req.set('Cookie', cookie) : req;
};

async function family() {
  const admin = await createAdmin(agent);
  const kidA = await createUser(agent, admin.token, { username: 'kida', displayName: 'Kid A', password: 'pass123', role: 'child' });
  const kidB = await createUser(agent, admin.token, { username: 'kidb', displayName: 'Kid B', password: 'pass123', role: 'child' });
  await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Room', roomType: 'other' })).body.id as number;
  const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Homework', effort: 1, onDemand: true })).body.id as number;
  const done = await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token)).send({});
  const up = await agent.post(`/api/completions/${done.body.completionId}/photo`).set(auth(kidA.token))
    .attach('photo', PNG, { filename: 'card.png', contentType: 'image/png' });
  expect(up.status).toBe(200);
  return { admin, kidA, kidB, task, completionId: done.body.completionId as number, url: up.body.photoUrl as string };
}

describe('Proof photos need the photos cookie (NEW-29)', () => {
  it('opens for the parent and the kid who did it, not for a sibling or without the cookie', async () => {
    const f = await family();
    const ok = await load(f.url, await photoCookie(f.admin.token));
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('private, no-cache');
    expect((await load(f.url, await photoCookie(f.kidA.token))).status).toBe(200);
    expect((await load(f.url, await photoCookie(f.kidB.token))).status).toBe(404);
    expect((await load(f.url)).status).toBe(404);
    // The login header doesn't open photos, and the login token doesn't work as the cookie
    expect((await load(f.url).set(auth(f.admin.token))).status).toBe(404);
    expect((await load(f.url, `tq_files=${f.admin.token}`)).status).toBe(404);
  });

  it('opens for a partner on a team-up or a shared chore that day', async () => {
    const f = await family();
    const kidB = await photoCookie(f.kidB.token);
    const partner = db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0, 'approved')");
    const row = partner.run(f.task, f.kidB.user.id).lastInsertRowid;
    expect((await load(f.url, kidB)).status).toBe(404);
    db.prepare("UPDATE tasks SET assignmentMode = 'shared' WHERE id = ?").run(f.task);
    expect((await load(f.url, kidB)).status).toBe(200);
    // A team-up is matched by its id, not the day
    db.prepare('UPDATE task_completions SET teamupId = 7 WHERE id = ?').run(f.completionId);
    expect((await load(f.url, kidB)).status).toBe(404);
    db.prepare('UPDATE task_completions SET teamupId = 7 WHERE id = ?').run(row);
    expect((await load(f.url, kidB)).status).toBe(200);
  });

  it("matches a shared chore's partner by the family's day, not the UTC day (BUG-31)", async () => {
    const f = await family();
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('timeZone', 'America/Los_Angeles')").run();
    db.prepare("UPDATE tasks SET assignmentMode = 'shared' WHERE id = ?").run(f.task);
    const kidB = await photoCookie(f.kidB.token);
    const at = (id: number | bigint, iso: string) => db.prepare('UPDATE task_completions SET completedAt = ? WHERE id = ?').run(iso, id);
    const row = db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, '', 0, 'approved')")
      .run(f.task, f.kidB.user.id).lastInsertRowid;
    // 3:50 pm and 4:10 pm in Los Angeles: the same family day, different UTC days
    at(f.completionId, '2026-11-08T23:50:00.000Z');
    at(row, '2026-11-09T00:10:00.000Z');
    expect((await load(f.url, kidB)).status).toBe(200);
    // 11:50 pm and 12:10 am: the same UTC day, different family days
    at(f.completionId, '2026-11-09T07:50:00.000Z');
    at(row, '2026-11-09T08:10:00.000Z');
    expect((await load(f.url, kidB)).status).toBe(404);
  });

  it('is set at login as a cookie scripts and other sites can’t use, and cleared by Log out', async () => {
    await createAdmin(agent);
    const login = await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123', ...familyField() });
    const set = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith('tq_files='));
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Strict/);
    expect(set).toMatch(isHosted() ? /Path=\/api\/files/ : /Path=\/api\/proofs/);
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);
    const cleared = ([] as string[]).concat(out.headers['set-cookie'] ?? []).find((c) => c.startsWith('tq_files='));
    expect(cleared).toMatch(/^tq_files=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('stops working after "Log out everywhere else", and the new login gets a new one', async () => {
    const f = await family();
    const before = await photoCookie(f.kidA.token);
    const others = await agent.post('/api/auth/logout-others').set(auth(f.kidA.token));
    expect(others.status).toBe(200);
    expect((await load(f.url, before)).status).toBe(404);
    expect((await load(f.url, cookieFrom(others))).status).toBe(200);
  });

  it('keeps self-hosted avatars open for the login screen; hosted ones need the cookie', async () => {
    const admin = await createAdmin(agent);
    const up = await agent.post(`/api/users/${admin.user.id}/avatar-upload`).set(auth(admin.token))
      .attach('avatar', PNG, { filename: 'me.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect((await load(up.body.avatarPhotoUrl)).status).toBe(isHosted() ? 404 : 200);
    expect((await load(up.body.avatarPhotoUrl, await photoCookie(admin.token))).status).toBe(200);
  });
});
