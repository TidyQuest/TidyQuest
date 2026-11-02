import { LANGUAGES } from '../utils/i18n';
import { accountByEmail } from './accounts';
import { mainDb } from './mainDb';

// New-family sign-up (NEW-30): the operator page's Open / Closed switch, and the waitlist families join on
// the sign-up page while it's closed. Both live in main.db, so a change works at once, with no restart.
// Nothing is emailed: the operator reads the list and writes to families by hand.

/** Whether new families can sign up. Open until an operator closes it. */
export function signupsOpen(): boolean {
  const row = mainDb().prepare("SELECT value FROM settings WHERE key = 'signupsOpen'").get() as { value: string } | undefined;
  return row?.value !== '0';
}

export function setSignupsOpen(open: boolean): void {
  mainDb().prepare("INSERT INTO settings (key, value) VALUES ('signupsOpen', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(open ? '1' : '0');
}

export interface WaitlistRequest {
  familyName: string;
  parentName: string;
  email: string;
  language: unknown;
  note: string | null;
}

export interface WaitlistEntry {
  id: number;
  at: string;
  familyName: string;
  parentName: string;
  email: string;
  language: string;
  note: string | null;
}

/**
 * Adds a family to the end of the waitlist. An email that's already on it keeps its place and what it
 * said first, so nobody can change someone else's entry by typing their address.
 */
export function joinWaitlist(req: WaitlistRequest, now = new Date()): void {
  const language = typeof req.language === 'string' && LANGUAGES.includes(req.language) ? req.language : 'en';
  mainDb().prepare(
    `INSERT INTO waitlist (at, familyName, parentName, email, language, note) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO NOTHING`,
  ).run(now.toISOString(), req.familyName, req.parentName, req.email, language, req.note);
}

/** The waitlist, first come first: `limit` entries after the first `offset`. hasFamily: that email has signed up since. */
export function waitlist(offset: number, limit: number): { found: number; entries: (WaitlistEntry & { hasFamily: boolean })[] } {
  const main = mainDb();
  const { found } = main.prepare('SELECT COUNT(*) AS found FROM waitlist').get() as { found: number };
  const rows = main.prepare('SELECT id, at, familyName, parentName, email, language, note FROM waitlist ORDER BY id LIMIT ? OFFSET ?')
    .all(limit, offset) as WaitlistEntry[];
  return { found, entries: rows.map((r) => ({ ...r, hasFamily: !!accountByEmail(r.email) })) };
}

export function waitlistCount(): number {
  return (mainDb().prepare('SELECT COUNT(*) AS n FROM waitlist').get() as { n: number }).n;
}

/** Takes one entry off the waitlist; the entry it was, or undefined when it's already gone. */
export function removeFromWaitlist(id: number): WaitlistEntry | undefined {
  const main = mainDb();
  const entry = main.prepare('SELECT id, at, familyName, parentName, email, language, note FROM waitlist WHERE id = ?').get(id) as WaitlistEntry | undefined;
  if (entry) main.prepare('DELETE FROM waitlist WHERE id = ?').run(id);
  return entry;
}
