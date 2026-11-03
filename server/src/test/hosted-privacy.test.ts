import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import type supertest from 'supertest';
import db from '../database';
import { runInFamily, setHosted } from '../hosted/context';
import { setEmailTransport, type Email } from '../hosted/email';
import { deleteFamily, familyDir, openFamily, purgeDeletedFamilies } from '../hosted/families';
import { runJobs, resetDailyJobs } from '../hosted/jobs';
import { mainDb } from '../hosted/mainDb';
import { operatorFromEnv } from '../hosted/operator';
import { unsubscribeLinks } from '../hosted/news';
import { endInactiveFamilies, endUnconfirmedFamilies, forgetOldWaitlist } from '../hosted/privacy';
import { HOSTED_RUN, addTestFamily, createAdmin, createTestApp, createUser, familyCodeOf } from './setup';

// NEW-34, the privacy basics before the first outside family (TidyQuest.org/PRIVACY.md and TERMS.md), and
// NEW-25, "Delete our family".
const DAY = 24 * 60 * 60 * 1000;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let agent: supertest.Agent;
let A: string;
let B: string;
let adminA: { user: any; token: string };
let sent: Email[];

const signup = (extra: object = {}) => agent.post('/api/hosted/signup').send({
  familyName: 'The Okafors', parentName: 'Zoë Okafor', email: 'zoe@example.com', password: 'longpassword',
  timeZone: 'America/Chicago', language: 'en', ...extra,
});
const lastTo = (to: string) => [...sent].reverse().find((e) => e.to === to);
const familyRow = (id: string) => mainDb().prepare('SELECT * FROM families WHERE id = ?').get(id) as any;
const inFamily = <T>(id: string, fn: () => T) => runInFamily(openFamily(id, Date.now(), { activity: false })!, fn);

beforeEach(async () => {
  const t = createTestApp({ hosted: true });
  agent = t.agent;
  A = t.familyId!;
  ({ familyId: B } = addTestFamily('The Bakers'));
  adminA = await createAdmin(agent, 'admin', 'admin123', 'Admin A', A);
  await createAdmin(agent, 'admin', 'admin123', 'Admin B', B);
  sent = [];
  setEmailTransport((e) => { sent.push(e); });
});

afterEach(() => {
  setEmailTransport();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  resetDailyJobs();
});

