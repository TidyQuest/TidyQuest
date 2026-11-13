// Each person's Today page settings (ENH-6, ENH-26): the parts they hide and the order of the big blocks, saved on the
// server (users.homeLayout via the profile route) so it follows them to every device.

export interface HomeLayout { order: string[]; hidden: string[] }

/**
 * The parts of Today someone can hide, in the order Customise lists them. They reuse the old Home card ids, so what
 * someone hid there stays hidden; old ids with no part on Today any more are ignored.
 */
export const TODAY_BLOCKS = [
  'mascot', 'rescue', 'houseHealth', 'holiday', 'level', 'streak', 'myGoal', 'childrenGoals', 'pendingApprovals',
  'teamups', 'focus', 'usual', 'todo', 'leaderboard',
] as const;
export type TodayBlockId = typeof TODAY_BLOCKS[number];

/** Kid mode keeps Today to the essentials: kids can hide these (the rest isn't shown to them) */
export const KID_BLOCKS: ReadonlySet<string> = new Set(['mascot', 'rescue', 'holiday', 'level', 'streak', 'myGoal', 'teamups', 'focus', 'usual', 'todo', 'leaderboard']);

/**
 * The full-width blocks under the summary, in their default order. Customise can move these (the summary stays on top
 * and the chips stay in one row). 'lists' (Overdue / Today / Any time) can be moved but not hidden.
 */
export const TODAY_ORDER = ['pendingApprovals', 'teamups', 'focus', 'lists', 'todo', 'leaderboard'] as const;
export type TodayOrderId = typeof TODAY_ORDER[number];

/**
 * The blocks in this person's order: the ids they saved swap places among themselves, and any id they never placed
 * (a block added later) keeps its default spot. Unknown saved ids (old Home cards) are ignored.
 */
export function orderBlocks<T extends string>(defaults: readonly T[], saved: readonly string[]): T[] {
  const placed = defaults.filter((id) => saved.includes(id)).sort((a, b) => saved.indexOf(a) - saved.indexOf(b));
  let next = 0;
  return defaults.map((id) => (saved.includes(id) ? placed[next++] : id));
}

/** Moves one id before or after another (Customise's drag) */
export function placeBlock<T extends string>(order: readonly T[], id: T, target: T, where: 'before' | 'after'): T[] {
  const rest = order.filter((x) => x !== id);
  const at = rest.indexOf(target);
  if (at < 0) return [...order];
  rest.splice(where === 'before' ? at : at + 1, 0, id);
  return rest;
}

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
