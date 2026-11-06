import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import supertest from 'supertest';
import { setHosted } from '../hosted/context';
import { setEmailTransport, type Email } from '../hosted/email';
import db from '../database';
import { runInFamily } from '../hosted/context';
import { createFamily, deleteFamily, familyDir, openFamily, purgeDeletedFamilies } from '../hosted/families';
import { recordOperatorAction } from '../hosted/operatorHistory';
import { dataDir, mainDb } from '../hosted/mainDb';
import { operatorFromEnv } from '../hosted/operator';
import { HOSTED_RUN, addTestFamily, createAdmin, createTestApp, createUser } from './setup';

// Hosted step 7 (NEW-13): the operator page's accounts, its own tokens, the family list and its actions;
// the History of those actions (NEW-24); restoring a deleted family (NEW-23).
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 24 * 60 * 60 * 1000;
const OP_EMAIL = 'op@tidyquest.example';
const OP_PASSWORD = 'operator-password-1';

let agent: supertest.Agent;
let A: string;
let B: string;
let adminA: { user: any; token: string };
let sent: Email[];

function makeOperator(email = OP_EMAIL, password = OP_PASSWORD) {
  vi.stubEnv('OPERATOR_EMAIL', email);
  vi.stubEnv('OPERATOR_PASSWORD', password);
  operatorFromEnv();
  vi.unstubAllEnvs();
}

