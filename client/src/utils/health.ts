export function getHealthColor(h: number): string {
  return h >= 70 ? 'var(--health-green)' : h >= 40 ? 'var(--health-yellow)' : 'var(--health-red)';
}

export function getHealthBg(h: number): string {
  return h >= 70 ? 'var(--health-green-bg)' : h >= 40 ? 'var(--health-yellow-bg)' : 'var(--health-red-bg)';
}

/** Done stays locked until a chore is due again (unless it's on demand or may be done early),
 *  so its colour shouldn't turn red yet: the same rule as the Done button in RoomDetail. */
export function notDueYet(task: { onDemand?: boolean | number | null; allowEarlyCompletion?: boolean | number | null; health: number; lastCompletedAt?: string | null }): boolean {
  return !task.onDemand && !task.allowEarlyCompletion && task.health > 0 && !!task.lastCompletedAt;
}

export function getHealthLabel(h: number): string {
  return h >= 70 ? 'Healthy' : h >= 40 ? 'Needs attention' : 'Critical';
}

export function getRoomHealth(tasks: Array<{ health: number; effort: number }>): number {
  const totalEffort = tasks.reduce((s, t) => s + t.effort, 0);
  if (totalEffort === 0) return 100;
  return Math.round(tasks.reduce((s, t) => s + t.health * t.effort, 0) / totalEffort);
}
