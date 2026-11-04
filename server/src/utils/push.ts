import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import db, { prepared } from '../database';
import { dataDir } from '../hosted/mainDb';
import { isFeatureOn } from './features';
import { sendTimeout } from './notifications';

/**
 * Web push (NEW-5): notifications from the app itself, on the phones and computers where someone turned them
 * on (Profile → My notifications → This device). It's one more personal channel in notify.ts.
 *
 * Each device is a row in push_subscriptions, tied to the login that made it (tokenVersion): signing out on
 * the device, "Log out everywhere" or a new password stops it. The device that stays signed in signs itself
 * up again with its new login.
 *
 * Messages are signed with VAPID keys: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY if set, or else a pair the
 * server makes on first use and keeps in the data folder (one pair for every family in hosted mode). The
 * push services (Google, Apple, Mozilla, Microsoft) only ever see encrypted messages.
 */

export interface PushDevice {
  id: number;
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
  tokenVersion: number;
  createdAt: string;
  lastOkAt: string | null;
}

/** At most this many devices per person; the oldest goes when another signs up. */
export const MAX_DEVICES = 10;
/** A message nobody received in 12 hours (a phone that was off) is dropped: summaries and nudges are stale by then. */
const TTL_SECONDS = 12 * 3600;

let keys: { publicKey: string; privateKey: string } | null = null;

/** The server's VAPID keys (made and saved on first use). */
export function vapidKeys(): { publicKey: string; privateKey: string } {
  if (keys) return keys;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (publicKey && privateKey) return (keys = { publicKey, privateKey });
  const file = path.join(dataDir(), 'vapid-keys.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof saved.publicKey === 'string' && typeof saved.privateKey === 'string') return (keys = saved);
  } catch { /* none yet: make a pair */ }
  const made = webpush.generateVAPIDKeys();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(made), { mode: 0o600 });
  console.log(`[push] Made the web push keys in ${file}. Keep this file with the data: without it, every device has to turn notifications on again.`);
  return (keys = made);
}

/** Who the push services can contact about this server's messages. */
const subject = () => process.env.VAPID_SUBJECT?.trim() || 'https://github.com/TidyQuest/TidyQuest';

/** Web push is switched on for this family (Settings → Features). */
export const pushOn = () => isFeatureOn('webPush');

// Only the browsers' own push services: the server sends to this address, so it can't be one a person typed
// (in hosted mode that could be a machine inside the hosting network).
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, // Chrome, Edge on Android, Samsung Internet, Opera, Brave
  /(^|\.)push\.apple\.com$/, // Safari on iPhone, iPad and Mac
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)notify\.windows\.com$/, // Edge on Windows
];

export function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1024) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.port && !u.username && !u.password && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

const KEY = /^[A-Za-z0-9_-]{8,200}={0,2}$/;

/** Saves this device for this person (the same device signing up again replaces its row). */
export function saveDevice(userId: number, sub: { endpoint: unknown; p256dh: unknown; auth: unknown; label?: unknown }): PushDevice | null {
  if (!validEndpoint(sub.endpoint) || typeof sub.p256dh !== 'string' || !KEY.test(sub.p256dh) || typeof sub.auth !== 'string' || !KEY.test(sub.auth)) return null;
  const label = typeof sub.label === 'string' ? sub.label.replace(/\p{Cc}/gu, '').trim().slice(0, 60) : '';
  const version = (prepared('SELECT tokenVersion FROM users WHERE id = ?').get(userId) as { tokenVersion: number } | undefined)?.tokenVersion;
  if (version === undefined) return null;
  const existing = prepared('SELECT id, userId FROM push_subscriptions WHERE endpoint = ?').get(sub.endpoint) as { id: number; userId: number } | undefined;
  if (existing && existing.userId === userId) {
    db.prepare('UPDATE push_subscriptions SET p256dh = ?, auth = ?, label = ?, tokenVersion = ? WHERE id = ?').run(sub.p256dh, sub.auth, label, version, existing.id);
  } else {
    // Someone else signed in on this device: it's theirs now
    if (existing) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(existing.id);
    db.prepare('INSERT INTO push_subscriptions (userId, endpoint, p256dh, auth, label, tokenVersion) VALUES (?, ?, ?, ?, ?, ?)').run(userId, sub.endpoint, sub.p256dh, sub.auth, label, version);
    db.prepare(`DELETE FROM push_subscriptions WHERE userId = ? AND id NOT IN (SELECT id FROM push_subscriptions WHERE userId = ? ORDER BY id DESC LIMIT ${MAX_DEVICES})`).run(userId, userId);
  }
  return prepared('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(sub.endpoint) as PushDevice;
}

/** The person's devices whose login still works. */
export function activeDevices(userId: number): PushDevice[] {
  return prepared(`SELECT d.* FROM push_subscriptions d JOIN users u ON u.id = d.userId
    WHERE d.userId = ? AND d.tokenVersion = u.tokenVersion ORDER BY d.id`).all(userId) as PushDevice[];
}

/** Turned off on the device itself (or it signed out). */
export function removeDeviceByEndpoint(userId: number, endpoint: string): boolean {
  return db.prepare('DELETE FROM push_subscriptions WHERE userId = ? AND endpoint = ?').run(userId, endpoint).changes > 0;
}

/** A parent (or the person) removes one from the list. */
export function removeDevice(userId: number, id: number): boolean {
  return db.prepare('DELETE FROM push_subscriptions WHERE userId = ? AND id = ?').run(userId, id).changes > 0;
}

export type PushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, options: webpush.RequestOptions) => Promise<unknown>;
let sender: PushSender = (sub, payload, options) => webpush.sendNotification(sub, payload, options);
/** Tests: stand in for the push services (call with no argument to restore). */
export function setPushSender(s?: PushSender) { sender = s ?? ((sub, payload, options) => webpush.sendNotification(sub, payload, options)); }

/** Sends one message to one device. A device the push service says is gone is removed. */
export async function sendPush(deviceId: number, message: string): Promise<{ ok: boolean; error?: string }> {
  const d = prepared('SELECT * FROM push_subscriptions WHERE id = ?').get(deviceId) as PushDevice | undefined;
  if (!d) return { ok: false, error: 'This device was removed.' };
  const { publicKey, privateKey } = vapidKeys();
  const payload = JSON.stringify({ title: 'TidyQuest', body: message.slice(0, 1500) });
  try {
    await sender({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, {
      vapidDetails: { subject: subject(), publicKey, privateKey },
      TTL: TTL_SECONDS,
      timeout: sendTimeout(),
    });
    db.prepare('UPDATE push_subscriptions SET lastOkAt = ? WHERE id = ?').run(new Date().toISOString(), d.id);
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(d.id);
      return { ok: false, error: 'This device no longer takes notifications, so it was removed.' };
    }
    return { ok: false, error: status ? `The push service returned ${status}.` : 'Could not reach the push service.' };
  }
}
