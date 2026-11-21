import type { FeatureFlags } from '../hooks/useApi';

/**
 * "What's new" after a big update (NEW-38): the announcements this app has slides for
 * (components/shared/WhatsNew.tsx), oldest first. The server lists the same ids (server/src/utils/whatsNew.ts)
 * and remembers who has seen each one; add a new one in both places.
 */
export const WHATS_NEW_IDS = ['new-look', 'quest-trail'];

/** The announcements among these ids that this app has slides for, oldest first (someone who missed two sees both) */
export function unseenWhatsNew(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return WHATS_NEW_IDS.filter((id) => ids.includes(id));
}

/** "See what's new again" in the guide: the newest announcement about something this family has */
export function replayWhatsNew(features?: Partial<FeatureFlags>): string[] {
  const latest = [...WHATS_NEW_IDS].reverse().find((id) => id !== 'quest-trail' || features?.questTrail !== false);
  return latest ? [latest] : [];
}
