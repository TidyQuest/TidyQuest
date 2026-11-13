import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import HealthBar from '../shared/HealthBar';
import { LevelStrip } from '../shared/LevelStrip';
import { TodoQuickAdd } from '../shared/TodoQuickAdd';
import { RewardRejectNote } from '../shared/RewardRejectNote';
import type { BadgeItem, LevelInfo } from '../../utils/badges';
import RingGauge from '../shared/RingGauge';
import UserAvatar from '../shared/UserAvatar';
import { FireIcon, CoinIcon } from '../icons/UIIcons';
import { ShieldPanel } from '../shared/StreakShields';
import { getHealthColor } from '../../utils/health';
import { useTranslation } from '../../hooks/useTranslation';
import { formatNextDue, isTaskForUser, taskCoins } from '../../utils/tasks';
import { useTaskView } from '../../hooks/useTaskView';
import { PendingApprovals, type PendingItem } from '../shared/PendingApprovals';
import { ProofModal, type Proof } from '../shared/ProofModal';
import type { CheerSummary, CoinBoost, FeatureFlags, TeamUpInfo, TeamupItem } from '../../hooks/useApi';
import { CheerBar } from '../shared/CheerBar';
import { MascotCard, MascotPicture, type MascotData, type MascotSuggestion } from '../mascot/MascotCard';
import { TeamUpDialog, TeamUpsCard } from '../shared/TeamUp';
import { ChoreAct, ChoreCoins, ChoreFacts, ChoreLate, ChoreRow } from '../shared/ChoreRow';
import { choreDue } from '../../utils/choreText';
import type { ScheduledTaskFields } from '../../utils/schedule';
import { claimedLabel } from '../../utils/teamups';
import { formatCoins } from '../../utils/format';
import { AdminCompleteModal } from '../shared/AdminCompleteModal';
import { api } from '../../hooks/useApi';
import { TakeBackButton } from '../shared/TakeBackButton';
import { UndoToast, type UndoState } from '../shared/UndoToast';
import { BoostDetails } from '../shared/BoostDetails';
import type { FocusData } from './Focus';
import { HomeLayoutEditor } from '../shared/HomeLayoutEditor';
import { KID_BLOCKS, LEGACY_HIDDEN_KEY, legacyHidden, orderBlocks, placeBlock, TODAY_BLOCKS, TODAY_ORDER, type HomeLayout, type TodayBlockId, type TodayOrderId } from '../../utils/homeLayout';
import { TimerStartButton } from '../shared/ChoreTimer';
import { useChoreTimer } from '../../hooks/useChoreTimer';
import type { ListRoom } from './TaskList';
import { dateStr } from '../../utils/clock';
import { localeFor } from '../../utils/locale';
import { loadSkips, orderLine, saveSkips } from '../../utils/focus';
import { daysUntil, type Season } from '../../utils/seasons';

/* ── Types ── */

interface Room {
  id: number;
  name: string;
  roomType: string;
  color: string;
  accentColor: string;
  health: number;
  taskCount: number;
  criticalCount: number;
  /** The To-dos room (ENH-18): a to-do count instead of health */
  isTodoRoom?: boolean;
  todoCount?: number;
  todoOverdue?: number;
}

interface Quest extends ScheduledTaskFields {
  /** Countdown timer in minutes (NEW-1), null = none */
  timerMinutes?: number | null;
  id: number;
  name: string;
  translationKey?: string;
  iconKey?: string;
  health: number;
  effort: number;
  roomId: number;
  roomName: string;
  roomColor: string;
  roomAccent: string;
  lastCompletedAt: string | null;
  isSeasonal: boolean;
  onDemand?: boolean;
  /** One-time chore (the To-do card) */
  oneTime?: number | boolean;
  doBy?: string | null;
  overdue?: boolean;
  /** Your usual: pinned by the viewer */
  pinned?: boolean;
  /** Overdue: whole days late */
  overdueDays?: number;
  /** Snoozed by the viewer (waits under the scheduled list) */
  snoozed?: boolean;
  frequencyDays: number;
  dueDate?: string;
  dueInDays?: number;
  assignedToChildren?: boolean;
  effectiveAssignedUserId?: number | null;
  effectiveAssignedUserIds?: number[];
  assignedUsers?: Array<{ id: number; displayName: string; avatarColor: string; avatarType?: string; avatarPreset?: string; avatarPhotoUrl?: string }>;
  assignmentMode?: 'first' | 'shared' | 'custom' | 'rotating';
  /** Rotating chores: whose turn it is */
  rotationCurrentUserId?: number | null;
  allowEarlyCompletion?: number | boolean;
  nextDueAt?: string | null;
  sharedCompletions?: Array<{ userId: number; displayName: string }>;
  completedTodayBy?: { userId: number; displayName: string; avatarColor: string } | null;
  /** Team-ups: can you start one, and has a team claimed it today? */
  teamUp?: TeamUpInfo | null;
  /** The viewer's own completions of this task still waiting for a parent (Strict Mode) */
  myPendingCount?: number;
  /** My latest Done that waits for approval (I can take it back) */
  myPendingId?: number | null;
  notes?: string | null;
  customCoins?: number | null;
  repeatLimit?: number | null;
  repeatPeriod?: 'day' | 'week' | null;
  myRepeatCount?: number;
}

interface CurrentUser {
  id: number;
  role?: 'admin' | 'member' | 'child';
  displayName: string;
  coins: number;
  goalCoins?: number | null;
  currentStreak: number;
  streakShields?: number;
  avatarColor: string;
  lastActiveDate?: string | null;
  taskView?: 'all' | 'mine' | 'mineOnly';
  kidMode?: number | boolean;
  /** Card order and hidden cards (ENH-6); null = the default */
  homeLayout?: HomeLayout | null;
}

interface ActivityEntry {
  userId?: number;
  displayName: string;
  avatarColor: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
  taskName: string;
  translationKey?: string;
  roomId: number;
  roomName: string;
  completedAt: string;
  coinsEarned: number;
}

interface FamilyMember {
  id: number;
  displayName: string;
  avatarColor: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
  coins: number;
  currentStreak: number;
  points: number;
}

interface CompletedTodayEntry {
  completionId: number;
  userId: number;
  approvalNote?: string | null;
  cheers?: CheerSummary;
  /** A chore of 3★ effort or more: only those get the mascot's 🐾 */
  mascotCheers?: boolean;
  completedAt: string;
  coinsEarned: number;
  taskId: number;
  name: string;
  translationKey?: string;
  iconKey?: string;
  roomId: number;
  roomName: string;
  roomType?: string;
  roomColor: string;
  roomAccent: string;
  displayName: string;
  avatarColor: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
}

