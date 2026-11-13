import db from '../database';
import { isFeatureOn } from './features';

/**
 * "What's new" after a big update (NEW-38). The ids of the announcements the client has slides for
 * (client/src/components/shared/WhatsNew.tsx), oldest first: add a new one here and there together.
 */
export const WHATS_NEW = ['new-look'] as const;

const ARRIVED_KEY = 'whatsNewArrived';

/** When each announcement first reached this family's database (app_settings, a JSON object of id -> time). */
function arrivals(instance: Pick<typeof db, 'prepare'> = db): Record<string, string> {
  try {
    const raw = (instance.prepare('SELECT value FROM app_settings WHERE key = ?').get(ARRIVED_KEY) as { value: string } | undefined)?.value;
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === 'object' ? map : {};
  } catch { return {}; }
}

/**
 * At start-up (and when a hosted family's database opens): note the time an announcement first arrived. People whose
 * accounts are newer never saw the old app, so it isn't shown to them, and a new install or family starts with none.
 */
export function recordWhatsNewArrivals(instance: Pick<typeof db, 'prepare'> = db) {
  const map = arrivals(instance);
  const missing = WHATS_NEW.filter((id) => !map[id]);
  if (!missing.length) return;
  const now = (instance.prepare("SELECT datetime('now') AS now").get() as { now: string }).now;
  for (const id of missing) map[id] = now;
  instance.prepare("INSERT OR REPLACE INTO app_settings (key, value, updatedAt) VALUES (?, ?, datetime('now'))").run(ARRIVED_KEY, JSON.stringify(map));
}

/** The announcements this person still has to see, oldest first (none when the family switched them off). */
export function unseenWhatsNew(userId: number): string[] {
  if (!isFeatureOn('whatsNew')) return [];
  const map = arrivals();
  const seen = new Set((db.prepare('SELECT itemId FROM whats_new_seen WHERE userId = ?').all(userId) as Array<{ itemId: string }>).map((r) => r.itemId));
  // julianday() reads both "2026-11-20 10:00:00" and ISO times, however the account was made
  const olderThan = db.prepare('SELECT 1 FROM users WHERE id = ? AND julianday(createdAt) < julianday(?)');
  return WHATS_NEW.filter((id) => map[id] && !seen.has(id) && olderThan.get(userId, map[id]));
}

/** Seen (or skipped): the given announcements, or all of them, for these people. */
export function markWhatsNewSeen(userIds: number[], ids: readonly string[] = WHATS_NEW) {
  const known = ids.filter((id) => (WHATS_NEW as readonly string[]).includes(id));
  const insert = db.prepare('INSERT OR IGNORE INTO whats_new_seen (userId, itemId) VALUES (?, ?)');
  for (const userId of userIds) for (const id of known) insert.run(userId, id);
}