describe('The terms and the privacy policy', () => {
  const legalOn = () => {
    vi.stubEnv('TERMS_URL', 'https://tidyquest.example/terms');
    vi.stubEnv('PRIVACY_URL', 'https://tidyquest.example/privacy');
    vi.stubEnv('TERMS_VERSION', '2026-12-01');
    vi.stubEnv('PRIVACY_VERSION', '2026-12-01');
  };
  beforeEach(legalOn);

  it('needs the box at sign-up, and keeps when and which versions were agreed to', async () => {
    const without = await signup();
    expect(without.status).toBe(400);
    expect(without.body.code).toBe('must-agree');
    const res = await signup({ acceptTerms: true });
    expect(res.status).toBe(201);
    const fid = JSON.parse(Buffer.from(res.body.token.split('.')[1], 'base64url').toString()).fid;
    const me = inFamily(fid, () => db.prepare('SELECT agreedAt, agreedTerms, agreedPrivacy FROM users WHERE id = ?').get(res.body.user.id)) as any;
    expect(me.agreedAt).toBeTruthy();
    expect([me.agreedTerms, me.agreedPrivacy]).toEqual(['2026-12-01', '2026-12-01']);
    // The parent who signed up isn't asked again
    expect((await agent.get('/api/hosted/account').set(auth(res.body.token))).body.mustAgree).toBe(false);
    // News only when ticked: not this time
    expect(mainDb().prepare('SELECT newsAt FROM accounts WHERE email = ?').get('zoe@example.com')).toEqual({ newsAt: null });
  });

  it('puts the COPPA notice, with the policy link, in the confirmation email', async () => {
    await signup({ acceptTerms: true });
    const confirm = lastTo('zoe@example.com')!;
    expect(confirm.text).toContain('COPPA');
    expect(confirm.text).toContain('https://tidyquest.example/privacy');
    expect(confirm.text).toMatch(/token=/);
  });

  it('asks other parents and members once, again after a change, and never children', async () => {
    // People added before the terms were set up
    vi.unstubAllEnvs();
    const member = await createUser(agent, adminA.token, { username: 'grandma', displayName: 'Grandma', password: 'pass123', role: 'member', familyId: A });
    const kid = await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child', familyId: A });
    legalOn();
    for (const token of [adminA.token, member.token]) {
      const blocked = await agent.get('/api/dashboard').set(auth(token));
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('must-agree');
      expect((await agent.get('/api/hosted/account').set(auth(token))).body).toMatchObject({ mustAgree: true, termsUrl: 'https://tidyquest.example/terms' });
      expect((await agent.post('/api/hosted/agree').set(auth(token))).status).toBe(200);
      expect((await agent.get('/api/dashboard').set(auth(token))).status).toBe(200);
    }
    expect((await agent.get('/api/dashboard').set(auth(kid.token))).status).toBe(200);
    expect((await agent.get('/api/hosted/account').set(auth(kid.token))).body.mustAgree).toBe(false);
    vi.stubEnv('TERMS_VERSION', '2027-05-01');
    expect((await agent.get('/api/dashboard').set(auth(member.token))).body.code).toBe('must-agree');
    expect((await agent.get('/api/dashboard').set(auth(kid.token))).status).toBe(200);
  });

  it("doesn't take agreements from an imported file", async () => {
    await agent.post('/api/hosted/agree').set(auth(adminA.token));
    const backup = (await agent.get('/api/export').set(auth(adminA.token))).body;
    backup.users.push({ ...backup.users[0], id: 99, username: 'stranger', agreedAt: '2026-01-01T00:00:00.000Z', agreedTerms: '2026-12-01', agreedPrivacy: '2026-12-01' });
    expect((await agent.post('/api/import').set(auth(adminA.token)).send(backup)).status).toBe(200);
    const rows = inFamily(A, () => db.prepare('SELECT username, agreedAt FROM users ORDER BY username').all()) as any[];
    expect(rows.find((r) => r.username === 'admin').agreedAt).toBeTruthy();
    expect(rows.find((r) => r.username === 'stranger').agreedAt).toBeNull();
  });
});