interface DashboardProps {
  data: {
    houseHealth: number;
    rooms: Room[];
    readyToComplete?: Quest[];
    scheduledUpcoming?: Quest[];
    onDemandQuests?: Quest[];
    /** One-time chores still to do */
    todoQuests?: Quest[];
    /** The viewer's pins, then what they do most */
    usualQuests?: Quest[];
    /** Chores overdue by at least their own interval, worst first */
    forgottenQuests?: Quest[];
    /** Today's lists (ENH-26): every chore sorted into Overdue, Today, Any time and Later (the next 30 days) */
    today?: { overdue: Quest[]; today: Quest[]; anytime: Quest[]; later: Quest[] };
    /** Today's Rescue Mission: the chore that pays extra to the first one who does it */
    rescueMission?: { day: string; taskId: number | null; multiplier: number; completedBy: number | null; completedByName: string | null; taskName: string | null; task: Quest | null } | null;
    /** Parents: chores they can choose as the mission instead */
    rescueChoices?: Array<{ id: number; name: string }>;
    /** One thing at a time: null when it's off for this person (NEW-2) */
    focus?: FocusData | null;
    /** Optional extras switched on or off in Settings → Features */
    features?: Partial<FeatureFlags>;
    nextUnlock?: { level: number; kind: string; id: string } | null;
    mascot?: MascotData | null;
    teamups?: TeamupItem[];
    completedToday?: CompletedTodayEntry[];
    myLevel?: LevelInfo | null;
    nextBadge?: BadgeItem | null;
    myGoal?: { goalCoins: number; currentCoins: number; progress: number; goalStartAt?: string | null; goalEndAt?: string | null; completed?: boolean; rewardCoins?: number; title?: string | null } | null;
    /** Double coins events running now */
    coinBoosts?: CoinBoost[];
    childrenGoals?: Array<{ id: number; displayName: string; role: string; coins: number; currentCoins?: number; goalCoins: number | null; progress: number | null; goalStartAt?: string | null; goalEndAt?: string | null }>;
    pendingRewardRequests?: Array<{ id: number; title: string; displayName: string; costCoins: number; redeemedAt: string; status: 'requested' | 'approved' | 'rejected' }>;
    /** Chores waiting for a parent (admins only) */
    pendingCompletions?: PendingItem[];
    strictMode?: boolean;
    /** Streak shields: null when they're off */
    shields?: { price: number; max: number; every: number } | null;
    currentUser: CurrentUser;
    recentActivity: ActivityEntry[];
    badges?: Record<number, string | null>;
  };
  family: FamilyMember[];
  users?: Array<{ id: number; displayName: string; role: string; avatarColor: string; avatarType?: string; avatarPreset?: string; avatarPhotoUrl?: string }>;
  language?: string;
  onCompleteTask: (taskId: number, proof?: Proof) => void;
  onRefresh?: () => void;
  /** Coins changed outside a chore (a streak shield bought): refresh the header's total */
  onCoinsChanged?: () => void;
  /** Every room with its chores (the dashboard's own rooms are summaries), for a double coins event's chore list */
  allRooms?: ListRoom[];
  onNavigateToRoom: (roomId: number) => void;
  /** Open a task in its room, scrolled to and highlighted */
  onOpenTask?: (roomId: number, taskId: number) => void;
  /** The "turn on notifications" card (ENH-31), when this person should see it */
  notifyCard?: React.ReactNode;
  coinsByEffort?: Record<number, number>;
  onNavigateToActivity: () => void;
  onNavigateToRewards?: () => void;
  onNavigateToRooms?: () => void;
  /** The task list for the whole family; criticalOnly shows only chores under 30% health */
  onNavigateToTasks?: (criticalOnly?: boolean) => void;
  onOpenFocus?: () => void;
  onRewardRequestAction: (id: number, status: 'approved' | 'rejected', note?: string) => void | Promise<void>;
  gamificationEnabled?: boolean;
  leaderboardPeriod?: 'week' | 'month' | 'quarter' | 'year';
  /** The holiday showing now dresses the mascot (seasons.ts costume) */
  seasonCostume?: string | null;
  /** The holiday coming up (its countdown is a chip) */
  season?: Season | null;
}

/* ── Component ── */

/** Wide screens show Today in two columns: the side one holds approvals, the mascot, house health and the week */
const WIDE = '(min-width: 1100px)';
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(WIDE);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);

/** The ring in the summary card: done out of everything due today */
function DoneRing({ done, total, ofLabel }: { done: number; total: number; ofLabel: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const part = total > 0 ? Math.min(1, done / total) : 1;
  return (
    <div className="today-ring" aria-hidden="true">
      <svg viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} className="today-ring-track" />
        {part > 0 && <circle cx="36" cy="36" r={r} className="today-ring-fill" strokeDasharray={`${c * part} ${c}`} />}
      </svg>
      <span className="today-ring-n">{done}<small>{ofLabel}</small></span>
    </div>
  );
}

