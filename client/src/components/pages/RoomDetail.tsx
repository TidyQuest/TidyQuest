import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useHeaderAdd } from '../layout/headerAdd';
import { createPortal } from 'react-dom';
import { RingGauge } from '../shared/RingGauge';
import { EffortDots } from '../shared/EffortDots';
import { TaskIcon } from '../icons/TaskIcons';
import { IconPicker } from '../shared/IconPicker';
import { PlusIcon } from '../icons/UIIcons';
import { getRoomHealth } from '../../utils/health';
import { formatNextDue, isTaskForUser, taskNextDue } from '../../utils/tasks';
import { taskErrorText } from '../../utils/taskError';
import { useBusy } from '../../hooks/useBusy';
import { TimerStartButton } from '../shared/ChoreTimer';
import { useChoreTimer } from '../../hooks/useChoreTimer';
import { DueOnPicker, ReminderPicker, RotationPeriodPicker, SeasonPicker, StartsOnPicker, StepsField, TimerPicker } from '../shared/ScheduleFields';
import { EMPTY_SCHEDULE, schedulePayload, scheduleFromTask, startsLater, todayIso, type ScheduledTaskFields, type ScheduleValue } from '../../utils/schedule';
import { api } from '../../hooks/useApi';
import { TakeBackButton } from '../shared/TakeBackButton';
import { TodoQuickAdd } from '../shared/TodoQuickAdd';
import { localeFor } from '../../utils/locale';
import { useTranslation } from '../../hooks/useTranslation';
import { AdminCompleteModal } from '../shared/AdminCompleteModal';
import { ProofModal, type Proof } from '../shared/ProofModal';
import { LateLogModal } from '../shared/LateLogModal';
import { UndoToast, type UndoState } from '../shared/UndoToast';
import { TeamUpDialog } from '../shared/TeamUp';
import { ChoreAct, ChoreCoins, ChoreFacts, ChoreLate, ChoreRow } from '../shared/ChoreRow';
import { choreDue, choreWho, daysToFreq } from '../../utils/choreText';
import { claimedLabel } from '../../utils/teamups';
import type { TeamUpInfo } from '../../hooks/useApi';
import { DuplicateRoom } from '../shared/DuplicateRoom';
import { dateStr, startOfDay } from '../../utils/clock';

const tomorrowIso = () => todayIso(new Date(Date.now() + 86400000));

const FREQ_UNITS = [
  { label: 'hours', toDays: 1 / 24 },
  { label: 'days', toDays: 1 },
  { label: 'weeks', toDays: 7 },
  { label: 'months', toDays: 30 },
  { label: 'years', toDays: 365 },
];

function freqToDays(value: number, unit: string): number {
  const u = FREQ_UNITS.find(f => f.label === unit);
  return value * (u?.toDays || 1);
}


function healthColor(value: number): string {
  if (value >= 70) return 'var(--health-green)';
  if (value >= 40) return 'var(--health-yellow)';
  return 'var(--health-red)';
}

type RoomFilter = 'all' | 'mine' | 'overdue' | 'paused';
type Bucket = 'overdue' | 'today' | 'week' | 'needed' | 'later' | 'paused';
type SortKey = 'when' | 'name' | 'health' | 'effort' | 'frequency' | 'coins' | 'assigned' | 'dueDate';

interface CompletedTodayBy {
  completionId: number;
  userId: number;
  coinsEarned?: number;
  displayName: string;
  avatarColor: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
}

interface Task extends ScheduledTaskFields {
  pausedAt?: string | null; // ENH-1: paused (parents only see it)
  pausedUntil?: string | null;
  id: number; name: string; translationKey?: string; health: number; frequencyDays: number;
  effort: number; notes?: string | null; isSeasonal: boolean; onDemand?: boolean; showInDashboard?: boolean; lastCompletedAt: string | null; iconKey?: string;
  assignedToChildren?: boolean;
  assignedUserIds?: number[];
  assignedUsers?: Array<{ id: number; displayName: string; avatarColor: string; avatarType?: string; avatarPreset?: string; avatarPhotoUrl?: string; coinPercentage?: number }>;
  effectiveAssignedUserIds?: number[];
  completedTodayBy?: CompletedTodayBy | null;
  /** Team-ups: can you start one, and has a team claimed it today? */
  teamUp?: TeamUpInfo | null;
  assignmentMode?: 'first' | 'shared' | 'custom' | 'rotating';
  rotationCurrentUserId?: number | null;
  customCoins?: number | null;
  myPendingCount?: number;
  /** My latest Done that waits for approval (I can take it back) */
  myPendingId?: number | null;
  repeatLimit?: number | null;
  repeatPeriod?: 'day' | 'week' | null;
  /** The viewer's completions of this anytime quest in the current day/week */
  myRepeatCount?: number;
  allowEarlyCompletion?: boolean;
  sharedCompletions?: Array<{ userId: number; displayName: string; completionId: number }>;
  /** When it's next due, from the server (set weekdays aware) */
  nextDueAt?: string | null;
  /** Outside its season right now (isSeasonal is then true too) */
  outOfSeason?: boolean;
  /** Pinned by the viewer to "Your usual" on Home */
  pinned?: boolean;
  createdAt?: string | null;
}

interface RoomDetailProps {
  room: {
    id: number; name: string; roomType: string; color: string; accentColor: string;
    assignedUserId?: number | null;
    tasks: Task[];
    /** From the server: one-time chores, paused ones and (for the To-dos room) everything left out */
    health?: number;
    /** The family's To-dos room (ENH-18): a checklist, with no health */
    isTodoRoom?: boolean;
    todoCount?: number;
    todoOverdue?: number;
  };
  language?: string;
  isAdmin: boolean;
  currentUserId?: number;
  currentUserRole?: 'admin' | 'member' | 'child';
  users?: Array<{ id: number; displayName: string; role: string; avatarColor: string; avatarType?: string; avatarPreset?: string; avatarPhotoUrl?: string }>;
  coinsByEffort?: Record<number, number>;
  onCompleteTask: (taskId: number, proof?: Proof) => void;
  /** Strict Mode is on: kids can attach a note or photo when finishing */
  strictMode?: boolean;
  onRefresh?: () => void;
  /** Go to another room (after duplicating this one) */
  onOpenRoom?: (roomId: number) => void;
  /** Offer "One time" in the task form (Settings → Features → To-dos) */
  allowOneTime?: boolean;
  /** Settings → Features → Proof photos: kids' proof is a note only when off */
  allowPhotos?: boolean;
  /** Your usual is switched on: show the ☆ pin button */
  allowPins?: boolean;
  onAchievementsUnlocked?: (ids: string[]) => void;
  /** Task to scroll to and briefly highlight (from search or the task list) */
  focusTaskId?: number;
  /** The viewer is locked to Mine (or in Kid mode): only show their tasks */
  onlyMine?: boolean;
}

function FrequencyPicker({ value, unit, onChange, t }: {
  value: number; unit: string;
  onChange: (v: number, u: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input type="number" min={1} max={999} value={value}
        onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1), unit)}
        className="tq-input-compact"
        style={{ width: 52, textAlign: 'center', fontWeight: 700 }} />
      <select value={unit} onChange={(e) => onChange(value, e.target.value)}
        className="tq-input-compact"
        style={{ cursor: 'pointer' }}>
        {FREQ_UNITS.map((f) => (
          <option key={f.label} value={f.label}>{t(`units.${f.label}`)}</option>
        ))}
      </select>
    </div>
  );
}

