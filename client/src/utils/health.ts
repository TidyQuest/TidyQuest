// Health colours blend smoothly instead of jumping between three steps (ENH-34):
// dark red at 0 → red at 20 → amber at 45 → yellow-green at 70 → green at 100.
// Built from each theme's own --health-* colours, so every theme and dark mode keeps working.
const STOPS: Array<[number, string]> = [
  [0, 'var(--health-deep, color-mix(in oklab, var(--health-red) 62%, #000))'],
  [20, 'var(--health-red)'],
  [45, 'var(--health-yellow)'],
  [70, 'color-mix(in oklab, var(--health-yellow) 45%, var(--health-green))'],
  [100, 'var(--health-green)'],
];

/** Fill colour for a health bar or ring (0–100) */
export function getHealthColor(h: number): string {
  const v = Math.max(0, Math.min(100, Math.round(h)));
  for (let i = 1; i < STOPS.length; i++) {
    const [b, bc] = STOPS[i];
    if (v > b) continue;
    const [a, ac] = STOPS[i - 1];
    if (v === b) return bc;
    if (v === a) return ac;
    return `color-mix(in oklab, ${bc} ${Math.round(((v - a) / (b - a)) * 100)}%, ${ac})`;
  }
  return STOPS[STOPS.length - 1][1];
}

/** The same colour for small text (a % or a word): mixed with the theme's text colour so it stays
 *  readable on a light card (darker) and on a dark one (lighter). Below 20% it mixes toward red
 *  instead, so dark red text doesn't turn almost black. */
export function getHealthTextColor(h: number): string {
  const v = Math.max(0, Math.min(100, Math.round(h)));
  const base = v >= 20 ? 'var(--warm-text)' : `color-mix(in oklab, var(--warm-text) ${v * 5}%, var(--health-red))`;
  return `color-mix(in oklab, ${getHealthColor(v)} 62%, ${base})`;
}

export function getHealthBg(h: number): string {
  return h >= 70 ? 'var(--health-green-bg)' : h >= 40 ? 'var(--health-yellow-bg)' : 'var(--health-red-bg)';
}

/** A chore that can't be done yet stops at amber: red means "due, do it now" (#153, #172, #183) */
export const NOT_DUE_FLOOR = 45;

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
