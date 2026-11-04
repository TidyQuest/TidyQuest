import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import webpush from 'web-push';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { setNotifyTransport, sendPersonTest, type Delivery } from '../utils/notify';
import { notifyBadge } from '../utils/notifyMessages';
import { MAX_DEVICES, sendPush, setPushSender, validEndpoint } from '../utils/push';

// Web push (NEW-5): devices sign up, get the person's messages, and stop with the login that made them

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;
let sent: Delivery[];

beforeEach(() => {
  ({ agent, db } = createTestApp());
  sent = [];
  setNotifyTransport(async (d) => { sent.push(d); return { ok: true }; });
});
afterEach(() => { setNotifyTransport(); setPushSender(); });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const setting = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);

/** A browser's subscription, with real keys so the encryption can run */
function subscription(n = 1, host = 'fcm.googleapis.com') {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://${host}/fcm/send/device-${n}`,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') },
    label: `Phone ${n}`,
  };
}

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  setting('notificationsEnabled', '1');
  setting('ntfyEnabled', '1');
  setting('ntfyTopic', 'family-topic');
  return { admin, kid };
}

const signUp = (token: string, sub = subscription()) => agent.post('/api/notify/push/devices').set(auth(token)).send(sub);
/** The parent gets badge news on their own topic, so the family channel only carries what has nowhere else to go */
const ownTopic = (userId: number) => db.prepare("UPDATE users SET ntfyTopic = 'parent-topic' WHERE id = ?").run(userId);
const devices = (userId: number) => db.prepare('SELECT * FROM push_subscriptions WHERE userId = ? ORDER BY id').all(userId) as any[];

describe('Signing up a device', () => {
  it('gives the browser the public key and says whether push is on', async () => {
    const { kid } = await family();
    const res = await agent.get('/api/notify/push').set(auth(kid.token)).expect(200);
    expect(res.body).toEqual({ publicKey: process.env.VAPID_PUBLIC_KEY, on: true, notificationsOn: true });
  });

  it("saves the device for the person signed in and shows it in their notification settings", async () => {
    const { admin, kid } = await family();
    await signUp(kid.token).expect(200);
    const view = (await agent.get(`/api/notify/people/${kid.user.id}`).set(auth(admin.token))).body;
    expect(view.channels).toEqual(['push']);
    expect(view.devices).toEqual([expect.objectContaining({ label: 'Phone 1', lastOkAt: null })]);
  });

  it("only takes the browsers' own push services as the address", async () => {
    const { kid } = await family();
    for (const endpoint of ['http://fcm.googleapis.com/fcm/send/x', 'https://192.168.2.133/push', 'https://fcm.googleapis.com:8443/x',
      'https://evil.example/fcm.googleapis.com', 'https://user:pw@fcm.googleapis.com/x', 'not a url']) {
      await signUp(kid.token, { ...subscription(), endpoint }).expect(400);
    }
    for (const host of ['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com', 'wns2-by3p.notify.windows.com']) {
      expect(validEndpoint(`https://${host}/x`)).toBe(true);
    }
    await signUp(kid.token, { ...subscription(), keys: { p256dh: 'bad key!', auth: 'x' } }).expect(400);
    expect(devices(kid.user.id)).toHaveLength(0);
  });

  it('signing up the same device again updates it; another person signing in there takes it over', async () => {
    const { admin, kid } = await family();
    const sub = subscription();
    await signUp(kid.token, sub).expect(200);
    await signUp(kid.token, { ...sub, label: 'Renamed' }).expect(200);
    expect(devices(kid.user.id).map((d) => d.label)).toEqual(['Renamed']);
    await signUp(admin.token, sub).expect(200);
    expect(devices(kid.user.id)).toHaveLength(0);
    expect(devices(admin.user.id)).toHaveLength(1);
  });

  it(`keeps at most ${MAX_DEVICES} devices per person, dropping the oldest`, async () => {
    const { kid } = await family();
    for (let n = 1; n <= MAX_DEVICES + 2; n++) await signUp(kid.token, subscription(n)).expect(200);
    const left = devices(kid.user.id);
    expect(left).toHaveLength(MAX_DEVICES);
    expect(left[0].label).toBe('Phone 3');
  });

  it('is refused, and nothing goes out, while Settings → Features has web push off', async () => {
    const { admin, kid } = await family();
    await signUp(kid.token).expect(200);
    setting('features', JSON.stringify({ webPush: false }));
    await signUp(kid.token, subscription(2)).expect(403);
    await notifyBadge(kid.user.id, { titleKey: 'achievements.firstStep', title: null });
    expect(sent.map((d) => d.channel)).toEqual(['ntfy']); // the family channel again
    expect((await agent.get(`/api/notify/people/${kid.user.id}`).set(auth(admin.token))).body.devices).toEqual([]);
  });
});

