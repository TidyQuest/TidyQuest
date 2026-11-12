import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type supertest from 'supertest';
import { setEmailTransport } from '../hosted/email';
import { setHosted } from '../hosted/context';
import { HOSTED_RUN, createAdmin, createTestApp, createUser } from './setup';

// BUG-24: hosted parents sign in by email from anywhere, so wherever a parent's password is set it needs 8
// characters, as at sign-up and with the reset link. Everyone else, and self-hosted parents, need 4.

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
let agent: supertest.Agent;
let admin: { user: any; token: string };
let A: string | undefined;

const addPerson = (role: string, password: string, username = `${role}x`) =>
  agent.post('/api/users').set(auth(admin.token)).send({ username, displayName: username, password, role });

describe('Hosted: a parent\'s password needs 8 characters wherever it is set', () => {
  beforeEach(async () => {
    const t = createTestApp({ hosted: true });
    agent = t.agent;
    A = t.familyId;
    admin = await createAdmin(agent, 'admin', 'admin123', 'Admin', A);
    setEmailTransport(() => {});
  });
  afterEach(() => setEmailTransport());

  it('when adding a parent; kids still need 4', async () => {
    const res = await addPerson('admin', 'short12');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'short-password', min: 8 });
    expect((await addPerson('admin', 'longer123')).status).toBe(201);
    expect((await addPerson('child', 'ab')).body).toMatchObject({ code: 'short-password', min: 4 });
    expect((await addPerson('child', 'abcd')).status).toBe(201);
  });

  it('when a parent changes their own password, or another parent\'s', async () => {
    const own = await agent.put(`/api/users/${admin.user.id}/password`).set(auth(admin.token)).send({ currentPassword: 'admin123', newPassword: 'short12' });
    expect(own.status).toBe(400);
    expect(own.body).toMatchObject({ code: 'short-password', min: 8 });
    const mom = (await addPerson('admin', 'longer123', 'mom')).body;
    expect((await agent.put(`/api/users/${mom.id}/password`).set(auth(admin.token)).send({ newPassword: 'mom1' })).body.code).toBe('short-password');
    const kid = (await addPerson('child', 'abcd', 'kid')).body;
    expect((await agent.put(`/api/users/${kid.id}/password`).set(auth(admin.token)).send({ newPassword: 'kid2' })).status).toBe(200);
  });

  it('in the setup wizard, for the grown-ups', async () => {
    const res = await agent.post('/api/setup').set(auth(admin.token)).send({
      people: [{ ref: 'me', kind: 'adult' }, { ref: 'dad', kind: 'adult', displayName: 'Dad', username: 'dad', password: 'dad1' }],
      rooms: [], chores: [], rewards: [],
    });
    expect(res.body.code).toBe('password_needed');
  });

  it('before a parent made from a kid adds a sign-in email', async () => {
    const kid = await createUser(agent, admin.token, { username: 'teen', displayName: 'Teen', password: 'teen', role: 'child', familyId: A });
    await agent.put(`/api/users/${kid.user.id}/role`).set(auth(admin.token)).send({ role: 'admin' }).expect(200);
    const res = await agent.post('/api/hosted/change-email').set(auth(kid.token)).send({ email: 'teen@example.com', password: 'teen' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('change-password-first');
  });
});

describe.skipIf(HOSTED_RUN)('Self-hosted: 4 characters for everyone', () => {
  beforeEach(async () => {
    setHosted(false);
    ({ agent } = createTestApp());
    admin = await createAdmin(agent);
  });

  it('takes a 4-character parent password, and no longer a shorter one when adding someone', async () => {
    expect((await addPerson('admin', 'abcd')).status).toBe(201);
    expect((await addPerson('child', 'abc')).body).toMatchObject({ code: 'short-password', min: 4 });
  });
});