const Dashboard: React.FC<DashboardProps> = ({
  data,
  family,
  users,
  language,
  onCompleteTask,
  onRefresh,
  onCoinsChanged,
  allRooms = [],
  onNavigateToRoom,
  onOpenTask,
  notifyCard,
  coinsByEffort,
  onNavigateToRewards,
  onNavigateToRooms,
  onNavigateToTasks,
  onOpenFocus,
  onRewardRequestAction,
  gamificationEnabled = true,
  leaderboardPeriod = 'week',
  seasonCostume = null,
  season = null,
}) => {
  const { taskName, roomDisplayName, timeAgo, t } = useTranslation(language);
  const navigate = useNavigate();
  const wide = useWide();

  // Double coins events: the biggest running boost that covers a task's room (boosts don't stack)
  const boosts = gamificationEnabled ? (data.coinBoosts ?? []) : [];
  // Today's Rescue Mission pays extra too (the bigger multiplier wins, like on the server)
  const mission = gamificationEnabled ? data.rescueMission ?? null : null;
  const missionBonus = (taskId: number) => (mission && mission.taskId === taskId && !mission.completedBy ? mission.multiplier : 1);
  // A boost counts for a chore when nothing was picked, or its room or the chore itself was (as on the server)
  const covers = (b: CoinBoost, taskId: number, roomId: number) => (!b.roomIds && !b.taskIds) || !!b.roomIds?.includes(roomId) || !!b.taskIds?.includes(taskId);
  const multiplierFor = (taskId: number, roomId: number) => boosts.reduce((m, b) => (covers(b, taskId, roomId) ? Math.max(m, b.multiplier) : m), missionBonus(taskId));
  const boostFor = (q: Quest) => multiplierFor(q.id, q.roomId);
  // The event whose chore list is open (tap its chip)
  const [openBoostId, setOpenBoostId] = useState<number | null>(null);
  // The reward request whose Reject box (an optional note for the kid) is open
  const [rejectingReward, setRejectingReward] = useState<number | null>(null);
  const openBoost = boosts.find((b) => b.id === openBoostId) ?? null;
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (boosts.length === 0) return;
    const id = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(id);
  }, [boosts.length]);
  const timeLeft = (endAt: string) => {
    const mins = Math.max(0, Math.round((new Date(endAt).getTime() - nowTs) / 60000));
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  };
  const { houseHealth, rooms, completedToday = [], myGoal, childrenGoals = [], pendingRewardRequests = [], currentUser, badges, myLevel = null, nextBadge = null } = data;

  const BADGE_COLORS: Record<string, string> = {
    bronze: '#CD7F32',
    silver: '#A8A9AD',
    gold: '#FFD700',
    platinum: '#B0C4DE',
    legend: '#9B59B6',
  };
  const [adminModalQuest, setAdminModalQuest] = useState<Quest | null>(null);
  // Mine / Everyone: a parent can make someone start on Mine or lock it (Kid mode always shows Mine)
  const { filter: taskFilter, setFilter: setTaskFilter, locked: filterLocked } = useTaskView(currentUser);
  const kidMode = !!currentUser.kidMode;
  const isParent = currentUser.role === 'admin';
  const isAdult = currentUser.role === 'admin' || currentUser.role === 'member';
  // Strict Mode: kids can finish a chore with a note or photo for the parent who approves it
  const [proofQuest, setProofQuest] = useState<Quest | null>(null);
  const canAddProof = !!data.strictMode && currentUser.role === 'child';
  const proofPhotos = data.features?.proofPhotos !== false;
  const proofLabel = t(proofPhotos ? 'proof.addProof' : 'proof.addNote');
  const pendingCompletions = data.pendingCompletions ?? [];
  const filterQuests = (quests: Quest[], view: 'all' | 'mine' = taskFilter) =>
    (view === 'all' ? quests : quests.filter((q) => isTaskForUser(q, currentUser.id, currentUser.role)));
  const [showTodoAdd, setShowTodoAdd] = useState(false);
  const [todoNotice, setTodoNotice] = useState('');

  // Shared and split-coins chores are done once per person (BUG-37: only 'shared' counted, so the second
  // person on a split-coins chore saw "Done by A")
  const isPerPerson = (q: Quest) => q.assignmentMode === 'shared' || q.assignmentMode === 'custom';
  // A rotating chore during someone else's turn: a kid can't do it (parents can, on anyone's turn)
  const waitingForTurn = (q: Quest): string | null => {
    if (isAdult || q.assignmentMode !== 'rotating' || q.rotationCurrentUserId == null || q.rotationCurrentUserId === currentUser.id) return null;
    const name = q.assignedUsers?.find((u) => u.id === q.rotationCurrentUserId)?.displayName || '?';
    return t('roomDetail.waitingForTurn').replace('{name}', name);
  };

  // The Done tick for a chore that isn't due (to-dos, Your usual, Any time): the same rules as the due lists, plus
  // "not due yet" for a pinned chore
  const doneState = (q: Quest): { disabled: boolean; label: string; done?: boolean } => {
    const claimed = claimedLabel(q.teamUp);
    if (claimed) return { disabled: true, label: claimed };
    const hasAssignees = (q.effectiveAssignedUserIds && q.effectiveAssignedUserIds.length > 0) || q.assignedToChildren;
    const ids = q.effectiveAssignedUserIds ?? [];
    if (!isAdult && ids.length > 0 && !ids.includes(currentUser.id)) return { disabled: true, label: t('app.notAssigned') };
    if (!isAdult && (q.myPendingCount ?? 0) > 0) return { disabled: true, label: t('app.waitingForApproval') };
    if (q.onDemand) {
      if (!isAdult && q.repeatLimit && (q.myRepeatCount ?? 0) >= q.repeatLimit) return { disabled: true, label: t(q.repeatPeriod === 'day' ? 'repeat.doneToday' : 'repeat.doneThisWeek') };
      return { disabled: false, label: t('roomDetail.done') };
    }
    const turn = waitingForTurn(q);
    if (turn) return { disabled: true, label: turn };
    if (isPerPerson(q)) {
      if (q.sharedCompletions?.some((c) => c.userId === currentUser.id) && !isAdult) return { disabled: true, done: true, label: t('app.doneBy').replace('{name}', t('common.you')) };
    } else if (q.completedTodayBy && (!isAdult || !hasAssignees)) {
      return { disabled: true, done: true, label: t('app.doneBy').replace('{name}', q.completedTodayBy.displayName) };
    }
    // Not due yet (a pinned "usual" chore, mostly): the server would refuse it, so say when it's next due
    // (BUG-37). Done early is fine once a day when the chore allows it.
    if (!q.oneTime && q.health > 0 && q.lastCompletedAt && !(q.allowEarlyCompletion && dateStr(q.lastCompletedAt) < dateStr())) {
      return { disabled: true, label: formatNextDue(q.lastCompletedAt, q.frequencyDays, t, language, q.health, q.nextDueAt).text };
    }
    return { disabled: false, label: t('roomDetail.done') };
  };
  const timer = useChoreTimer();
  const finish = (q: Quest) => {
    const hasAssignees = (q.effectiveAssignedUserIds && q.effectiveAssignedUserIds.length > 0) || q.assignedToChildren;
    if (isAdult && hasAssignees) setAdminModalQuest(q);
    else onCompleteTask(q.id);
  };
  type TickState = { disabled: boolean; label: string; done?: boolean };
  const ready: TickState = { disabled: false, label: t('roomDetail.done') };
  /** The tick for a chore that's due (Overdue and Today) */
  const readyState = (q: Quest): TickState => {
    const claimed = claimedLabel(q.teamUp);
    if (claimed) return { disabled: true, label: claimed };
    const hasAssignees = (q.effectiveAssignedUserIds && q.effectiveAssignedUserIds.length > 0) || q.assignedToChildren;
    let state = ready;
    if (isPerPerson(q)) {
      if (q.sharedCompletions?.some((c) => c.userId === currentUser.id) && !isAdult) state = { disabled: true, done: true, label: t('app.doneBy').replace('{name}', t('common.you') || 'You') };
    } else if (q.completedTodayBy) {
      if (!isAdult || !hasAssignees) state = { disabled: true, done: true, label: t('app.doneBy').replace('{name}', q.completedTodayBy.displayName) };
    } else if (!isAdult) {
      const ids = q.effectiveAssignedUserIds ?? [];
      if (ids.length > 0 && !ids.includes(currentUser.id)) state = { disabled: true, label: t('app.notAssigned') };
    }
    if (!isAdult && (q.myPendingCount ?? 0) > 0) state = { disabled: true, label: t('app.waitingForApproval') };
    const turn = waitingForTurn(q);
    if (turn && !state.disabled) state = { disabled: true, label: turn };
    return state;
  };
  /** The tick for an anytime chore (one waiting for approval can be done again) */
  const onDemandState = (q: Quest): TickState => {
    const claimed = claimedLabel(q.teamUp);
    if (claimed) return { disabled: true, label: claimed };
    const ids = q.effectiveAssignedUserIds ?? [];
    if (!isAdult && ids.length > 0 && !ids.includes(currentUser.id)) return { disabled: true, label: t('app.notAssigned') };
    if (!isAdult && !!q.repeatLimit && (q.myRepeatCount ?? 0) >= q.repeatLimit) return { disabled: true, label: t(q.repeatPeriod === 'day' ? 'repeat.doneToday' : 'repeat.doneThisWeek') };
    return ready;
  };
  const roomTypeById = new Map(rooms.map((r) => [r.id, r.roomType]));
  // The chore row that's open (ENH-25), by list and chore: one that shows twice opens only where it was tapped
  const [openRow, setOpenRow] = useState<string | null>(null);
  /**
   * One chore row (ENH-25): icon, name, "room · when", coins and the tick. Tapping it opens the notes, details and
   * the less-used buttons: Go to room, Pin, Snooze, the timer, Team up, a note or photo, Take back.
   */
  const questRow = (q: Quest, opts: { key: string; state?: TickState; when?: React.ReactNode; noTick?: boolean; pin?: boolean; snooze?: boolean; wake?: boolean; highlight?: boolean }) => {
    const state = opts.state ?? doneState(q);
    const name = taskName(q.name, q.translationKey);
    const due = choreDue(q, t, language);
    // Why it can't be ticked right now ("Waiting for Cecil", "Done by Dad") takes the place of when it's due
    const status = !opts.noTick && state.disabled && state.label !== t('roomDetail.done') ? state.label : null;
    const when = status ?? opts.when ?? (due.late ? <ChoreLate>{due.text}</ChoreLate> : due.text);
    const canDo = !opts.noTick && !state.disabled;
    // Timer chores (NEW-1): kids start it first, and Done comes when it ends
    const waitForTimer = canDo && !!timer?.mustWait(q);
    const open = openRow === opts.key;
    const timerTask = { ...q, name };
    return (
      <ChoreRow key={opts.key} taskId={q.id} iconKey={q.iconKey} tileColor={q.roomColor} tileBorder={`${q.roomAccent}44`} name={name}
        sub={[roomDisplayName(q.roomName, roomTypeById.get(q.roomId) || ''), when]}
        coins={gamificationEnabled ? <ChoreCoins coins={taskCoins(q, coinsByEffort)} boost={boostFor(q)} format={formatCoins} /> : null}
        className={opts.highlight ? 'highlight' : ''}
        tick={opts.noTick ? null : { state: state.done ? 'done' : state.disabled ? 'off' : 'ready', label: state.label, onTick: () => finish(q) }}
        trailing={waitForTimer ? <TimerStartButton task={timerTask} language={language} primary className="chore-act" /> : undefined}
        open={open} onToggle={() => setOpenRow(open ? null : opts.key)}>
        {q.notes && <p className="chore-notes">{q.notes}</p>}
        <ChoreFacts task={q} language={language} />
        <div className="chore-acts">
          {onOpenTask && <ChoreAct onClick={() => onOpenTask(q.roomId, q.id)}>{t('chore.goToRoom')}</ChoreAct>}
          {opts.pin && (
            <ChoreAct on={!!q.pinned} aria-pressed={!!q.pinned} title={q.pinned ? t('home.unpin') : t('home.pin')} onClick={() => void togglePin(q)}>
              {q.pinned ? '★' : '☆'} {t(q.pinned ? 'chore.pinned' : 'chore.pin')}
            </ChoreAct>
          )}
          {opts.snooze && <ChoreAct onClick={() => void snooze(q)}>💤 {t('home.snooze')}</ChoreAct>}
          {opts.wake && <ChoreAct onClick={() => void wake(q)}>⏰ {t('today.wake')}</ChoreAct>}
          {canDo && !waitForTimer && <TimerStartButton task={timerTask} language={language} className="chore-act" />}
          {q.teamUp?.canStart && <ChoreAct onClick={() => setTeamPick(q)}>🤝 {t('teamups.teamUp')}</ChoreAct>}
          {canAddProof && canDo && !waitForTimer && <ChoreAct onClick={() => setProofQuest(q)}>📎 {proofLabel}</ChoreAct>}
          <TakeBackButton completionId={q.myPendingId} onDone={() => onRefresh?.()} language={language} />
        </div>
      </ChoreRow>
    );
  };
  /** A chore someone finished today (approved): struck through, with who and when; opens to the note and cheers */
  const doneEntryRow = (c: CompletedTodayEntry) => {
    const key = `c-${c.completionId}`;
    const open = openRow === key;
    const time = new Date(c.completedAt).toLocaleTimeString(localeFor(language), { hour: 'numeric', minute: '2-digit' });
    const mine = c.userId === currentUser.id;
    const extra = !!c.approvalNote || !!c.cheers;
    return (
      <ChoreRow key={key} taskId={c.taskId} iconKey={c.iconKey} tileColor={c.roomColor} tileBorder={`${c.roomAccent}44`} name={taskName(c.name, c.translationKey)}
        sub={[roomDisplayName(c.roomName, c.roomType || ''), mine ? null : c.displayName, t('today.doneAt').replace('{time}', time)]}
        coins={gamificationEnabled ? <ChoreCoins coins={c.coinsEarned} format={formatCoins} /> : null}
        tick={{ state: 'done', label: t('app.doneBy').replace('{name}', mine ? t('common.you') : c.displayName) }}
        open={open} onToggle={() => setOpenRow(open ? null : key)}>
        {extra ? (
          <>
            {c.approvalNote && <p className="chore-notes">💬 “{c.approvalNote}”</p>}
            {c.cheers && <CheerBar completionId={c.completionId} cheers={c.cheers} canCheer={!mine} language={language} mascotName={c.mascotCheers ? data.mascot?.name : null} />}
          </>
        ) : undefined}
      </ChoreRow>
    );
  };
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showCustomize, setShowCustomize] = useState(false);
  // The chore someone is picking a team-up partner for
  const [teamPick, setTeamPick] = useState<Quest | null>(null);
  // The chip whose panel is open under the chips (Rescue Mission, house health, streak, goals, mascot)
  const [panel, setPanel] = useState<string | null>(null);
  const togglePanel = (id: string) => setPanel((p) => (p === id ? null : id));
  // The approvals notice's list
  const [reviewOpen, setReviewOpen] = useState(false);

  const BLOCK_LABELS: Record<TodayBlockId, string> = {
    mascot: t('mascot.title'),
    rescue: t('rescue.title'),
    houseHealth: t('dashboard.houseHealth'),
    holiday: t('today.holiday'),
    level: t('today.levelBlock'),
    streak: t('dashboard.dayStreak'),
    myGoal: t('dashboard.myGoal'),
    childrenGoals: t('dashboard.childrenGoals'),
    pendingApprovals: t('approvals.title'),
    teamups: t('teamups.title'),
    focus: t('today.nextUp'),
    usual: t('home.usualTitle'),
    todo: t('todos.title'),
    leaderboard: t('app.leaderboardTitle'),
  };
  // This person's hidden parts of Today and the order of its big blocks (saved on the server; the old browser-only
  // hidden set is brought over the first time)
  const [layout, setLayout] = useState<HomeLayout>(() => currentUser.homeLayout ?? { order: [], hidden: legacyHidden() });
  useEffect(() => {
    if (currentUser.homeLayout || legacyHidden().length === 0) return;
    api.updateProfile(currentUser.id, { homeLayout: { order: [], hidden: legacyHidden() } })
      .then(() => { try { localStorage.removeItem(LEGACY_HIDDEN_KEY); } catch { /* ignore */ } onRefresh?.(); })
      .catch(() => {});
  }, [currentUser.id, currentUser.homeLayout, onRefresh]);
  const [layoutError, setLayoutError] = useState(false);
  const saveLayout = (next: HomeLayout) => {
    setLayout(next);
    api.updateProfile(currentUser.id, { homeLayout: next.order.length || next.hidden.length ? next : null })
      // Today's data carries the layout, so reload it (it comes back this way after a page change)
      .then(() => onRefresh?.())
      .catch(() => setLayoutError(true));
  };
  const hiddenSet = new Set(layout.hidden);
  const toggleBlock = (id: string) => saveLayout({
    order: layout.order,
    hidden: hiddenSet.has(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id],
  });
  // What this person can get: a part only shows when it applies; kid mode keeps to KID_BLOCKS
  const blockApplies: Record<TodayBlockId, boolean> = {
    mascot: !!data.mascot,
    rescue: gamificationEnabled && data.features?.rescue !== false,
    houseHealth: true,
    holiday: !!season,
    level: gamificationEnabled && !!myLevel,
    streak: gamificationEnabled && !!data.shields,
    myGoal: gamificationEnabled && !!myGoal,
    childrenGoals: isParent && gamificationEnabled && childrenGoals.length > 0,
    pendingApprovals: isParent,
    teamups: data.features?.teamups !== false,
    focus: !!data.focus,
    usual: data.features?.usual !== false,
    todo: data.features?.todos !== false,
    leaderboard: gamificationEnabled,
  };
  const listedBlocks = TODAY_BLOCKS.filter((id) => blockApplies[id] && (!kidMode || KID_BLOCKS.has(id)));
  const shows = (id: TodayBlockId) => blockApplies[id] && (!kidMode || KID_BLOCKS.has(id)) && !hiddenSet.has(id);
  // The big blocks under the summary, in this person's order; Customise moves them (the chore lists can't be hidden)
  const blockOrder = orderBlocks(TODAY_ORDER, layout.order);
  const orderable = (id: TodayOrderId) => id === 'lists' || listedBlocks.includes(id);
  const saveOrder = (order: TodayOrderId[]) => saveLayout({ order, hidden: layout.hidden });
  const stepBlock = (id: string, dir: -1 | 1) => {
    const shown = blockOrder.filter(orderable);
    const to = shown[shown.indexOf(id as TodayOrderId) + dir];
    if (to) saveOrder(placeBlock(blockOrder, id as TodayOrderId, to, dir < 0 ? 'before' : 'after'));
  };

  const togglePin = async (q: Quest) => {
    if (q.pinned) await api.unpinTask(q.id); else await api.pinTask(q.id);
    onRefresh?.();
  };
  // 💤 hides an overdue chore for you for 3 days (it waits under the scheduled list); the toast takes it back
  const [snoozeUndo, setSnoozeUndo] = useState<UndoState | null>(null);
  const closeSnoozeUndo = useCallback(() => setSnoozeUndo(null), []);
  const canSnooze = isAdult && data.features?.forgot !== false;
  const snooze = async (q: Quest) => {
    await api.snoozeTask(q.id, 3);
    setSnoozeUndo({ message: t('home.snoozed').replace('{name}', taskName(q.name, q.translationKey)), onUndo: () => api.unsnoozeTask(q.id) });
    onRefresh?.();
  };
  const snoozeAll = async (qs: Quest[]) => {
    await Promise.all(qs.map((q) => api.snoozeTask(q.id, 3)));
    setSnoozeUndo({ message: t('today.snoozedAll').replace('{n}', String(qs.length)), onUndo: () => Promise.all(qs.map((q) => api.unsnoozeTask(q.id))) });
    onRefresh?.();
  };
  const wake = async (q: Quest) => {
    await api.unsnoozeTask(q.id);
    onRefresh?.();
  };
  const missionAction = async (fn: () => Promise<unknown>) => { await fn(); onRefresh?.(); };
  const LIMIT = 7;
  const isExpanded = (key: string) => !!expanded[key];
  const toggleExpand = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));
  const showMoreBtn = (key: string, total: number) => total > LIMIT && (
    <button type="button" className="today-more" onClick={() => toggleExpand(key)}>
      {isExpanded(key) ? t('common.showLess') : t('common.showMore').replace('{n}', `${total - LIMIT}`)}
    </button>
  );

  /* ── Today's lists (the server sorts every chore into Overdue, Today, Any time and Later; ENH-26) ── */
  // To-dos have their own section unless it's hidden: then they sit in the day's lists by their do-by date
  const todoOn = shows('todo');
  const sorted = data.today ?? { overdue: [], today: [], anytime: [], later: [] };
  const choresOnly = (qs: Quest[]) => (todoOn ? qs.filter((q) => !q.oneTime) : qs);
  const lists = { overdue: choresOnly(sorted.overdue), today: choresOnly(sorted.today), anytime: choresOnly(sorted.anytime), later: choresOnly(sorted.later) };
  // Waiting for a parent's OK counts as done for the kid who did it
  const waiting = (q: Quest) => !isAdult && (q.myPendingCount ?? 0) > 0;
  const settled = (q: Quest) => !!readyState(q).done || waiting(q);
  const viewOf = (view: 'all' | 'mine') => {
    const due = [...filterQuests(lists.overdue, view), ...filterQuests(lists.today, view)];
    const doneEntries = completedToday.filter((c) => view === 'all' || c.userId === currentUser.id);
    return {
      overdue: filterQuests(lists.overdue, view).filter((q) => !settled(q)),
      today: filterQuests(lists.today, view).filter((q) => !settled(q)),
      doneEntries,
      // A chore done today shows once: its completion when there is one, else the chore itself
      doneTasks: due.filter((q) => settled(q) && !doneEntries.some((c) => c.taskId === q.id)),
    };
  };
  const view = viewOf(taskFilter);
  const leftCount = (v: ReturnType<typeof viewOf>) => v.overdue.length + v.today.length;
  const left = leftCount(view);
  const doneCount = view.doneEntries.length + view.doneTasks.length;
  const coinsUp = gamificationEnabled
    ? [...view.overdue, ...view.today].filter((q) => !readyState(q).disabled).reduce((s, q) => s + Math.round(taskCoins(q, coinsByEffort) * boostFor(q)), 0)
    : 0;

  // Next up (NEW-2's one thing at a time): the first chore in today's line that can be done now; Pick another skips it
  const [skips, setSkips] = useState<number[]>(() => loadSkips(currentUser.id));
  const dueAll = [...lists.overdue, ...lists.today];
  const line = shows('focus') && data.focus
    ? orderLine(data.focus.line, skips).map((c) => dueAll.find((q) => q.id === c.id)).filter((q): q is Quest => !!q && !settled(q) && !readyState(q).disabled)
    : [];
  const nextUp = line[0] ?? null;
  const pickAnother = (id: number) => {
    const next = [...skips.filter((s) => s !== id), id];
    setSkips(next);
    saveSkips(currentUser.id, next);
  };
  // A double tap on Done! would land on the next chore, which slides in under the same button (BUG-35)
  const justDone = useRef(false);
  const doneNext = (q: Quest) => {
    if (justDone.current) return;
    justDone.current = true;
    setTimeout(() => { justDone.current = false; }, 700);
    finish(q);
  };
  const notNext = (q: Quest) => q.id !== nextUp?.id;

  // Any time: Your usual (pins always, the rest only when they can be done now) and then anytime chores and to-dos
  // without a date
  const shownDue = new Set(dueAll.map((q) => q.id));
  const usual = shows('usual') ? (data.usualQuests ?? []).filter((q) => !shownDue.has(q.id) && (q.pinned || !doneState(q).disabled)).slice(0, 6) : [];
  const usualIds = new Set(usual.map((q) => q.id));
  const anytime = [...usual, ...filterQuests(lists.anytime).filter((q) => !usualIds.has(q.id))];
  const later = filterQuests(lists.later).filter((q) => !usualIds.has(q.id));
  const missionTask = (q: Quest) => !!mission && mission.taskId === q.id && !mission.completedBy;

  const overdueRows = view.overdue.filter(notNext).map((q) => questRow(q, { key: `o-${q.id}`, state: readyState(q), snooze: canSnooze, highlight: missionTask(q) }));
  const todayRows = view.today.filter(notNext).map((q) => questRow(q, { key: `t-${q.id}`, state: readyState(q), highlight: missionTask(q) }));
  const doneRows = [
    ...view.doneTasks.map((q) => questRow(q, { key: `d-${q.id}`, state: waiting(q) ? { disabled: true, label: `⏳ ${t('app.waitingForApproval')}` } : readyState(q) })),
    ...view.doneEntries.map(doneEntryRow),
  ];
  const anytimeRows = anytime.map((q) => questRow(q, { key: `a-${q.id}`, state: q.onDemand ? onDemandState(q) : doneState(q), pin: data.features?.usual !== false, highlight: missionTask(q) }));
  const laterRows = later.map((q) => q.snoozed
    ? questRow(q, { key: `l-${q.id}`, state: readyState(q), wake: true, when: `💤 ${t('today.snoozed')}` })
    : questRow(q, {
      key: `l-${q.id}`, noTick: true,
      when: (q.dueInDays ?? 0) <= 0 ? t('calendar.today') : q.dueInDays === 1 ? t('calendar.tomorrow') : t('calendar.inDays').replace('{days}', `${q.dueInDays}`),
    }));
  const [showLater, setShowLater] = useState(false);

  const section = (key: string, title: string, rows: React.ReactNode[], opts: { late?: boolean; action?: React.ReactNode } = {}) => rows.length > 0 && (
    <section className="today-section" key={key}>
      <div className={`today-sec${opts.late ? ' late' : ''}`}>
        <h3>{opts.late && <span className="today-dot" aria-hidden="true" />}{title} · {rows.length}</h3>
        {opts.action}
      </div>
      <div className="tq-card today-list chore-list">
        {isExpanded(key) ? rows : rows.slice(0, LIMIT)}
      </div>
      {showMoreBtn(key, rows.length)}
    </section>
  );

  /* ── The summary card ── */
  const ofLabel = t('today.ringOf').replace('{n}', String(left + doneCount));
  const headline = left > 0 ? (left === 1 ? t('today.leftOne') : t('today.left').replace('{n}', String(left)))
    : doneCount > 0 ? t('today.allDone') : t('today.nothing');
  const overdueTotal = view.overdue.length;
  const subParts = kidMode
    ? [left > 0 && coinsUp > 0 ? t('today.kidCoins').replace('{n}', formatCoins(coinsUp)) : '']
    : [overdueTotal === 1 ? t('today.overdueOne') : overdueTotal > 1 ? t('today.overdueMany').replace('{n}', String(overdueTotal)) : '',
      coinsUp > 0 ? t('today.coinsUp').replace('{n}', formatCoins(coinsUp)) : ''];
  const sub = subParts.filter(Boolean).join(' · ');
  const showLevel = !kidMode && shows('level') && !!myLevel && (currentUser.role !== 'admin' || myLevel.coinsEarned > 0);
  const goalBar = kidMode && shows('myGoal') && myGoal && (
    <div className="today-goal">
      <div className="today-goal-top">
        <span>{myGoal.completed ? `🎉 ${t('dashboard.goalCompleted')}` : `🎁 ${myGoal.title || t('dashboard.myGoal')}`}</span>
        <span>{formatCoins(myGoal.currentCoins)} / {formatCoins(myGoal.goalCoins)}</span>
      </div>
      <div className="today-bar"><span style={{ width: `${Math.min(100, Math.max(0, myGoal.progress))}%` }} /></div>
      {(myGoal.rewardCoins ?? 0) > 0 && (
        <div className="today-goal-note">
          {myGoal.completed ? `+${formatCoins(myGoal.rewardCoins)} ${t('goals.bonusEarned')}` : t('goals.bonusWhenReached').replace('{n}', formatCoins(myGoal.rewardCoins))}
        </div>
      )}
    </div>
  );
  const mascotLine = !wide && shows('mascot') && data.mascot && (
    <button type="button" className="today-mascot-line" onClick={() => togglePanel('mascot')} aria-expanded={panel === 'mascot'}>
      <span className="today-mascot-pic"><MascotPicture m={data.mascot} costume={seasonCostume} size={44} asleep={data.mascot.mood === 'sleep'} outfit={data.mascot.outfit} /></span>
      <span className="today-mascot-text"><b>{data.mascot.name}</b> · {t(`mascot.mood_${data.mascot.mood}`)}</span>
    </button>
  );
  const mascotCard = shows('mascot') && data.mascot && (
    <MascotCard m={data.mascot} costume={seasonCostume} language={language} suggestions={mascotIdeas()} userId={currentUser.id}
      isParent={isParent} coins={currentUser.coins} onChanged={() => { onRefresh?.(); onCoinsChanged?.(); }} />
  );
  // "What should I do?": chores the mascot can suggest, best first (only ones you can do right now)
  function mascotIdeas(): MascotSuggestion[] {
    const ideas: MascotSuggestion[] = [];
    const seen = new Set<number>();
    const add = (q: Quest | null | undefined, reason: MascotSuggestion['reason']) => {
      if (!q || seen.has(q.id) || doneState(q).disabled) return;
      seen.add(q.id);
      ideas.push({ taskId: q.id, roomId: q.roomId, name: taskName(q.name, q.translationKey), roomName: roomDisplayName(q.roomName, roomTypeById.get(q.roomId) || ''), coins: gamificationEnabled ? taskCoins(q, coinsByEffort) : null, reason });
    };
    if (mission && !mission.completedBy) add(mission.task as Quest | null, 'rescue');
    for (const x of data.teamups ?? []) if (x.canJoin) add([...dueAll, ...lists.anytime].find((q) => q.id === x.taskId), 'teamup');
    for (const q of dueAll) if ((q.effectiveAssignedUserIds ?? []).includes(currentUser.id)) add(q, 'yours');
    for (const q of dueAll) if (q.roomId === data.mascot?.messiestRoom?.id) add(q, 'messiest');
    for (const q of [...dueAll].sort((a, b) => a.effort - b.effort)) add(q, 'quick');
    return ideas;
  }

  /* ── Chips and their panels ── */
  const missionShown = shows('rescue') && !!mission && (!!mission.task || !!mission.completedBy);
  const healthMessage = houseHealth >= 70 ? t('dashboard.healthGreat') : houseHealth >= 40 ? t('dashboard.healthMedium') : t('dashboard.healthLow');
  // House health boxes: the To-dos room's to-dos aren't counted (ENH-18)
  const totalTasks = rooms.reduce((s, r) => s + (r.isTodoRoom ? 0 : r.taskCount), 0);
  const totalCritical = rooms.reduce((s, r) => s + r.criticalCount, 0);
  const healthBody = (
    <>
      <div className="today-health-top">
        <RingGauge value={houseHealth} size={wide ? 84 : 64} strokeWidth={wide ? 9 : 7} />
        <p>{healthMessage}</p>
      </div>
      <div className="today-health-boxes">
        {[
          { label: t('dashboard.roomsCount'), value: rooms.length, aria: t('dashboard.openRooms').replace('{n}', String(rooms.length)), open: onNavigateToRooms },
          { label: t('dashboard.tasksCount'), value: totalTasks, aria: t('dashboard.openTasks').replace('{n}', String(totalTasks)), open: onNavigateToTasks && (() => onNavigateToTasks()) },
          { label: t('dashboard.criticalCount'), value: totalCritical, aria: t('dashboard.openCritical').replace('{n}', String(totalCritical)), open: onNavigateToTasks && (() => onNavigateToTasks(true)) },
        ].map((s) => (
          <button key={s.label} type="button" onClick={s.open} disabled={!s.open} aria-label={s.aria}>
            <b>{s.value}</b><span>{s.label}</span>
          </button>
        ))}
      </div>
    </>
  );
  const streakDoneToday = currentUser.lastActiveDate === dateStr();
  const holidayLine = (() => {
    if (!season || !shows('holiday')) return null;
    const days = daysUntil(season);
    const text = days > 1 ? t('seasons.daysUntil').replace('{n}', String(days)) : days === 1 ? t('seasons.tomorrow') : days === 0 ? t('seasons.today') : t('seasons.after');
    return `${season.strip[0]} ${text.replace('{name}', t(`seasons.${season.id}`))}`;
  })();
  const chip = (id: string, content: React.ReactNode, opts: { hot?: boolean; onClick?: () => void; panel?: boolean } = {}) => {
    const cls = `today-chip${opts.hot ? ' hot' : ''}${opts.panel && panel === id ? ' on' : ''}`;
    if (!opts.onClick && !opts.panel) return <span key={id} className={cls}>{content}</span>;
    return (
      <button key={id} type="button" className={cls} onClick={opts.onClick ?? (() => togglePanel(id))} aria-expanded={opts.panel ? panel === id : undefined}>
        {content}
      </button>
    );
  };
  const chips = [
    ...boosts.map((b) => chip(`boost-${b.id}`, <>⚡ <em>{b.multiplier}×</em> {b.title} · {t('boosts.left').replace('{time}', timeLeft(b.endAt))}</>, { hot: true, onClick: () => setOpenBoostId(b.id) })),
    missionShown && mission && chip('rescue', mission.completedBy
      ? <>✅ {t('rescue.rescuedBy').replace('{name}', mission.completedByName ?? '?')}</>
      : <>⚡ {t('rescue.title')} · <em>{t('today.rescueChip').replace('{m}', String(mission.multiplier))}</em></>, { hot: !mission.completedBy, panel: true }),
    !wide && shows('houseHealth') && chip('health', <>🏠 {t('dashboard.houseHealth')} <em style={{ color: getHealthColor(houseHealth) }}>{houseHealth}</em></>, { panel: true }),
    holidayLine && chip('holiday', holidayLine),
    kidMode && shows('level') && myLevel && chip('level', <>⭐ {t('levels.level').replace('{n}', String(myLevel.level))} · {t('today.levelChip').replace('{n}', formatCoins(myLevel.nextLevelAt - myLevel.coinsEarned))}</>, { onClick: () => navigate('/achievements') }),
    shows('streak') && chip('streak', <>🔥 {t('today.streakChip').replace('{n}', String(currentUser.currentStreak))}</>, { panel: true }),
    !kidMode && shows('myGoal') && myGoal && chip('goal', <>🎁 {t('dashboard.myGoal')} <em>{formatCoins(myGoal.currentCoins)}/{formatCoins(myGoal.goalCoins)}</em></>, { panel: true }),
    shows('childrenGoals') && chip('kidsGoals', <>🎯 {t('dashboard.childrenGoals')}</>, { panel: true }),
  ].filter(Boolean);
  const panelBody = (() => {
    switch (panel) {
      case 'rescue': return missionShown && mission && (
        <div className="tq-card tq-card-padded today-panel rescue-card">
          {mission.completedBy ? (
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--health-green)' }}>
              ✅ {mission.taskName ? `${taskName(mission.taskName, mission.task?.translationKey)} · ` : ''}{t('rescue.rescuedBy').replace('{name}', mission.completedByName ?? '?')}
            </div>
          ) : mission.task && (
            <>
              <div className="today-panel-note">{t('rescue.pays').replace('{m}', String(mission.multiplier))} {t('rescue.endsMidnight')}</div>
              <div className="chore-list">{questRow(mission.task, { key: `rescue-${mission.task.id}`, highlight: true })}</div>
            </>
          )}
          {isParent && !mission.completedBy && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
              <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => void missionAction(api.rescueReroll)}>🔄 {t('rescue.another')}</button>
              {(data.rescueChoices ?? []).length > 1 && (
                <select className="tq-input-compact" value="" aria-label={t('rescue.choose')} style={{ flex: '1 1 140px', width: 0, minWidth: 0, maxWidth: '100%' }}
                  onChange={(e) => { if (e.target.value) void missionAction(() => api.rescueChoose(Number(e.target.value))); }}>
                  <option value="">{t('rescue.choose')}</option>
                  {(data.rescueChoices ?? []).filter((c) => c.id !== mission.taskId).map((c) => <option key={c.id} value={c.id}>{taskName(c.name, undefined)}</option>)}
                </select>
              )}
              <button className="tq-btn tq-btn-sm" onClick={() => void missionAction(api.rescueSkip)}>{t('rescue.skip')}</button>
            </div>
          )}
        </div>
      );
      case 'health': return <div className="tq-card tq-card-padded today-panel today-health">{healthBody}</div>;
      case 'streak': return (
        <div className="tq-card tq-card-padded today-panel" style={{ background: 'var(--warm-streak-bg)', borderColor: 'var(--warm-streak-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <FireIcon />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-streak-text)' }}>{t('today.streakChip').replace('{n}', String(currentUser.currentStreak))}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--warm-streak-subtext)', fontWeight: 700 }}>
            {streakDoneToday ? t('dashboard.streakDoneToday') : t('dashboard.keepStreak')}
          </div>
          {data.shields && (
            <ShieldPanel shields={currentUser.streakShields ?? 0} streak={currentUser.currentStreak} coins={currentUser.coins} config={data.shields}
              language={language} onChanged={() => { onRefresh?.(); onCoinsChanged?.(); }} />
          )}
        </div>
      );
      case 'goal': return myGoal && (
        <div className="tq-card tq-card-padded today-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{myGoal.title || t('dashboard.myGoal')}</div>
            {myGoal.completed && <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--health-green)' }}>{t('dashboard.goalCompleted')}</span>}
          </div>
          {(myGoal.goalStartAt || myGoal.goalEndAt) && (
            <div style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 700, marginBottom: 8 }}>
              {(myGoal.goalStartAt ? new Date(myGoal.goalStartAt).toLocaleDateString(localeFor(language)) : '...')} - {(myGoal.goalEndAt ? new Date(myGoal.goalEndAt).toLocaleDateString(localeFor(language)) : '...')}
            </div>
          )}
          <HealthBar value={myGoal.progress} height={8} showLabel={false} />
          {(myGoal.rewardCoins ?? 0) > 0 && (
            <div style={{ fontSize: 12, fontWeight: 800, color: myGoal.completed ? 'var(--health-green)' : 'var(--warm-text-muted)', marginTop: 6 }}>
              {myGoal.completed ? `🎉 +${formatCoins(myGoal.rewardCoins)} ${t('goals.bonusEarned')}` : t('goals.bonusWhenReached').replace('{n}', formatCoins(myGoal.rewardCoins))}
            </div>
          )}
        </div>
      );
      case 'kidsGoals': return (
        <div className="tq-card tq-card-padded today-panel" style={{ display: 'grid', gap: 8 }}>
          {childrenGoals.map((cg) => (
            <div key={cg.id} style={{ paddingBottom: 8, borderBottom: '1px solid var(--warm-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--warm-text-secondary)' }}>
                <span>{cg.displayName}</span>
                <span>{cg.goalCoins ? `${formatCoins(cg.currentCoins ?? cg.coins)}/${formatCoins(cg.goalCoins)}` : t('dashboard.noGoal')}</span>
              </div>
              {cg.goalCoins && <HealthBar value={cg.progress || 0} height={6} showLabel={false} />}
            </div>
          ))}
        </div>
      );
      case 'mascot': return !wide && mascotCard;
      default: return null;
    }
  })();

  /* ── Approvals: one notice for chores and rewards waiting for a parent ── */
  const rewardsWaiting = gamificationEnabled ? pendingRewardRequests : [];
  const waitingTotal = pendingCompletions.length + rewardsWaiting.length;
  const firstWaiting = pendingCompletions[0]
    ? `${pendingCompletions[0].displayName} · ${taskName(pendingCompletions[0].taskName, pendingCompletions[0].translationKey)}`
    : rewardsWaiting[0] ? `${rewardsWaiting[0].displayName} · ${rewardsWaiting[0].title}` : '';
  /* Parents always see it (FIX-34): a calm line when nothing waits, so an empty queue doesn't look like a missing card. */
  const showApprovals = isParent && shows('pendingApprovals');
  const approvals = showApprovals && waitingTotal === 0 ? (
    <section className="today-notice-wrap">
      <div className="today-notice today-notice-calm" role="status">
        <span className="today-notice-icon" aria-hidden="true">✅</span>
        <div><b>{t('today.nothingWaiting')}</b></div>
      </div>
    </section>
  ) : showApprovals && (
    <section className="today-notice-wrap">
      <div className="today-notice">
        <span className="today-notice-icon" aria-hidden="true">✋</span>
        <div>
          <b>{waitingTotal === 1 ? t('today.waitingOne') : t('today.waiting').replace('{n}', String(waitingTotal))}</b>
          <span>{firstWaiting}</span>
        </div>
        <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" onClick={() => setReviewOpen((o) => !o)} aria-expanded={reviewOpen}>
          {reviewOpen ? t('today.hide') : t('today.review')}
        </button>
      </div>
      {reviewOpen && (
        <div className="tq-card tq-card-padded today-panel">
          {pendingCompletions.length > 0 && (
            <PendingApprovals items={pendingCompletions} language={language} gamificationEnabled={gamificationEnabled} extras={data.features?.cheers !== false} onChanged={() => onRefresh?.()} />
          )}
          {rewardsWaiting.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginTop: pendingCompletions.length > 0 ? 12 : 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{t('dashboard.rewardRequestsTitle')}</div>
              {rewardsWaiting.slice(0, 6).map((rr) => (
                <div key={rr.id} style={{ border: '1px solid var(--warm-border)', backgroundColor: 'var(--warm-bg-subtle)', borderRadius: 12, padding: '8px 10px' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>{rr.displayName}</div>
                  <div style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 700, overflowWrap: 'anywhere' }}>{rr.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 700 }}>{timeAgo(rr.redeemedAt)}</span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)' }}><CoinIcon /> {rr.costCoins}</span>
                      <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => onRewardRequestAction(rr.id, 'approved')}>{t('dashboard.approve')}</button>
                      <button className="tq-btn tq-btn-sm" onClick={() => setRejectingReward(rejectingReward === rr.id ? null : rr.id)} aria-expanded={rejectingReward === rr.id}
                        style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger-text, var(--health-red))' }}>{t('dashboard.reject')}</button>
                    </span>
                  </div>
                  {rejectingReward === rr.id && (
                    <RewardRejectNote language={language} name={rr.displayName}
                      onReject={(note) => { setRejectingReward(null); void onRewardRequestAction(rr.id, 'rejected', note); }}
                      onCancel={() => setRejectingReward(null)} />
                  )}
                </div>
              ))}
              {rewardsWaiting.length > 6 && onNavigateToRewards && (
                <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={onNavigateToRewards}>
                  {t('home.seeAllRequests').replace('{n}', String(rewardsWaiting.length))}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );

  /* ── This week's standings ── */
  const sortedFamily = [...family].sort((a, b) => b.points - a.points);
  const periodLabel = leaderboardPeriod === 'month' ? t('leaderboard.thisMonth')
    : leaderboardPeriod === 'quarter' ? t('leaderboard.thisQuarter')
    : leaderboardPeriod === 'year' ? t('leaderboard.thisYear')
    : t('leaderboard.thisWeek');
  const standings = shows('leaderboard') && sortedFamily.length > 0 && (
    <section className="today-section today-week">
      <div className="today-sec">
        <h3>{periodLabel}</h3>
        <button type="button" className="today-link" onClick={() => navigate('/leaderboard')}>{t('nav.board')}</button>
      </div>
      <div className="tq-card today-standings">
        {sortedFamily.map((u, i) => (
          <div key={u.id} className={`today-person${i === 0 && u.points > 0 ? ' first' : ''}`}>
            <span className="today-rank">{i + 1}</span>
            <span className="today-person-pic">
              <UserAvatar userId={u.id} name={u.displayName} color={u.avatarColor} size={wide ? 32 : 40} avatarType={u.avatarType as 'letter' | 'preset' | 'photo' | undefined} avatarPreset={u.avatarPreset} avatarPhotoUrl={u.avatarPhotoUrl} />
              {badges?.[u.id] && (
                <span className="today-person-badge" title={t(`achievements.badge_${badges[u.id]}`)} style={{ background: BADGE_COLORS[badges[u.id]!] || '#888' }}>★</span>
              )}
            </span>
            <span className="today-person-name">{u.displayName}</span>
            <span className="today-person-pts">{wide && <CoinIcon />}{formatCoins(u.points)}<small> {t('leaderboard.points')}</small></span>
          </div>
        ))}
      </div>
    </section>
  );

  /* ── Next up ── */
  const nextCard = nextUp && (
    <section className="tq-card today-next">
      <div className="today-next-head">
        <span>🎯 {t('today.nextUp')}</span>
        {onOpenFocus && <button type="button" className="today-link" onClick={onOpenFocus}>{t('focus.title')}</button>}
      </div>
      <div className="chore-list">{questRow(nextUp, { key: `n-${nextUp.id}`, noTick: true, highlight: missionTask(nextUp) })}</div>
      <div className="today-next-acts">
        {timer?.mustWait(nextUp)
          ? <TimerStartButton task={{ ...nextUp, name: taskName(nextUp.name, nextUp.translationKey) }} language={language} primary className="tq-btn tq-btn-primary today-done" />
          : <button type="button" className="tq-btn tq-btn-primary today-done" onClick={() => doneNext(nextUp)}>✓ {t('today.doneBig')}</button>}
        {line.length > 1 && <button type="button" className="tq-btn tq-btn-secondary" onClick={() => pickAnother(nextUp.id)}>{t('today.pickAnother')}</button>}
      </div>
    </section>
  );

  const canAddTodo = isParent && data.features?.todos !== false;
  const addTodoBtn = !showTodoAdd && (
    <button type="button" className="today-link" onClick={() => { setShowTodoAdd(true); setTodoNotice(''); }}>+ {t('todos.add')}</button>
  );
  const todoAddForm = (
    <>
      {showTodoAdd && (
        <TodoQuickAdd language={language}
          people={(users ?? []).map((u) => ({ id: u.id, displayName: u.displayName }))}
          onCancel={() => setShowTodoAdd(false)}
          onAdded={(name) => { setShowTodoAdd(false); setTodoNotice(t('todos.added').replace('{name}', name)); onRefresh?.(); }} />
      )}
      {todoNotice && <div className="today-added">{todoNotice}</div>}
    </>
  );
  // To-dos: every open one-time chore, overdue first, then by do-by date (the server sorts them)
  const todoRows = todoOn ? filterQuests(data.todoQuests ?? []).map((q) => questRow(q, { key: `td-${q.id}`, highlight: missionTask(q) })) : [];
  const todoBlock = todoOn && (todoRows.length > 0 || canAddTodo) && (
    <section className="today-section today-todos">
      <div className="today-sec">
        <h3>📝 {t('todos.title')}{todoRows.length > 0 && ` · ${todoRows.length}`}</h3>
        {canAddTodo && addTodoBtn}
      </div>
      {todoAddForm}
      {todoRows.length > 0 && (
        <div className="tq-card today-list chore-list">{isExpanded('todo') ? todoRows : todoRows.slice(0, LIMIT)}</div>
      )}
      {showMoreBtn('todo', todoRows.length)}
    </section>
  );
  const tabs = (!filterLocked || (canAddTodo && !todoOn)) && (
    <div className="today-tabs-row">
      {!filterLocked && (
        <div className="today-tabs" role="group" aria-label={t('settings.taskView')}>
          {(['mine', 'all'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={taskFilter === f} className={taskFilter === f ? 'on' : ''} onClick={() => setTaskFilter(f)}>
              {f === 'mine' ? t('dashboard.myTasks') : t('today.everyone')} <i>{leftCount(viewOf(f))}</i>
            </button>
          ))}
        </div>
      )}
      {canAddTodo && !todoOn && addTodoBtn}
    </div>
  );
  const nothingAtAll = !nextUp && overdueRows.length + todayRows.length + doneRows.length + anytimeRows.length === 0;
  const snoozeAllBtn = canSnooze && view.overdue.length > 1 && (
    <button type="button" className="today-link quiet" onClick={() => void snoozeAll(view.overdue)}>💤 {t('today.snoozeAll')}</button>
  );
  const listsBlock = kidMode ? (
    <>
      {section('today', t('today.today'), todayRows)}
      {section('overdue', t('today.catchUp'), overdueRows, { late: true })}
      {section('done', t('today.alreadyDone'), doneRows)}
      {section('anytime', t('today.bonus'), anytimeRows)}
    </>
  ) : (
    <>
      {section('overdue', t('today.overdue'), overdueRows, { late: true, action: snoozeAllBtn })}
      {section('today', t('today.today'), [...todayRows, ...doneRows])}
      {section('anytime', t('today.anytime'), anytimeRows)}
    </>
  );

  const mainBlocks: Record<TodayOrderId, React.ReactNode> = {
    pendingApprovals: !wide && approvals,
    teamups: shows('teamups') && (
      <TeamUpsCard items={data.teamups ?? []} userId={currentUser.id} language={language}
        onDone={(taskId) => onCompleteTask(taskId)} onChanged={() => onRefresh?.()} />
    ),
    focus: nextCard,
    lists: (
      <>
        {tabs}
        {!todoOn && todoAddForm}
        {nothingAtAll && <div className="tq-card tq-card-padded today-empty">{t('focus.nothing')}</div>}
        {listsBlock}
        {laterRows.length > 0 && (
          <>
            <button type="button" className="today-more" onClick={() => setShowLater((s) => !s)} aria-expanded={showLater}>
              {showLater ? t('today.hideScheduled')
                : laterRows.length === 1 ? t('today.showScheduledOne') : t('today.showScheduled').replace('{n}', String(laterRows.length))}
            </button>
            {showLater && section('later', t('dashboard.scheduled'), laterRows)}
          </>
        )}
      </>
    ),
    todo: todoBlock,
    leaderboard: !wide && standings,
  };

  return (
    <>
      {/* Customise: the order of Today's big blocks and which parts this person sees */}
      {showCustomize && (
        <HomeLayoutEditor
          blocks={blockOrder.filter(orderable).map((id) => ({
            id, label: id === 'lists' ? t('today.choreLists') : BLOCK_LABELS[id], visible: id === 'lists' ? undefined : !hiddenSet.has(id),
          }))}
          parts={listedBlocks.filter((id) => !(TODAY_ORDER as readonly string[]).includes(id)).map((id) => ({ id, label: BLOCK_LABELS[id], visible: !hiddenSet.has(id) }))}
          onPlace={(id, target, where) => saveOrder(placeBlock(blockOrder, id as TodayOrderId, target as TodayOrderId, where))}
          onStep={stepBlock}
          onToggle={toggleBlock}
          onReset={() => saveLayout({ order: [], hidden: [] })}
          onClose={() => { setShowCustomize(false); setLayoutError(false); }}
          error={layoutError}
          t={t}
        />
      )}
      {teamPick && (
        <TeamUpDialog task={{ id: teamPick.id, name: taskName(teamPick.name, teamPick.translationKey) }} language={language}
          people={(users ?? []).filter((u) => u.id !== currentUser.id && ((teamPick.effectiveAssignedUserIds ?? []).length === 0 || teamPick.effectiveAssignedUserIds!.includes(u.id)))}
          onClose={() => setTeamPick(null)} onStarted={() => onRefresh?.()} />
      )}
      <div className={`today${wide ? ' wide' : ''}`}>
        <div className="today-main">
          {/* The summary: done of everything due today, what's left, and the level (or a kid's goal) */}
          <section className="today-summary">
            <div className="today-summary-top">
              <DoneRing done={doneCount} total={left + doneCount} ofLabel={ofLabel} />
              <div className="today-summary-text">
                <h2>{headline}</h2>
                {sub && <p>{sub}</p>}
                {showLevel && (
                  <div className="today-level">
                    <LevelStrip level={myLevel} nextBadge={nextBadge} language={language} userId={currentUser.id} nextUnlock={data.nextUnlock} />
                  </div>
                )}
                {goalBar}
              </div>
            </div>
            {mascotLine}
          </section>
          {panel === 'mascot' && panelBody}
          {chips.length > 0 && <div className="today-chips">{chips}</div>}
          {panel !== 'mascot' && panelBody}
          {/* A one-time prompt that removes itself, so not a part Customise can hide (ENH-31) */}
          {notifyCard}
          {/* The big blocks, in this person's order (Customise) */}
          {blockOrder.map((id) => <React.Fragment key={id}>{mainBlocks[id]}</React.Fragment>)}
          {/* Always here, so a hidden part can come back */}
          <div className="today-customise">
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setShowCustomize(true)}>⚙ {t('dashboard.customise')}</button>
          </div>
        </div>
        {wide && (
          <aside className="today-side">
            {approvals}
            {mascotCard}
            {shows('houseHealth') && (
              <section className="tq-card tq-card-padded today-health">
                <h3>{t('dashboard.houseHealth')}</h3>
                {healthBody}
              </section>
            )}
            {standings}
          </aside>
        )}
      </div>
      {proofQuest && (
        <ProofModal
          taskTitle={taskName(proofQuest.name, proofQuest.translationKey)}
          language={language}
          photos={proofPhotos}
          onClose={() => setProofQuest(null)}
          onSubmit={async (proof) => { onCompleteTask(proofQuest.id, proof); setProofQuest(null); }}
        />
      )}
      {adminModalQuest && (
        <AdminCompleteModal
          task={adminModalQuest}
          allUsers={(users || []) as any[]}
          language={language}
          onConfirm={async (userIds) => {
            try {
              for (const uid of userIds) {
                await api.completeTask(adminModalQuest.id, uid);
              }
            } catch (e) {
              // The box stays open and says why (BUG-38); earlier people on the list may have gone through
              onRefresh?.();
              throw e;
            }
            setAdminModalQuest(null);
            onRefresh?.();
          }}
          onClose={() => setAdminModalQuest(null)}
        />
      )}
      {openBoost && (
        <BoostDetails boost={openBoost} rooms={allRooms} userId={currentUser.id} role={currentUser.role} coinsByEffort={coinsByEffort}
          multiplierFor={multiplierFor} language={language} onClose={() => setOpenBoostId(null)}
          onOpenTask={(roomId, taskId) => (onOpenTask ? onOpenTask(roomId, taskId) : onNavigateToRoom(roomId))} onOpenRoom={onNavigateToRoom} />
      )}
      <UndoToast undo={snoozeUndo} language={language} onClose={closeSnoozeUndo} onRestored={() => onRefresh?.()} />
    </>
  );
};
export default Dashboard;
