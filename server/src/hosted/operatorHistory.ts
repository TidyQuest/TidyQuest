import { mainDb } from './mainDb';

// The operator page's History (NEW-24): every operator action, sign-ins included, and what the server did
// to a family by itself. Kept for good, but once a deleted family is gone for good its name and the emails
// in its entries are cleared (NEW-34), and so are waitlist emails after 12 months. The server log still
// gets its lines.

export type OperatorAction =
  // On a family, by an operator or by the server's clean-up: an expired trial, a parent who never
  // confirmed, a year unused (NEW-34)
  | 'suspend' | 'resume' | 'delete' | 'resend-confirmation' | 'trial-delete' | 'unconfirmed-delete' | 'inactive-delete'
  // A deleted family brought back (NEW-23); detail lists the emails and family code new sign-ups took meanwhile
  | 'restore'
  // A parent deleted their own family (NEW-25); detail is their email
  | 'parent-delete'
  // A news email went out (NEW-34); detail is its subject and how many got it
  | 'news'
  // An operator's own account; the env- ones come from OPERATOR_EMAIL and OPERATOR_PASSWORD
  | 'sign-in' | 'wrong-password' | 'password' | 'sign-out' | 'env-account' | 'env-password'
  // New sign-ups opened or closed, and a family taken off the waitlist (NEW-30)
  | 'signups-open' | 'signups-closed' | 'waitlist-remove';

/** The History's Sign-ins and Sign-ups filters; Family actions are the entries with a family. */
export const SIGN_IN_ACTIONS: OperatorAction[] = ['sign-in', 'wrong-password', 'password', 'sign-out', 'env-account', 'env-password'];
export const SIGN_UP_ACTIONS: OperatorAction[] = ['signups-open', 'signups-closed', 'waitlist-remove'];

export interface HistoryEntry {
  action: OperatorAction;
  operatorEmail?: string;
  family?: { id: string; name: string };
  detail?: string;
  ip?: string;
}

export function recordOperatorAction(entry: HistoryEntry, now = new Date()): void {
  mainDb().prepare('INSERT INTO operator_history (at, operatorEmail, action, familyId, familyName, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(now.toISOString(), entry.operatorEmail ?? null, entry.action, entry.family?.id ?? null, entry.family?.name ?? null,
      entry.detail ?? null, entry.ip ?? null);
}
