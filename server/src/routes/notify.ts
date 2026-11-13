import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { NOTIFICATION_KINDS } from '../utils/notifications';
import { familyChannels, getPeople, personalChannels, sendPersonTest, wants, type NotifyKind } from '../utils/notify';
import { answerNotifyCard } from '../utils/notifyCard';
import { activeDevices, pushOn, removeDevice, removeDeviceByEndpoint, saveDevice, vapidKeys } from '../utils/push';
import { SCHEDULE_DEFAULTS } from '../utils/notifySchedule';
import { tr } from '../utils/i18n';
import { isHosted } from '../hosted/context';

/**
 * Notification settings beyond the family channel (Settings → Notifications): times for the
 * summaries, quiet and school hours, Home Assistant, each person's own channels and choices, and the
 * log of what was sent.
 */
const router = Router();
router.use(authMiddleware);

const get = (key: string) => (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? '';
const set = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function readSettings() {
  return {
    morningTime: get('morningTime') || SCHEDULE_DEFAULTS.morningTime,
    eveningTime: get('eveningTime') || SCHEDULE_DEFAULTS.eveningTime,
    recapDay: Number(get('recapDay') || SCHEDULE_DEFAULTS.recapDay),
    recapTime: get('recapTime') || SCHEDULE_DEFAULTS.recapTime,
    quietStart: get('quietStart'),
    quietEnd: get('quietEnd'),
    schoolHoursEnabled: get('schoolHoursEnabled') === '1',
    schoolStart: get('schoolStart') || '08:00',
    schoolEnd: get('schoolEnd') || '15:00',
    haUrl: get('haUrl'),
    hasHaToken: !!get('haToken'),
    haFamilyService: get('haFamilyService'),
  };
}

router.get('/settings', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  res.json(readSettings());
});

router.put('/settings', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const b = req.body ?? {};
  for (const key of ['morningTime', 'eveningTime', 'recapTime', 'schoolStart', 'schoolEnd']) {
    if (b[key] !== undefined && !HM.test(String(b[key]))) return res.status(400).json({ error: 'invalid_time', field: key });
  }
  for (const key of ['quietStart', 'quietEnd']) {
    if (b[key] !== undefined && b[key] !== '' && !HM.test(String(b[key]))) return res.status(400).json({ error: 'invalid_time', field: key });
  }
  if (b.recapDay !== undefined && !(Number.isInteger(Number(b.recapDay)) && Number(b.recapDay) >= 0 && Number(b.recapDay) <= 6)) {
    return res.status(400).json({ error: 'invalid_day' });
  }
  // Hosted mode has no Home Assistant: its address could be a machine inside the hosting network
  if (isHosted() && (b.haUrl || b.haToken || b.haFamilyService)) return res.status(400).json({ error: 'ha_off' });
  if (b.haUrl) {
    try {
      if (!['http:', 'https:'].includes(new URL(String(b.haUrl)).protocol)) throw new Error('protocol');
    } catch {
      return res.status(400).json({ error: 'invalid_url' });
    }
  }
  if (b.haFamilyService && !/^(notify\.)?[a-z0-9_]+$/.test(String(b.haFamilyService))) return res.status(400).json({ error: 'invalid_service' });
  for (const key of ['morningTime', 'eveningTime', 'recapTime', 'schoolStart', 'schoolEnd', 'quietStart', 'quietEnd', 'haFamilyService']) {
    if (b[key] !== undefined) set(key, String(b[key]).trim());
  }
  if (b.recapDay !== undefined) set('recapDay', String(Number(b.recapDay)));
  if (b.schoolHoursEnabled !== undefined) set('schoolHoursEnabled', b.schoolHoursEnabled ? '1' : '0');
  if (b.haUrl !== undefined) set('haUrl', String(b.haUrl).trim().replace(/\/+$/, ''));
  // The token is write-only: empty string clears it, leaving it out keeps it
  if (typeof b.haToken === 'string') set('haToken', b.haToken.trim());
  res.json(readSettings());
});

const canEdit = (req: AuthRequest, userId: number) => ensureAdmin(req.userId) || req.userId === userId;

function personView(id: number) {
  const p = getPeople().find((x) => x.id === id);
  if (!p) return null;
  return {
    id: p.id, displayName: p.displayName, role: p.role, language: p.language,
    ntfyTopic: p.ntfyTopic ?? '', telegramChatId: p.telegramChatId ?? '', haNotifyService: p.haNotifyService ?? '',
    prefs: Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, wants(p, k)])),
    channels: [...new Set(personalChannels(p).map((c) => c.channel))],
    // Whether a family channel is on: without one, someone with no channel of their own gets nothing (ENH-31)
    familyChannel: familyChannels().length > 0,
    // Phones and computers where they turned on web push (NEW-5)
    devices: pushOn() ? activeDevices(p.id).map((d) => ({ id: d.id, label: d.label, createdAt: d.createdAt, lastOkAt: d.lastOkAt })) : [],
    // Can't log in (ENH-16): nothing is sent to them until a parent turns it back on
    canLogIn: p.canLogIn !== 0,
  };
}

router.get('/people', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  res.json(getPeople().map((p) => personView(p.id)));
});

router.get('/people/:id', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!canEdit(req, id)) return res.status(403).json({ error: 'Not allowed' });
  const view = personView(id);
  if (!view) return res.status(404).json({ error: 'not_found' });
  res.json(view);
});

