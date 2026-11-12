import bcrypt from 'bcryptjs';
import { isHosted } from '../hosted/context';
import { addFailure, clearFailures, failuresOf } from './throttle';

/** Hosted parents sign in by email from anywhere: their passwords need at least this many characters. */
export const HOSTED_PARENT_MIN = 8;

/** The shortest password this person may have (BUG-24): 8 for a parent in hosted mode, else 4. */
export function minPassword(role: string): number {
  return isHosted() && role === 'admin' ? HOSTED_PARENT_MIN : 4;
}

/** The refusal for a password shorter than `min`; the app shows it in the reader's language. */
export const shortPassword = (min: number) => ({ error: `Passwords need at least ${min} characters`, code: 'short-password', min });

/** Wrong passwords a signed-in person may type in 15 minutes when asked to confirm theirs. */
export const OWN_PASSWORD_MAX = 5;

/**
 * A signed-in person retyping their password (changing their email or password, deleting the family). Wrong ones
 * count like failed logins, and once there are OWN_PASSWORD_MAX nothing is checked until the 15 minutes are up, so
 * a stolen session can't be used to guess the password and the slow compare can't be looped (BUG-23).
 * `who` names the person: `<familyId>:<userId>`.
 */
export function checkOwnPassword(who: string, password: unknown, hash: string): 'ok' | 'wrong' | 'blocked' {
  const key = `own-password:${who}`;
  if (failuresOf(key) >= OWN_PASSWORD_MAX) return 'blocked';
  if (typeof password === 'string' && bcrypt.compareSync(password, hash)) {
    clearFailures(key);
    return 'ok';
  }
  addFailure(key);
  return 'wrong';
}

export const TOO_MANY_TRIES = { error: 'Too many wrong passwords. Please try again in 15 minutes.', code: 'too-many-tries' };
