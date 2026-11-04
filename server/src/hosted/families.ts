import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { createDatabase, initDatabase } from '../database';
import { registerClockFunctions } from '../utils/clock';
import { FamilyContext, runInFamily } from './context';
import { codeKey, newFamilyCode } from './familyCode';
import { dataDir, mainDb, openMainDb } from './mainDb';

type Db = InstanceType<typeof Database>;

/** Family ids are random (16 letters and digits), so they don't show how many families there are. */
export const FAMILY_ID = /^[a-z0-9]{16}$/;
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const TRIAL_DAYS = 30;
/** A deleted family's folder is kept this long, then removed. */
export const KEEP_DELETED_DAYS = 30;

export function newFamilyId(): string {
  let id = '';
  for (let i = 0; i < 16; i++) id += ID_CHARS[crypto.randomInt(ID_CHARS.length)];
  return id;
}

/** data/families/<familyId>/ holds tidyquest.db, avatars/ and proofs/. */
export const familyDir = (id: string) => path.join(dataDir(), 'families', id);
const deletedDir = () => path.join(dataDir(), 'deleted');

// Open family databases. One nobody has used for an hour is closed, so the number open follows the
// families active right now. The background jobs use every trial and paid family's database twice a
// minute, so those stay open; suspended and expired ones close.
const open = new Map<string, { db: Db; lastUsed: number; lastActiveSaved: number }>();

/** Makes a family: its folder, its database, its row in main.db and its family code. Tests pass an in-memory database. */
export function createFamily(name: string, opts: { db?: Db; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  let id = newFamilyId();
  while (fs.existsSync(familyDir(id)) || mainDb().prepare('SELECT 1 FROM families WHERE id = ?').get(id)) id = newFamilyId();
  fs.mkdirSync(path.join(familyDir(id), 'avatars'), { recursive: true });
  fs.mkdirSync(path.join(familyDir(id), 'proofs'), { recursive: true });
  const db = opts.db ?? createDatabase(path.join(familyDir(id), 'tidyquest.db'));
  if (opts.db) registerClockFunctions(db);
  else runInFamily({ familyId: id, db }, () => initDatabase());
  open.set(id, { db, lastUsed: now.getTime(), lastActiveSaved: now.getTime() });
  mainDb().prepare('INSERT INTO families (id, name, status, trialEndsAt, createdAt, lastActiveAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, 'trial', new Date(now.getTime() + TRIAL_DAYS * DAY).toISOString(), now.toISOString(), now.toISOString());
  newFamilyCode(id);
  return id;
}

/** Billing is on when a payment key is set. NEW-19 picks the company (and may rename the variable). */
export const billingOn = () => !!process.env.PAYMENT_KEY;

export type FamilyStatus = 'trial' | 'active' | 'suspended' | 'expired' | 'deleted';
interface StatusRow { status: string; trialEndsAt: string | null; plan: string | null }

/**
 * Where a family stands: trial and active get in, suspended and expired only reach their account and
 * export (HOSTED.md §8). A trial counts as expired once it has ended, but only with billing on: until
 * then families never expire (decision 11).
 */
export function familyStatus(row: StatusRow, now = Date.now()): FamilyStatus {
  const status = row.status as FamilyStatus;
  if (status === 'trial' && billingOn() && !row.plan && row.trialEndsAt && Date.parse(row.trialEndsAt) <= now) return 'expired';
  return status;
}

export function familyStatusOf(id: string, now = Date.now()): FamilyStatus {
  const row = mainDb().prepare('SELECT status, trialEndsAt, plan FROM families WHERE id = ?').get(id) as StatusRow | undefined;
  return row ? familyStatus(row, now) : 'deleted';
}

/** Whether this is a family that exists and isn't deleted. */
export function isLiveFamily(id: unknown): id is string {
  if (typeof id !== 'string' || !FAMILY_ID.test(id)) return false;
  return !!mainDb().prepare('SELECT 1 FROM families WHERE id = ? AND deletedAt IS NULL').get(id);
}

/**
 * The family's database, opened on first use (which also upgrades its schema). Null for an unknown or
 * deleted family. main.db is asked every time, so a deleted family is shut out at once. Background jobs
 * pass activity: false, so lastActiveAt still means a person used the app.
 */
export function openFamily(id: unknown, now = Date.now(), { activity = true } = {}): FamilyContext | null {
  if (!isLiveFamily(id)) return null;
  let entry = open.get(id);
  if (!entry) {
    const file = path.join(familyDir(id), 'tidyquest.db');
    if (!fs.existsSync(file)) return null;
    const db = createDatabase(file);
    try {
      runInFamily({ familyId: id, db }, () => initDatabase());
    } catch (err) {
      db.close();
      throw err;
    }
    entry = { db, lastUsed: now, lastActiveSaved: 0 };
    open.set(id, entry);
  }
  entry.lastUsed = now;
  if (activity && now - entry.lastActiveSaved >= HOUR) {
    entry.lastActiveSaved = now;
    mainDb().prepare('UPDATE families SET lastActiveAt = ? WHERE id = ?').run(new Date(now).toISOString(), id);
  }
  return { familyId: id, db: entry.db };
}

function closeFamily(id: string): void {
  const entry = open.get(id);
  if (!entry) return;
  open.delete(id);
  if (entry.db.open) entry.db.close();
}

/** Closes the family databases nobody has used for an hour. Returns how many it closed. */
export function closeIdleFamilies(now = Date.now()): number {
  let closed = 0;
  for (const [id, entry] of open) {
    if (now - entry.lastUsed >= HOUR) {
      closeFamily(id);
      closed++;
    }
  }
  return closed;
}

/** Closes every open family database (a fresh test server starts with none). */
export function closeAllFamilies(): void {
  for (const id of [...open.keys()]) closeFamily(id);
}

/**
 * What a restore needs (NEW-23), kept as restore.json in the deleted folder, since deleting frees the emails
 * and the family code in main.db. It goes with the folder after 30 days.
 */
export interface SavedFamily {
  status: string;
  code: string | null;
  accounts: { email: string; userId: number; emailConfirmedAt: string | null; createdAt: string; newsAt: string | null }[];
}
const SAVED_FILE = 'restore.json';

/** A deleted family's folder in deleted/, if it's still there. */
function keptFolder(id: string): string | null {
  if (!FAMILY_ID.test(id) || !fs.existsSync(deletedDir())) return null;
  const name = fs.readdirSync(deletedDir()).find((n) => n.startsWith(`${id}-`));
  return name ? path.join(deletedDir(), name) : null;
}

/** What was saved when this family was deleted: null when its folder is gone, {} when it was deleted before NEW-23. */
export function savedFamily(id: string): Partial<SavedFamily> | null {
  const kept = keptFolder(id);
  if (!kept) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(kept, SAVED_FILE), 'utf8')) as SavedFamily;
  } catch {
    return {};
  }
}

