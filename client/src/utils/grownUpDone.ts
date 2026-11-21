/**
 * What a Done tap does (FIX-37):
 * - 'pick': open "Who did it?" (a grown-up on an assigned chore, or on any chore when the family chose "Always ask")
 * - 'change': count it as the grown-up's, with "counted as yours · Change" for a few seconds
 * - 'plain': just done (kids, and a grown-up with nobody else who could get the credit)
 */
export type DoneMode = 'pick' | 'change' | 'plain';

interface DoneTask { effectiveAssignedUserIds?: number[]; assignedToChildren?: boolean }
interface Person { id: number; isParticipant?: number | boolean }

export const hasAssignees = (task: DoneTask) => (task.effectiveAssignedUserIds?.length ?? 0) > 0 || !!task.assignedToChildren;

/** Someone other than me who can get credit for a chore anyone can do */
export const someoneElseCanGetIt = (meId: number, people: Person[] | undefined) =>
  (people ?? []).some((p) => p.id !== meId && p.isParticipant !== 0 && p.isParticipant !== false);

export function doneMode(task: DoneTask, me: { id: number; role?: string }, people: Person[] | undefined, setting: 'mine' | 'ask' | undefined): DoneMode {
  if (me.role !== 'admin' && me.role !== 'member') return 'plain';
  if (hasAssignees(task)) return 'pick';
  if (!someoneElseCanGetIt(me.id, people)) return 'plain';
  return setting === 'ask' ? 'pick' : 'change';
}
