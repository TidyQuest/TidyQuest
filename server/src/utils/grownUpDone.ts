import db from '../database';

/**
 * What a grown-up's Done on a chore anyone can do does (FIX-37): 'mine' counts it as theirs with a short
 * "Change" bar, 'ask' opens "Who did it?" first. Until a parent picks, families with someone who can't log in
 * (they only get chores this way) are asked, and others count it as the grown-up's.
 */
export type GrownUpDone = 'mine' | 'ask';

export function grownUpDoneSetting(): { value: GrownUpDone; chosen: boolean } {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'grownUpDone'").get() as { value: string } | undefined;
  if (row?.value === 'mine' || row?.value === 'ask') return { value: row.value, chosen: true };
  const noLogin = db.prepare('SELECT 1 FROM users WHERE canLogIn = 0 AND isParticipant = 1 LIMIT 1').get();
  return { value: noLogin ? 'ask' : 'mine', chosen: false };
}

/** null goes back to the automatic choice */
export function setGrownUpDone(value: GrownUpDone | null): void {
  if (value === null) db.prepare("DELETE FROM app_settings WHERE key = 'grownUpDone'").run();
  else db.prepare("INSERT INTO app_settings (key, value) VALUES ('grownUpDone', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(value);
}