/**
 * Deletes a family: its folder moves to data/deleted/<familyId>-<date>/ (kept 30 days), and its emails
 * and family code are freed for a new sign-up. restore.json in the folder keeps them for a restore.
 */
export function deleteFamily(id: string, now = new Date()): boolean {
  if (!isLiveFamily(id)) return false;
  closeFamily(id);
  const main = mainDb();
  if (fs.existsSync(familyDir(id))) {
    const { status, code } = main.prepare('SELECT status, code FROM families WHERE id = ?').get(id) as { status: string; code: string | null };
    const accounts = main.prepare('SELECT email, userId, emailConfirmedAt, createdAt, newsAt FROM accounts WHERE familyId = ? ORDER BY createdAt').all(id) as SavedFamily['accounts'];
    const kept = path.join(deletedDir(), `${id}-${now.toISOString().slice(0, 10)}`);
    fs.mkdirSync(deletedDir(), { recursive: true });
    fs.renameSync(familyDir(id), kept);
    fs.writeFileSync(path.join(kept, SAVED_FILE), JSON.stringify({ status, code, accounts } satisfies SavedFamily, null, 2));
  }
  main.transaction(() => {
    main.prepare('DELETE FROM email_tokens WHERE familyId = ?').run(id);
    main.prepare('DELETE FROM accounts WHERE familyId = ?').run(id);
    main.prepare("UPDATE families SET status = 'deleted', code = NULL, codeKey = NULL, deletedAt = ? WHERE id = ?").run(now.toISOString(), id);
  })();
  return true;
}

export interface Restored {
  status: 'trial' | 'active' | 'suspended';
  code: string;
  /** The code it had, when a new sign-up took it meanwhile */
  codeTaken: string | null;
  /** The parents' emails that came back, and the ones a new sign-up took meanwhile */
  emails: string[];
  emailsTaken: string[];
  /** Deleted before restores kept the emails and the code (NEW-23): none came back, and the code is new */
  nothingSaved: boolean;
}

