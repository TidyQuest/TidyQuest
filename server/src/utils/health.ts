export function calculateHealth(
  lastCompletedAt: string | null,
  frequencyDays: number,
  isVacationMode: boolean = false,
  vacationStartDate: string | null = null,
  nowMs: number = Date.now()
): number {
  if (!lastCompletedAt) return 0;

  let now = nowMs;

  // If vacation mode is on, freeze time at vacation start
  if (isVacationMode && vacationStartDate) {
    now = new Date(vacationStartDate).getTime();
  }

  const lastDone = new Date(lastCompletedAt).getTime();
  const safeFrequencyDays = Math.max(1 / 24, Number(frequencyDays) || 7);
  const daysSinceCompletion = (now - lastDone) / (1000 * 60 * 60 * 24);
  // Never over 100: a chore done during a vacation is measured against the day the vacation began
  const health = Math.min(100, Math.max(0, Math.round(100 - (daysSinceCompletion / safeFrequencyDays) * 100)));
  return health;
}

export const DEFAULT_COINS_BY_EFFORT: Record<number, number> = {
  1: 5,
  2: 10,
  3: 15,
  4: 20,
  5: 25,
};

export function normalizeCoinsByEffortConfig(config: any): Record<number, number> {
  const normalized: Record<number, number> = { ...DEFAULT_COINS_BY_EFFORT };
  for (const key of [1, 2, 3, 4, 5]) {
    const v = Number(config?.[key] ?? config?.[String(key)]);
    if (Number.isFinite(v) && v >= 0) {
      normalized[key] = Math.round(v);
    }
  }
  return normalized;
}

export function getCoinsForEffort(effort: number, coinsByEffort: Record<number, number> = DEFAULT_COINS_BY_EFFORT): number {
  const e = Math.max(1, Math.min(5, Math.round(effort || 1)));
  return coinsByEffort[e] ?? DEFAULT_COINS_BY_EFFORT[e];
}
