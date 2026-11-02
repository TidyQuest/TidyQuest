import { mainDb } from './mainDb';

// The operator page's History (NEW-24): every operator action, sign-ins included, and what the server did
// to a family by itself. Kept for good, family names and emails too. The server log still gets its lines.

export type OperatorAction =
  // On a family, by an operator or (trial-delete) by the expired-trial clean-up
  | 'suspend' | 'resume' | 'delete' | 'resend-confirmation' | 'trial-delete'
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
