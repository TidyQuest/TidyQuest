// Each person's Today page settings (ENH-6, ENH-26): the parts they hide, saved on the server (users.homeLayout via the
// profile route) so it follows them to every device. Today's order is fixed since ENH-26: a card order saved on the old
// Home stays in the database (`order`) but isn't used.

export interface HomeLayout { order: string[]; hidden: string[] }

/**
 * The parts of Today someone can hide, in the order Customise lists them. They reuse the old Home card ids, so what
 * someone hid there stays hidden; old ids with no part on Today any more are ignored.
 */
export const TODAY_BLOCKS = [
  'mascot', 'rescue', 'houseHealth', 'holiday', 'level', 'streak', 'myGoal', 'childrenGoals', 'pendingApprovals',
  'teamups', 'focus', 'usual', 'leaderboard',
] as const;
export type TodayBlockId = typeof TODAY_BLOCKS[number];

/** Kid mode keeps Today to the essentials: kids can hide these (the rest isn't shown to them) */
export const KID_BLOCKS: ReadonlySet<string> = new Set(['mascot', 'rescue', 'holiday', 'level', 'streak', 'myGoal', 'teamups', 'focus', 'usual', 'leaderboard']);

/** The hidden set the old Customise kept in this browser (before layouts were saved per person) */
export const LEGACY_HIDDEN_KEY = 'tq-dashboard-cards';
export function legacyHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LEGACY_HIDDEN_KEY) || '[]');
    return Array.isArray(v) ? v.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
