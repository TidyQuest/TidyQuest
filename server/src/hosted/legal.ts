import db from '../database';
import { mainDb } from './mainDb';

// The terms of service and the privacy policy (NEW-34). TERMS_URL and PRIVACY_URL are their pages on the
// website; TERMS_VERSION and PRIVACY_VERSION (like their "last updated" dates) say which text people agreed
// to. With neither URL set (a test server) nobody is asked to agree.

export interface Legal {
  termsUrl: string | null;
  privacyUrl: string | null;
  termsVersion: string;
  privacyVersion: string;
  /** Whether people are asked to agree: a URL is set */
  on: boolean;
}

export function legal(env: Record<string, string | undefined> = process.env): Legal {
  const termsUrl = env.TERMS_URL?.trim() || null;
  const privacyUrl = env.PRIVACY_URL?.trim() || null;
  return {
    termsUrl,
    privacyUrl,
    termsVersion: env.TERMS_VERSION?.trim() || '',
    privacyVersion: env.PRIVACY_VERSION?.trim() || '',
    on: !!(termsUrl || privacyUrl),
  };
}

/** Records that this person agreed to the current terms and privacy policy (inside their family). */
export function recordAgreement(userId: number, now = new Date()): void {
  const { termsVersion, privacyVersion } = legal();
  db.prepare('UPDATE users SET agreedAt = ?, agreedTerms = ?, agreedPrivacy = ? WHERE id = ?')
    .run(now.toISOString(), termsVersion, privacyVersion, userId);
}

export interface AgreementRow { role: string; agreedAt: string | null; agreedTerms: string | null; agreedPrivacy: string | null }

/**
 * Whether this person must agree before using the app: parents and members (the adults) who haven't
 * agreed yet, or agreed to an older version. Children sign nothing (TERMS.md decision 15).
 */
export function mustAgree(user: AgreementRow): boolean {
  const l = legal();
  if (!l.on || user.role === 'child') return false;
  return !user.agreedAt || (user.agreedTerms ?? '') !== l.termsVersion || (user.agreedPrivacy ?? '') !== l.privacyVersion;
}

/**
 * Whether a parent has given consent by confirming their email (COPPA "email plus"). Until then only
 * parents can sign in; members and children can't (PRIVACY.md app change 1).
 */
export function familyConsented(familyId: string): boolean {
  const main = mainDb();
  const row = main.prepare('SELECT consentAt FROM families WHERE id = ?').get(familyId) as { consentAt: string | null } | undefined;
  if (row?.consentAt) return true;
  return !!main.prepare('SELECT 1 FROM accounts WHERE familyId = ? AND emailConfirmedAt IS NOT NULL').get(familyId);
}

/** Notes the family's consent the first time a parent confirms. True when this was that first time. */
export function recordConsent(familyId: string, now = new Date()): boolean {
  return mainDb().prepare('UPDATE families SET consentAt = ? WHERE id = ? AND consentAt IS NULL').run(now.toISOString(), familyId).changes === 1;
}
