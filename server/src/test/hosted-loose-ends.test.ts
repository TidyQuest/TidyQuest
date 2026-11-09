import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type supertest from 'supertest';
import { createEmailToken, forgetOldEmailLinks, useEmailToken } from '../hosted/accounts';
import { setEmailTransport, type Email } from '../hosted/email';
import { mainDb } from '../hosted/mainDb';
import { createAdmin, createTestApp, createUser, familyField } from './setup';

// BUG-25: hosted account loose ends.

const DAY = 24 * 60 * 60 * 1000;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
let agent: supertest.Agent;
let A: string;
let admin: { user: any; token: string };
let sent: Email[];
const linkToken = (to: string) => /token=([\w-]+)/.exec([...sent].reverse().find((e) => e.to === to)!.text)?.[1];

beforeEach(async () => {
  const t = createTestApp({ hosted: true });
  agent = t.agent;
  A = t.familyId!;
  admin = await createAdmin(agent, 'admin', 'admin123', 'Admin', A);
  sent = [];
  setEmailTransport((e) => { sent.push(e); });
});
afterEach(() => {
  setEmailTransport();
  vi.useRealTimers();
});

describe('Hosted account loose ends (BUG-25)', () => {
  it('a parent changed to a member lets their sign-in email go', async () => {
    const mom = await createUser(agent, admin.token, { username: 'mom', displayName: 'Mom', password: 'pass1234', role: 'admin', familyId: A });
    await agent.post('/api/hosted/change-email').set(auth(mom.token)).send({ email: 'mom@example.com', password: 'pass1234' }).expect(200);
    await agent.post('/api/hosted/confirm-email').send({ token: linkToken('mom@example.com') }).expect(200);
    expect(mainDb().prepare("SELECT 1 FROM accounts WHERE email = 'mom@example.com'").get()).toBeTruthy();

    await agent.put(`/api/users/${mom.user.id}/role`).set(auth(admin.token)).send({ role: 'member' }).expect(200);
    expect(mainDb().prepare("SELECT 1 FROM accounts WHERE email = 'mom@example.com'").get()).toBeUndefined();
    // No reset link goes out, and the address is free again
    sent = [];
    await agent.post('/api/hosted/forgot-password').send({ email: 'mom@example.com' }).expect(200);
    expect(sent).toEqual([]);
    expect((await agent.post('/api/hosted/change-email').set(auth(admin.token)).send({ email: 'mom@example.com', password: 'admin123' })).status).toBe(200);
    // She still signs in with the family code
    expect((await agent.post('/api/auth/login').send({ username: 'mom', password: 'pass1234', ...familyField(A) })).status).toBe(200);
  });

  it('deletes used and expired email links every day, and keeps live ones', () => {
    const now = new Date();
    const link = (kind: 'reset' | 'confirm', at = now) =>
      createEmailToken({ kind, familyId: A, userId: admin.user.id, email: `admin@${A}.example`, newEmail: null }, at);
    const used = link('reset');
    expect(useEmailToken(used, ['reset'], now)).toBeTruthy();
    link('reset', new Date(now.getTime() - 2 * DAY)); // a reset link lasts an hour
    link('confirm');
    const before = (mainDb().prepare('SELECT COUNT(*) AS n FROM email_tokens WHERE familyId = ?').get(A) as { n: number }).n;
    expect(forgetOldEmailLinks(now)).toBe(before - 1);
    expect(mainDb().prepare('SELECT kind FROM email_tokens WHERE familyId = ?').all(A)).toEqual([{ kind: 'confirm' }]);
  });

  it('counts only a sign-in that works as the family using TidyQuest', async () => {
    const OLD = '2026-01-01T00:00:00.000Z';
    const lastActive = () => (mainDb().prepare('SELECT lastActiveAt FROM families WHERE id = ?').get(A) as { lastActiveAt: string }).lastActiveAt;
    mainDb().prepare('UPDATE families SET lastActiveAt = ? WHERE id = ?').run(OLD, A);
    // Two hours on: activity is saved at most once an hour
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);

    await agent.post('/api/auth/login').send({ email: `admin@${A}.example`, password: 'guess' }).expect(401);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'guess', ...familyField(A) }).expect(401);
    await agent.post('/api/hosted/forgot-password').send({ email: `admin@${A}.example` }).expect(200);
    expect(lastActive()).toBe(OLD);

    await agent.post('/api/auth/login').send({ email: `admin@${A}.example`, password: 'admin123' }).expect(200);
    expect(lastActive()).not.toBe(OLD);
  });
});
