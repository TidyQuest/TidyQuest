import { api } from '../hooks/useApi';
import { browserSubscription, pushOwner, sameKey, setPushOwner, subscribeBrowser, subscriptionBody, unsubscribeBrowser } from './push';

/**
 * Web push on this device (NEW-5): turning it on and off, and keeping the server's copy current.
 * utils/push.ts has the browser's side; signing out goes through forgetPush in hooks/useApi.ts.
 */

/** Profile → This device → Turn on. Must run straight from the tap (see subscribeBrowser). */
export async function turnOnPush(userId: number, publicKey: string): Promise<void> {
  const sub = await subscribeBrowser(publicKey, true);
  const { id } = await api.pushSignUp(subscriptionBody(sub));
  setPushOwner({ userId, endpoint: sub.endpoint, deviceId: id });
}

/** Profile → This device → Turn off. */
export async function turnOffPush(): Promise<void> {
  const owner = pushOwner();
  setPushOwner(null);
  if (owner) await api.pushForget(owner.endpoint).catch(() => {});
  await unsubscribeBrowser();
}

/** This device gets this person's notifications right now. */
export async function pushOnHere(userId: number): Promise<boolean> {
  const owner = pushOwner();
  if (!owner || owner.userId !== userId || Notification.permission !== 'granted') return false;
  const sub = await browserSubscription().catch(() => null);
  return !!sub && sub.endpoint === owner.endpoint;
}

/**
 * When the app opens, and when this device gets a fresh login: signs this device up again (the server forgets
 * devices on "Log out everywhere", a restored backup or a new server key), or drops a subscription that isn't
 * the signed-in person's.
 */
export async function syncPush(userId: number): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    const owner = pushOwner();
    const sub = await browserSubscription();
    if (!sub) {
      if (owner) setPushOwner(null);
      return;
    }
    if (!owner || owner.userId !== userId || Notification.permission !== 'granted') {
      setPushOwner(null);
      await sub.unsubscribe();
      return;
    }
    const info = await api.pushInfo();
    if (!info.on) return;
    const current = sameKey(sub, info.publicKey) ? sub : await subscribeBrowser(info.publicKey, false);
    const { id } = await api.pushSignUp(subscriptionBody(current));
    setPushOwner({ userId, endpoint: current.endpoint, deviceId: id });
  } catch {
    // Offline, or the browser wouldn't sign up again without a tap: Profile shows "Turn on" if it's off
  }
}