describe('News emails', () => {
  it('only for parents who tick the box, which Settings can change', async () => {
    const res = await signup({ news: true });
    expect(mainDb().prepare('SELECT newsAt FROM accounts WHERE email = ?').get('zoe@example.com')).toEqual({ newsAt: expect.any(String) });
    expect((await agent.get('/api/hosted/account').set(auth(res.body.token))).body.news).toBe(true);
    expect((await agent.post('/api/hosted/news').set(auth(res.body.token)).send({ on: false })).body.news).toBe(false);
    expect(mainDb().prepare('SELECT newsAt FROM accounts WHERE email = ?').get('zoe@example.com')).toEqual({ newsAt: null });
  });

  it('stops with the signed one-click link, and refuses a forged one', async () => {
    vi.stubEnv('PUBLIC_URL', 'https://app.tidyquest.example');
    await signup({ news: true });
    const { oneClick } = unsubscribeLinks('zoe@example.com');
    const url = new URL(oneClick);
    expect((await agent.post(`/api/hosted/unsubscribe?e=${encodeURIComponent('zoe@example.com')}&s=forged`)).status).toBe(400);
    expect(mainDb().prepare('SELECT newsAt FROM accounts WHERE email = ?').get('zoe@example.com')).toEqual({ newsAt: expect.any(String) });
    expect((await agent.post(`${url.pathname}${url.search}`)).status).toBe(200);
    expect(mainDb().prepare('SELECT newsAt FROM accounts WHERE email = ?').get('zoe@example.com')).toEqual({ newsAt: null });
  });

  it('go out from the operator page with the unsubscribe link and the postal address, to confirmed parents only', async () => {
    vi.stubEnv('OPERATOR_EMAIL', 'op@tidyquest.example');
    vi.stubEnv('OPERATOR_PASSWORD', 'operator-password-1');
    operatorFromEnv();
    const op = (await agent.post('/api/operator/login').send({ email: 'op@tidyquest.example', password: 'operator-password-1' })).body.token;
    mainDb().prepare('UPDATE accounts SET newsAt = ?, emailConfirmedAt = ? WHERE familyId = ?').run(new Date().toISOString(), new Date().toISOString(), A);
    mainDb().prepare('UPDATE accounts SET newsAt = ? WHERE familyId = ?').run(new Date().toISOString(), B); // not confirmed
    const news = { subject: 'Spring cleaning', body: 'New chores ideas inside.' };
    expect((await agent.post('/api/operator/news').set(auth(op)).send(news)).body.error).toMatch(/PUBLIC_URL/);
    vi.stubEnv('PUBLIC_URL', 'https://app.tidyquest.example');
    expect((await agent.post('/api/operator/news').set(auth(op)).send(news)).body.error).toMatch(/POSTAL_ADDRESS/);
    vi.stubEnv('POSTAL_ADDRESS', 'PO Box 1, Springfield, IL 62701');
    expect((await agent.get('/api/operator/news').set(auth(op))).body).toEqual({ recipients: 1, blocked: null });
    expect((await agent.post('/api/operator/news').set(auth(op)).send({ ...news, test: true })).body.sent).toBe(1);
    expect(sent.map((e) => e.to)).toEqual(['op@tidyquest.example']);
    expect((await agent.post('/api/operator/news').set(auth(op)).send(news)).body.sent).toBe(1);
    const email = lastTo(`admin@${A}.example`)!;
    expect(email.text).toContain('PO Box 1, Springfield, IL 62701');
    expect(email.text).toContain('https://app.tidyquest.example/unsubscribe?e=');
    expect(email.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(lastTo(`admin@${B}.example`)).toBeUndefined();
  });
});

describe('Families that never confirm, or stop using TidyQuest', () => {
  beforeEach(() => vi.stubEnv('PUBLIC_URL', 'https://app.tidyquest.example'));

  it('reminds an unconfirmed family a week before day 30, then deletes it', async () => {
    const res = await signup();
    const fid = JSON.parse(Buffer.from(res.body.token.split('.')[1], 'base64url').toString()).fid;
    const created = Date.parse(familyRow(fid).createdAt);
    await endUnconfirmedFamilies(new Date(created + 22 * DAY));
    expect(lastTo('zoe@example.com')!.subject).not.toMatch(/deleted/);
    await endUnconfirmedFamilies(new Date(created + 23 * DAY + 1000));
    const reminder = lastTo('zoe@example.com')!;
    expect(reminder.subject).toMatch(/will be deleted on/);
    expect(reminder.text).toMatch(/confirm-email\?token=/);
    expect(await endUnconfirmedFamilies(new Date(created + 29 * DAY))).toBe(0);
    expect(await endUnconfirmedFamilies(new Date(created + 30 * DAY + 2000))).toBe(1);
    expect(familyRow(fid).deletedAt).toBeTruthy();
    expect(mainDb().prepare("SELECT action FROM operator_history WHERE familyId = ?").all(fid)).toEqual([{ action: 'unconfirmed-delete' }]);
    // Families with consent are never touched
    expect(familyRow(A).deletedAt).toBeNull();
  });

  it('keeps a family whose parent confirms after the reminder', async () => {
    const res = await signup();
    const fid = JSON.parse(Buffer.from(res.body.token.split('.')[1], 'base64url').toString()).fid;
    const created = Date.parse(familyRow(fid).createdAt);
    await endUnconfirmedFamilies(new Date(created + 24 * DAY));
    const token = /token=([\w-]+)/.exec(lastTo('zoe@example.com')!.text)![1];
    expect((await agent.post('/api/hosted/confirm-email').send({ token })).status).toBe(200);
    expect(await endUnconfirmedFamilies(new Date(created + 40 * DAY))).toBe(0);
    expect(familyRow(fid).deletedAt).toBeNull();
  });

  it('warns a family unused for a year, starts over when someone signs in, and deletes it 30 days after a warning', async () => {
    mainDb().prepare('UPDATE accounts SET emailConfirmedAt = ? WHERE familyId IN (?, ?)').run(new Date().toISOString(), A, B);
    const now = Date.now();
    await endInactiveFamilies(new Date(now + 366 * DAY));
    expect(familyRow(A).inactiveWarnedAt).toBeTruthy();
    expect(lastTo(`admin@${A}.example`)!.subject).toMatch(/will be deleted on/);
    // Someone used the app after the warning
    mainDb().prepare('UPDATE families SET lastActiveAt = ? WHERE id = ?').run(new Date(now + 380 * DAY).toISOString(), A);
    expect(await endInactiveFamilies(new Date(now + 397 * DAY))).toBe(1); // B
    expect(familyRow(A).deletedAt).toBeNull();
    expect(familyRow(A).inactiveWarnedAt).toBeNull();
    expect(familyRow(B).deletedAt).toBeTruthy();
    expect(mainDb().prepare("SELECT action FROM operator_history WHERE familyId = ?").all(B)).toEqual([{ action: 'inactive-delete' }]);
  });

  it('runs these with the daily jobs', async () => {
    const res = await signup();
    const fid = JSON.parse(Buffer.from(res.body.token.split('.')[1], 'base64url').toString()).fid;
    mainDb().prepare('UPDATE families SET createdAt = ?, consentRemindedAt = ? WHERE id = ?')
      .run(new Date(Date.now() - 40 * DAY).toISOString(), new Date(Date.now() - 8 * DAY).toISOString(), fid);
    await runJobs([]);
    expect(familyRow(fid).deletedAt).toBeTruthy();
  });

  it('forgets waitlist entries, and their emails in the History, after 12 months', () => {
    const old = new Date(Date.now() - 400 * DAY).toISOString();
    mainDb().prepare("INSERT INTO waitlist (at, familyName, parentName, email, language) VALUES (?, 'Old', 'Ola', 'old@example.com', 'en'), (?, 'New', 'Nia', 'new@example.com', 'en')")
      .run(old, new Date().toISOString());
    mainDb().prepare("INSERT INTO operator_history (at, action, detail) VALUES (?, 'waitlist-remove', 'Old (gone@example.com)')").run(old);
    expect(forgetOldWaitlist()).toBe(1);
    expect(mainDb().prepare('SELECT email FROM waitlist').all()).toEqual([{ email: 'new@example.com' }]);
    expect(mainDb().prepare("SELECT detail FROM operator_history WHERE action = 'waitlist-remove'").get()).toEqual({ detail: null });
  });
});

describe('Notification channels in hosted mode', () => {
  it('only a parent sets where anyone gets them; everyone picks which kinds', async () => {
    const kid = await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child', familyId: A });
    const kidId = kid.user.id;
    const put = (token: string, body: object) => agent.put(`/api/notify/people/${kidId}`).set(auth(token)).send(body);
    expect((await put(kid.token, { ntfyTopic: 'my-own-topic' })).body.error).toBe('parent_only');
    expect((await put(kid.token, { telegramChatId: '12345' })).status).toBe(403);
    expect((await put(adminA.token, { ntfyTopic: 'kid-topic' })).body.ntfyTopic).toBe('kid-topic');
    // The kid saving their kinds sends the topic back unchanged, which is fine
    const prefs = await put(kid.token, { ntfyTopic: 'kid-topic', prefs: { nudge: false } });
    expect(prefs.status).toBe(200);
    expect(prefs.body.prefs.nudge).toBe(false);
  });
});

describe('Photos without location', () => {
  // A JPEG's segments: JFIF, EXIF with a "GPS" secret, a comment, a table, the picture, the end, then a thumbnail
  const seg = (marker: number, body: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), Buffer.from([(body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
  const JPEG = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    seg(0xe1, Buffer.from('Exif\0\0GPS-SECRET-47.6N', 'latin1')),
    seg(0xfe, Buffer.from('taken at home', 'latin1')),
    seg(0xdb, Buffer.alloc(65, 1)),
    seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]),
    Buffer.from([0xff, 0xd9]),
    Buffer.from('THUMB-GPS-SECRET', 'latin1'),
  ]);

  async function completionId(token: string) {
    const room = (await agent.post('/api/rooms').set(auth(token)).send({ name: 'Room', roomType: 'other' })).body.id;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(token)).send({ name: 'Homework', effort: 1, onDemand: true })).body.id;
    return (await agent.post(`/api/tasks/${task}/complete`).set(auth(token)).send({})).body.completionId;
  }

  it("takes the camera data off a JPEG, keeps the picture, and refuses what it can't clean", async () => {
    const id = await completionId(adminA.token);
    const up = await agent.post(`/api/completions/${id}/photo`).set(auth(adminA.token)).attach('photo', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' });
    expect(up.status).toBe(200);
    const saved = fs.readFileSync(path.join(familyDir(A), 'proofs', path.basename(up.body.photoUrl)));
    expect(saved.toString('latin1')).not.toMatch(/SECRET|taken at home/);
    expect(saved.toString('latin1')).toContain('JFIF');
    expect(saved.subarray(-10)).toEqual(Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0xff, 0xd9]));

    const gif = await agent.post(`/api/completions/${id}/photo`).set(auth(adminA.token))
      .attach('photo', Buffer.from('GIF89a\x01\0\x01\0secret', 'latin1'), { filename: 'p.gif', contentType: 'image/gif' });
    expect(gif.status).toBe(400);
    expect(gif.body.code).toBe('photo-type');
    expect(fs.readdirSync(path.join(familyDir(A), 'proofs'))).toHaveLength(1);
  });

  it("takes a PNG's text chunks off", async () => {
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    const text = Buffer.concat([Buffer.from([0, 0, 0, 14]), Buffer.from('tEXtGPS\0SECRET-47N', 'latin1').subarray(0, 18), Buffer.alloc(4)]);
    const withText = Buffer.concat([PNG.subarray(0, 33), text, PNG.subarray(33)]);
    const up = await agent.post(`/api/users/${adminA.user.id}/avatar-upload`).set(auth(adminA.token)).attach('avatar', withText, { filename: 'me.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(fs.readFileSync(path.join(familyDir(A), 'avatars', path.basename(up.body.avatarPhotoUrl)))).toEqual(PNG);
  });
});