router.put('/people/:id', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!canEdit(req, id)) return res.status(403).json({ error: 'Not allowed' });
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) return res.status(404).json({ error: 'not_found' });
  const b = req.body ?? {};
  const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (b.ntfyTopic !== undefined && clean(b.ntfyTopic) && !/^[A-Za-z0-9_-]{1,64}$/.test(clean(b.ntfyTopic))) return res.status(400).json({ error: 'invalid_topic' });
  if (b.telegramChatId !== undefined && clean(b.telegramChatId) && !/^-?\d{1,20}$|^@[A-Za-z0-9_]{4,64}$/.test(clean(b.telegramChatId))) return res.status(400).json({ error: 'invalid_chat' });
  if (b.haNotifyService !== undefined && clean(b.haNotifyService) && !/^(notify\.)?[a-z0-9_]+$/.test(clean(b.haNotifyService))) return res.status(400).json({ error: 'invalid_service' });
  if (isHosted() && clean(b.haNotifyService)) return res.status(400).json({ error: 'ha_off' });
  // Hosted mode (NEW-34): only a parent says where anyone's notifications go, so a child can't send theirs
  // to a stranger's ntfy topic or Telegram chat. Everyone still picks which kinds they get.
  if (isHosted() && !ensureAdmin(req.userId)) {
    const now = db.prepare('SELECT ntfyTopic, telegramChatId FROM users WHERE id = ?').get(id) as { ntfyTopic: string | null; telegramChatId: string | null };
    const changes = (key: 'ntfyTopic' | 'telegramChatId') => b[key] !== undefined && clean(b[key]) !== (now[key] ?? '');
    if (changes('ntfyTopic') || changes('telegramChatId')) return res.status(403).json({ error: 'parent_only' });
  }
  const updates: Record<string, string | null> = {};
  for (const key of ['ntfyTopic', 'telegramChatId', 'haNotifyService']) if (b[key] !== undefined) updates[key] = clean(b[key]) || null;
  if (b.prefs && typeof b.prefs === 'object') {
    // Only what differs from the starting choice is kept (BUG-52: "Chores anyone can do" starts off for kids)
    const person = getPeople().find((x) => x.id === id);
    const start = (k: NotifyKind) => wants({ prefs: {}, role: person?.role ?? 'member' }, k);
    updates.notifyPrefs = JSON.stringify(Object.fromEntries(NOTIFICATION_KINDS
      .filter((k) => typeof b.prefs[k] === 'boolean' && b.prefs[k] !== start(k)).map((k) => [k, b.prefs[k]])));
  }
  const cols = Object.keys(updates);
  if (cols.length) db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(updates), id);
  res.json(personView(id));
});

router.post('/people/:id/test', async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!canEdit(req, id)) return res.status(403).json({ error: 'Not allowed' });
  const p = getPeople().find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const results = await sendPersonTest(id, tr(p.language, 'notify.test', { name: p.displayName }));
  if (results.length === 0) return res.status(400).json({ error: 'no_channels' });
  res.json({ results });
});

// Web push (NEW-5, utils/push.ts). The key a browser needs to sign up, and whether push can be used at all.
router.get('/push', (_req: AuthRequest, res: Response) => {
  res.json({ publicKey: vapidKeys().publicKey, on: pushOn(), notificationsOn: get('notificationsEnabled') === '1' });
});

// This device signs up (Profile → This device → Turn on), or again with a new login. Always for the person
// signed in: the subscription comes from their own browser.
router.post('/push/devices', (req: AuthRequest, res: Response) => {
  if (!pushOn()) return res.status(403).json({ error: 'push_off' });
  const b = req.body ?? {};
  const device = saveDevice(req.userId!, { endpoint: b.endpoint, p256dh: b.keys?.p256dh, auth: b.keys?.auth, label: b.label });
  if (!device) return res.status(400).json({ error: 'invalid_subscription' });
  res.json({ id: device.id });
});

// The "turn on notifications" card on Today (ENH-31): Turn on worked, or Not now
router.post('/card', (req: AuthRequest, res: Response) => {
  const answer = req.body?.answer;
  if (answer !== 'done' && answer !== 'snooze') return res.status(400).json({ error: 'invalid_answer' });
  answerNotifyCard(req.userId!, answer);
  res.json({ success: true });
});

// This device turns it off, or signs out
router.post('/push/devices/forget', (req: AuthRequest, res: Response) => {
  if (typeof req.body?.endpoint === 'string') removeDeviceByEndpoint(req.userId!, req.body.endpoint);
  res.json({ success: true });
});

// A parent (or the person) removes a device from the list
router.delete('/people/:id/devices/:deviceId', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!canEdit(req, id)) return res.status(403).json({ error: 'Not allowed' });
  if (!removeDevice(id, Number(req.params.deviceId))) return res.status(404).json({ error: 'not_found' });
  res.json(personView(id));
});

router.get('/log', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  res.json(db.prepare(
    `SELECT l.id, l.sentAt, l.userId, u.displayName, l.channel, l.kind, l.message, l.ok, l.error
     FROM notification_log l LEFT JOIN users u ON u.id = l.userId ORDER BY l.id DESC LIMIT 100`
  ).all());
});

export default router;
