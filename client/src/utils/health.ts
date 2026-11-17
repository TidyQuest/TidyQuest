// Health colours in five clean steps that match a room's wording (ENH-34): 90%+ green, 70%+ lime,
// 40%+ amber, 20%+ orange-red, below 20% dark red. Each step has a bar colour and a readable text colour,
// set per theme in index.css (--health-s0 … --health-s4 and their -text versions).
const step = (h: number): number => (h >= 90 ? 4 : h >= 70 ? 3 : h >= 40 ? 2 : h >= 20 ? 1 : 0);

/** Bar or ring colour for a health value (0–100) */
export function getHealthColor(h: number): string {
  return `var(--health-s${step(h)})`;
}

/** The same step's colour for a % or a word: darker on light cards, lighter on dark ones */
export function getHealthTextColor(h: number): string {
  return `var(--health-s${step(h)}-text)`;
}

export function getHealthBg(h: number): string {
  return h >= 70 ? 'var(--health-green-bg)' : h >= 40 ? 'var(--health-yellow-bg)' : 'var(--health-red-bg)';
}

/** A chore that can't be done yet stops at amber: red means "due, do it now" (#153, #172, #183) */
export const NOT_DUE_FLOOR = 40;

/** Done stays locked until a chore is due again (unless it's on demand or may be done early),
 *  so its colour shouldn't turn red yet: the same rule as the Done button in RoomDetail. */
export function notDueYet(task: { onDemand?: boolean | number | null; allowEarlyCompletion?: boolean | number | null; health: number; lastCompletedAt?: string | null }): boolean {
  return !task.onDemand && !task.allowEarlyCompletion && task.health > 0 && !!task.lastCompletedAt;
}

/** One chore's health as a colour: like getHealthColor, but a chore that can't be done yet stops at amber */
export function choreHealthColor(task: Parameters<typeof notDueYet>[0], text = false): string {
  const v = notDueYet(task) ? Math.max(task.health, NOT_DUE_FLOOR) : task.health;
  return text ? getHealthTextColor(v) : getHealthColor(v);
}

export function getHealthLabel(h: number): string {
  return h >= 70 ? 'Healthy' : h >= 40 ? 'Needs attention' : 'Critical';
}

export function getRoomHealth(tasks: Array<{ health: number; effort: number }>): number {
  const totalEffort = tasks.reduce((s, t) => s + t.effort, 0);
  if (totalEffort === 0) return 100;
  return Math.round(tasks.reduce((s, t) => s + t.health * t.effort, 0) / totalEffort);
}