describe('Photos go with their owner', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const files = (kind: string) => fs.readdirSync(path.join(familyDir(A), kind));
  const photoOf = (completion: number) => (inFamily(A, () => db.prepare('SELECT photoUrl FROM task_completions WHERE id = ?').get(completion)) as { photoUrl: string | null } | undefined)?.photoUrl;

  async function choreWithPhoto(roomId?: number) {
    const room = roomId ?? (await agent.post('/api/rooms').set(auth(adminA.token)).send({ name: 'Room', roomType: 'other' })).body.id;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(adminA.token)).send({ name: 'Homework', effort: 1, onDemand: true })).body.id;
    const completion = (await agent.post(`/api/tasks/${task}/complete`).set(auth(adminA.token)).send({})).body.completionId;
    await agent.post(`/api/completions/${completion}/photo`).set(auth(adminA.token)).attach('photo', PNG, { filename: 'p.png', contentType: 'image/png' });
    return { room, task, completion };
  }

  it("removes a person's avatar file with them", async () => {
    const kid = await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child', familyId: A });
    await agent.post(`/api/users/${kid.user.id}/avatar-upload`).set(auth(adminA.token)).attach('avatar', PNG, { filename: 'k.png', contentType: 'image/png' });
    expect(files('avatars')).toHaveLength(1);
    expect((await agent.delete(`/api/users/${kid.user.id}`).set(auth(adminA.token))).status).toBe(200);
    expect(files('avatars')).toHaveLength(0);
  });

  it("removes a chore's proof photos when it leaves the trash, keeping its history", async () => {
    const { task, completion } = await choreWithPhoto();
    expect(files('proofs')).toHaveLength(1);
    expect((await agent.delete(`/api/tasks/${task}`).set(auth(adminA.token))).status).toBe(200);
    // In the trash it can come back, photo and all
    expect(files('proofs')).toHaveLength(1);
    const trashId = (await agent.get('/api/trash').set(auth(adminA.token))).body.items.find((t: any) => t.itemId === task).id;
    expect((await agent.delete(`/api/trash/${trashId}`).set(auth(adminA.token))).status).toBe(200);
    expect(files('proofs')).toHaveLength(0);
    expect(photoOf(completion)).toBeNull();
  });

  it('removes them when the trash entry expires, and at once when the chore goes with its room', async () => {
    const first = await choreWithPhoto();
    await agent.delete(`/api/tasks/${first.task}`).set(auth(adminA.token));
    inFamily(A, () => db.prepare("UPDATE trash SET deletedAt = datetime('now', '-31 days')").run());
    const second = await choreWithPhoto();
    expect(files('proofs')).toHaveLength(2);
    await runJobs([(await import('../utils/trash')).expireTrash]);
    expect(photoOf(first.completion)).toBeNull();
    expect(files('proofs')).toHaveLength(1);
    expect((await agent.delete(`/api/rooms/${second.room}`).set(auth(adminA.token))).status).toBe(200);
    expect(files('proofs')).toHaveLength(0);
    expect(photoOf(second.completion)).toBeNull();
  });
});