async function operatorToken(email = OP_EMAIL, password = OP_PASSWORD): Promise<string> {
  const res = await agent.post('/api/operator/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

const families = async (token: string, query = '') => (await agent.get(`/api/operator/families${query}`).set(auth(token))).body;
const familyOf = async (token: string, id: string, query = '') => (await families(token, query)).families.find((f: any) => f.id === id);
const history = async (token: string, query = '') => (await agent.get(`/api/operator/history${query}`).set(auth(token))).body;
const actions = (list: { entries: { action: string }[] }) => list.entries.map((e) => e.action);

beforeEach(async () => {
  const t = createTestApp({ hosted: true });
  agent = t.agent;
  A = t.familyId!;
  ({ familyId: B } = addTestFamily('The Bakers'));
  adminA = await createAdmin(agent, 'admin', 'admin123', 'Admin A', A);
  await createAdmin(agent, 'admin', 'admin123', 'Admin B', B);
  sent = [];
  setEmailTransport((e) => { sent.push(e); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setEmailTransport();
});

describe('Operator accounts from the compose file', () => {
  it('makes the account once, and a changed password signs it out everywhere', async () => {
    makeOperator();
    expect(mainDb().prepare('SELECT COUNT(*) AS n FROM operators').get()).toEqual({ n: 1 });
    const token = await operatorToken();
    makeOperator(); // the same password: nothing changes
    expect((await agent.get('/api/operator/me').set(auth(token))).body.email).toBe(OP_EMAIL);

    makeOperator(OP_EMAIL, 'a-brand-new-password');
    expect(mainDb().prepare('SELECT COUNT(*) AS n FROM operators').get()).toEqual({ n: 1 });
    expect((await agent.get('/api/operator/me').set(auth(token))).status).toBe(401);
    expect((await agent.post('/api/operator/login').send({ email: OP_EMAIL, password: OP_PASSWORD })).status).toBe(401);
    await operatorToken(OP_EMAIL, 'a-brand-new-password');
  });

  it('refuses a short password or a bad email, and does nothing when unset', () => {
    makeOperator(OP_EMAIL, 'short');
    makeOperator('not an email', OP_PASSWORD);
    operatorFromEnv();
    expect(mainDb().prepare('SELECT COUNT(*) AS n FROM operators').get()).toEqual({ n: 0 });
  });
});

describe('Operator login and tokens', () => {
  beforeEach(() => makeOperator());

  it('turns away a wrong password and an unknown email alike, then throttles', async () => {
    const wrong = await agent.post('/api/operator/login').send({ email: OP_EMAIL, password: 'nope' });
    const unknown = await agent.post('/api/operator/login').send({ email: 'who@example.com', password: OP_PASSWORD });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body.error).toBe(unknown.body.error);
    for (let i = 0; i < 9; i++) await agent.post('/api/operator/login').send({ email: OP_EMAIL, password: 'nope' });
    expect((await agent.post('/api/operator/login').send({ email: OP_EMAIL, password: OP_PASSWORD })).status).toBe(429);
  });

  it("a family's token can't open the operator page, and an operator's token can't open a family", async () => {
    const op = await operatorToken();
    expect((await agent.get('/api/operator/families').set(auth(adminA.token))).status).toBe(401);
    expect((await agent.post(`/api/operator/families/${B}/suspend`).set(auth(adminA.token))).status).toBe(401);
    expect((await agent.get('/api/operator/history').set(auth(adminA.token))).status).toBe(401);
    expect((await agent.get('/api/operator/families')).status).toBe(401);
    for (const url of ['/api/auth/me', '/api/hosted/account', '/api/dashboard', '/api/export']) {
      expect((await agent.get(url).set(auth(op))).status).toBe(401);
    }
  });

  it('Sign out ends every operator session; a new password keeps only this one', async () => {
    const one = await operatorToken();
    const two = await operatorToken();
    expect((await agent.post('/api/operator/password').set(auth(one)).send({ current: 'wrong', password: 'another-long-password' })).status).toBe(400);
    expect((await agent.post('/api/operator/password').set(auth(one)).send({ current: OP_PASSWORD, password: 'short' })).status).toBe(400);
    const changed = await agent.post('/api/operator/password').set(auth(one)).send({ current: OP_PASSWORD, password: 'another-long-password' });
    expect(changed.status).toBe(200);
    expect((await agent.get('/api/operator/me').set(auth(two))).status).toBe(401);
    const three = changed.body.token;
    expect((await agent.get('/api/operator/me').set(auth(three))).status).toBe(200);
    await agent.post('/api/operator/logout').set(auth(three));
    expect((await agent.get('/api/operator/me').set(auth(three))).status).toBe(401);
  });
});

describe('The family list', () => {
  let op: string;
  beforeEach(async () => {
    makeOperator();
    op = await operatorToken();
  });

  it('shows each family with people, storage, status, plan and parents, nothing from inside', async () => {
    await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid A', password: 'kid12345', role: 'child', familyId: A });
    fs.writeFileSync(path.join(dataDir(), 'families', A, 'proofs', 'photo.png'), Buffer.alloc(2048));
    const list = await families(op);
    expect(list.totals).toMatchObject({ trial: 2, active: 0, suspended: 0, expired: 0, deleted: 0, newThisWeek: 2 });
    expect(list.found).toBe(2);
    const a = list.families.find((f: any) => f.id === A);
    expect(a).toMatchObject({ name: 'Family A', status: 'trial', plan: null, people: 2, filesBytes: 2048 });
    expect(a.parents).toEqual([{ email: `admin@${A}.example`, confirmed: false }]);
    expect(JSON.stringify(list)).not.toMatch(/Kid A|Admin A|passwordHash/);
  });

  it('finds a family by name, family code or parent email, and pages', async () => {
    const code = (mainDb().prepare('SELECT code FROM families WHERE id = ?').get(B) as { code: string }).code;
    for (const q of ['bakers', code.toUpperCase(), `admin@${B}`]) {
      const list = await families(op, `?q=${encodeURIComponent(q)}`);
      expect(list.families.map((f: any) => f.id)).toEqual([B]);
    }
    expect((await families(op, '?q=nobody-like-this')).found).toBe(0);
    expect((await families(op, '?offset=50')).families).toEqual([]);
    expect((await families(op, '?limit=1')).families).toHaveLength(1);
  });

  it('suspends and resumes: the family sees the paused page, then gets back in', async () => {
    expect((await agent.post(`/api/operator/families/${A}/suspend`).set(auth(op))).status).toBe(200);
    expect((await agent.get('/api/dashboard').set(auth(adminA.token))).body.code).toBe('suspended');
    expect((await agent.get('/api/export').set(auth(adminA.token))).status).toBe(200);
    expect((await families(op, '?status=suspended')).families.map((f: any) => f.id)).toEqual([A]);
    expect((await agent.post(`/api/operator/families/${A}/suspend`).set(auth(op))).status).toBe(400);

    expect((await agent.post(`/api/operator/families/${A}/resume`).set(auth(op))).status).toBe(200);
    expect((await agent.get('/api/dashboard').set(auth(adminA.token))).status).toBe(200);
    expect((await familyOf(op, A)).status).toBe('trial');
    expect((await agent.post(`/api/operator/families/${A}/resume`).set(auth(op))).status).toBe(400);
  });

  it('resumes a family with a plan as active', async () => {
    mainDb().prepare("UPDATE families SET plan = 'family' WHERE id = ?").run(B);
    await agent.post(`/api/operator/families/${B}/suspend`).set(auth(op));
    await agent.post(`/api/operator/families/${B}/resume`).set(auth(op));
    expect((await familyOf(op, B)).status).toBe('active');
  });

  it('deletes only with the family name typed again, to deleted/', async () => {
    expect((await agent.post(`/api/operator/families/${A}/delete`).set(auth(op)).send({ name: 'Family' })).status).toBe(400);
    expect((await agent.post(`/api/operator/families/${A}/delete`).set(auth(op)).send({ name: ' family a ' })).status).toBe(200);
    expect(fs.readdirSync(path.join(dataDir(), 'deleted')).some((name) => name.startsWith(`${A}-`))).toBe(true);
    expect((await agent.get('/api/auth/me').set(auth(adminA.token))).status).toBe(401);
    const list = await families(op);
    expect(list.families.map((f: any) => f.id)).toEqual([B]);
    expect(list.totals.deleted).toBe(1);
    // Its parents' emails come from its folder, so the operator can find it by the address a parent writes from
    expect((await familyOf(op, A, `?status=deleted&q=admin@${A}`))).toMatchObject({
      status: 'deleted', people: null, canRestore: true, parents: [{ email: `admin@${A}.example`, confirmed: false }],
    });
    expect((await agent.post(`/api/operator/families/${A}/suspend`).set(auth(op))).status).toBe(404);
  });

  it("resends the confirmation email to a parent who hasn't confirmed, only in that family", async () => {
    const email = `admin@${A}.example`;
    const res = await agent.post(`/api/operator/families/${A}/resend-confirmation`).set(auth(op)).send({ email });
    expect(res.status).toBe(200);
    expect(sent.map((e) => e.to)).toEqual([email]);
    expect(sent[0].text).toContain('/confirm-email?token=');
    expect((await agent.post(`/api/operator/families/${B}/resend-confirmation`).set(auth(op)).send({ email })).status).toBe(404);

    mainDb().prepare("UPDATE accounts SET emailConfirmedAt = '2026-10-29T00:00:00Z' WHERE email = ?").run(email);
    expect((await agent.post(`/api/operator/families/${A}/resend-confirmation`).set(auth(op)).send({ email })).status).toBe(400);
    expect(sent).toHaveLength(1);
  });
});

describe('Restoring a deleted family (NEW-23)', () => {
  let op: string;
  let C: string;
  const email = () => `parent@${C}.example`;
  const deleted = () => fs.readdirSync(path.join(dataDir(), 'deleted'));
  const restore = (id: string) => agent.post(`/api/operator/families/${id}/restore`).set(auth(op));
  const codeOf = (id: string) => (mainDb().prepare('SELECT code FROM families WHERE id = ?').get(id) as { code: string | null }).code;
  const login = (body: object) => agent.post('/api/auth/login').send({ password: 'parent123', ...body });

  beforeEach(async () => {
    makeOperator();
    op = await operatorToken();
    C = createFamily('The Carters'); // with its database in its folder, like a real family
    await createAdmin(agent, 'parent', 'parent123', 'Parent C', C);
    runInFamily(openFamily(C)!, () => db.prepare("INSERT INTO app_settings (key, value) VALUES ('marker', 'kept')").run());
  });

  it('brings back the folder, the status, the family code and the emails', async () => {
    mainDb().prepare("UPDATE accounts SET emailConfirmedAt = '2026-11-01T00:00:00Z', newsAt = '2026-11-01T00:00:00Z' WHERE email = ?").run(email());
    await agent.post(`/api/operator/families/${C}/suspend`).set(auth(op));
    const code = codeOf(C);
    await agent.post(`/api/operator/families/${C}/delete`).set(auth(op)).send({ name: 'The Carters' });
    expect((await login({ email: email() })).status).toBe(401);

    const res = await restore(C);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'suspended', code, codeTaken: null, emails: [email()], emailsTaken: [], nothingSaved: false, again: null });
    expect(fs.existsSync(path.join(familyDir(C), 'tidyquest.db'))).toBe(true);
    expect(fs.existsSync(path.join(familyDir(C), 'restore.json'))).toBe(false);
    expect(deleted().some((name) => name.startsWith(`${C}-`))).toBe(false);
    expect(mainDb().prepare('SELECT emailConfirmedAt, newsAt FROM accounts WHERE email = ?').get(email()))
      .toEqual({ emailConfirmedAt: '2026-11-01T00:00:00Z', newsAt: '2026-11-01T00:00:00Z' });
    expect(await familyOf(op, C)).toMatchObject({ status: 'suspended', code, deletedAt: null, parents: [{ email: email(), confirmed: true }] });

    await agent.post(`/api/operator/families/${C}/resume`).set(auth(op));
    const back = await login({ email: email() });
    expect(back.status).toBe(200);
    expect(runInFamily(openFamily(C)!, () => db.prepare("SELECT value FROM app_settings WHERE key = 'marker'").get())).toEqual({ value: 'kept' });
    expect(actions(await history(op, `?family=${C}`)).slice(0, 3)).toEqual(['resume', 'restore', 'delete']);
    expect((await restore(C)).status).toBe(404);
    expect((await restore(A)).status).toBe(404);
  });

  it('skips an email and a family code a new sign-up took meanwhile, and says so', async () => {
    const code = codeOf(C)!;
    await agent.post(`/api/operator/families/${C}/delete`).set(auth(op)).send({ name: 'The Carters' });
    mainDb().prepare('UPDATE families SET code = ?, codeKey = ? WHERE id = ?').run(code, code.replace(/-/g, ''), B);
    mainDb().prepare('INSERT INTO accounts (email, familyId, userId, createdAt) VALUES (?, ?, 1, ?)').run(email(), B, new Date().toISOString());

    const res = await restore(C);
    expect(res.body).toMatchObject({ status: 'trial', codeTaken: code, emails: [], emailsTaken: [email()] });
    expect(res.body.code).not.toBe(code);
    expect(codeOf(C)).toBe(res.body.code);
    expect(codeOf(B)).toBe(code);
    // That parent still gets in with the family code and their username, and can add a new email in Settings
    expect((await login({ username: 'parent', familyCode: res.body.code })).status).toBe(200);
    expect((await history(op, `?family=${C}`)).entries[0]).toMatchObject({ action: 'restore', detail: `taken meanwhile: ${email()}, code ${code}` });
  });

  it("starts a clean-up job's warning over, and says what happens next", async () => {
    const warned = '2026-10-01T00:00:00Z';
    mainDb().prepare('UPDATE families SET trialWarnedAt = ?, consentRemindedAt = ?, inactiveWarnedAt = ? WHERE id = ?').run(warned, warned, warned, C);
    deleteFamily(C);
    recordOperatorAction({ action: 'inactive-delete', family: { id: C, name: 'The Carters' } });

    const res = await restore(C);
    expect(res.body.again).toMatch(/warned again .* deleted 30 days later/);
    expect(mainDb().prepare('SELECT trialWarnedAt, consentRemindedAt, inactiveWarnedAt FROM families WHERE id = ?').get(C))
      .toEqual({ trialWarnedAt: null, consentRemindedAt: null, inactiveWarnedAt: null });
  });

  it('brings back a family deleted before NEW-23 with a new code, but not once its folder is gone', async () => {
    const code = codeOf(C);
    deleteFamily(C);
    const kept = deleted().find((name) => name.startsWith(`${C}-`))!;
    fs.rmSync(path.join(dataDir(), 'deleted', kept, 'restore.json'));
    expect(await familyOf(op, C, '?status=deleted')).toMatchObject({ canRestore: true, parents: [] });
    const res = await restore(C);
    expect(res.body).toMatchObject({ status: 'trial', codeTaken: null, emails: [], emailsTaken: [], nothingSaved: true });
    expect(res.body.code).not.toBe(code);

    deleteFamily(C);
    fs.rmSync(path.join(dataDir(), 'deleted', deleted().find((name) => name.startsWith(`${C}-`))!), { recursive: true });
    expect(await familyOf(op, C, '?status=deleted')).toMatchObject({ canRestore: false, parents: [] });
    expect((await restore(C)).status).toBe(410);
    expect((await familyOf(op, C, '?status=deleted')).status).toBe('deleted');
  });
});

describe('The History', () => {
  let op: string;
  beforeEach(async () => {
    makeOperator();
    op = await operatorToken();
  });

  it("keeps each family action with who, which family and when, newest first, and each family's own", async () => {
    const email = `admin@${A}.example`;
    await agent.post(`/api/operator/families/${B}/suspend`).set(auth(op));
    await agent.post(`/api/operator/families/${B}/resume`).set(auth(op));
    await agent.post(`/api/operator/families/${A}/resend-confirmation`).set(auth(op)).send({ email });
    await agent.post(`/api/operator/families/${B}/delete`).set(auth(op)).send({ name: 'The Bakers' });
    expect((await agent.post(`/api/operator/families/${A}/delete`).set(auth(op)).send({ name: 'wrong' })).status).toBe(400); // not kept

    const all = await history(op, '?kind=families');
    expect(all.found).toBe(4);
    expect(all.entries.map((e: any) => [e.action, e.familyName])).toEqual([
      ['delete', 'The Bakers'], ['resend-confirmation', 'Family A'], ['resume', 'The Bakers'], ['suspend', 'The Bakers'],
    ]);
    expect(all.entries[1]).toMatchObject({ operatorEmail: OP_EMAIL, familyId: A, detail: email });
    expect(all.entries[0].ip).toBeTruthy();
    expect(Date.now() - Date.parse(all.entries[0].at)).toBeLessThan(60_000);

    // A deleted family's too
    expect(actions(await history(op, `?family=${B}`))).toEqual(['delete', 'resume', 'suspend']);
    expect(actions(await history(op, `?family=${A}`))).toEqual(['resend-confirmation']);
  });

  it('pages from before an entry, and counts all that match', async () => {
    for (let i = 0; i < 3; i++) {
      await agent.post(`/api/operator/families/${B}/suspend`).set(auth(op));
      await agent.post(`/api/operator/families/${B}/resume`).set(auth(op));
    }
    const first = await history(op, `?family=${B}&limit=4`);
    expect(first.found).toBe(6);
    expect(actions(first)).toEqual(['resume', 'suspend', 'resume', 'suspend']);
    const rest = await history(op, `?family=${B}&limit=4&before=${first.entries[3].id}`);
    expect(actions(rest)).toEqual(['resume', 'suspend']);
    expect(rest.found).toBe(6);
  });

  it("keeps sign-ins, an operator's wrong passwords, a new password and Sign out, apart from the families", async () => {
    await agent.post('/api/operator/login').send({ email: OP_EMAIL, password: 'nope' });
    await agent.post('/api/operator/login').send({ email: 'who@example.com', password: OP_PASSWORD }); // no such operator: not kept
    const changed = await agent.post('/api/operator/password').set(auth(op)).send({ current: OP_PASSWORD, password: 'another-long-password' });
    await agent.post(`/api/operator/families/${B}/suspend`).set(auth(changed.body.token));
    await agent.post('/api/operator/logout').set(auth(changed.body.token));
    const again = await operatorToken(OP_EMAIL, 'another-long-password');

    const signIns = await history(again, '?kind=sign-ins');
    expect(actions(signIns)).toEqual(['sign-in', 'sign-out', 'password', 'wrong-password', 'sign-in', 'env-account']);
    expect(signIns.entries.every((e: any) => e.operatorEmail === OP_EMAIL && e.familyId === null)).toBe(true);
    expect(actions(await history(again, '?kind=families'))).toEqual(['suspend']);
    expect((await history(again)).found).toBe(7);
  });

  it('keeps an account or password that came from the compose file', async () => {
    makeOperator(OP_EMAIL, 'a-new-compose-password'); // the way back in after a forgotten password
    makeOperator('second@tidyquest.example', 'second-password-1');
    makeOperator('second@tidyquest.example', 'second-password-1'); // unchanged: nothing new
    const second = await operatorToken('second@tidyquest.example', 'second-password-1');
    expect((await history(second)).entries.map((e: any) => [e.action, e.operatorEmail])).toEqual([
      ['sign-in', 'second@tidyquest.example'], ['env-account', 'second@tidyquest.example'],
      ['env-password', OP_EMAIL], ['sign-in', OP_EMAIL], ['env-account', OP_EMAIL],
    ]);
  });

  it("keeps a family's entries after it's removed for good, without its name or emails (NEW-34)", async () => {
    const email = `admin@${A}.example`;
    await agent.post(`/api/operator/families/${A}/resend-confirmation`).set(auth(op)).send({ email });
    await agent.post(`/api/operator/families/${A}/delete`).set(auth(op)).send({ name: 'Family A' });
    expect(purgeDeletedFamilies(new Date(Date.now() + 31 * DAY))).toBe(1);
    expect(mainDb().prepare('SELECT 1 FROM families WHERE id = ?').get(A)).toBeUndefined();
    expect((await history(op, `?family=${A}`)).entries.map((e: any) => [e.action, e.familyName, e.detail])).toEqual([
      ['delete', null, null], ['resend-confirmation', null, null],
    ]);
  });
});

describe.skipIf(HOSTED_RUN)('Self-hosted', () => {
  it('has no operator page', async () => {
    setHosted(false); // the beforeEach above made a hosted server
    const t = createTestApp();
    // It answers like any path the server doesn't have
    const unknown = (await t.agent.post('/api/no-such-page').send({})).status;
    const login = await t.agent.post('/api/operator/login').send({ email: OP_EMAIL, password: OP_PASSWORD });
    expect(login.status).toBe(unknown);
    expect(login.body.token).toBeUndefined();
  });
});
