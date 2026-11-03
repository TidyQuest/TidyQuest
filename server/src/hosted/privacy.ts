import db from '../database';
import { LANGUAGES, tr } from '../utils/i18n';
import { createEmailToken } from './accounts';
import { runInFamily } from './context';
import { sendEmail, writeEmail, type Email } from './email';
import { deleteFamily, openFamily, TRIAL_DAYS } from './families';
import { familyConsented, legal } from './legal';
import { mainDb } from './mainDb';
import { recordOperatorAction } from './operatorHistory';

// The privacy policy's promises the server keeps by itself (NEW-34, TidyQuest.org/PRIVACY.md):
// - a family whose parent never confirms their email (the COPPA consent) is deleted 30 days after sign-up,
//   a week after a reminder;
// - a family nobody has used for 12 months is deleted 30 days after the parents are told;
// - waitlist entries go after 12 months.
// Deleted families go to deleted/ like any other, and are gone for good 30 days later.
const DAY = 24 * 60 * 60 * 1000;
export const REMIND_DAYS = 7;
export const INACTIVE_DAYS = 365;
export const INACTIVE_WARN_DAYS = 30;
export const WAITLIST_DAYS = 365;

export interface Parent { email: string; userId: number; name: string; lang: string; confirmed: boolean }

/** The family's parents with a sign-in email, with their names and languages. */
export function familyParents(familyId: string, now = new Date()): Parent[] {
  const context = openFamily(familyId, now.getTime(), { activity: false });
  if (!context) return [];
  const rows = mainDb().prepare('SELECT email, userId, emailConfirmedAt FROM accounts WHERE familyId = ?').all(familyId) as { email: string; userId: number; emailConfirmedAt: string | null }[];
  return runInFamily(context, () => rows.flatMap((r) => {
    const user = db.prepare("SELECT displayName, language FROM users WHERE id = ? AND role = 'admin'").get(r.userId) as { displayName: string; language: string } | undefined;
    if (!user) return [];
    return [{ email: r.email, userId: r.userId, name: user.displayName, lang: LANGUAGES.includes(user.language) ? user.language : 'en', confirmed: !!r.emailConfirmedAt }];
  }));
}

const longDate = (lang: string, d: Date) => new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(d);
const publicUrl = () => process.env.PUBLIC_URL?.replace(/\/+$/, '') || '';

/** The COPPA direct notice under a confirmation email (only once the privacy policy has its address). */
export function consentNotice(lang: string): string | undefined {
  const { privacyUrl } = legal();
  return privacyUrl ? tr(lang, 'hostedEmail.consentNotice', { privacy: privacyUrl }) : undefined;
}

/** The second email of "email plus": sent when a family's first parent confirms, so a forged consent gets noticed. */
export function sendConsentConfirmed(familyId: string, userId: number): void {
  const parent = familyParents(familyId).find((p) => p.userId === userId);
  const family = mainDb().prepare('SELECT name FROM families WHERE id = ?').get(familyId) as { name: string } | undefined;
  if (!parent || !family) return;
  void sendEmail(writeEmail('consent-confirmed', parent.lang, parent.email, {
    name: parent.name,
    family: family.name,
    privacy: legal().privacyUrl ?? publicUrl(),
    deleteFamily: tr(parent.lang, 'hosted.deleteFamilyTitle'),
    settings: tr(parent.lang, 'nav.settings'),
  }));
}

interface Unconfirmed { id: string; name: string; createdAt: string; consentRemindedAt: string | null }

/** The day an unconfirmed family is deleted: 30 days after sign-up, and never sooner than a week after the reminder. */
const unconfirmedDeleteOn = (f: Unconfirmed, remindedAt: Date) =>
  new Date(Math.max(Date.parse(f.createdAt) + TRIAL_DAYS * DAY, remindedAt.getTime() + REMIND_DAYS * DAY));

/**
 * The daily job for families whose parent never confirmed: a reminder (with a new link) a week before day
 * 30, then deletion. Like expired trials, it waits for PUBLIC_URL, since the reminder needs a link.
 * Returns how many it deleted.
 */
