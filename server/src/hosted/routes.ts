import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../database';
import { AuthRequest, authMiddleware, revokeTokens } from '../middleware/auth';
import { clientIp, sendLogin } from '../routes/auth';
import { checkRateLimit } from '../utils/throttle';
import { HOSTED_PARENT_MIN, TOO_MANY_TRIES, checkOwnPassword } from '../utils/passwords';
import {
  accountByEmail, accountOf, addAccount, cleanEmail, confirmBy, createEmailToken, isLocked, markConfirmed, useEmailToken,
} from './accounts';
import { runInFamily } from './context';
import { appLink, sendEmail, writeEmail } from './email';
import { createFamily, deleteFamily, familyStatus, KEEP_DELETED_DAYS, openFamily } from './families';
import { newFamilyCode } from './familyCode';
import { familyConsented, legal, mustAgree, recordAgreement, recordConsent, type AgreementRow } from './legal';
import { mainDb } from './mainDb';
import { setNews, unsubscribe } from './news';
import { recordOperatorAction } from './operatorHistory';
import { consentNotice, familyParents, sendConsentConfirmed } from './privacy';
import { addParent, captchaPasses, usernameFrom } from './signup';
import { joinWaitlist, signupsOpen } from './signupGate';

// Hosted mode's own pages (/api/hosted): sign-up, parents' emails and passwords, the family code.
const router = Router();

const MIN_PASSWORD = HOSTED_PARENT_MIN;
// Each error has a code, so the page can say it in the family's language
const LINK_EXPIRED = { error: 'This link has expired or was already used. Ask for a new one.', code: 'link-expired' };
const BAD_EMAIL = { error: "That email address doesn't look right", code: 'bad-email' };
const SHORT_PASSWORD = { error: `Passwords need at least ${MIN_PASSWORD} characters`, code: 'short-password' };
const EMAIL_TAKEN = { error: 'That email already has a family. Sign in, or reset your password.', code: 'email-taken' };
const CAPTCHA_FAILED = { error: "The check that you're not a robot didn't pass. Please try again.", code: 'captcha' };
const SIGNUPS_CLOSED = { error: 'New sign-ups are closed right now. You can join the waitlist instead.', code: 'signups-closed' };
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * What the sign-up and login pages need before anyone signs in: the terms and privacy links (TERMS_URL,
 * PRIVACY_URL; NEW-34). signupsOpen false: the operator closed new sign-ups, and the page is the waitlist
 * form (NEW-30).
 */
router.get('/config', (_req, res: Response) => {
  const { termsUrl, privacyUrl } = legal();
  res.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
    termsUrl,
    privacyUrl,
    signupsOpen: signupsOpen(),
  });
});

/** The confirmation email, which is also how a parent gives consent for their children (it carries the COPPA notice). */
export function sendConfirmation(req: AuthRequest, p: { familyId: string; userId: number; email: string; name: string; language: string }) {
  const token = createEmailToken({ kind: 'confirm', familyId: p.familyId, userId: p.userId, email: p.email, newEmail: null });
  void sendEmail(writeEmail('confirm', p.language, p.email, { name: p.name, link: appLink(req, `/confirm-email?token=${token}`) }, consentNotice(p.language)));
}

// Sign-up: a new family (on a 30-day trial), its first parent and family code; then the confirmation email
router.post('/signup', async (req: AuthRequest, res: Response) => {
  if (!signupsOpen()) return res.status(403).json(SIGNUPS_CLOSED);
  const familyName = text(req.body.familyName, 60);
  const parentName = text(req.body.parentName, 40);
  const email = cleanEmail(req.body.email);
  const { password, language, timeZone } = req.body;
  if (!familyName || !parentName) return res.status(400).json({ error: 'Family name and your name are required' });
  if (!email) return res.status(400).json(BAD_EMAIL);
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return res.status(400).json(SHORT_PASSWORD);
  }
  // The box: 18 or over, the children's parent or guardian, agrees to the terms and the privacy policy (NEW-34)
  if (legal().on && req.body.acceptTerms !== true) {
    return res.status(400).json({ error: 'Please agree to the terms and the privacy policy', code: 'must-agree' });
  }
  // Counted once the form is filled in properly, so fixing a typo doesn't use up a try
  if (!checkRateLimit(`signup:${clientIp(req)}`, 5)) {
    return res.status(429).json({ error: 'Too many sign-ups from here. Please try again later.' });
  }
  if (!(await captchaPasses(req.body.captchaToken, clientIp(req)))) {
    return res.status(400).json(CAPTCHA_FAILED);
  }
  if (accountByEmail(email)) {
    return res.status(409).json(EMAIL_TAKEN);
  }

  let familyId: string | null = null;
  try {
    familyId = createFamily(familyName);
    const family = openFamily(familyId)!;
    runInFamily(family, () => {
      const userId = addParent({ username: usernameFrom(parentName), displayName: parentName, password, email, language, timeZone });
      if (legal().on) recordAgreement(userId);
      // "Send me TidyQuest news", unticked unless they tick it
      if (req.body.news === true) setNews(family.familyId, userId, true);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
      sendConfirmation(req, { familyId: family.familyId, userId, email, name: parentName, language: user.language });
      console.log(`[signup] new family ${family.familyId}`);
      sendLogin(res.status(201), user);
    });
  } catch (err) {
    // Nothing half-made stays behind (two sign-ups with one email at once end here too)
    if (familyId) deleteFamily(familyId);
    if (accountByEmail(email)) return res.status(409).json(EMAIL_TAKEN);
    console.error('[signup] failed:', err);
    res.status(500).json({ error: 'Sign-up failed. Please try again.' });
  }
});

