import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../database';
import { AuthRequest, authMiddleware, loginToken } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { BACKUP_TABLES } from '../forkSchema';
import { isHosted } from '../hosted/context';
import { accountUsernames, relinkAccounts } from '../hosted/accounts';
import { dropRefusedAddresses, tooManyPeople } from '../hosted/limits';

const router = Router();
router.use(authMiddleware);

/**
 * Tables in a backup, parents before children. The key is the property name in the backup file
 * (kept from older versions so their files still import).
 */
const TABLES: Array<{ key: string; table: string }> = [
  { key: 'users', table: 'users' },
  { key: 'zones', table: 'zones' },
  { key: 'rooms', table: 'rooms' },
  { key: 'tasks', table: 'tasks' },
  { key: 'taskAssignees', table: 'task_assignees' },
  { key: 'completions', table: 'task_completions' },
  { key: 'goals', table: 'user_goals' },
  { key: 'rewards', table: 'rewards' },
  { key: 'rewardRedemptions', table: 'reward_redemptions' },
  ...BACKUP_TABLES,
];

interface ColumnInfo { name: string; notnull: number; dflt_value: unknown }

function columnsOf(table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

/**
 * Insert backup rows using whatever columns the table has today, so no column is silently
 * dropped. Keys the table doesn't know are ignored; missing or null values fall back to the
 * column default.
 */
function insertRows(table: string, rows: any[], skip: string[] = []) {
  const cols = columnsOf(table).filter((c) => !skip.includes(c.name));
  // Optional links to rows the backup doesn't contain (e.g. a room's zone, when an older backup has
  // no zones) are cleared instead of failing the whole import on a foreign key.
  const optionalLinks = (db.prepare(`PRAGMA foreign_key_list(${table})`).all() as { table: string; from: string; to: string | null }[])
    .filter((fk) => !cols.find((c) => c.name === fk.from)?.notnull);
  for (const original of rows) {
    const row = { ...original };
    for (const fk of optionalLinks) {
      if (row[fk.from] == null) continue;
      const exists = db.prepare(`SELECT 1 FROM ${fk.table} WHERE ${fk.to ?? 'id'} = ?`).get(row[fk.from]);
      if (!exists) row[fk.from] = null;
    }
    const present = cols.filter((c) => row[c.name] !== undefined && !(row[c.name] === null && c.notnull && c.dflt_value !== null));
    if (present.length === 0) continue;
    const values = present.map((c) => (typeof row[c.name] === 'boolean' ? (row[c.name] ? 1 : 0) : row[c.name]));
    db.prepare(`INSERT INTO ${table} (${present.map((c) => c.name).join(', ')}) VALUES (${present.map(() => '?').join(', ')})`).run(...values);
  }
}

// Export all data as JSON
router.get('/export', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const out: Record<string, unknown> = { version: 7, exportedAt: new Date().toISOString() };
  for (const { key, table } of TABLES) {
    out[key] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  // Password hashes never leave the server, nor login token versions (a restore must not bring back
  // logins that were cut off)
  out.users = (out.users as any[]).map(({ passwordHash: _omit, tokenVersion: _v, ...u }) => u);
  out.settings = db.prepare('SELECT * FROM app_settings').all();

  res.setHeader('Content-Disposition', 'attachment; filename=tidyquest-backup.json');
  res.json(out);
});

// Import data from JSON (replaces everything)
router.post('/import', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const body = req.body || {};
  const { users, rooms, tasks, completions, settings, taskAssignees } = body;

  if (!Array.isArray(users) || !Array.isArray(rooms) || !Array.isArray(tasks) || !Array.isArray(completions)) {
    return res.status(400).json({ error: 'Invalid backup format. Expected arrays: users, rooms, tasks, completions' });
  }
  // Hosted mode: up to MAX_PEOPLE (15) in a family
  const tooMany = tooManyPeople(users.length);
  if (tooMany) return res.status(403).json(tooMany);

  // Password hashes are never accepted from a file. Everyone who already has an account here (same
  // username, the importing admin included) keeps their current password; new people get a random one
  // and need a reset. People are matched by username only: the file may give an id to someone else.
  const currentAdmin = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.userId) as { id: number; username: string };
  const adminName = currentAdmin.username.toLowerCase();
  const adminInFile = users.find((u: any) => String(u?.username).toLowerCase() === adminName && u.role === 'admin');
  // Importing a file without yourself as a parent would sign you out for good
  if (!adminInFile) {
    return res.status(400).json({ error: `This backup doesn't list you (${currentAdmin.username}) as a parent`, code: 'not-in-backup', username: currentAdmin.username });
  }
  const existing = db.prepare('SELECT id, username, passwordHash, tokenVersion, agreedAt, agreedTerms, agreedPrivacy FROM users').all() as
    { id: number; username: string; passwordHash: string; tokenVersion: number; agreedAt: string | null; agreedTerms: string | null; agreedPrivacy: string | null }[];
  const existingHashes = new Map(existing.map((u) => [u.username.toLowerCase(), u.passwordHash]));
  // Logins name people by id. They stay as they are (NEW-8) only where an id still belongs to the same
  // person; anyone else gets a version no earlier login can carry, so a phone signed in as the old holder
  // of that id (or as someone removed) doesn't open their account (BUG-21).
  const existingById = new Map(existing.map((u) => [u.id, u]));
  const versionFor = (id: unknown, name: string) => {
    const before = existingById.get(Number(id));
    return before && before.username.toLowerCase() === name ? before.tokenVersion : crypto.randomInt(1_000_000, 2 ** 31 - 1);
  };
  // So do agreements to the terms (NEW-34): a file can't say someone agreed
  const existingAgreements = new Map(existing.map(({ username, agreedAt, agreedTerms, agreedPrivacy }) => [username.toLowerCase(), { agreedAt, agreedTerms, agreedPrivacy }]));

  // Hosted mode: parents' sign-in emails follow them to their ids in the file
  const accounts = isHosted() ? accountUsernames(req.familyId!) : [];

  // Backups from before BUG-22 have no earned badges, and removing the people removes theirs: keep each
  // person's from here (by username), or every badge they still qualify for would pay its bonus again
  const keptBadges = Array.isArray(body.earnedBadges) ? [] : db.prepare(
    'SELECT u.username, b.achievementId, b.sentAt FROM user_achievement_notifications b JOIN users u ON u.id = b.userId'
  ).all() as { username: string; achievementId: string; sentAt: string }[];

  const importData = db.transaction(() => {
    // Web push devices belong to people's ids on this server, which the backup may give to someone else (NEW-5).
    // Each device signs up again when the app opens.
    db.prepare('DELETE FROM push_subscriptions').run();
    // Clear existing data, children first. Zones are only replaced when the backup has them.
    for (const { key, table } of [...TABLES].reverse()) {
      if (table === 'zones' && !Array.isArray(body.zones)) continue;
      if (BACKUP_TABLES.some((t) => t.table === table) && !Array.isArray(body[key])) continue;
      db.prepare(`DELETE FROM ${table}`).run();
    }

    const usersWithHashes = users.map((u: any) => {
      const name = String(u.username).toLowerCase();
      const passwordHash = existingHashes.get(name) ?? bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
      const { passwordHash: _ignored, tokenVersion: _v, agreedAt: _a, agreedTerms: _t, agreedPrivacy: _p, ...rest } = u;
      return { ...rest, passwordHash, tokenVersion: versionFor(u.id, name), ...existingAgreements.get(name) };
    });
    insertRows('users', usersWithHashes);

    if (Array.isArray(body.zones)) insertRows('zones', body.zones);
    insertRows('rooms', rooms);
    insertRows('tasks', tasks);

    if (Array.isArray(taskAssignees)) {
      insertRows('task_assignees', taskAssignees);
    } else {
      // Backward compatibility for older backups without task_assignees array
      for (const t of tasks) {
        if (t.assignedUserId != null) {
          db.prepare('INSERT OR IGNORE INTO task_assignees (taskId, userId, coinPercentage) VALUES (?, ?, 0)')
            .run(t.id, t.assignedUserId);
        }
      }
    }

    insertRows('task_completions', completions.map((c: any) => ({ ...c, status: c.status || 'approved' })));

    if (Array.isArray(settings)) {
      db.prepare('DELETE FROM app_settings').run();
      for (const s of settings) {
        db.prepare('INSERT INTO app_settings (key, value, updatedAt) VALUES (?, ?, COALESCE(?, datetime(\'now\')))').run(s.key, s.value, s.updatedAt);
      }
    }

    for (const { key, table } of TABLES) {
      if (['users', 'zones', 'rooms', 'tasks', 'task_assignees', 'task_completions'].includes(table)) continue;
      if (Array.isArray(body[key])) insertRows(table, body[key]);
    }
    const keepBadge = db.prepare(`INSERT OR IGNORE INTO user_achievement_notifications (userId, achievementId, sentAt)
      SELECT id, ?, ? FROM users WHERE username = ? COLLATE NOCASE`);
    for (const b of keptBadges) keepBadge.run(b.achievementId, b.sentAt, b.username);
    // Hosted mode: no Home Assistant or custom ntfy server from a self-hosted backup
    dropRefusedAddresses();
  });

  importData();
  if (isHosted()) relinkAccounts(req.familyId!, accounts);
  // The importing admin may have a new id now: a fresh login (and photos cookie) for this device
  const me = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(currentAdmin.username) as { id: number };
  const token = loginToken(res, me.id);
  res.json({ success: true, token, imported: { users: users.length, rooms: rooms.length, tasks: tasks.length, completions: completions.length } });
});

export default router;
