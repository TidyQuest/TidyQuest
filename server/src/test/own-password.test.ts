import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type supertest from 'supertest';
import { setEmailTransport } from '../hosted/email';
import { familyStatusOf } from '../hosted/families';
import { mainDb } from '../hosted/mainDb';
import { createAdmin, createTestApp, familyField } from './setup';

// BUG-23: wrong passwords typed by someone already signed in (changing their password or email, deleting the
// family) count, 5 in 15 minutes, like failed logins.

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
let agent: supertest.Agent;

describe('Changing your own password', () => {
  let admin: { user: any; token: string };
  beforeEach(async () => {
    ({ agent } = createTestApp());
    admin = await createAdmin(agent);
  });
  const change = (currentPassword: string, newPassword = 'newpass123') =>
    agent.put(`/api/users/${admin.user.id}/password`).set(auth(admin.token)).send({ currentPassword, newPassword });

  it('stops checking after 5 wrong current passwords, even the right one', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await change('guess' + i);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('wrong-password');
    }
    const blocked = await change('admin123');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('too-many-tries');
    // Still the old password, and still signed in on this device
    expect((await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123', ...familyField() })).status).toBe(200);
    expect((await agent.get('/api/auth/me').set(auth(admin.token))).status).toBe(200);
  });

  it('starts counting again after the right password', async () => {
    for (let i = 0; i < 4; i++) expect((await change('guess' + i)).status).toBe(403);
    const ok = await change('admin123');
    expect(ok.status).toBe(200);
    admin.token = ok.body.token;
    for (let i = 0; i < 4; i++) expect((await change('guess' + i)).status).toBe(403);
  });
});

describe('Hosted: changing the email and deleting the family', () => {
  let A: string;
  let admin: { user: any; token: string };
  beforeEach(async () => {
    const t = createTestApp({ hosted: true });
    agent = t.agent;
    A = t.familyId!;
    admin = await createAdmin(agent, 'admin', 'admin123', 'Admin A', A);
    setEmailTransport(() => {});
  });
  afterEach(() => setEmailTransport());

  const changeEmail = (password: string) =>
    agent.post('/api/hosted/change-email').set(auth(admin.token)).send({ email: 'new@example.com', password });

  it('counts wrong passwords when changing the email', async () => {
    for (let i = 0; i < 5; i++) expect((await changeEmail('guess' + i)).body.code).toBe('wrong-password');
    const blocked = await changeEmail('admin123');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('too-many-tries');
  });

  it('shares the count with deleting the family', async () => {
    for (let i = 0; i < 5; i++) expect((await changeEmail('guess' + i)).status).toBe(400);
    const name = (mainDb().prepare('SELECT name FROM families WHERE id = ?').get(A) as { name: string }).name;
    const del = await agent.post('/api/hosted/delete-family').set(auth(admin.token)).send({ name, password: 'admin123' });
    expect(del.status).toBe(429);
    expect(familyStatusOf(A)).not.toBe('deleted');
  });
});