// The waitlist (NEW-30): while new sign-ups are closed, the sign-up page sends these instead. They're listed
// on the operator page and nothing is emailed. The answer is the same for an email that's already waiting.
router.post('/waitlist', async (req: AuthRequest, res: Response) => {
  const familyName = text(req.body.familyName, 60);
  const parentName = text(req.body.parentName, 40);
  const email = cleanEmail(req.body.email);
  if (!familyName || !parentName) return res.status(400).json({ error: 'Family name and your name are required' });
  if (!email) return res.status(400).json(BAD_EMAIL);
  if (!checkRateLimit(`waitlist:${clientIp(req)}`, 5)) {
    return res.status(429).json({ error: 'Too many requests from here. Please try again later.' });
  }
  if (!(await captchaPasses(req.body.captchaToken, clientIp(req)))) return res.status(400).json(CAPTCHA_FAILED);
  joinWaitlist({ familyName, parentName, email, language: req.body.language, note: text(req.body.note, 500) || null });
  console.log('[waitlist] a family joined the waitlist');
  res.json({ ok: true });
});

// Forgot password (parents): a link that works once, for an hour. The answer is the same whether or not
// the email has an account, so the page can't be used to find out who has signed up.
router.post('/forgot-password', (req: AuthRequest, res: Response) => {
  const email = cleanEmail(req.body.email);
  if (!email) return res.status(400).json(BAD_EMAIL);
  if (!checkRateLimit(`forgot:${clientIp(req)}`)) {
    return res.status(429).json({ error: 'Too many tries. Please try again later.' });
  }
  const account = checkRateLimit(`forgot:${email}`, 3) ? accountByEmail(email) : undefined;
  // Asking for a link isn't using TidyQuest: anyone can type the email (BUG-25)
  const family = account && openFamily(account.familyId, Date.now(), { activity: false });
  if (account && family) {
    runInFamily(family, () => {
      const user = db.prepare("SELECT displayName, language FROM users WHERE id = ? AND role = 'admin'").get(account.userId) as { displayName: string; language: string } | undefined;
      if (!user) return;
      const token = createEmailToken({ kind: 'reset', familyId: account.familyId, userId: account.userId, email, newEmail: null });
      void sendEmail(writeEmail('reset', user.language, email, { name: user.displayName, link: appLink(req, `/reset-password?token=${token}`) }));
    });
  }
  res.json({ ok: true });
});

// The reset link's page: a new password, which signs out every other device (NEW-8), and signs in here
router.post('/reset-password', (req: AuthRequest, res: Response) => {
  const { password } = req.body;
  // Checked before the link is used up, so a too-short password doesn't waste it
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return res.status(400).json(SHORT_PASSWORD);
  }
  const link = useEmailToken(req.body.token, ['reset']);
  const family = link && openFamily(link.familyId);
  if (!link || !family) return res.status(400).json(LINK_EXPIRED);
  runInFamily(family, () => {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(link.userId);
    if (!user) return res.status(400).json(LINK_EXPIRED);
    db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), link.userId);
    revokeTokens(link.userId);
    // The link reached them, so the email works, and that's the family's consent if it's the first (NEW-34)
    if (markConfirmed(link.familyId, link.userId)) sendConsentConfirmed(link.familyId, link.userId);
    req.familyId = family.familyId;
    sendLogin(res, db.prepare('SELECT * FROM users WHERE id = ?').get(link.userId));
  });
});