export async function endUnconfirmedFamilies(now = new Date()): Promise<number> {
  const base = publicUrl();
  if (!base) {
    console.warn('[hosted] Unconfirmed families are kept until PUBLIC_URL is set: the reminder email needs a link.');
    return 0;
  }
  const remindFrom = new Date(now.getTime() - (TRIAL_DAYS - REMIND_DAYS) * DAY).toISOString();
  const families = mainDb().prepare(
    'SELECT id, name, createdAt, consentRemindedAt FROM families WHERE deletedAt IS NULL AND consentAt IS NULL AND createdAt <= ?',
  ).all(remindFrom) as Unconfirmed[];
  let deleted = 0;
  for (const family of families) {
    try {
      if (familyConsented(family.id)) continue;
      if (!family.consentRemindedAt) {
        const deleting = unconfirmedDeleteOn(family, now);
        const emails: Email[] = familyParents(family.id, now).map((p) => {
          const token = createEmailToken({ kind: 'confirm', familyId: family.id, userId: p.userId, email: p.email, newEmail: null }, now);
          return writeEmail('consent-reminder', p.lang, p.email, {
            name: p.name, family: family.name, date: longDate(p.lang, deleting), link: `${base}/confirm-email?token=${token}`,
          }, consentNotice(p.lang));
        });
        mainDb().prepare('UPDATE families SET consentRemindedAt = ? WHERE id = ?').run(now.toISOString(), family.id);
        for (const email of emails) await sendEmail(email);
      } else if (unconfirmedDeleteOn(family, new Date(family.consentRemindedAt)) <= now && deleteFamily(family.id, now)) {
        recordOperatorAction({ action: 'unconfirmed-delete', family }, now);
        deleted++;
      }
    } catch (err) {
      console.error(`[hosted] Ending unconfirmed family ${family.id} failed:`, err);
    }
  }
  return deleted;
}

interface Inactive { id: string; name: string; lastActiveAt: string; inactiveWarnedAt: string | null }

/**
 * The daily job for families nobody has used for 12 months (PRIVACY.md decision 5): the parents are told,
 * and 30 days later, unless someone used the app meanwhile, the family is deleted. Waits for PUBLIC_URL,
 * like the others. Returns how many it deleted.
 */
export async function endInactiveFamilies(now = new Date()): Promise<number> {
  const base = publicUrl();
  if (!base) return 0;
  const idleSince = new Date(now.getTime() - INACTIVE_DAYS * DAY).toISOString();
  const main = mainDb();
  // Someone used the app after the warning: it starts over
  main.prepare('UPDATE families SET inactiveWarnedAt = NULL WHERE inactiveWarnedAt IS NOT NULL AND lastActiveAt > inactiveWarnedAt').run();
  const families = main.prepare(
    'SELECT id, name, lastActiveAt, inactiveWarnedAt FROM families WHERE deletedAt IS NULL AND lastActiveAt <= ?',
  ).all(idleSince) as Inactive[];
  let deleted = 0;
  for (const family of families) {
    try {
      if (!family.inactiveWarnedAt) {
        const deleting = new Date(now.getTime() + INACTIVE_WARN_DAYS * DAY);
        const emails = familyParents(family.id, now).filter((p) => p.confirmed).map((p) => writeEmail('inactive-warning', p.lang, p.email, {
          name: p.name, family: family.name, date: longDate(p.lang, deleting), link: `${base}/login`,
          export: tr(p.lang, 'settings.exportData'), settings: tr(p.lang, 'nav.settings'),
        }));
        main.prepare('UPDATE families SET inactiveWarnedAt = ? WHERE id = ?').run(now.toISOString(), family.id);
        for (const email of emails) await sendEmail(email);
      } else if (Date.parse(family.inactiveWarnedAt) + INACTIVE_WARN_DAYS * DAY <= now.getTime() && deleteFamily(family.id, now)) {
        recordOperatorAction({ action: 'inactive-delete', family }, now);
        deleted++;
      }
    } catch (err) {
      console.error(`[hosted] Ending inactive family ${family.id} failed:`, err);
    }
  }
  return deleted;
}

/** The daily job that drops waitlist entries after 12 months, and the emails in the History about them. */
export function forgetOldWaitlist(now = new Date()): number {
  const cutoff = new Date(now.getTime() - WAITLIST_DAYS * DAY).toISOString();
  const main = mainDb();
  main.prepare("UPDATE operator_history SET detail = NULL WHERE action = 'waitlist-remove' AND at <= ? AND detail IS NOT NULL").run(cutoff);
  return main.prepare('DELETE FROM waitlist WHERE at <= ?').run(cutoff).changes;
}
