// The chore form's values and helpers (ENH-28; the form itself is components/shared/ChoreForm.tsx)

export const FREQ_UNITS = [
  { label: 'hours', toDays: 1 / 24 },
  { label: 'days', toDays: 1 },
  { label: 'weeks', toDays: 7 },
  { label: 'months', toDays: 30 },
  { label: 'years', toDays: 365 },
];

export function freqToDays(value: number, unit: string): number {
  const u = FREQ_UNITS.find(f => f.label === unit);
  return value * (u?.toDays || 1);
}

export function healthColor(value: number): string {
  if (value >= 70) return 'var(--health-green)';
  if (value >= 40) return 'var(--health-yellow)';
  return 'var(--health-red)';
}

export type AssignMode = 'first' | 'shared' | 'custom' | 'rotating';

export interface ChoreFormState {
  name: string;
  /** The name as it was opened (a translated default chore keeps its key unless it's renamed) */
  originalName: string;
  notes: string;
  freqValue: number;
  freqUnit: string;
  effort: number;
  health: number;
  healthChanged: boolean;
  iconKey: string;
  onDemand: boolean;
  showInDashboard: boolean;
  assignmentType: 'none' | 'users';
  assignmentUserIds: number[];
  assignmentMode: AssignMode;
  assignmentPercentages: Record<number, number>;
  customCoins: string | number;
  allowEarlyCompletion: boolean;
  repeatLimit: string;
  repeatPeriod: 'day' | 'week';
  paused: boolean;
  pausedUntil: string;
}

/** A new chore: every week, effort 2, due now, anyone */
export const newChoreForm = (): ChoreFormState => ({
  name: '', originalName: '', notes: '', freqValue: 7, freqUnit: 'days', effort: 2, health: 0, healthChanged: false,
  iconKey: 'sparkle', onDemand: false, showInDashboard: false, assignmentType: 'none', assignmentUserIds: [],
  assignmentMode: 'first', assignmentPercentages: {}, customCoins: '', allowEarlyCompletion: false, repeatLimit: '',
  repeatPeriod: 'week', paused: false, pausedUntil: '',
});

/** Custom split: share 100% evenly, the odd points to the first person */
export function initPercentages(userIds: number[]): Record<number, number> {
  if (userIds.length === 0) return {};
  const base = Math.floor(100 / userIds.length);
  const remainder = 100 - base * userIds.length;
  const result: Record<number, number> = {};
  userIds.forEach((id, i) => { result[id] = base + (i === 0 ? remainder : 0); });
  return result;
}