describe('Sending', () => {
  it("sends the person's messages to each of their devices instead of the family channel", async () => {
    const { admin, kid } = await family();
    ownTopic(admin.user.id);
    await signUp(kid.token, subscription(1)).expect(200);
    await signUp(kid.token, subscription(2)).expect(200);
    await notifyBadge(kid.user.id, { titleKey: 'achievements.firstStep', title: null });
    const ids = devices(kid.user.id).map((d) => String(d.id));
    expect(sent.map((d) => [d.channel, d.target])).toEqual([['ntfy', 'parent-topic'], ['push', ids[0]], ['push', ids[1]]]);
    const log = db.prepare('SELECT channel, ok FROM notification_log WHERE userId = ?').all(kid.user.id);
    expect(log).toEqual([{ channel: 'push', ok: 1 }, { channel: 'push', ok: 1 }]);
  });

  it("names each device in the results of Send a test", async () => {
    const { kid } = await family();
    await signUp(kid.token).expect(200);
    expect(await sendPersonTest(kid.user.id, 'Test')).toEqual([{ channel: 'push (Phone 1)', ok: true, error: undefined }]);
  });

  it('encrypts a TidyQuest message for the device and signs it with the server key', async () => {
    const { kid } = await family();
    await signUp(kid.token).expect(200);
    const id = devices(kid.user.id)[0].id;
    let request: ReturnType<typeof webpush.generateRequestDetails> | null = null;
    let payload = '';
    setPushSender(async (sub, body, options) => { payload = body; request = webpush.generateRequestDetails(sub, body, options); });
    expect(await sendPush(id, 'Kid earned a badge')).toEqual({ ok: true });
    expect(JSON.parse(payload)).toEqual({ title: 'TidyQuest', body: 'Kid earned a badge' });
    expect(request!.endpoint).toBe('https://fcm.googleapis.com/fcm/send/device-1');
    expect(request!.headers).toMatchObject({ TTL: 43200, 'Content-Encoding': 'aes128gcm' });
    expect(String(request!.headers.Authorization)).toContain(`k=${process.env.VAPID_PUBLIC_KEY}`);
    expect(devices(kid.user.id)[0].lastOkAt).not.toBeNull();
  });

  it('removes a device the push service says is gone, and reports other failures', async () => {
    const { kid } = await family();
    await signUp(kid.token, subscription(1)).expect(200);
    await signUp(kid.token, subscription(2)).expect(200);
    const [a, b] = devices(kid.user.id).map((d) => d.id);
    setPushSender(async () => { throw Object.assign(new Error('Gone'), { statusCode: 410 }); });
    expect((await sendPush(a, 'Hi')).ok).toBe(false);
    setPushSender(async () => { throw Object.assign(new Error('Busy'), { statusCode: 503 }); });
    expect(await sendPush(b, 'Hi')).toEqual({ ok: false, error: 'The push service returned 503.' });
    expect(devices(kid.user.id).map((d) => d.id)).toEqual([b]);
  });
});

