import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, photoCookie, familyField } from './setup';
import type supertest from 'supertest';

// BUG-21: logins name people by id, and a backup can give an id to someone else.

let agent: supertest.Agent;

beforeEach(() => {
  ({ agent } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const me = (token: string) => agent.get('/api/auth/me').set(auth(token));
const login = (username: string, password: string) => agent.post('/api/auth/login').send({ username, password, ...familyField() });
// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function family() {
  const admin = await createAdmin(agent);
  const kidA = await createUser(agent, admin.token, { username: 'kida', displayName: 'Kid A', password: 'pass123', role: 'child' });
  const kidB = await createUser(agent, admin.token, { username: 'kidb', displayName: 'Kid B', password: 'pass123', role: 'child' });
  return { admin, kidA, kidB };
}

const exportFile = async (token: string) => (await agent.get('/api/export').set(auth(token))).body;
const importFile = (token: string, backup: object) => agent.post('/api/import').set(auth(token)).send(backup);

describe('Logins after a backup import (BUG-21)', () => {
  it('a phone signed in as the old holder of an id does not open the new holder\'s account', async () => {
    const { admin, kidA, kidB } = await family();
    // A proof photo kid A may not see, for the photos cookie
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Room', roomType: 'other' })).body.id;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 1, onDemand: true })).body.id;
    const done = (await agent.post(`/api/tasks/${task}/complete`).set(auth(kidB.token)).send({})).body.completionId;
    const photo = (await agent.post(`/api/completions/${done}/photo`).set(auth(kidB.token)).attach('photo', PNG, { filename: 'a.png', contentType: 'image/png' })).body.photoUrl;
    const cookieA = await photoCookie(agent, kidA.token);
    expect((await agent.get(photo).set('Cookie', cookieA)).status).toBe(404);

    // The file gives kid A's id to Mom, a parent
    const backup = await exportFile(admin.token);
    backup.users = backup.users.map((u: any) => (u.id === kidA.user.id ? { ...u, username: 'mom', displayName: 'Mom', role: 'admin' } : u));
    expect((await importFile(admin.token, backup)).status).toBe(200);

    expect((await me(kidA.token)).status).toBe(401);
    expect((await agent.get(photo).set('Cookie', cookieA)).status).toBe(404);
    // People whose id didn't change stay signed in
    expect((await me(kidB.token)).status).toBe(200);
    expect((await me(admin.token)).body.username).toBe('admin');
  });

  it('two people trading ids are both signed out, and keep their passwords', async () => {
    const { admin, kidA, kidB } = await family();
    const backup = await exportFile(admin.token);
    backup.users = backup.users.map((u: any) =>
      u.id === kidA.user.id ? { ...u, id: kidB.user.id } : u.id === kidB.user.id ? { ...u, id: kidA.user.id } : u);
    expect((await importFile(admin.token, backup)).status).toBe(200);

    expect((await me(kidA.token)).status).toBe(401);
    expect((await me(kidB.token)).status).toBe(401);
    const again = await login('kida', 'pass123');
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(kidB.user.id);
  });

  it('the importing parent gets a fresh login when the file gives them another id, and nobody gets their password', async () => {
    const { admin, kidA } = await family();
    const backup = await exportFile(admin.token);
    backup.users = backup.users.map((u: any) =>
      u.id === admin.user.id ? { ...u, id: kidA.user.id } : u.id === kidA.user.id ? { ...u, id: admin.user.id } : u);
    const res = await importFile(admin.token, backup);
    expect(res.status).toBe(200);

    // Kid A's tablet is not now signed in as the parent
    expect((await me(kidA.token)).status).toBe(401);
    expect((await me(admin.token)).status).toBe(401);
    const fresh = await me(res.body.token);
    expect(fresh.status).toBe(200);
    expect(fresh.body).toMatchObject({ id: kidA.user.id, username: 'admin' });
    // Kid A now has the parent's old id, with their own password, not the parent's
    expect((await login('kida', 'admin123')).status).toBe(401);
    expect((await login('kida', 'pass123')).body.user.id).toBe(admin.user.id);
  });

  it('a removed person\'s old login does not open someone new at their id', async () => {
    const { admin, kidB } = await family();
    await agent.delete(`/api/users/${kidB.user.id}`).set(auth(admin.token)).expect(200);
    expect((await me(kidB.token)).status).toBe(401);

    const backup = await exportFile(admin.token);
    backup.users.push({ ...backup.users.find((u: any) => u.username === 'kida'), id: kidB.user.id, username: 'cecil', displayName: 'Cecil' });
    expect((await importFile(admin.token, backup)).status).toBe(200);
    expect((await me(kidB.token)).status).toBe(401);
  });

  it('refuses a file that doesn\'t list the importing parent as a parent, and changes nothing', async () => {
    const { admin, kidA } = await family();
    const backup = await exportFile(admin.token);
    const withoutMe = { ...backup, users: backup.users.filter((u: any) => u.username !== 'admin') };
    const res = await importFile(admin.token, withoutMe);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'not-in-backup', username: 'admin' });
    const demoted = { ...backup, users: backup.users.map((u: any) => (u.username === 'admin' ? { ...u, role: 'member' } : u)) };
    expect((await importFile(admin.token, demoted)).body.code).toBe('not-in-backup');

    expect((await me(admin.token)).status).toBe(200);
    expect((await me(kidA.token)).status).toBe(200);
  });
});
