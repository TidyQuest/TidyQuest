/**
 * Web push on this device (NEW-5), the browser's side. The server calls are in hooks/useApi.ts (forgetPush) and
 * utils/pushSync.ts.
 *
 * localStorage 'tidyquest_push' remembers who turned it on here and the device's push address, so signing out
 * can stop it and the next person signing in on this device doesn't get their notifications.
 */

const KEY = 'tidyquest_push';
export type PushOwner = { userId: number; endpoint: string; deviceId?: number };

export function pushOwner(): PushOwner | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v.userId === 'number' && typeof v.endpoint === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function setPushOwner(owner: PushOwner | null): void {
  try {
    if (owner) localStorage.setItem(KEY, JSON.stringify(owner));
    else localStorage.removeItem(KEY);
  } catch { /* private window: it just won't be remembered */ }
}

/** Why push can't be turned on here, or null when it can. */
export type PushBlock = 'insecure' | 'iosInstall' | 'unsupported' | 'denied' | null;

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function pushBlock(): PushBlock {
  if (!window.isSecureContext) return 'insecure';
  // iPhones and iPads only allow it in the app added to the Home Screen (iOS 16.4 or newer)
  if (isIos() && !isInstalled()) return 'iosInstall';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return null;
}

/** The browser's subscription on this device, if there is one (registers nothing). */
export async function browserSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

const toBytes = (b64url: string) => {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Made with this server key (the key changes if the server's data folder was replaced). */
export function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const key = sub.options?.applicationServerKey;
  if (!key) return false;
  const a = new Uint8Array(key);
  const b = toBytes(publicKey);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Subscribes this browser with the server's key. With ask, it first asks for permission: that has to be the
 * first thing after a tap (iPhones refuse it otherwise), so nothing is awaited before it.
 */
export async function subscribeBrowser(publicKey: string, ask: boolean): Promise<PushSubscription> {
  if (ask && (await Notification.requestPermission()) !== 'granted') throw new Error('denied');
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing, publicKey)) return existing;
  if (existing) await existing.unsubscribe();
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) });
}

export async function unsubscribeBrowser(): Promise<void> {
  try {
    await (await browserSubscription())?.unsubscribe();
  } catch { /* nothing to stop */ }
}

/** What the server needs from a subscription, and a name for the device ("iPhone · Safari"). */
export function subscriptionBody(sub: PushSubscription) {
  const j = sub.toJSON();
  return { endpoint: sub.endpoint, keys: { p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' }, label: deviceLabel() };
}

export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /CrOS/.test(ua) ? 'Chromebook'
    : /Windows/.test(ua) ? 'Windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /Edg[A]?\//.test(ua) ? 'Edge'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari' : '';
  return [os, browser].filter(Boolean).join(' · ') || 'Browser';
}