describe('"Delete our family" (NEW-25)', () => {
  const del = (token: string, body: object) => agent.post('/api/hosted/delete-family').set(auth(token)).send(body);

  it("needs a parent, the family's name and their password", async () => {
    const kid = await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child', familyId: A });
    expect((await del(kid.token, { name: 'Family A', password: 'pass123' })).status).toBe(403);
    expect((await del(adminA.token, { name: 'Family B', password: 'admin123' })).body.code).toBe('wrong-name');
    expect((await del(adminA.token, { name: 'family a', password: 'nope' })).body.code).toBe('wrong-password');
    expect(familyRow(A).deletedAt).toBeNull();
  });

  it('deletes it: everyone is signed out, the email is free, and confirmed parents hear about it', async () => {
    const kid = await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child', familyId: A });
    mainDb().prepare('UPDATE accounts SET emailConfirmedAt = ? WHERE familyId = ?').run(new Date().toISOString(), A);
    const code = familyCodeOf(A);
    expect((await del(adminA.token, { name: ' family a ', password: 'admin123' })).status).toBe(200);
    expect(familyRow(A).deletedAt).toBeTruthy();
    for (const token of [adminA.token, kid.token]) expect((await agent.get('/api/dashboard').set(auth(token))).status).toBe(401);
    expect((await agent.post('/api/auth/login').send({ familyCode: code, username: 'kid', password: 'pass123' })).status).toBe(401);
    expect(mainDb().prepare('SELECT 1 FROM accounts WHERE familyId = ?').get(A)).toBeUndefined();
    expect(lastTo(`admin@${A}.example`)!.subject).toMatch(/was deleted/);
    expect(mainDb().prepare("SELECT action, familyName, detail FROM operator_history WHERE familyId = ?").all(A))
      .toEqual([{ action: 'parent-delete', familyName: 'Family A', detail: `admin@${A}.example` }]);
    // Gone for good 30 days later, with its name and the email out of the History
    expect(purgeDeletedFamilies(new Date(Date.now() + 31 * DAY))).toBe(1);
    expect(mainDb().prepare("SELECT familyName, detail FROM operator_history WHERE familyId = ?").all(A)).toEqual([{ familyName: null, detail: null }]);
    expect(familyRow(B).deletedAt).toBeNull();
  });
});

