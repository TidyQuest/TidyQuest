import db from '../database';
import { achievementsFor, badgeInfo } from './achievementStats';
import { notifyBadge } from './notifyMessages';

/**
 * Synchronously checks which achievements are newly unlocked for a user,
 * records them in user_achievement_notifications (where earned badges are kept), and returns their IDs.
 * Safe to call inline before sending a response.
 */
export function checkAndRecordNewAchievements(userId: number): string[] {
  const gamifRow = db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  if (gamifRow && gamifRow.value === '0') return [];
  return achievementsFor(userId, { record: true })?.newlyEarned ?? [];
}

/**
 * Async: tells the person and the parents about newly earned badges. Pass the ids when
 * checkAndRecordNewAchievements already ran for this person (the Done route does, for the pop-up): a second
 * check finds nothing new, and nothing would be sent (BUG-40). Without ids it checks and records itself.
 */
export async function notifyAchievementUnlocksForUser(userId: number, alreadyRecorded?: string[]): Promise<void> {
  const newIds = alreadyRecorded ?? checkAndRecordNewAchievements(userId);
  for (const badge of badgeInfo(userId, newIds)) await notifyBadge(userId, badge);
}
