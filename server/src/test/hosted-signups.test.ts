import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type supertest from 'supertest';
import { setEmailTransport, type Email } from '../hosted/email';
import { mainDb } from '../hosted/mainDb';
import { operatorFromEnv } from '../hosted/operator';
import { setCaptchaCheck } from '../hosted/signup';
import { createAdmin, createTestApp } from './setup';

// NEW-30: the operator page opens and closes new-family sign-up; while it's closed the sign-up page takes
// waitlist requests, which the operator page lists. Nothing is emailed.
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const OP_EMAIL = 'op@tidyquest.example';

let agent: supertest.Agent;
let A: string;
let op: string;
let parent: string;
let sent: Email[];

const signup = (extra: object = {}) => agent.post('/api/hosted/signup').send({
  familyName: 'The Okafors', parentName: 'Zoë Okafor', email: 'zoe@example.com', password: 'longpassword', timeZone: 'UTC', ...extra,
});
const join = (extra: object = {}) => agent.post('/api/hosted/waitlist').send({
  familyName: 'The Okafors', parentName: 'Zoë Okafor', email: 'Zoe@Example.com', note: 'Three kids, 4 to 11', language: 'fr', ...extra,
});
const setOpen = (open: unknown, token = op) => agent.post('/api/operator/signups').set(auth(token)).send({ open });
const waitlist = async (query = '') => (await agent.get(`/api/operator/waitlist${query}`).set(auth(op))).body;
const history = async (query = '') => (await agent.get(`/api/operator/history${query}`).set(auth(op))).body;
const families = () => (mainDb().prepare('SELECT COUNT(*) AS n FROM families').get() as { n: number }).n;