describe('Signing out stops a device', () => {
  it('turning it off or signing out on the device removes it (only your own)', async () => {
    const { admin, kid } = await family();
    const sub = subscription();
    await signUp(kid.token, sub).expect(200);
    await agent.post('/api/notify/push/devices/forget').set(auth(admin.token)).send({ endpoint: sub.endpoint }).expect(200);
    expect(devices(kid.user.id)).toHaveLength(1);
    await agent.post('/api/notify/push/devices/forget').set(auth(kid.token)).send({ endpoint: sub.endpoint }).expect(200);
    expect(devices(kid.user.id)).toHaveLength(0);
  });

  it('"Log out everywhere else" removes every device; the one still signed in signs up again', async () => {
    const { admin, kid } = await family();
    ownTopic(admin.user.id);
    await signUp(kid.token, subscription(1)).expect(200);
    await signUp(kid.token, subscription(2)).expect(200);
    const fresh = (await agent.post('/api/auth/logout-others').set(auth(kid.token)).expect(200)).body.token;
    expect(devices(kid.user.id)).toHaveLength(0);
    await signUp(fresh, subscription(1)).expect(200);
    await notifyBadge(kid.user.id, { titleKey: 'achievements.firstStep', title: null });
    expect(sent.map((d) => d.target)).toEqual(['parent-topic', String(devices(kid.user.id)[0].id)]);
  });

  it('a parent logging someone out everywhere, or a new password, removes their devices', async () => {
    const { admin, kid } = await family();
    await signUp(kid.token).expect(200);
    await agent.post(`/api/users/${kid.user.id}/logout-all`).set(auth(admin.token)).expect(200);
    expect(devices(kid.user.id)).toHaveLength(0);
    await signUp(admin.token).expect(200);
    await agent.put(`/api/users/${admin.user.id}/password`).set(auth(admin.token)).send({ currentPassword: 'admin123', newPassword: 'newpass123' });
    expect(devices(admin.user.id)).toHaveLength(0);
  });

  it("sends nothing to a device whose login ended some other way (the server's password reset)", async () => {
    const { kid } = await family();
    await signUp(kid.token).expect(200);
    db.prepare('UPDATE users SET tokenVersion = tokenVersion + 1 WHERE id = ?').run(kid.user.id);
    await notifyBadge(kid.user.id, { titleKey: 'achievements.firstStep', title: null });
    expect(sent.map((d) => d.channel)).toEqual(['ntfy']);
  });

  it("a parent can remove someone's device from the list; others can't", async () => {
    const { admin, kid } = await family();
    const other = await createUser(agent, admin.token, { username: 'other', displayName: 'Other', password: 'pass123', role: 'child' });
    await signUp(kid.token).expect(200);
    const id = devices(kid.user.id)[0].id;
    await agent.delete(`/api/notify/people/${kid.user.id}/devices/${id}`).set(auth(other.token)).expect(403);
    const res = await agent.delete(`/api/notify/people/${kid.user.id}/devices/${id}`).set(auth(admin.token)).expect(200);
    expect(res.body.devices).toEqual([]);
    await agent.delete(`/api/notify/people/${kid.user.id}/devices/${id}`).set(auth(admin.token)).expect(404);
  });

  it('a backup import forgets every device (ids may belong to someone else afterwards)', async () => {
    const { admin, kid } = await family();
    await signUp(kid.token).expect(200);
    const backup = (await agent.get('/api/export').set(auth(admin.token))).body;
    expect(JSON.stringify(backup)).not.toContain('fcm.googleapis.com');
    await agent.post('/api/import').set(auth(admin.token)).send(backup).expect(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()).toEqual({ n: 0 });
  });
});

describe('Settings → Notifications switch (v0.16.2)', () => {
  const config = (token: string, body: object) => agent.put('/api/users/notifications-config').set(auth(token)).send(body);
  const master = () => (db.prepare("SELECT value FROM app_settings WHERE key = 'notificationsEnabled'").get() as { value: string }).value;
  // A real database starts with these rows (database.ts); the routes only update them
  const seed = () => {
    for (const [key, value] of [['notificationsEnabled', '0'], ['telegramEnabled', '0'], ['ntfyEnabled', '0'], ['ntfyTopic', ''], ['notificationTime', '09:00']]) {
      db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
    }
  };

  it('turns on with phone notifications alone: nothing else to set up', async () => {
    const admin = await createAdmin(agent);
    seed();
    const res = await config(admin.token, { notificationsEnabled: true }).expect(200);
    expect(res.body.notificationsEnabled).toBe(true);
    expect(master()).toBe('1');
    await config(admin.token, { notificationsEnabled: false }).expect(200);
    expect(master()).toBe('0');
  });

  it('with phone notifications switched off it needs another way to send, and a refused save keeps nothing', async () => {
    const admin = await createAdmin(agent);
    seed();
    setting('features', JSON.stringify({ webPush: false }));
    const res = await config(admin.token, { notificationsEnabled: true, notificationTime: '07:30' }).expect(400);
    expect(res.body.code).toBe('provider_required');
    expect(master()).toBe('0');
    expect(db.prepare("SELECT value FROM app_settings WHERE key = 'notificationTime'").get()).toEqual({ value: '09:00' });
    await config(admin.token, { notificationsEnabled: true, ntfyEnabled: true, ntfyTopic: 'family-topic' }).expect(200);
    expect(master()).toBe('1');
  });
});