/**
 * Brings back a deleted family whose folder is still in deleted/ (NEW-23): the folder moves back, and the
 * status, family code and parents' emails come back from restore.json. An email or code a new sign-up took
 * meanwhile is skipped; the family then gets a new code. The clean-up jobs' warnings start over, so a family
 * one of them deleted is warned again, with the usual notice, before that happens again. Null when there's
 * nothing to restore.
 */
export function restoreFamily(id: string): Restored | null {
  const main = mainDb();
  const row = main.prepare('SELECT plan FROM families WHERE id = ? AND deletedAt IS NOT NULL').get(id) as { plan: string | null } | undefined;
  const kept = row ? keptFolder(id) : null;
  if (!row || !kept || fs.existsSync(familyDir(id))) return null;
  const saved = savedFamily(id) ?? {};
  fs.mkdirSync(path.dirname(familyDir(id)), { recursive: true });
  fs.renameSync(kept, familyDir(id));
  try {
    const restored = main.transaction((): Restored => {
      const status = saved.status === 'trial' || saved.status === 'active' || saved.status === 'suspended' ? saved.status
        : row.plan ? 'active' : 'trial';
      main.prepare(`UPDATE families SET status = ?, deletedAt = NULL, trialWarnedAt = NULL, consentRemindedAt = NULL,
        inactiveWarnedAt = NULL WHERE id = ?`).run(status, id);
      const old = saved.code ?? null;
      const free = !!old && !main.prepare('SELECT 1 FROM families WHERE codeKey = ?').get(codeKey(old));
      if (free) main.prepare('UPDATE families SET code = ?, codeKey = ? WHERE id = ?').run(old, codeKey(old), id);
      const code = free ? old! : newFamilyCode(id);
      const emails: string[] = [];
      const emailsTaken: string[] = [];
      for (const a of saved.accounts ?? []) {
        if (main.prepare('SELECT 1 FROM accounts WHERE email = ?').get(a.email)) {
          emailsTaken.push(a.email);
          continue;
        }
        main.prepare('INSERT INTO accounts (email, familyId, userId, emailConfirmedAt, createdAt, newsAt) VALUES (?, ?, ?, ?, ?, ?)')
          .run(a.email, id, a.userId, a.emailConfirmedAt, a.createdAt, a.newsAt);
        emails.push(a.email);
      }
      return { status, code, codeTaken: old && !free ? old : null, emails, emailsTaken, nothingSaved: !saved.accounts };
    })();
    fs.rmSync(path.join(familyDir(id), SAVED_FILE), { force: true });
    return restored;
  } catch (err) {
    fs.renameSync(familyDir(id), kept);
    throw err;
  }
}

/**
 * Removes the folders of families deleted more than 30 days ago (a daily job from NEW-11), and their names
 * and emails from the operator History (NEW-34: no leftovers).
 */
export function purgeDeletedFamilies(now = new Date()): number {
  const main = mainDb();
  const cutoff = new Date(now.getTime() - KEEP_DELETED_DAYS * DAY).toISOString();
  const gone = main.prepare('SELECT id FROM families WHERE deletedAt IS NOT NULL AND deletedAt <= ?').all(cutoff) as { id: string }[];
  const folders = fs.existsSync(deletedDir()) ? fs.readdirSync(deletedDir()) : [];
  for (const { id } of gone) {
    for (const name of folders) {
      if (name.startsWith(`${id}-`)) fs.rmSync(path.join(deletedDir(), name), { recursive: true, force: true });
    }
    main.transaction(() => {
      main.prepare('UPDATE operator_history SET familyName = NULL, detail = NULL WHERE familyId = ?').run(id);
      main.prepare('DELETE FROM families WHERE id = ?').run(id);
    })();
  }
  return gone.length;
}

/** Opens every family's database once, which brings its schema up to date. One that fails is logged. */
export function upgradeAllFamilies(now = Date.now()): void {
  const families = mainDb().prepare('SELECT id FROM families WHERE deletedAt IS NULL').all() as { id: string }[];
  for (const { id } of families) {
    try {
      if (!openFamily(id, now, { activity: false })) console.error(`[hosted] Family ${id} has no database.`);
    } catch (err) {
      console.error(`[hosted] Upgrading family ${id}'s database failed:`, err);
    }
  }
}

/** Server start in hosted mode: open main.db, upgrade every family's database, and close idle ones every few minutes. */
export function startHosted(): void {
  openMainDb();
  upgradeAllFamilies();
  if (!process.env.PUBLIC_URL) console.warn('[hosted] Set PUBLIC_URL (like https://app.tidyquest.org): links in emails follow the request until then.');
  setInterval(() => closeIdleFamilies(), 5 * 60 * 1000).unref();
}