function EffortPicker({ effort, onChange }: { effort: number; onChange: (e: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((e) => (
        <button key={e} onClick={() => onChange(e)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 1,
            opacity: e <= effort ? 1 : 0.3,
          }}>
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L8.5 5H12.5L9.5 7.5L10.5 11.5L7 9L3.5 11.5L4.5 7.5L1.5 5H5.5L7 1Z"
              fill={e <= effort ? '#F59E0B' : 'none'}
              stroke={e <= effort ? '#F59E0B' : '#E2D5C5'}
              strokeWidth={e <= effort ? '0.5' : '1'} />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function RoomDetail({ room, language, isAdmin, currentUserId, currentUserRole, users, coinsByEffort, onCompleteTask, onRefresh, onOpenRoom, allowOneTime = true, allowPhotos = true, allowPins = true, onAchievementsUnlocked, focusTaskId, onlyMine, strictMode }: RoomDetailProps) {
  const { taskName: translateTask, roomDisplayName, t } = useTranslation(language);
  const [animatedTask, setAnimatedTask] = useState<number | null>(null);
  const timer = useChoreTimer();
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', originalName: '', notes: '', freqValue: 7, freqUnit: 'days', effort: 1, health: 100, healthChanged: false, iconKey: 'sparkle', onDemand: false, showInDashboard: false, assignmentType: 'none' as 'none' | 'users', assignmentUserIds: [] as number[], assignmentMode: 'first' as 'first' | 'shared' | 'custom' | 'rotating', assignmentPercentages: {} as Record<number, number>, customCoins: '' as string | number, allowEarlyCompletion: false, repeatLimit: '', repeatPeriod: 'week' as 'day' | 'week', paused: false, pausedUntil: '' });
  const [taskMenuOpen, setTaskMenuOpen] = useState<number | null>(null);
  const [moveMenuTaskId, setMoveMenuTaskId] = useState<number | null>(null);
  const [allRooms, setAllRooms] = useState<Array<{ id: number; name: string; roomType: string }>>([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newFreqValue, setNewFreqValue] = useState(7);
  const [newFreqUnit, setNewFreqUnit] = useState('days');
  const [newTaskEffort, setNewTaskEffort] = useState(2);
  const [newTaskHealth, setNewTaskHealth] = useState(0);
  const [newTaskIconKey, setNewTaskIconKey] = useState('sparkle');
  const [newAssignmentType, setNewAssignmentType] = useState<'none' | 'users'>('none');
  const [newAssignmentUserIds, setNewAssignmentUserIds] = useState<number[]>([]);
  const [newAssignmentMode, setNewAssignmentMode] = useState<'first' | 'shared' | 'custom' | 'rotating'>('first');
  const [newAssignmentPercentages, setNewAssignmentPercentages] = useState<Record<number, number>>({});
  const [addTaskError, setAddTaskError] = useState('');
  const [newTaskOnDemand, setNewTaskOnDemand] = useState(false);
  const [newTaskShowInDashboard, setNewTaskShowInDashboard] = useState(false);
  const [newTaskCustomCoins, setNewTaskCustomCoins] = useState<string | number>('');
  const [newRepeatLimit, setNewRepeatLimit] = useState('');
  const [newRepeatPeriod, setNewRepeatPeriod] = useState<'day' | 'week'>('week');
  const [editSchedule, setEditSchedule] = useState<ScheduleValue>(EMPTY_SCHEDULE);
  const [newSchedule, setNewSchedule] = useState<ScheduleValue>(EMPTY_SCHEDULE);
  // ENH-28: "When it's due" shows the room in sections (Overdue, Today, This week…); any other sort is one list
  const [sortKey, setSortKey] = useState<SortKey>('when');
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState<RoomFilter>('all');
  const [showLater, setShowLater] = useState(false);
  const [roomMenu, setRoomMenu] = useState(false);
  const focusedOnce = useRef<number | null>(null);
  // The chore whose row is open (ENH-25); one opened from search, Home or the task list starts open
  const [openTask, setOpenTask] = useState<number | null>(focusTaskId ?? null);
  const [seenFocus, setSeenFocus] = useState(focusTaskId);
  if (focusTaskId !== seenFocus) {
    setSeenFocus(focusTaskId);
    if (focusTaskId) setOpenTask(focusTaskId);
  }
  const [proofTask, setProofTask] = useState<Task | null>(null);
  /** "Done earlier…" (ENH-7) */
  const [lateTask, setLateTask] = useState<Task | null>(null);
  // The chore someone is picking a team-up partner for
  const [teamPick, setTeamPick] = useState<Task | null>(null);
  const canAddProof = !!strictMode && currentUserRole === 'child';
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const closeUndo = useCallback(() => setUndo(null), []);
  // Delete, undo, pin, copy and move: a failure (such as a phone that's offline) shows a toast instead of nothing
  const attempt = async (fn: () => Promise<void>) => {
    try { await fn(); } catch { setUndo({ message: t('common.actionFailed') }); onRefresh?.(); }
  };

  // Opened from search or the task list: bring that task into view and flash it once
  useEffect(() => {
    if (!focusTaskId || focusedOnce.current === focusTaskId) return;
    const el = document.querySelector(`[data-task-id="${focusTaskId}"]`);
    if (!el) return;
    focusedOnce.current = focusTaskId;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('task-focus-flash');
    const timer = setTimeout(() => el.classList.remove('task-focus-flash'), 2500);
    return () => { clearTimeout(timer); el.classList.remove('task-focus-flash'); };
  }, [focusTaskId, room.tasks.length]);

  const [adminModalTask, setAdminModalTask] = useState<Task | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateTasks, setTemplateTasks] = useState<Array<{ name: string; translationKey?: string; iconKey?: string; frequencyDays: number; effort: number; isSeasonal?: boolean; selected: boolean }>>([]);
  const [templateLoading, setTemplateLoading] = useState(false);

  // Initialize percentages evenly for custom mode
  const initPercentages = (userIds: number[]): Record<number, number> => {
    if (userIds.length === 0) return {};
    const base = Math.floor(100 / userIds.length);
    const remainder = 100 - base * userIds.length;
    const result: Record<number, number> = {};
    userIds.forEach((id, i) => { result[id] = base + (i === 0 ? remainder : 0); });
    return result;
  };

  const health = room.health ?? getRoomHealth(room.tasks);

  // Same rule the server uses when paying out: a custom amount wins over the effort default
  const taskCoins = (task: Task) =>
    task.customCoins != null && task.customCoins > 0 ? task.customCoins : (coinsByEffort?.[task.effort] ?? task.effort * 5);

  const sortedTasks = [...room.tasks].filter((task) => !onlyMine || currentUserId === undefined || isTaskForUser(task, currentUserId, currentUserRole)).sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'health': cmp = a.health - b.health; break;
      case 'effort': cmp = a.effort - b.effort; break;
      case 'frequency': cmp = a.frequencyDays - b.frequencyDays; break;
      case 'coins': cmp = taskCoins(a) - taskCoins(b); break;
      case 'assigned': cmp = (a.assignedUsers?.length ?? 0) - (b.assignedUsers?.length ?? 0); break;
      case 'when':
      case 'dueDate': cmp = taskNextDue(a).getTime() - taskNextDue(b).getTime() || a.id - b.id; break;
    }
    return !!a.pausedAt !== !!b.pausedAt ? (a.pausedAt ? 1 : -1) : sortAsc ? cmp : -cmp; // paused chores last
  });

  const handleComplete = (task: Task) => {
    const isAdminOrMember = currentUserRole === 'admin' || currentUserRole === 'member';
    const hasAssignees = (task.effectiveAssignedUserIds && task.effectiveAssignedUserIds.length > 0) || task.assignedToChildren;
    if (isAdminOrMember && hasAssignees) {
      setAdminModalTask(task);
    } else {
      setAnimatedTask(task.id);
      onCompleteTask(task.id);
      setTimeout(() => setAnimatedTask(null), 2200);
    }
  };

  const handleAdminModalConfirm = async (userIds: number[]) => {
    if (!adminModalTask) return;
    const allNewAchievements: string[] = [];
    try {
      for (const uid of userIds) {
        const result = await api.completeTask(adminModalTask.id, uid);
        if (result.newAchievements?.length) allNewAchievements.push(...result.newAchievements);
      }
    } catch (e) {
      // It didn't go through (the kid already did it, no connection): no green flash, and the box stays open
      // and says why (BUG-38). Earlier people on the list may have gone through, so reload.
      onRefresh?.();
      throw e;
    } finally {
      if (allNewAchievements.length > 0) onAchievementsUnlocked?.(allNewAchievements);
    }
    setAdminModalTask(null);
    setAnimatedTask(adminModalTask.id);
    onRefresh?.();
    setTimeout(() => setAnimatedTask(null), 2200);
  };

  const startEdit = (task: Task) => {
    const { value, unit } = daysToFreq(task.frequencyDays);
    const assignmentType: 'none' | 'users' =
      (task.assignedUserIds && task.assignedUserIds.length > 0) ? 'users' : 'none';
    const assignmentUserIds = task.assignedUserIds || [];
    const assignmentPercentages: Record<number, number> = {};
    for (const u of task.assignedUsers || []) {
      assignmentPercentages[u.id] = u.coinPercentage ?? 0;
    }
    const displayedName = translateTask(task.name, task.translationKey);
    setSaveError('');
    setEditingTask(task.id);
    setEditSchedule(scheduleFromTask(task));
    setEditForm({ name: displayedName, originalName: displayedName, notes: task.notes || '', freqValue: value, freqUnit: unit, effort: task.effort, health: task.health, healthChanged: false, iconKey: task.iconKey || 'sparkle', onDemand: !!task.onDemand, showInDashboard: !!task.showInDashboard, assignmentType, assignmentUserIds, assignmentMode: (task.assignmentMode || 'first') as 'first' | 'shared' | 'custom' | 'rotating', assignmentPercentages, customCoins: task.customCoins ?? '', allowEarlyCompletion: !!task.allowEarlyCompletion, repeatLimit: task.repeatLimit ? String(task.repeatLimit) : '', repeatPeriod: task.repeatPeriod === 'day' ? 'day' : 'week', paused: !!task.pausedAt, pausedUntil: task.pausedUntil || '' });
  };

  // One save at a time (BUG-35: a double tap added the chore twice), and a save that fails says so
  // (BUG-38: Save did nothing)
  const [saving, runSave] = useBusy();
  const [saveError, setSaveError] = useState('');
  // The phone top bar's + opens the add form here and brings it into view (ENH-24)
  const addAnchor = useRef<HTMLDivElement>(null);
  const openAddFromHeader = useCallback(() => {
    setSaveError('');
    setShowAddTask(true);
    requestAnimationFrame(() => addAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);
  useHeaderAdd(isAdmin ? openAddFromHeader : null);
  const saveEdit = () => runSave(async () => {
    if (!editingTask || !editForm.name.trim()) return;
    setSaveError('');
    const frequencyDays = freqToDays(editForm.freqValue, editForm.freqUnit);
    const assignmentPayload =
      editForm.assignmentType === 'users' ? { assignedToChildren: false, assignedUserIds: editForm.assignmentUserIds } :
      { assignedToChildren: false, assignedUserIds: [] };
    const assignedUserPercentages = editForm.assignmentMode === 'custom' ? editForm.assignmentPercentages : undefined;
    const nameChanged = editForm.name.trim() !== editForm.originalName.trim();
    try {
      await api.updateTask(editingTask, { ...(nameChanged ? { name: editForm.name } : {}), notes: editForm.notes, frequencyDays, effort: editForm.effort, ...(editForm.healthChanged ? { health: editForm.health } : {}), iconKey: editForm.iconKey, onDemand: editForm.onDemand, showInDashboard: editForm.showInDashboard, assignmentMode: editForm.assignmentMode, assignedUserPercentages, customCoins: editForm.customCoins !== '' ? Number(editForm.customCoins) : null, allowEarlyCompletion: editForm.allowEarlyCompletion, repeatLimit: editForm.onDemand && editForm.repeatLimit ? Number(editForm.repeatLimit) : null, repeatPeriod: editForm.repeatPeriod, ...schedulePayload(editSchedule, { onDemand: editForm.onDemand, rotating: editForm.assignmentMode === 'rotating' }), ...assignmentPayload, paused: editForm.paused, pausedUntil: editForm.paused && editForm.pausedUntil ? editForm.pausedUntil : null });
    } catch (err) {
      setSaveError(taskErrorText(err, t));
      return;
    }
    const editedId = editingTask;
    setEditingTask(null);
    onRefresh?.();
    // Bring the edited task back into view once the list has reloaded (it may have re-sorted)
    setTimeout(() => {
      const el = document.querySelector(`[data-task-id="${editedId}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('task-focus-flash');
      setTimeout(() => el.classList.remove('task-focus-flash'), 2000);
    }, 500);
  });

  // Determine if Done button should be disabled for a task
  function getDoneButtonState(task: Task): { disabled: boolean; label: string; done?: boolean } {
    const claimed = claimedLabel(task.teamUp);
    if (claimed) return { disabled: true, label: claimed };
    if (currentUserRole !== 'admin' && currentUserRole !== 'member') {
      const effectiveIds = task.effectiveAssignedUserIds;
      if (effectiveIds && effectiveIds.length > 0 && currentUserId !== undefined) {
        if (!effectiveIds.includes(currentUserId)) {
          return { disabled: true, label: t('app.notAssigned') };
        }
      }
    }

    // Strict Mode: my earlier tap is still waiting for a parent
    const pending = task.myPendingCount ?? 0;
    if (pending > 0 && currentUserRole !== 'admin' && currentUserRole !== 'member') {
      if (!task.onDemand) return { disabled: true, label: t('app.waitingForApproval') };
      return { disabled: false, label: `${t('roomDetail.done')} · ⏳ ${pending}` };
    }

    // Anytime quest with a repeat limit that's used up for this day/week
    if (task.onDemand && task.repeatLimit && (task.myRepeatCount ?? 0) >= task.repeatLimit && currentUserRole !== 'admin' && currentUserRole !== 'member') {
      return { disabled: true, label: t(task.repeatPeriod === 'day' ? 'repeat.doneToday' : 'repeat.doneThisWeek') };
    }

    // Rotating mode: disabled if it's not the current user's turn (parents can do it on anyone's turn, as on Home)
    if (task.assignmentMode === 'rotating' && task.rotationCurrentUserId != null && currentUserRole !== 'admin' && currentUserRole !== 'member') {
      if (currentUserId !== undefined && task.rotationCurrentUserId !== currentUserId) {
        const turnUser = task.assignedUsers?.find(u => u.id === task.rotationCurrentUserId);
        return { disabled: true, label: t('roomDetail.waitingForTurn').replace('{name}', turnUser?.displayName || '?') };
      }
    }

    // On-demand tasks are always completeable — skip all scheduling and repetition guards
    if (task.onDemand) {
      return { disabled: false, label: t('roomDetail.done') };
    }

    // Block if task frequency cooldown hasn't elapsed (health > 0 means not yet due)
    if (task.health > 0 && task.lastCompletedAt) {
      // Allow early completion if the toggle is on AND last completion was on a previous calendar day
      if (task.allowEarlyCompletion) {
        if (dateStr(task.lastCompletedAt) < dateStr()) {
          // Different calendar day — allow despite health > 0
        } else {
          return { disabled: true, label: t('roomDetail.done') };
        }
      } else {
        const { text } = formatNextDue(task.lastCompletedAt, task.frequencyDays, t, language, task.health, task.nextDueAt);
        return { disabled: true, label: text };
      }
    }

    if (task.assignmentMode === 'shared' || task.assignmentMode === 'custom') {
      // In shared/custom mode: disabled only if current user has already completed their part
      const myCompletion = task.sharedCompletions?.find(c => c.userId === currentUserId);
      if (myCompletion) {
        return { disabled: true, done: true, label: t('app.doneBy').replace('{name}', t('common.you') || 'You') };
      }
      // Also disabled if all users have completed (task fully done)
      if (task.sharedCompletions && task.assignedUsers && task.sharedCompletions.length >= task.assignedUsers.length) {
        return { disabled: true, done: true, label: t('roomDetail.done') };
      }
      return { disabled: false, label: t('roomDetail.done') };
    }

    // First mode (default): if anyone completed today, blocked
    if (task.completedTodayBy) {
      return { disabled: true, done: true, label: t('app.doneBy').replace('{name}', task.completedTodayBy.displayName) };
    }
    return { disabled: false, label: t('roomDetail.done') };
  }

  const deleteTask = async (taskId: number) => {
    const task = room.tasks.find((x) => x.id === taskId);
    const name = task ? translateTask(task.name, task.translationKey) : '';
    if (!window.confirm(t('roomDetail.deleteTaskConfirmTrash').replace('{name}', name).replace('{n}', '30'))) return;
    await attempt(async () => {
      const { trashId } = await api.deleteTask(taskId);
      setEditingTask(null);
      onRefresh?.();
      if (trashId) setUndo({ trashIds: [trashId], message: t('trash.deleted').replace('{name}', name) });
    });
  };

  const togglePin = async (task: Task) => {
    await attempt(async () => {
      if (task.pinned) await api.unpinTask(task.id); else await api.pinTask(task.id);
      onRefresh?.();
    });
  };

  const togglePause = async (task: Task) => {
    setTaskMenuOpen(null);
    setMoveMenuTaskId(null);
    await attempt(async () => {
      if (task.pausedAt) await api.resumeTask(task.id); else await api.pauseTask(task.id);
      onRefresh?.();
    });
  };

  const pausedLabel = (task: Task) => task.pausedUntil
    ? t('pause.pausedUntil').replace('{date}', new Date(`${task.pausedUntil}T12:00:00`).toLocaleDateString(localeFor(language), { month: 'short', day: 'numeric' }))
    : t('pause.paused');

  const handleDuplicateTask = async (taskId: number) => {
    setTaskMenuOpen(null);
    await attempt(async () => {
      await api.duplicateTask(taskId);
      onRefresh?.();
    });
  };

  const handleMoveTask = async (taskId: number, targetRoomId: number) => {
    setMoveMenuTaskId(null);
    setTaskMenuOpen(null);
    await attempt(async () => {
      await api.updateTask(taskId, { roomId: targetRoomId });
      onRefresh?.();
    });
  };

  const handleTaskMenuOpen = async (taskId: number) => {
    setTaskMenuOpen(taskId);
    if (allRooms.length === 0) {
      const rooms = await api.getRooms();
      setAllRooms(rooms);
    }
  };

  const addTask = () => runSave(async () => {
    if (!newTaskName.trim()) {
      setAddTaskError(t('roomDetail.taskNameRequired'));
      return;
    }
    setAddTaskError('');
    setSaveError('');
    const frequencyDays = freqToDays(newFreqValue, newFreqUnit);
    const assignmentPayload =
      newAssignmentType === 'users' ? { assignedToChildren: false, assignedUserIds: newAssignmentUserIds } :
      { assignedToChildren: false, assignedUserIds: [] };
    const assignedUserPercentages = newAssignmentMode === 'custom' ? newAssignmentPercentages : undefined;
    try {
      await api.createTask(room.id, {
        name: newTaskName.trim(),
        notes: newTaskNotes.trim() || undefined,
        frequencyDays,
        effort: newTaskEffort,
        health: newTaskHealth,
        // Left on the sparkle: the server picks the icon the name suggests
        iconKey: newTaskIconKey !== 'sparkle' ? newTaskIconKey : undefined,
        onDemand: newTaskOnDemand,
        showInDashboard: newTaskShowInDashboard,
        customCoins: newTaskCustomCoins !== '' ? Number(newTaskCustomCoins) : null,
        ...(newTaskOnDemand && newRepeatLimit ? { repeatLimit: Number(newRepeatLimit), repeatPeriod: newRepeatPeriod } : {}),
        assignmentMode: newAssignmentMode,
        assignedUserPercentages,
        ...schedulePayload(newSchedule, { onDemand: newTaskOnDemand, rotating: newAssignmentMode === 'rotating' }),
        ...assignmentPayload,
      });
    } catch (err) {
      setSaveError(taskErrorText(err, t));
      return;
    }
    setNewTaskName('');
    setNewTaskNotes('');
    setNewFreqValue(7);
    setNewFreqUnit('days');
    setNewTaskEffort(2);
    setNewTaskHealth(0);
    setNewTaskIconKey('sparkle');
    setNewAssignmentType('none');
    setNewAssignmentUserIds([]);
    setNewAssignmentMode('first');
    setNewAssignmentPercentages({});
    setNewTaskOnDemand(false);
    setNewTaskShowInDashboard(false);
    setNewTaskCustomCoins('');
    setNewRepeatLimit('');
    setNewSchedule(EMPTY_SCHEDULE);
    setShowAddTask(false);
    onRefresh?.();
  });

  // The To-dos room (ENH-18): earliest do-by date first, then the oldest added; ticking one finishes it, with its coins.
  const todoOrder = [...sortedTasks].sort((a, b) => (!!a.pausedAt !== !!b.pausedAt ? (a.pausedAt ? 1 : -1) : 0)
    || String(a.doBy || '9999').localeCompare(String(b.doBy || '9999'))
    || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || a.id - b.id);

  const roomOwner = room.assignedUserId ? (users || []).find((u) => u.id === room.assignedUserId)?.displayName ?? '' : '';
  const undoDone = async (task: Task) => {
    const by = task.completedTodayBy!;
    const ask = t('roomDetail.undoDoneConfirm').replace('{task}', translateTask(task.name, task.translationKey))
      .replace('{name}', by.displayName).replace('{coins}', String(by.coinsEarned ?? 0));
    if (!window.confirm(ask)) return;
    await attempt(async () => {
      await api.cancelCompletion(by.completionId);
      onRefresh?.();
    });
  };
  const closeTaskMenu = () => { setTaskMenuOpen(null); setMoveMenuTaskId(null); };

  /** One chore (ENH-25): the compact row, and under it, when it's tapped open, its notes, details and buttons */
  const choreRow = (task: Task) => {
    const name = translateTask(task.name, task.translationKey);
    const btn = getDoneButtonState(task);
    const paused = !!task.pausedAt;
    const flashing = animatedTask === task.id;
    const due = choreDue(task, t, language);
    // Why it can't be ticked right now ("Waiting for Cecil", "Done by Dad") takes the place of when it's due
    const status = paused ? pausedLabel(task) : btn.disabled && btn.label !== t('roomDetail.done') ? btn.label : null;
    const when = status ?? (due.late ? <ChoreLate>{due.text}</ChoreLate> : due.text);
    // Kids start the timer first; Done comes when it ends (NEW-1)
    const waitForTimer = !paused && !btn.disabled && !!timer?.mustWait(task);
    const open = openTask === task.id;
    const timerTask = { ...task, name };
    const proofLabel = t(allowPhotos ? 'proof.addProof' : 'proof.addNote');
    return (
      <Fragment key={task.id}>
        {/* Edit opens in a pop-up (a bottom sheet on phones) so the list doesn't jump around */}
        {taskEditor(task)}
        <ChoreRow taskId={task.id} iconKey={task.iconKey} name={name}
          sub={[when, choreWho(task) || roomOwner || t('chore.anyone')]}
          coins={<ChoreCoins coins={taskCoins(task)} />}
          className={`${paused ? 'paused' : ''}${flashing ? ' flash' : ''}`}
          tick={paused ? null : { state: flashing || btn.done ? 'done' : btn.disabled ? 'off' : 'ready', label: btn.label, onTick: () => handleComplete(task) }}
          trailing={waitForTimer ? <TimerStartButton task={timerTask} language={language} primary className="chore-act" /> : undefined}
          open={open} onToggle={() => { setOpenTask(open ? null : task.id); closeTaskMenu(); }}>
          {task.notes && <p className="chore-notes">{task.notes}</p>}
          <ChoreFacts task={task} language={language} showHealth={!room.isTodoRoom} />
          <div className="chore-acts">
            {isAdmin && <ChoreAct onClick={() => startEdit(task)}>✏️ {t('common.edit')}</ChoreAct>}
            {allowPins && (
              <ChoreAct on={!!task.pinned} aria-pressed={!!task.pinned} title={task.pinned ? t('home.unpin') : t('home.pin')} onClick={() => togglePin(task)}>
                {task.pinned ? '★' : '☆'} {t(task.pinned ? 'chore.pinned' : 'chore.pin')}
              </ChoreAct>
            )}
            {!paused && btn.label !== t('app.notAssigned') && !claimedLabel(task.teamUp) && (
              <ChoreAct onClick={() => setLateTask(task)}>📅 {t('late.button')}</ChoreAct>
            )}
            {!paused && !btn.disabled && !waitForTimer && <TimerStartButton task={timerTask} language={language} className="chore-act" />}
            {!paused && task.teamUp?.canStart && <ChoreAct onClick={() => setTeamPick(task)}>🤝 {t('teamups.teamUp')}</ChoreAct>}
            {!paused && canAddProof && !btn.disabled && !waitForTimer && <ChoreAct onClick={() => setProofTask(task)}>📎 {proofLabel}</ChoreAct>}
            {!paused && <TakeBackButton completionId={task.myPendingId} onDone={() => onRefresh?.()} language={language} />}
            {isAdmin && task.completedTodayBy?.completionId && (
              <ChoreAct onClick={() => void undoDone(task)} title={t('roomDetail.undoDoneTitle')}>↩️ {t('roomDetail.undoDone')}</ChoreAct>
            )}
            {isAdmin && (
              <ChoreAct title={t('roomDetail.moreOptions')} aria-label={t('roomDetail.moreOptions')} aria-expanded={taskMenuOpen === task.id}
                onClick={() => { if (taskMenuOpen === task.id) closeTaskMenu(); else { setMoveMenuTaskId(null); void handleTaskMenuOpen(task.id); } }}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor"><circle cx="4" cy="10" r="2" /><circle cx="10" cy="10" r="2" /><circle cx="16" cy="10" r="2" /></svg>
              </ChoreAct>
            )}
          </div>
          {/* ⋯ opens underneath, so it can't hang off the side of a phone */}
          {isAdmin && taskMenuOpen === task.id && (
            <div className="chore-menu">
              <button type="button" onClick={() => handleDuplicateTask(task.id)}>{t('roomDetail.duplicateTask')}</button>
              <button type="button" aria-expanded={moveMenuTaskId === task.id} onClick={() => setMoveMenuTaskId(moveMenuTaskId === task.id ? null : task.id)}>
                <span>{t('roomDetail.moveToRoom')}</span>
                <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.6 }}>{moveMenuTaskId === task.id ? '▲' : '▼'}</span>
              </button>
              {moveMenuTaskId === task.id && (
                <div className="chore-menu-rooms">
                  {allRooms.filter((r) => r.id !== room.id).map((r) => (
                    <button type="button" key={r.id} onClick={() => handleMoveTask(task.id, r.id)}>{roomDisplayName(r.name, r.roomType)}</button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => togglePause(task)}>{task.pausedAt ? t('pause.resume') : t('pause.pause')}</button>
            </div>
          )}
        </ChoreRow>
      </Fragment>
    );
  };
  const todoLine = [
    t('todos.countLine').replace('{n}', String(room.todoCount ?? 0)),
    room.todoOverdue ? t('todos.overdueCount').replace('{n}', String(room.todoOverdue)) : '',
  ].filter(Boolean).join(' · ');

  /* ── The room in sections (ENH-28): Overdue, Today, This week, When needed, Later, Paused ── */
  const endToday = startOfDay(new Date(), 1).getTime();
  const endWeek = startOfDay(new Date(), 7).getTime();
  const lastWeekDay = dateStr(startOfDay(new Date(), 6));
  const bucketOf = (task: Task): Bucket => {
    if (task.pausedAt) return 'paused';
    if (task.onDemand) return 'needed';
    if (task.outOfSeason) return 'later';
    // Done today stays under Today with a green tick
    if (task.completedTodayBy || getDoneButtonState(task).done) return 'today';
    if (choreDue(task, t, language).late) return 'overdue';
    if (task.oneTime) {
      if (!task.doBy) return 'needed';
      return task.doBy <= dateStr() ? 'today' : task.doBy <= lastWeekDay ? 'week' : 'later';
    }
    const due = taskNextDue(task).getTime();
    return due < endToday ? 'today' : due < endWeek ? 'week' : 'later';
  };
  const buckets = new Map(sortedTasks.map((task) => [task.id, bucketOf(task)]));
  const inBucket = (b: Bucket) => sortedTasks.filter((task) => buckets.get(task.id) === b);
  const overdueTasks = inBucket('overdue');
  const pausedTasks = inBucket('paused');
  const todayLeft = inBucket('today').filter((task) => !task.completedTodayBy && !getDoneButtonState(task).done);
  const fineCount = sortedTasks.length - overdueTasks.length - todayLeft.length - pausedTasks.length;
  const coinsWaiting = [...overdueTasks, ...todayLeft].reduce((sum, task) => sum + taskCoins(task), 0);
  const mineCount = currentUserId === undefined ? 0 : sortedTasks.filter((task) => isTaskForUser(task, currentUserId, currentUserRole)).length;
  // A filter whose chip went away (the last paused chore resumed) falls back to All
  const activeFilter: RoomFilter = filter === 'paused' && pausedTasks.length === 0 ? 'all' : filter === 'mine' && onlyMine ? 'all' : filter;
  const shown = sortedTasks.filter((task) => activeFilter === 'all'
    || (activeFilter === 'mine' ? currentUserId !== undefined && isTaskForUser(task, currentUserId, currentUserRole)
      : buckets.get(task.id) === activeFilter));
  const headline = health < 40 ? 'roomPage.needsLove' : health < 70 ? 'roomPage.couldTidy' : 'roomPage.looksGood';
  const summary = [
    overdueTasks.length > 0 && t('roomPage.overdue').replace('{n}', String(overdueTasks.length)),
    todayLeft.length > 0 && t('roomPage.leftToday').replace('{n}', String(todayLeft.length)),
    fineCount > 0 && t('roomPage.fine').replace('{n}', String(fineCount)),
  ].filter(Boolean).join(' · ');
  const roomChip = (id: RoomFilter, label: string, n: number) => (
    <button key={id} type="button" className={`today-chip${activeFilter === id ? ' on' : ''}`} aria-pressed={activeFilter === id}
      onClick={() => setFilter(id)}>{label} · <em>{n}</em></button>
  );
  const roomSection = (key: Bucket, title: string, rows: Task[], opts: { late?: boolean; note?: string } = {}) => rows.length > 0 && (
    <section className="today-section" key={key}>
      <div className={`today-sec${opts.late ? ' late' : ''}`}>
        <h3>{opts.late && <span className="today-dot" aria-hidden="true" />}{title} · {rows.length}</h3>
        {opts.note && <span className="room-sec-note">{opts.note}</span>}
      </div>
      <div className="tq-card today-list chore-list">{rows.map(choreRow)}</div>
    </section>
  );
  const shownIn = (b: Bucket) => shown.filter((task) => buckets.get(task.id) === b);
  const laterRows = shownIn('later');

  // The edit pop-up for one chore (a bottom sheet on phones), shared by the table and the to-do checklist
  const taskEditor = (task: Task) => editingTask === task.id && createPortal(
              <div className="tq-modal-overlay task-edit-overlay" onClick={() => setEditingTask(null)}>
              <div className="tq-card tq-modal tq-modal-wide task-edit-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ overflowY: 'auto', padding: 12 }}>
              <div style={{
                padding: '16px 8px', borderBottom: '1px solid var(--warm-border-subtle)',
                backgroundColor: 'var(--warm-bg-warm)', borderRadius: 12,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 70 }}>{t('roomDetail.name')}</label>
                    <input value={editForm.name}
                      onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                      autoFocus={!window.matchMedia('(pointer: coarse)').matches}
                      className="tq-input"
                      style={{ flex: 1, fontWeight: 700 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 70 }}>{t('roomDetail.notes')}</label>
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder={t('roomDetail.optionalNotes')}
                      rows={2}
                      className="tq-input"
                      style={{ flex: 1, resize: 'vertical' }}
                    />
                  </div>
                  <div className="task-edit-form" style={{ display: 'flex', alignItems: 'center', gap: '12px 20px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.onDemand')}</label>
                      <input type="checkbox" checked={editForm.onDemand}
                        onChange={(e) => setEditForm(f => ({ ...f, onDemand: e.target.checked }))}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                    </div>
                    {editForm.onDemand && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.showInDashboard')}</label>
                      <input type="checkbox" checked={editForm.showInDashboard}
                        onChange={(e) => setEditForm(f => ({ ...f, showInDashboard: e.target.checked }))}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                    </div>}
                    {editForm.onDemand && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} title={t('repeat.limitDesc')}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('repeat.limit')}</label>
                      <input type="number" min={1} max={99} className="tq-input-compact" value={editForm.repeatLimit} placeholder="∞"
                        onChange={(e) => setEditForm(f => ({ ...f, repeatLimit: e.target.value }))} style={{ width: 52 }} />
                      <select className="tq-input-compact" value={editForm.repeatPeriod} onChange={(e) => setEditForm(f => ({ ...f, repeatPeriod: e.target.value as 'day' | 'week' }))}>
                        <option value="day">{t('repeat.perDay')}</option>
                        <option value="week">{t('repeat.perWeek')}</option>
                      </select>
                    </div>}
                    {!editForm.onDemand && <DueOnPicker allowOnce={allowOneTime} value={editSchedule} onChange={setEditSchedule} t={t} language={language}
                      interval={<FrequencyPicker value={editForm.freqValue} unit={editForm.freqUnit}
                        t={t}
                        onChange={(v, u) => setEditForm(f => ({ ...f, freqValue: v, freqUnit: u }))} />} />}
                    {!editForm.onDemand && editSchedule.mode !== 'once' && <StartsOnPicker value={editSchedule} onChange={setEditSchedule} t={t} />}
                    {!editForm.onDemand && editSchedule.mode !== 'once' && <SeasonPicker value={editSchedule} onChange={setEditSchedule} t={t} language={language} />}
                    {!editForm.onDemand && <ReminderPicker value={editSchedule} onChange={setEditSchedule} t={t} />}
                    <TimerPicker value={editSchedule} onChange={setEditSchedule} t={t} />
                    <StepsField value={editSchedule} onChange={setEditSchedule} t={t} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.effort')}</label>
                      <EffortPicker effort={editForm.effort} onChange={(e) => setEditForm(f => ({ ...f, effort: e }))} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.allowEarlyCompletion')}</label>
                      <input type="checkbox" checked={editForm.allowEarlyCompletion}
                        onChange={(e) => setEditForm(f => ({ ...f, allowEarlyCompletion: e.target.checked }))}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 70 }}>{t('roomDetail.customCoins')}</label>
                    <input
                      type="number"
                      min={1}
                      value={editForm.customCoins}
                      onChange={(e) => setEditForm(f => ({ ...f, customCoins: e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1) }))}
                      placeholder={t('roomDetail.customCoinsPlaceholder')}
                      className="tq-input-compact"
                      style={{ width: 80 }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--warm-text-light)' }}>{t('roomDetail.customCoinsDesc')}</span>
                  </div>
                  {!editForm.onDemand && startsLater(editSchedule) ? <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-muted)' }}>{t('schedule.firstDueOnStart')}</div> : <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('rooms.health')}</label>
                    <div style={{ width: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={10}
                          value={editForm.health}
                          onChange={(e) => setEditForm((f) => ({ ...f, health: parseInt(e.target.value, 10), healthChanged: true }))}
                          style={{ flex: 1, accentColor: healthColor(editForm.health) }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 800, color: healthColor(editForm.health), minWidth: 32, textAlign: 'right' }}>
                          {editForm.health}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--warm-text-light)', fontWeight: 600, marginTop: 2 }}>
                        <span>{t('rooms.dirty')}</span><span>{t('rooms.clean')}</span>
                      </div>
                    </div>
                  </div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('roomDetail.icon')}</label>
                    <IconPicker value={editForm.iconKey} onChange={(k) => setEditForm((f) => ({ ...f, iconKey: k }))} language={language}
                      taskName={editForm.name} roomName={room.name} roomColor={room.color} coins={editForm.customCoins !== '' ? Number(editForm.customCoins) : coinsByEffort?.[editForm.effort]} />
                  </div>
                  {/* Task assignment — only show if room has no room-level assignment */}
                  {!room.assignedUserId && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('rooms.assignTask')}</label>
                        <select
                          value={editForm.assignmentType}
                          onChange={(e) => setEditForm(f => ({ ...f, assignmentType: e.target.value as 'none' | 'users', assignmentUserIds: [], assignmentMode: 'first' }))}
                          className="tq-input-compact"
                          style={{ cursor: 'pointer' }}
                        >
                          <option value="none">{t('rooms.noAssignment')}</option>
                          <option value="users">{t('rooms.specificUsers')}</option>
                        </select>
                      </div>
                      {editForm.assignmentType === 'users' && (
                        <>
                          <div style={{ marginLeft: 70, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {(users || []).map(u => {
                              const checked = editForm.assignmentUserIds.includes(u.id);
                              return (
                                <label key={u.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                                  padding: '5px 10px', borderRadius: 20,
                                  border: `1.5px solid ${checked ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                                  backgroundColor: checked ? 'var(--warm-accent-light)' : 'var(--warm-bg-input)',
                                  fontSize: 12, fontWeight: 700, color: checked ? 'var(--warm-accent)' : 'var(--warm-text)',
                                  fontFamily: 'Nunito', transition: 'all 0.15s ease',
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => setEditForm(f => {
                                      const newIds = checked
                                        ? f.assignmentUserIds.filter(id => id !== u.id)
                                        : [...f.assignmentUserIds, u.id];
                                      return {
                                        ...f,
                                        assignmentUserIds: newIds,
                                        assignmentPercentages: f.assignmentMode === 'custom' ? initPercentages(newIds) : f.assignmentPercentages,
                                      };
                                    })}
                                    style={{ display: 'none' }}
                                  />
                                  {checked && <span style={{ fontSize: 10 }}>✓</span>}
                                  {u.displayName}
                                </label>
                              );
                            })}
                          </div>
                          {editForm.assignmentUserIds.length >= 2 && (
                            <>
                              <div style={{ marginLeft: 70, display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('roomDetail.assignmentMode')}</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {(['first', 'shared', 'custom', 'rotating'] as const).map(mode => (
                                    <button
                                      key={mode}
                                      onClick={() => {
                                        const newPercentages = mode === 'custom' ? initPercentages(editForm.assignmentUserIds) : editForm.assignmentPercentages;
                                        setEditForm(f => ({ ...f, assignmentMode: mode, assignmentPercentages: newPercentages }));
                                      }}
                                      style={{
                                        padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                        border: `1.5px solid ${editForm.assignmentMode === mode ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                                        backgroundColor: editForm.assignmentMode === mode ? 'var(--warm-accent-light)' : 'transparent',
                                        color: editForm.assignmentMode === mode ? 'var(--warm-accent)' : 'var(--warm-text-light)',
                                        cursor: 'pointer', fontFamily: 'Nunito',
                                      }}
                                    >
                                      {mode === 'first' ? t('rooms.modeFirst') : mode === 'shared' ? t('rooms.modeShared') : mode === 'custom' ? t('rooms.modeCustom') : t('roomDetail.rotating')}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {editForm.assignmentMode === 'rotating' && (
                                <div style={{ marginLeft: 70, marginTop: 4 }}>
                                  <RotationPeriodPicker value={editSchedule} onChange={setEditSchedule} t={t} language={language} />
                                </div>
                              )}
                              {editForm.assignmentMode === 'custom' && (() => {
                                const total = editForm.assignmentUserIds.reduce((s, id) => s + (editForm.assignmentPercentages[id] ?? 0), 0);
                                const totalOk = total === 100;
                                return (
                                  <div style={{ marginLeft: 70, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                    {editForm.assignmentUserIds.map(uid => {
                                      const u = (users || []).find(x => x.id === uid);
                                      if (!u) return null;
                                      return (
                                        <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)', minWidth: 80 }}>{u.displayName}</span>
                                          <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={editForm.assignmentPercentages[uid] ?? 0}
                                            onChange={(e) => setEditForm(f => ({ ...f, assignmentPercentages: { ...f.assignmentPercentages, [uid]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) } }))}
                                            className="tq-input-compact"
                                            style={{ width: 52, textAlign: 'center', fontWeight: 700 }}
                                          />
                                          <span style={{ fontSize: 12, color: 'var(--warm-text-light)' }}>%</span>
                                        </div>
                                      );
                                    })}
                                    <div style={{ fontSize: 11, fontWeight: 700, color: totalOk ? '#22C55E' : '#EF4444' }}>
                                      {t('rooms.totalPercentage').replace('{total}', String(total))} {totalOk ? '✓' : '✗'}
                                    </div>
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <div className="task-edit-form" style={{ display: 'flex', alignItems: 'center', gap: '8px 16px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', cursor: 'pointer' }}>
                      {t('pause.switch')}
                      <input type="checkbox" checked={editForm.paused}
                        onChange={(e) => setEditForm(f => ({ ...f, paused: e.target.checked, pausedUntil: e.target.checked ? f.pausedUntil : '' }))}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                    </label>
                    {editForm.paused && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>
                        {t('pause.untilLabel')}
                        <input type="date" className="tq-input-compact" value={editForm.pausedUntil} min={tomorrowIso()}
                          onChange={(e) => setEditForm(f => ({ ...f, pausedUntil: e.target.value }))} />
                      </label>
                    )}
                    {editForm.paused && (
                      <div style={{ flexBasis: '100%', fontSize: 11, fontWeight: 600, color: 'var(--warm-text-muted)' }}>{t('pause.hint')}</div>
                    )}
                  </div>
                  {(() => {
                    const editCustomTotal = editForm.assignmentMode === 'custom'
                      ? editForm.assignmentUserIds.reduce((s, id) => s + (editForm.assignmentPercentages[id] ?? 0), 0)
                      : 100;
                    const editSaveDisabled = editForm.assignmentMode === 'custom' && editCustomTotal !== 100;
                    return (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        {saveError && <div role="alert" style={{ flexBasis: '100%', fontSize: 12, color: 'var(--health-red)', fontWeight: 700, textAlign: 'right' }}>{saveError}</div>}
                        <button onClick={() => deleteTask(task.id)}
                          className="tq-btn-sm"
                          style={{
                            background: 'none', border: '1.5px solid var(--warm-danger-border)', borderRadius: 10,
                            fontWeight: 700, color: 'var(--warm-danger)',
                            cursor: 'pointer', fontFamily: 'Nunito',
                          }}>{t('roomDetail.deleteTask')}</button>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setEditingTask(null)} className="tq-btn tq-btn-secondary tq-btn-sm">{t('common.cancel')}</button>
                          <button onClick={() => void saveEdit()} disabled={editSaveDisabled || saving} className="tq-btn tq-btn-primary tq-btn-sm"
                            style={{ opacity: editSaveDisabled ? 0.5 : 1 }}>{t('common.save')}</button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              </div>
              </div>,
              document.body
  );

  return (
    <>
    <div className="page-enter">
      {/* A short header (ENH-28): the room's health, what's due and the coins waiting; the name and ← are in the top bar */}
      <div className="tq-card room-hero" style={{ background: `linear-gradient(135deg, ${room.color}88, ${room.color}33)`, borderColor: `${room.accentColor}44` }}>
        {room.isTodoRoom ? (
          <div className="room-hero-todo" aria-hidden="true" style={{ borderColor: room.todoOverdue ? 'var(--health-red)' : 'var(--warm-accent)' }}>
            <span>📝</span><b>{room.todoCount ?? 0}</b>
          </div>
        ) : <RingGauge value={health} size={64} strokeWidth={7} />}
        <div className="room-hero-text">
          {room.isTodoRoom ? (
            <>
              <div className="room-hero-h" style={{ color: room.todoOverdue ? 'var(--health-red)' : undefined }}>{todoLine}</div>
              <div className="room-hero-s">{t('todos.noHealth')}</div>
            </>
          ) : (
            <>
              <div className="room-hero-h">{t(headline).replace('{room}', roomDisplayName(room.name, room.roomType))}</div>
              {summary && <div className="room-hero-s">{summary}</div>}
              <div className="room-hero-s">
                {coinsWaiting > 0 && <><span className="room-hero-coins">🪙 {t('roomPage.coinsWaiting').replace('{n}', String(coinsWaiting))}</span> · </>}
                <span className="room-hero-n">{t('roomPage.chores').replace('{n}', String(sortedTasks.length))}</span>
              </div>
            </>
          )}
        </div>
        {isAdmin && (
          <button type="button" className="room-hero-more" onClick={() => setRoomMenu((v) => !v)} aria-expanded={roomMenu}
            aria-label={t('roomPage.menu')} title={t('roomPage.menu')}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor"><circle cx="4" cy="10" r="2" /><circle cx="10" cy="10" r="2" /><circle cx="16" cy="10" r="2" /></svg>
          </button>
        )}
      </div>
      {isAdmin && roomMenu && (
        <div className="chore-menu room-menu">
          <button type="button" onClick={() => { setRoomMenu(false); setShowDuplicate(true); }}>{t('duplicateRoom.button')}</button>
        </div>
      )}

      {isAdmin && showDuplicate && (
        <DuplicateRoom room={room} displayName={roomDisplayName(room.name, room.roomType)} users={users || []} language={language}
          onCancel={() => setShowDuplicate(false)}
          onDone={(id) => { setShowDuplicate(false); onRefresh?.(); onOpenRoom?.(id); }} />
      )}

      <div className="room-body">
        {/* Filter chips and the sort (ENH-28); the To-dos room keeps one list, earliest do-by date first */}
        {!room.isTodoRoom && sortedTasks.length > 0 && (
          <div className="room-tools">
            <div className="today-chips" role="group" aria-label={t('roomPage.show')}>
              {roomChip('all', t('roomPage.all'), sortedTasks.length)}
              {!onlyMine && currentUserId !== undefined && roomChip('mine', t('roomPage.mine'), mineCount)}
              {overdueTasks.length > 0 && roomChip('overdue', t('roomPage.overdueChip'), overdueTasks.length)}
              {pausedTasks.length > 0 && roomChip('paused', t('roomPage.paused'), pausedTasks.length)}
              {/* The sort is the last chip: rarely needed, so it may sit past the edge on a phone */}
              {sortedTasks.length > 1 && (
                <select id="room-sort" aria-label={t('chore.sortBy')} title={t('chore.sortBy')} className="today-chip room-sort" value={sortKey}
                  onChange={(e) => { setSortKey(e.target.value as SortKey); setSortAsc(true); }}>
                  <option value="when">{t('roomPage.byWhen')}</option>
                  <option value="health">{t('rooms.health')}</option>
                  <option value="dueDate">{t('roomDetail.nextDue')}</option>
                  <option value="name">{t('roomDetail.name')}</option>
                  <option value="frequency">{t('roomDetail.frequency')}</option>
                  <option value="effort">{t('roomDetail.effort')}</option>
                  <option value="coins">{t('roomDetail.coins')}</option>
                  <option value="assigned">{t('roomDetail.assigned')}</option>
                </select>
              )}
              {sortedTasks.length > 1 && sortKey !== 'when' && (
                <button type="button" className="today-chip" onClick={() => setSortAsc(!sortAsc)} title={t('chore.reverse')} aria-label={t('chore.reverse')}>{sortAsc ? '↑' : '↓'}</button>
              )}
            </div>
          </div>
        )}
        {room.isTodoRoom ? (
          <div className="tq-card today-list chore-list">{todoOrder.map(choreRow)}</div>
        ) : sortKey !== 'when' ? (
          shown.length > 0 && <div className="tq-card today-list chore-list">{shown.map(choreRow)}</div>
        ) : (
          <>
            {roomSection('overdue', t('roomPage.secOverdue'), shownIn('overdue'), { late: true, note: shownIn('overdue').length > 1 ? t('roomPage.urgentFirst') : undefined })}
            {roomSection('today', t('roomPage.secToday'), shownIn('today'))}
            {roomSection('week', t('roomPage.secWeek'), shownIn('week'))}
            {roomSection('needed', t('roomPage.secNeeded'), shownIn('needed'))}
            {/* Later is folded away until asked for, unless it's all there is */}
            {laterRows.length > 0 && (showLater || shown.length === laterRows.length || (openTask != null && buckets.get(openTask) === 'later')
              ? roomSection('later', t('roomPage.secLater'), laterRows)
              : <button type="button" className="today-more room-later" onClick={() => setShowLater(true)}>{t('roomPage.showLater').replace('{n}', String(laterRows.length))}</button>)}
            {roomSection('paused', t('roomPage.secPaused'), shownIn('paused'))}
          </>
        )}
        {!room.isTodoRoom && sortedTasks.length > 0 && shown.length === 0 && (
          <div className="tq-empty-state" style={{ padding: '24px 8px' }}>{t('roomPage.noneHere')}</div>
        )}
        {room.isTodoRoom && todoOrder.length === 0 && (
          <div className="tq-empty-state" style={{ padding: '24px 8px' }}>{t('todos.empty')}</div>
        )}

        {/* Add Task */}
        <div ref={addAnchor} style={{ scrollMarginTop: 12 }} />
        {/* To-dos room: "+ To-do" opens the short to-do form (the server makes it one-time) */}
        {isAdmin && room.isTodoRoom ? (
          showAddTask ? (
            <div style={{ marginTop: 12 }}>
              <TodoQuickAdd language={language} roomId={room.id}
                people={(users ?? []).map((u) => ({ id: u.id, displayName: u.displayName }))}
                onCancel={() => setShowAddTask(false)}
                onAdded={() => { setShowAddTask(false); onRefresh?.(); }} />
            </div>
          ) : (
            <div style={{ padding: '14px 8px' }}>
              <button onClick={() => { setSaveError(''); setShowAddTask(true); }} className="tq-btn-md"
                style={{ width: '100%', background: 'none', border: '1.5px dashed var(--warm-border)', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, color: 'var(--warm-text-light)', fontFamily: 'Nunito' }}>
                <PlusIcon /> {t('todos.add')}
              </button>
            </div>
          )
        ) : isAdmin && showAddTask ? (
          <div style={{
            padding: '16px 8px', borderTop: '1px solid var(--warm-border-subtle)',
            backgroundColor: 'var(--warm-bg-warm)', borderRadius: 12, marginTop: 4,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 70 }}>{t('roomDetail.name')}</label>
                <input value={newTaskName}
                  onChange={(e) => { setNewTaskName(e.target.value); setAddTaskError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void addTask(); }}
                  placeholder={t('roomDetail.taskName')}
                  className="tq-input"
                  style={{ flex: 1, fontWeight: 700, borderColor: addTaskError ? 'var(--health-red)' : undefined }} />
              </div>
              {addTaskError && <div style={{ fontSize: 11, color: 'var(--health-red)', fontWeight: 600, marginLeft: 82 }}>{addTaskError}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 70 }}>{t('roomDetail.notes')}</label>
                <textarea value={newTaskNotes}
                  onChange={(e) => setNewTaskNotes(e.target.value)}
                  placeholder={t('roomDetail.optionalNotes')}
                  rows={2}
                  className="tq-input"
                  style={{ flex: 1, resize: 'vertical' }} />
              </div>
              <div className="task-add-form" style={{ display: 'flex', alignItems: 'center', gap: '12px 20px', flexWrap: 'wrap', minHeight: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.onDemand')}</label>
                  <input type="checkbox" checked={newTaskOnDemand}
                    onChange={(e) => setNewTaskOnDemand(e.target.checked)}
                    style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                </div>
                {newTaskOnDemand && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.showInDashboard')}</label>
                  <input type="checkbox" checked={newTaskShowInDashboard}
                    onChange={(e) => setNewTaskShowInDashboard(e.target.checked)}
                    style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                </div>}
                {newTaskOnDemand && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} title={t('repeat.limitDesc')}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('repeat.limit')}</label>
                  <input type="number" min={1} max={99} className="tq-input-compact" value={newRepeatLimit} placeholder="∞" onChange={(e) => setNewRepeatLimit(e.target.value)} style={{ width: 52 }} />
                  <select className="tq-input-compact" value={newRepeatPeriod} onChange={(e) => setNewRepeatPeriod(e.target.value as 'day' | 'week')}>
                    <option value="day">{t('repeat.perDay')}</option>
                    <option value="week">{t('repeat.perWeek')}</option>
                  </select>
                </div>}
                {!newTaskOnDemand && <DueOnPicker allowOnce={allowOneTime} value={newSchedule} onChange={setNewSchedule} t={t} language={language}
                  interval={<FrequencyPicker value={newFreqValue} unit={newFreqUnit}
                    t={t}
                    onChange={(v, u) => { setNewFreqValue(v); setNewFreqUnit(u); }} />} />}
                {!newTaskOnDemand && newSchedule.mode !== 'once' && <StartsOnPicker value={newSchedule} onChange={setNewSchedule} t={t} />}
                {!newTaskOnDemand && newSchedule.mode !== 'once' && <SeasonPicker value={newSchedule} onChange={setNewSchedule} t={t} language={language} />}
                {!newTaskOnDemand && <ReminderPicker value={newSchedule} onChange={setNewSchedule} t={t} />}
                <TimerPicker value={newSchedule} onChange={setNewSchedule} t={t} />
                <StepsField value={newSchedule} onChange={setNewSchedule} t={t} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.effort')}</label>
                  <EffortPicker effort={newTaskEffort} onChange={setNewTaskEffort} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 70 }}>{t('roomDetail.customCoins')}</label>
                <input
                  type="number"
                  min={1}
                  value={newTaskCustomCoins}
                  onChange={(e) => setNewTaskCustomCoins(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                  placeholder={t('roomDetail.customCoinsPlaceholder')}
                  className="tq-input-compact"
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 11, color: 'var(--warm-text-light)' }}>{t('roomDetail.customCoinsDesc')}</span>
              </div>
              {!newTaskOnDemand && startsLater(newSchedule) ? <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-muted)' }}>{t('schedule.firstDueOnStart')}</div> : <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('rooms.health')}</label>
                <div style={{ width: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={10}
                      value={newTaskHealth}
                      onChange={(e) => setNewTaskHealth(parseInt(e.target.value, 10))}
                      style={{ flex: 1, accentColor: healthColor(newTaskHealth) }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 800, color: healthColor(newTaskHealth), minWidth: 32, textAlign: 'right' }}>
                      {newTaskHealth}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--warm-text-light)', fontWeight: 600, marginTop: 2 }}>
                    <span>{t('rooms.dirty')}</span><span>{t('rooms.clean')}</span>
                  </div>
                </div>
              </div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('roomDetail.icon')}</label>
                <IconPicker value={newTaskIconKey} onChange={setNewTaskIconKey} language={language}
                  taskName={newTaskName} roomName={room.name} roomColor={room.color} coins={newTaskCustomCoins !== '' ? Number(newTaskCustomCoins) : coinsByEffort?.[newTaskEffort]} />
              </div>
              {!room.assignedUserId && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('rooms.assignRoom')}</label>
                    <select
                      value={newAssignmentType}
                      onChange={(e) => { setNewAssignmentType(e.target.value as 'none' | 'users'); setNewAssignmentUserIds([]); setNewAssignmentMode('first'); }}
                      className="tq-input-compact"
                      style={{ cursor: 'pointer' }}
                    >
                      <option value="none">{t('rooms.noAssignment')}</option>
                      <option value="users">{t('rooms.specificUsers')}</option>
                    </select>
                  </div>
                  {newAssignmentType === 'users' && (
                    <>
                      <div style={{ marginLeft: 70, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {(users || []).map(u => {
                          const checked = newAssignmentUserIds.includes(u.id);
                          return (
                            <label key={u.id} style={{
                              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                              padding: '5px 10px', borderRadius: 20,
                              border: `1.5px solid ${checked ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                              backgroundColor: checked ? 'var(--warm-accent-light)' : 'var(--warm-bg-input)',
                              fontSize: 12, fontWeight: 700, color: checked ? 'var(--warm-accent)' : 'var(--warm-text)',
                              fontFamily: 'Nunito', transition: 'all 0.15s ease',
                            }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const newIds = checked
                                    ? newAssignmentUserIds.filter(id => id !== u.id)
                                    : [...newAssignmentUserIds, u.id];
                                  setNewAssignmentUserIds(newIds);
                                  if (newAssignmentMode === 'custom') setNewAssignmentPercentages(initPercentages(newIds));
                                }}
                                style={{ display: 'none' }}
                              />
                              {checked && <span style={{ fontSize: 10 }}>✓</span>}
                              {u.displayName}
                            </label>
                          );
                        })}
                      </div>
                      {newAssignmentUserIds.length >= 2 && (
                        <>
                          <div style={{ marginLeft: 70, display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('roomDetail.assignmentMode')}</label>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {(['first', 'shared', 'custom', 'rotating'] as const).map(mode => (
                                <button
                                  key={mode}
                                  onClick={() => {
                                    setNewAssignmentMode(mode);
                                    if (mode === 'custom') setNewAssignmentPercentages(initPercentages(newAssignmentUserIds));
                                  }}
                                  style={{
                                    padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                    border: `1.5px solid ${newAssignmentMode === mode ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                                    backgroundColor: newAssignmentMode === mode ? 'var(--warm-accent-light)' : 'transparent',
                                    color: newAssignmentMode === mode ? 'var(--warm-accent)' : 'var(--warm-text-light)',
                                    cursor: 'pointer', fontFamily: 'Nunito',
                                  }}
                                >
                                  {mode === 'first' ? t('rooms.modeFirst') : mode === 'shared' ? t('rooms.modeShared') : mode === 'custom' ? t('rooms.modeCustom') : t('roomDetail.rotating')}
                                </button>
                              ))}
                            </div>
                          </div>
                          {newAssignmentMode === 'rotating' && (
                            <div style={{ marginLeft: 70, marginTop: 4 }}>
                              <RotationPeriodPicker value={newSchedule} onChange={setNewSchedule} t={t} language={language} />
                            </div>
                          )}
                          {newAssignmentMode === 'custom' && (() => {
                            const total = newAssignmentUserIds.reduce((s, id) => s + (newAssignmentPercentages[id] ?? 0), 0);
                            const totalOk = total === 100;
                            return (
                              <div style={{ marginLeft: 70, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                {newAssignmentUserIds.map(uid => {
                                  const u = (users || []).find(x => x.id === uid);
                                  if (!u) return null;
                                  return (
                                    <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)', minWidth: 80 }}>{u.displayName}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={newAssignmentPercentages[uid] ?? 0}
                                        onChange={(e) => setNewAssignmentPercentages(p => ({ ...p, [uid]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }))}
                                        className="tq-input-compact"
                                        style={{ width: 52, textAlign: 'center', fontWeight: 700 }}
                                      />
                                      <span style={{ fontSize: 12, color: 'var(--warm-text-light)' }}>%</span>
                                    </div>
                                  );
                                })}
                                <div style={{ fontSize: 11, fontWeight: 700, color: totalOk ? '#22C55E' : '#EF4444' }}>
                                  {t('rooms.totalPercentage').replace('{total}', String(total))} {totalOk ? '✓' : '✗'}
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
              {(() => {
                const addCustomTotal = newAssignmentMode === 'custom'
                  ? newAssignmentUserIds.reduce((s, id) => s + (newAssignmentPercentages[id] ?? 0), 0)
                  : 100;
                const addSaveDisabled = newAssignmentMode === 'custom' && addCustomTotal !== 100;
                return (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {saveError && <div role="alert" style={{ flexBasis: '100%', fontSize: 12, color: 'var(--health-red)', fontWeight: 700, textAlign: 'right' }}>{saveError}</div>}
                    <button onClick={() => { setShowAddTask(false); setNewTaskName(''); setNewTaskNotes(''); setNewTaskHealth(0); setNewTaskIconKey('sparkle'); setNewAssignmentType('none'); setNewAssignmentUserIds([]); setNewAssignmentMode('first'); setNewAssignmentPercentages({}); }}
                      className="tq-btn tq-btn-secondary tq-btn-sm">{t('common.cancel')}</button>
                    <button onClick={() => void addTask()} disabled={addSaveDisabled || saving} className="tq-btn tq-btn-primary tq-btn-sm"
                      style={{ opacity: addSaveDisabled ? 0.5 : 1 }}>{t('roomDetail.addTask')}</button>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : isAdmin ? (
          <div style={{ padding: '14px 8px', display: 'flex', gap: 8 }}>
            <button onClick={() => { setSaveError(''); setShowAddTask(true); }}
              className="tq-btn-md"
              style={{
                background: 'none', border: '1.5px dashed var(--warm-border)', borderRadius: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                fontWeight: 700, color: 'var(--warm-text-light)', fontFamily: 'Nunito', flex: 1,
                justifyContent: 'center',
              }}>
              <PlusIcon /> {t('roomDetail.addTask')}
            </button>
            <button onClick={() => {
              setSaveError('');
              setShowTemplates(true);
              setTemplateLoading(true);
              api.getDefaultTasks(room.roomType).then((defaults) => {
                const existingNames = new Set(room.tasks.map(t => t.name.toLowerCase()));
                setTemplateTasks(defaults.map(d => ({
                  ...d, translationKey: (d as any).translationKey, iconKey: (d as any).iconKey,
                  selected: false,
                })).filter(d => !existingNames.has(d.name.toLowerCase())));
                setTemplateLoading(false);
              }).catch(() => { setTemplateTasks([]); setTemplateLoading(false); });
            }}
              className="tq-btn-md"
              style={{
                background: 'none', border: '1.5px dashed var(--warm-border)', borderRadius: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                fontWeight: 700, color: 'var(--warm-text-light)', fontFamily: 'Nunito',
                justifyContent: 'center', padding: '0 16px',
              }}>
              {t('roomDetail.addFromTemplates')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
    {teamPick && (
      <TeamUpDialog task={{ id: teamPick.id, name: translateTask(teamPick.name, teamPick.translationKey) }} language={language}
        people={(users ?? []).filter((u) => u.id !== currentUserId && ((teamPick.effectiveAssignedUserIds ?? []).length === 0 || teamPick.effectiveAssignedUserIds!.includes(u.id)))}
        onClose={() => setTeamPick(null)} onStarted={() => onRefresh?.()} />
    )}
    {proofTask && (
      <ProofModal
        taskTitle={translateTask(proofTask.name, proofTask.translationKey)}
        language={language}
        photos={allowPhotos}
        onClose={() => setProofTask(null)}
        onSubmit={async (proof) => { onCompleteTask(proofTask.id, proof); setProofTask(null); }}
      />
    )}
    {lateTask && (() => {
      // Admins and members can say who did it: the chore's people, or everyone
      const canPick = currentUserRole === 'admin' || currentUserRole === 'member';
      const ids = lateTask.effectiveAssignedUserIds ?? [];
      const all = users ?? [];
      const others = all.filter((u) => u.id !== currentUserId && (ids.length > 0 ? ids.includes(u.id) : !lateTask.assignedToChildren || u.role === 'child'));
      const me = all.find((u) => u.id === currentUserId);
      return (
        <LateLogModal
          task={{ id: lateTask.id, title: translateTask(lateTask.name, lateTask.translationKey) }}
          people={canPick && me ? [me, ...others] : []}
          currentUserId={currentUserId}
          isParent={currentUserRole === 'admin'}
          language={language}
          onClose={() => setLateTask(null)}
          onLogged={(r) => { if (r.newAchievements?.length) onAchievementsUnlocked?.(r.newAchievements); onRefresh?.(); }}
        />
      );
    })()}
    {adminModalTask && (
      <AdminCompleteModal
        task={adminModalTask}
        allUsers={(users || []) as any[]}
        language={language}
        onConfirm={handleAdminModalConfirm}
        onClose={() => setAdminModalTask(null)}
      />
    )}
    {showTemplates && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={(e) => { if (e.target === e.currentTarget) setShowTemplates(false); }}>
        <div className="tq-card" style={{ padding: 24, width: 420, maxWidth: 'calc(100vw - 24px)', maxHeight: '80vh', overflow: 'auto' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: '0 0 16px' }}>
            {t('roomDetail.addFromTemplates')}
          </h3>
          {templateLoading ? (
            <p style={{ fontSize: 13, color: 'var(--warm-text-light)', textAlign: 'center', padding: 20 }}>...</p>
          ) : templateTasks.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--warm-text-light)', textAlign: 'center', padding: 20 }}>
              {t('roomDetail.noTemplates')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templateTasks.map((tt, i) => (
                <label key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 12, minHeight: 44,
                  border: `1.5px solid ${tt.selected ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                  backgroundColor: tt.selected ? 'var(--warm-accent-light)' : 'var(--warm-bg-subtle)',
                  transition: 'all 0.15s ease',
                }}>
                  <input type="checkbox" checked={tt.selected}
                    onChange={() => {
                      setTemplateTasks(prev => prev.map((t, j) => j === i ? { ...t, selected: !t.selected } : t));
                    }}
                    style={{ width: 16, height: 16, accentColor: 'var(--warm-accent)', cursor: 'pointer' }} />
                  <TaskIcon iconKey={tt.iconKey || 'sparkle'} size={20} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--warm-text)' }}>
                    {translateTask(tt.name, tt.translationKey)}
                  </span>
                  <EffortDots effort={tt.effort} />
                </label>
              ))}
            </div>
          )}
          {saveError && <div role="alert" style={{ fontSize: 12, color: 'var(--health-red)', fontWeight: 700, marginTop: 12 }}>{saveError}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="tq-btn tq-btn-secondary" onClick={() => setShowTemplates(false)}
              style={{ flex: 1 }}>{t('common.cancel')}</button>
            <button className="tq-btn tq-btn-primary" disabled={saving || !templateTasks.some(t => t.selected)}
              onClick={() => void runSave(async () => {
                setSaveError('');
                try {
                  // One by one; a chore that's added is unticked, so trying again after a failure adds only the rest
                  for (const tt of templateTasks.filter(t => t.selected)) {
                    await api.createTask(room.id, {
                      name: tt.name, effort: tt.effort,
                      frequencyDays: tt.frequencyDays,
                      iconKey: tt.iconKey || 'sparkle',
                      translationKey: tt.translationKey,
                    });
                    setTemplateTasks((prev) => prev.map((x) => (x === tt ? { ...x, selected: false } : x)));
                  }
                } catch (err) {
                  setSaveError(taskErrorText(err, t));
                  onRefresh?.();
                  return;
                }
                setShowTemplates(false);
                onRefresh?.();
              })}
              style={{ flex: 1 }}>
              {saving ? '...' : `${t('roomDetail.addTask')} (${templateTasks.filter(t => t.selected).length})`}
            </button>
          </div>
        </div>
      </div>
    )}
    <UndoToast undo={undo} language={language} onClose={closeUndo} onRestored={() => onRefresh?.()} />
    </>
  );
}
