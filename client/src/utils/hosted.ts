import { useEffect, useState } from 'react';

// Hosted mode (tidyquest.org): the server says so in /api/version. Self-hosted installs never show the
// sign-up page, the family code or the email cards.
interface VersionInfo { hosted?: boolean; source?: string }
let versionPromise: Promise<VersionInfo> | null = null;

function fetchVersion(): Promise<VersionInfo> {
  versionPromise ??= fetch('/api/version')
    .then((r) => r.json() as Promise<VersionInfo>)
    .catch(() => ({}));
  return versionPromise;
}

export function fetchHosted(): Promise<boolean> {
  return fetchVersion().then((v) => v.hosted === true);
}

const SOURCE_REPO = 'https://github.com/TidyQuest/TidyQuest';

/** The link to this version's code (NEW-20, the AGPL's source offer); null until the server answers. */
export function useSourceUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void fetchVersion().then((v) => { if (live) setUrl(v.source || SOURCE_REPO); });
    return () => { live = false; };
  }, []);
  return url;
}

/** Whether the server is hosted; null until it answers. */
export function useHosted(): boolean | null {
  const [hosted, setHosted] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void fetchHosted().then((h) => { if (live) setHosted(h); });
    return () => { live = false; };
  }, []);
  return hosted;
}

// The family this device logs in to, remembered from the family link (app.tidyquest.org/<code>) or the
// last kid login. Not a secret: kids still need their password.
const FAMILY_KEY = 'tidyquest_family_code';
const FAMILY_LINK = /^\/([a-z]+-[a-z]+-\d{2})\/?$/i;

export function rememberedFamily(): string {
  try { return localStorage.getItem(FAMILY_KEY) ?? ''; } catch { return ''; }
}

export function rememberFamily(code: string): void {
  try {
    if (code) localStorage.setItem(FAMILY_KEY, code);
    else localStorage.removeItem(FAMILY_KEY);
  } catch { /* private window: they type the code each time */ }
}

/** Opened through a family link: remember the family and go on to the login. True if it was one. */
export function takeFamilyLink(): boolean {
  const match = FAMILY_LINK.exec(window.location.pathname);
  if (!match) return false;
  rememberFamily(match[1].toLowerCase());
  window.history.replaceState(null, '', '/login');
  return true;
}

/** The language of pages shown before sign-in: the one picked on the login page, else the browser's. */
export function authLanguage(): string {
  const languages = ['en', 'fr', 'de', 'es', 'it', 'nl'];
  let saved: string | null = null;
  try { saved = localStorage.getItem('tidyquest_auth_lang'); } catch { /* none saved */ }
  if (saved && languages.includes(saved)) return saved;
  const browser = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en';
  return languages.includes(browser) ? browser : 'en';
}

export interface HostedAccount {
  familyName: string;
  familyCode: string;
  familyLink: string;
  trialEndsAt: string;
  isParent: boolean;
  /** This person's sign-in email (parents), or null */
  email: string | null;
  emailConfirmed: boolean;
  /** When the family gets locked if no parent confirms an email; null once one has */
  confirmBy: string | null;
  locked: boolean;
  /** trial or active; suspended and expired families see a screen about it instead of the app */
  status: 'trial' | 'active' | 'suspended' | 'expired';
  /** A member or child whose family has no parent's consent yet (NEW-34) */
  awaitingParent: boolean;
  /** A parent or member who hasn't agreed to the current terms and privacy policy (NEW-34) */
  mustAgree: boolean;
  termsUrl: string | null;
  privacyUrl: string | null;
  /** This parent gets news emails */
  news: boolean;
}

/**
 * Whether the app gives way to the LockedScreen: the family is locked, paused, or its trial has ended, or
 * this person waits for a parent's consent. (The AgreeScreen comes after.)
 */
export const isShutOut = (account: HostedAccount): boolean =>
  (account.locked || account.awaitingParent || account.status === 'suspended' || account.status === 'expired');

/** The terms and privacy links for pages before sign-in (NEW-34); null until the server answers, or self-hosted. */
let legalPromise: Promise<{ termsUrl: string | null; privacyUrl: string | null }> | null = null;
export function useLegalLinks(): { termsUrl: string | null; privacyUrl: string | null } | null {
  const [links, setLinks] = useState<{ termsUrl: string | null; privacyUrl: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    void fetchHosted().then((hosted) => {
      if (!hosted) return;
      legalPromise ??= fetch('/api/hosted/config').then((r) => r.json()).catch(() => ({ termsUrl: null, privacyUrl: null }));
      return legalPromise.then((l) => { if (live) setLinks({ termsUrl: l.termsUrl ?? null, privacyUrl: l.privacyUrl ?? null }); });
    });
    return () => { live = false; };
  }, []);
  return links;
}

/** The server's error code (link-expired, email-taken…) as a message in the page's language. */
export function hostedError(err: unknown, t: (key: string) => string, fallback: string): string {
  const code = (err as { body?: { code?: string } })?.body?.code;
  const keys: Record<string, string> = {
    'link-expired': 'hosted.linkExpired',
    'email-taken': 'hosted.errEmailTaken',
    'bad-email': 'hosted.errBadEmail',
    'wrong-password': 'hosted.errWrongPassword',
    'short-password': 'hosted.errShortPassword',
    captcha: 'hosted.captchaNeeded',
    'signups-closed': 'hosted.errSignupsClosed',
    'awaiting-parent': 'hosted.errAwaitingParent',
    // Self-hosted too: someone a parent switched to "can't log in" (ENH-16)
    'no-login': 'auth.noLogin',
    'wrong-name': 'hosted.errWrongName',
    'photo-type': 'photos.unreadable',
  };
  return code && keys[code] ? t(keys[code]) : fallback;
}

/** A limit the server answered with (people, file size, photo space) in the page's language; else the fallback. */
export function limitError(err: unknown, t: (key: string) => string, fallback: string): string {
  const body = (err as { body?: { code?: string; limit?: number } })?.body;
  const keys: Record<string, string> = { 'people-limit': 'limits.people', 'too-large': 'limits.tooLarge', 'storage-full': 'limits.storageFull', 'photo-type': 'photos.unreadable' };
  return body?.code && keys[body.code] ? t(keys[body.code]).replace('{n}', String(body.limit ?? '')) : fallback;
}