describe.skipIf(HOSTED_RUN)('A hosted export in a self-hosted TidyQuest (the terms promise it)', () => {
  it('imports, with the importing parent keeping their password', async () => {
    await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child', familyId: A });
    const room = (await agent.post('/api/rooms').set(auth(adminA.token)).send({ name: 'Kitchen', roomType: 'kitchen' })).body.id;
    await agent.post(`/api/rooms/${room}/tasks`).set(auth(adminA.token)).send({ name: 'Dishes', effort: 1, frequencyDays: 1 });
    const backup = (await agent.get('/api/export').set(auth(adminA.token))).body;
    deleteFamily(A);

    setHosted(false);
    const self = createTestApp();
    const admin = (await self.agent.post('/api/auth/register').send({ username: 'admin', password: 'selfhosted1', displayName: 'Admin' })).body;
    const res = await self.agent.post('/api/import').set(auth(admin.token)).send(backup);
    expect(res.status).toBe(200);
    expect(res.body.imported).toMatchObject({ users: 2, rooms: 1 });
    // The parent signs in with the password they had here; everyone else needs a new one from them
    expect((await self.agent.post('/api/auth/login').send({ username: 'admin', password: 'selfhosted1' })).status).toBe(200);
    expect((await self.agent.post('/api/auth/login').send({ username: 'kid', password: 'pass123' })).status).toBe(401);
  });
});
