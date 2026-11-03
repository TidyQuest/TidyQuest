import crypto from 'crypto';
import db from '../database';
import { linkSignature } from '../middleware/auth';
import { tr } from '../utils/i18n';
import { runInFamily } from './context';
import { sendEmail, type Email } from './email';
import { openFamily } from './families';
import { mainDb } from './mainDb';

// News emails (NEW-34, PRIVACY.md decision 7): only to parents who ticked "Send me TidyQuest news" (at
// sign-up, unticked, or later in Settings), each with a one-click unsubscribe link (RFC 8058) and the
// postal address (CAN-SPAM). Never to children. The operator page sends them.

/** Turns news on or off for a parent's sign-in email. */
export function setNews(familyId: string, userId: number, on: boolean, now = new Date()): void {
  mainDb().prepare('UPDATE accounts SET newsAt = ? WHERE familyId = ? AND userId = ?').run(on ? now.toISOString() : null, familyId, userId);
}

const PURPOSE = 'news-unsubscribe';
const base = () => process.env.PUBLIC_URL?.replace(/\/+$/, '') || '';

/** The unsubscribe page for this email (the app's /unsubscribe, which posts to the API). */
export function unsubscribeLinks(email: string): { page: string; oneClick: string } {
  const query = `e=${encodeURIComponent(email)}&s=${linkSignature(PURPOSE, email.toLowerCase())}`;
  return { page: `${base()}/unsubscribe?${query}`, oneClick: `${base()}/api/hosted/unsubscribe?${query}` };
}

/** Stops news for the email in a signed link. False when the signature doesn't match. */
export function unsubscribe(email: unknown, signature: unknown): boolean {
  if (typeof email !== 'string' || typeof signature !== 'string' || email.length > 254) return false;
  const expected = linkSignature(PURPOSE, email.toLowerCase());
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  mainDb().prepare('UPDATE accounts SET newsAt = NULL WHERE email = ?').run(email);
  return true;
}

export interface NewsRecipient { email: string; familyId: string; userId: number }

/** Parents who asked for news and confirmed their email, in families that aren't deleted. */
export function newsRecipients(): NewsRecipient[] {
  return mainDb().prepare(
    'SELECT a.email, a.familyId, a.userId FROM accounts a JOIN families f ON f.id = a.familyId WHERE a.newsAt IS NOT NULL AND a.emailConfirmedAt IS NOT NULL AND f.deletedAt IS NULL ORDER BY a.createdAt',
  ).all() as NewsRecipient[];
}

/** Why news can't go out yet, or null: the links need PUBLIC_URL, and each email needs the postal address. */
export function newsBlocked(): string | null {
  if (!base()) return 'Set PUBLIC_URL first: the unsubscribe links need it.';
  if (!process.env.POSTAL_ADDRESS?.trim()) return 'Set POSTAL_ADDRESS first: the law wants it in every news email.';
  return null;
}

/** One news email, with the unsubscribe line and the postal address under it, in the parent's language. */
export function writeNews(to: string, lang: string | null | undefined, subject: string, body: string): Email {
  const links = unsubscribeLinks(to);
  const footer = tr(lang, 'hostedEmail.newsFooter', { link: links.page, address: process.env.POSTAL_ADDRESS?.trim() ?? '' });
  return {
    to,
    subject,
    text: `${body.trim()}\n\n— TidyQuest\n\n${footer}`,
    headers: { 'List-Unsubscribe': `<${links.oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** Sends a news email to everyone who asked for it, one at a time. Returns how many went out. */
export async function sendNews(subject: string, body: string): Promise<number> {
  let sent = 0;
  for (const r of newsRecipients()) {
    const family = openFamily(r.familyId, Date.now(), { activity: false });
    const lang = family && runInFamily(family, () => (db.prepare('SELECT language FROM users WHERE id = ?').get(r.userId) as { language: string } | undefined)?.language);
    await sendEmail(writeNews(r.email, lang, subject, body));
    sent++;
  }
  return sent;
}
