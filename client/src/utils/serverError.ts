/**
 * Parents' settings forms (double coins, reward rules, goals, the family goal): the server answers
 * with short English errors meant for developers ("endAt must be after startAt"). The ones a parent
 * can run into are shown in the page's language; anything else keeps its own text.
 */
const KNOWN: Array<[RegExp, string]> = [
  [/^title is required$/, 'errors.titleRequired'],
  [/^multiplier must be more than 1 and at most (\d+)$/, 'errors.multiplier'],
  [/must be a valid date$|must be a date \(YYYY-MM-DD\)$|^Invalid time value$/, 'errors.badDate'],
  [/^endAt must be after startAt$/, 'errors.endBeforeStart'],
  [/^availableFrom must be on or before availableUntil$/, 'errors.fromAfterUntil'],
  [/^goalCoins must be > 0$/, 'errors.goalCoins'],
  [/^target must be 0 or more$/, 'errors.familyTarget'],
  [/^prices must be whole numbers above 0$/, 'errors.prices'],
  [/^limit\.count must be a whole number from 1 to (\d+)$/, 'errors.limitCount'],
  [/ not found$/, 'errors.notFound'],
  [/^Admin only$/, 'errors.adminOnly'],
];

export function serverErrorText(err: unknown, t: (key: string) => string): string {
  if (!(err instanceof Error)) return t('common.error');
  const raw = (err as { body?: { error?: string } }).body?.error ?? err.message;
  for (const [pattern, key] of KNOWN) {
    const m = pattern.exec(raw);
    if (m) return t(key).replace('{n}', m[1] ?? '');
  }
  return raw;
}
