/**
 * "What's new" after a big update (NEW-38): the announcements this app has slides for
 * (components/shared/WhatsNew.tsx), oldest first. The server lists the same ids (server/src/utils/whatsNew.ts)
 * and remembers who has seen each one; add a new one in both places.
 */
export const WHATS_NEW_IDS = ['new-look'];

/** The newest announcement among these ids that this app has slides for */
export function latestWhatsNew(ids: unknown): string | null {
  if (!Array.isArray(ids)) return null;
  return [...WHATS_NEW_IDS].reverse().find((id) => ids.includes(id)) ?? null;
}