beforeEach(async () => {
  const t = createTestApp({ hosted: true });
  agent = t.agent;
  A = t.familyId!;
  parent = (await createAdmin(agent, 'admin', 'admin123', 'Admin A', A)).token;
  vi.stubEnv('OPERATOR_EMAIL', OP_EMAIL);
  vi.stubEnv('OPERATOR_PASSWORD', 'operator-password-1');
  operatorFromEnv();
  vi.unstubAllEnvs();
  op = (await agent.post('/api/operator/login').send({ email: OP_EMAIL, password: 'operator-password-1' })).body.token;
  sent = [];
  setEmailTransport((e) => { sent.push(e); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  setEmailTransport();
  setCaptchaCheck();
});

describe('Opening and closing sign-up', () => {
  it('is open until an operator closes it', async () => {
    expect((await agent.get('/api/hosted/config')).body.signupsOpen).toBe(true);
    expect((await agent.get('/api/operator/signups').set(auth(op))).body).toEqual({ open: true, waiting: 0 });
    expect((await signup()).status).toBe(201);
  });

  it('refuses sign-ups while closed, and takes them again once reopened', async () => {
    expect((await setOpen(false)).body).toEqual({ open: false });
    expect((await agent.get('/api/hosted/config')).body.signupsOpen).toBe(false);
    const before = families();
    const refused = await signup();
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('signups-closed');
    expect(families()).toBe(before);

    expect((await setOpen(true)).body).toEqual({ open: true });
    expect((await signup()).status).toBe(201);
  });

  it('keeps each change in the History, once per change, under Sign-ups', async () => {
    await setOpen(false);
    await setOpen(false); // already closed: nothing new
    await setOpen(true);
    const list = await history('?kind=sign-ups');
    expect(list.entries.map((e: any) => [e.action, e.operatorEmail])).toEqual([['signups-open', OP_EMAIL], ['signups-closed', OP_EMAIL]]);
    // Not sign-ins, not family actions
    const signIns = (await history('?kind=sign-ins')).entries.map((e: any) => e.action);
    expect(signIns).not.toContain('signups-closed');
    expect((await history('?kind=families')).found).toBe(0);
  });

  it('only takes true or false, from an operator', async () => {
    expect((await setOpen('no')).status).toBe(400);
    expect((await agent.post('/api/operator/signups').send({ open: false })).status).toBe(401);
    expect((await setOpen(false, parent)).status).toBe(401); // a family's parent isn't an operator
    expect((await agent.get('/api/hosted/config')).body.signupsOpen).toBe(true);
  });
});

describe('The waitlist', () => {
  beforeEach(async () => { await setOpen(false); });

  it('keeps a request for the operator page and emails no one', async () => {
    expect((await join()).body).toEqual({ ok: true });
    const list = await waitlist();
    expect(list.found).toBe(1);
    expect(list.entries[0]).toMatchObject({
      familyName: 'The Okafors', parentName: 'Zoë Okafor', email: 'zoe@example.com', note: 'Three kids, 4 to 11', language: 'fr', hasFamily: false,
    });
    expect(Date.parse(list.entries[0].at)).not.toBeNaN();
    expect((await agent.get('/api/operator/signups').set(auth(op))).body).toEqual({ open: false, waiting: 1 });
    expect(sent).toEqual([]);
  });

  it('checks what was typed, and the CAPTCHA', async () => {
    expect((await join({ email: 'not-an-email' })).body.code).toBe('bad-email');
    expect((await join({ familyName: '  ' })).status).toBe(400);
    setCaptchaCheck(async (token) => token === 'good');
    expect((await join({ captchaToken: 'bad' })).body.code).toBe('captcha');
    expect((await join({ captchaToken: 'good', note: 'x'.repeat(900), language: 'xx' })).status).toBe(200);
    const [entry] = (await waitlist()).entries;
    expect(entry.note).toHaveLength(500);
    expect(entry.language).toBe('en');
  });

  it('keeps the first request when the same email asks again', async () => {
    await join();
    await join({ email: 'ZOE@example.com', familyName: 'Someone else', note: 'changed' });
    await join({ email: 'sam@example.com', familyName: 'The Lees', note: '' });
    const list = await waitlist();
    expect(list.entries.map((e: any) => [e.email, e.familyName, e.note])).toEqual([
      ['zoe@example.com', 'The Okafors', 'Three kids, 4 to 11'],
      ['sam@example.com', 'The Lees', null],
    ]);
  });

  it('limits requests from one address', async () => {
    for (let i = 0; i < 5; i++) expect((await join({ email: `p${i}@example.com` })).status).toBe(200);
    expect((await join({ email: 'p5@example.com' })).status).toBe(429);
    expect((await waitlist()).found).toBe(5);
  });

  it('shows when a waiting email has signed up since', async () => {
    await join({ email: 'zoe@example.com' });
    await setOpen(true);
    await signup({ email: 'zoe@example.com' });
    expect((await waitlist()).entries[0].hasFamily).toBe(true);
  });

  it('pages through the list, first come first', async () => {
    for (let i = 0; i < 3; i++) await join({ email: `p${i}@example.com` });
    const page = await waitlist('?offset=1&limit=1');
    expect(page.found).toBe(3);
    expect(page.entries.map((e: any) => e.email)).toEqual(['p1@example.com']);
  });

  it('takes an entry off, and keeps that in the History', async () => {
    await join();
    const [entry] = (await waitlist()).entries;
    expect((await agent.post(`/api/operator/waitlist/${entry.id}/remove`).set(auth(op))).body).toEqual({ ok: true });
    expect((await waitlist()).found).toBe(0);
    expect((await agent.post(`/api/operator/waitlist/${entry.id}/remove`).set(auth(op))).status).toBe(404);
    const [removed] = (await history('?kind=sign-ups')).entries;
    expect(removed).toMatchObject({ action: 'waitlist-remove', operatorEmail: OP_EMAIL, familyName: null, detail: 'The Okafors (zoe@example.com)' });
  });

  it('is only for operators', async () => {
    await join();
    expect((await agent.get('/api/operator/waitlist')).status).toBe(401);
    expect((await agent.post('/api/operator/waitlist/1/remove')).status).toBe(401);
  });
});