// The link in a confirmation or change-of-email message. Works signed in or not.
router.post('/confirm-email', (req: AuthRequest, res: Response) => {
  const link = useEmailToken(req.body.token, ['confirm', 'change-email']);
  if (!link) return res.status(400).json(LINK_EXPIRED);
  const main = mainDb();
  const now = new Date().toISOString();
  // A family's first confirmed email is its parent's consent (NEW-34): the second email of "email plus" says so
  const first = !familyConsented(link.familyId);
  const consented = () => { if (recordConsent(link.familyId) && first) sendConsentConfirmed(link.familyId, link.userId); };
  if (link.kind === 'confirm') {
    // Only while the account still has the address the link went to
    const done = main.prepare('UPDATE accounts SET emailConfirmedAt = COALESCE(emailConfirmedAt, ?) WHERE familyId = ? AND userId = ? AND email = ?')
      .run(now, link.familyId, link.userId, link.email);
    if (done.changes !== 1) return res.status(400).json(LINK_EXPIRED);
    consented();
    return res.json({ ok: true, email: link.email });
  }
  const newEmail = link.newEmail!;
  const taken = accountByEmail(newEmail);
  if (taken && !(taken.familyId === link.familyId && taken.userId === link.userId)) {
    return res.status(409).json(EMAIL_TAKEN);
  }
  // Clears the account's old unused links too: they were for the old address
  main.transaction(() => {
    main.prepare("UPDATE email_tokens SET usedAt = ? WHERE familyId = ? AND userId = ? AND usedAt IS NULL AND kind <> 'change-email'")
      .run(now, link.familyId, link.userId);
    if (accountOf(link.familyId, link.userId)) {
      main.prepare('UPDATE accounts SET email = ?, emailConfirmedAt = ? WHERE familyId = ? AND userId = ?').run(newEmail, now, link.familyId, link.userId);
    } else {
      addAccount(newEmail, link.familyId, link.userId);
      main.prepare('UPDATE accounts SET emailConfirmedAt = ? WHERE familyId = ? AND userId = ?').run(now, link.familyId, link.userId);
    }
  })();
  consented();
  res.json({ ok: true, email: newEmail });
});

// The unsubscribe link in a news email (NEW-34). Mail apps' one-click button posts here with the link's
// query (RFC 8058); the app's /unsubscribe page posts the same in the body. No sign-in: the link is signed.
router.post('/unsubscribe', (req: AuthRequest, res: Response) => {
  const e = req.query.e ?? req.body?.e;
  const sig = req.query.s ?? req.body?.s;
  if (!unsubscribe(e, sig)) return res.status(400).json(LINK_EXPIRED);
  res.json({ ok: true });
});

// Signed in from here on
router.use(authMiddleware);

const isParent = (userId?: number) =>
  (db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined)?.role === 'admin';

/** The family's code and link, this person's sign-in email, and whether the family must still confirm one. */
router.get('/account', (req: AuthRequest, res: Response) => {
  const familyId = req.familyId!;
  const family = mainDb().prepare('SELECT name, code, status, trialEndsAt, plan FROM families WHERE id = ?').get(familyId) as { name: string; code: string; status: string; trialEndsAt: string; plan: string | null };
  const account = accountOf(familyId, req.userId!);
  const me = db.prepare('SELECT role, agreedAt, agreedTerms, agreedPrivacy FROM users WHERE id = ?').get(req.userId) as AgreementRow;
  const { termsUrl, privacyUrl } = legal();
  res.json({
    familyName: family.name,
    familyCode: family.code,
    familyLink: appLink(req, `/${family.code}`),
    trialEndsAt: family.trialEndsAt,
    isParent: isParent(req.userId),
    email: account?.email ?? null,
    emailConfirmed: !!account?.emailConfirmedAt,
    confirmBy: confirmBy(familyId)?.toISOString() ?? null,
    locked: isLocked(familyId),
    // trial or active; suspended and expired see a page about it instead of the app
    status: familyStatus(family),
    // NEW-34: members and children wait for a parent's consent; adults agree to the terms before going on
    awaitingParent: me.role !== 'admin' && !familyConsented(familyId),
    mustAgree: mustAgree(me),
    termsUrl,
    privacyUrl,
    news: !!account?.newsAt,
  });
});

// "Agree and continue" (NEW-34): a parent or member agrees to the current terms and privacy policy
router.post('/agree', (req: AuthRequest, res: Response) => {
  if (!legal().on) return res.status(400).json({ error: 'There is nothing to agree to' });
  recordAgreement(req.userId!);
  res.json({ ok: true });
});

// "Send me TidyQuest news" in Settings (NEW-34), for a parent with a sign-in email
router.post('/news', (req: AuthRequest, res: Response) => {
  if (!accountOf(req.familyId!, req.userId!)) return res.status(400).json({ error: 'Only parents with a sign-in email get news' });
  setNews(req.familyId!, req.userId!, req.body.on === true);
  res.json({ ok: true, news: req.body.on === true });
});

router.post('/resend-confirmation', (req: AuthRequest, res: Response) => {
  const account = accountOf(req.familyId!, req.userId!);
  if (!account || account.emailConfirmedAt) return res.status(400).json({ error: 'There is no email to confirm' });
  if (!checkRateLimit(`resend:${req.familyId}:${req.userId}`, 5)) {
    return res.status(429).json({ error: 'Too many emails. Please try again later.' });
  }
  const user = db.prepare('SELECT displayName, language FROM users WHERE id = ?').get(req.userId) as { displayName: string; language: string };
  sendConfirmation(req, { familyId: req.familyId!, userId: req.userId!, email: account.email, name: user.displayName, language: user.language });
  res.json({ ok: true, email: account.email });
});

// Parents change (or add) the email they sign in with. It changes once they open the link sent to the new address.
router.post('/change-email', (req: AuthRequest, res: Response) => {
  const user = db.prepare('SELECT displayName, language, role, passwordHash FROM users WHERE id = ?').get(req.userId) as
    { displayName: string; language: string; role: string; passwordHash: string };
  if (user.role !== 'admin') return res.status(403).json({ error: 'Only parents sign in with an email' });
  const newEmail = cleanEmail(req.body.email);
  if (!newEmail) return res.status(400).json(BAD_EMAIL);
  const check = checkOwnPassword(`${req.familyId}:${req.userId}`, req.body.password, user.passwordHash);
  if (check === 'blocked') return res.status(429).json(TOO_MANY_TRIES);
  if (check === 'wrong') return res.status(400).json({ error: "Your password isn't right", code: 'wrong-password' });
  // Signing in by email needs a parent's password (BUG-24): someone made a parent with a kid's short one changes it first
  if (req.body.password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Change your password to one with at least ${MIN_PASSWORD} characters first`, code: 'change-password-first', min: MIN_PASSWORD });
  }
  if (!checkRateLimit(`change-email:${req.familyId}:${req.userId}`, 5)) {
    return res.status(429).json({ error: 'Too many emails. Please try again later.' });
  }
  const current = accountOf(req.familyId!, req.userId!);
  if (current?.email === newEmail) return res.status(400).json({ error: "That's already your email" });
  if (accountByEmail(newEmail)) return res.status(409).json(EMAIL_TAKEN);
  const token = createEmailToken({ kind: 'change-email', familyId: req.familyId!, userId: req.userId!, email: current?.email ?? newEmail, newEmail });
  void sendEmail(writeEmail('change-email', user.language, newEmail, { name: user.displayName, link: appLink(req, `/confirm-email?token=${token}`) }));
  // The old address hears about it, in case it wasn't them
  if (current) void sendEmail(writeEmail('email-changing', user.language, current.email, { name: user.displayName, email: newEmail }));
  res.json({ ok: true, email: newEmail });
});

// "Delete our family" (NEW-25): a parent deletes the whole family, confirming with its name and their password.
// Like the operator's delete: the folder is kept 30 days, then gone. Everyone is signed out at once, and the
// parents with a confirmed email hear about it.
router.post('/delete-family', (req: AuthRequest, res: Response) => {
  const familyId = req.familyId!;
  const user = db.prepare('SELECT displayName, role, passwordHash FROM users WHERE id = ?').get(req.userId) as
    { displayName: string; role: string; passwordHash: string };
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  if (!checkRateLimit(`delete-family:${familyId}:${req.userId}`, 5)) {
    return res.status(429).json({ error: 'Too many tries. Please try again later.' });
  }
  const family = mainDb().prepare('SELECT id, name FROM families WHERE id = ?').get(familyId) as { id: string; name: string };
  if (text(req.body.name, 100).toLowerCase() !== family.name.trim().toLowerCase()) {
    return res.status(400).json({ error: "Type the family's name to delete it", code: 'wrong-name' });
  }
  const check = checkOwnPassword(`${familyId}:${req.userId}`, req.body.password, user.passwordHash);
  if (check === 'blocked') return res.status(429).json(TOO_MANY_TRIES);
  if (check === 'wrong') return res.status(400).json({ error: "Your password isn't right", code: 'wrong-password' });
  // Read before deleting: the emails go with the family
  const parents = familyParents(familyId).filter((p) => p.confirmed);
  const who = accountOf(familyId, req.userId!)?.email ?? user.displayName;
  deleteFamily(familyId);
  recordOperatorAction({ action: 'parent-delete', family, detail: who });
  console.log(`[hosted] A parent deleted family ${familyId}`);
  const now = new Date();
  for (const p of parents) {
    void sendEmail(writeEmail('family-deleted', p.lang, p.email, {
      name: p.name, family: family.name, who: user.displayName,
      date: new Intl.DateTimeFormat(p.lang, { dateStyle: 'long', timeZone: 'UTC' }).format(now),
      days: String(KEEP_DELETED_DAYS),
    }));
  }
  res.json({ ok: true });
});

// "New code": the old code and link stop working at once
router.post('/family-code', (req: AuthRequest, res: Response) => {
  if (!isParent(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const code = newFamilyCode(req.familyId!);
  res.json({ familyCode: code, familyLink: appLink(req, `/${code}`) });
});

export default router;
