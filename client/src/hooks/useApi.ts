import type { Outfit } from '../components/mascot/MascotCard';
import type { HostedAccount } from '../utils/hosted';
import { AVATAR_PHOTO, PROOF_PHOTO, shrinkPhoto } from '../utils/photos';
import { pushOwner, setPushOwner, unsubscribeBrowser } from '../utils/push';
import type { User } from './useAuth';
const API_BASE = '/api';

/** What the hosted sign-up page needs before it's filled in. signupsOpen false: it's the waitlist form (NEW-30). */
/** GET /api/setup: the wizard's starter lists (server/src/setup/starter.ts) and what the family already has */
export type SetupAge = '3-5' | '6-8' | '9-12' | '13+';
export type SetupRoomId = 'kitchen' | 'bathroom' | 'living' | 'laundry' | 'bedroom' | 'yard' | 'pets' | 'garage' | 'office';
export interface SetupChoreDef {
  id: string; name: string; room: 'own' | 'quests' | SetupRoomId; frequencyDays: number; effort: number;
  ages: SetupAge[]; adults?: boolean; ticked: boolean; timerMinutes?: number; perWeek?: number;
}
export interface SetupRewardDef { id: string; weeks: number; ages: Array<SetupAge | 'adult'>; ticked: boolean; presetTitle?: string }
export interface SetupCatalog {
  needed: boolean;
  coinsByEffort: Record<number, number>;
  ageGroups: SetupAge[];
  rooms: Array<{ id: SetupRoomId; type: string; ticked: boolean; color: string; accent: string }>;
  chores: SetupChoreDef[];
  rewards: SetupRewardDef[];
  cashAmounts: number[];
  family: {
    people: Array<{ id: number; displayName: string; role: string; isParticipant: number; canLogIn: number; avatarColor: string }>;
    rooms: Array<{ id: number; name: string; roomType: string; assignedUserId: number | null }>;
    presetRewards: string[];
  };
}

export interface HostedConfig {
  turnstileSiteKey: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  signupsOpen: boolean;
}

export interface RewardPot {
  saved: number;
  target: number;
  remaining: number;
  contributors: Array<{ userId: number; displayName: string; amount: number }>;
  awaitingApproval: boolean;
}

export interface RewardAvailability {
  limit: number;
  period: 'ever' | 'day' | 'week' | 'month';
  scope: 'person' | 'everyone';
  used: number;
  remaining: number;
  resetsAt: string | null;
}

export interface RewardRules {
  visibleTo: number[];
  prices: Record<number, number>;
  limitCount: number | null;
  limitPeriod: 'ever' | 'day' | 'week' | 'month';
  limitScope: 'person' | 'everyone';
  availableFrom: string | null;
  availableUntil: string | null;
  isRotating: boolean;
  isShared: boolean;
  pot: RewardPot | null;
}

export interface RewardRulesInput {
  visibleTo?: number[];
  prices?: Record<number, number | null>;
  limit?: { count: number; period: string; scope: string } | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  isRotating?: boolean;
  isShared?: boolean;
}

export interface CoinBoost {
  id: number;
  title: string;
  multiplier: number;
  startAt: string;
  endAt: string;
  /** Nothing picked (both null) = every chore; otherwise chores in these rooms plus these chores */
  roomIds: number[] | null;
  taskIds: number[] | null;
  /** The picked chores' names (Home's banner) */
  taskNames?: string[];
}

/** Insights (parents): rows are [bucket, userId, taskId, chores, coins, effort] */
export type InsightsPeriod = 'day' | 'week' | 'month' | 'year';
/** A fixed period, or a From–To range */
export type InsightsRange = InsightsPeriod | 'custom';
/** What one bar covers */
export type InsightsGrain = 'hour' | 'day' | 'week' | 'month';
export interface InsightsPerson { id: number; name: string; color: string }
export interface InsightsBars {
  period: InsightsRange; grain: InsightsGrain; start: string; end: string; buckets: string[]; earliest: string | null;
  people: InsightsPerson[];
  rooms: Array<{ id: number; name: string; roomType: string }>;
  tasks: Array<{ id: number; name: string; roomId: number; translationKey: string | null }>;
  rows: Array<[number, number, number, number, number, number]>;
  /** Last period per person: [userId, chores, coins, effort] */
  previous: Array<[number, number, number, number]>;
  /** The period is still running, so `previous` stops at the same point (this time last week) */
  previousSoFar: boolean;
}
/** Skipped and late chores for a period (see server utils/insights.ts skippedChores) */
export interface InsightsSkipped {
  period: InsightsRange; start: string; end: string;
  /** First day "left overdue" was recorded ('YYYY-MM-DD'), or null before the first night */
  snapshotSince: string | null;
  rooms: Array<{ id: number; name: string; roomType: string }>;
  tasks: Array<{ id: number; name: string; translationKey: string | null; roomId: number; pool: boolean; assignees: number[] }>;
  /** [taskId, userId, times done, times late, days late added up, most days late] */
  late: Array<[number, number, number, number, number, number]>;
  /** [taskId, days left overdue, most days overdue] */
  undone: Array<[number, number, number]>;
  /** Open pools: [taskId, times done, hours waited added up, longest wait in hours] */
  waits: Array<[number, number, number, number]>;
  /** Open pools overdue right now: [taskId, hours since due] */
  waitingNow: Array<[number, number]>;
}
export type CoinCategory = 'chores' | 'bonus' | 'rewards' | 'chipins' | 'mascot' | 'shields' | 'adjust';
/** Coins in and out per person and week (server utils/insights.ts coinsByWeek) */
export interface InsightsCoins {
  weeks: 8 | 26; starts: string[]; end: string;
  /** Net coins since the last week ended [userId, net] (balances are worked back from today's) */
  afterNet: Array<[number, number]>;
  people: Array<InsightsPerson & { balance: number }>;
  /** [week, userId, category, coins]; coins are positive both ways */
  flows: Array<[number, number, CoinCategory, number]>;
  /** Repeating weekly goals: [week, userId, goal coins] */
  goals: Array<[number, number, number]>;
  /** Every reward, deleted ones too (deleted = 1) so their purchases keep a name */
  rewards: Array<{ id: number; title: string; costCoins: number; isActive: number; deleted: number }>;
  /** [rewardId, userId, redemptionId, coins, redeemedAt (ISO), waiting (1 = not handed over yet), boughtBy (the parent
   *  who bought it for them, 0 = nobody; ENH-16)]; a shared pot has one row per person who chipped in */
  bought: Array<[number, number, number, number, string, number, number?]>;
}
/** rows are [weekday (0 = Mon), slot, userId, chores, coins, effort] */
/** rows: [weekday (0 = the week's first day, weekStart like getDay()), slot, userId, chores, coins, effort] */
export interface InsightsHeatmap { weeks: 4 | 12; weekStart: number; start: string; end: string; people: InsightsPerson[]; rows: Array<[number, number, number, number, number, number]> }

export interface TrashItem {
  id: number;
  kind: 'task' | 'reward';
  itemId: number;
  title: string;
  roomId: number | null;
  roomName: string | null;
  roomExists?: boolean;
  deletedAt: string;
  deletedByName: string | null;
  historyCount: number;
}

export type CsvKind = 'tasks' | 'rewards';

export interface CsvImportRow {
  line: number;
  action: 'add' | 'update' | 'unchanged' | 'error';
  room?: string;
  task?: string;
  title?: string;
  newRoom?: boolean;
  changes: Array<{ field: string; from: string; to: string }>;
  error?: { code: string; message: string; field?: string; value?: string };
}

export interface CsvImportResult {
  dryRun: boolean;
  applied: boolean;
  rows: CsvImportRow[];
  summary: { add: number; update: number; unchanged: number; error: number };
  roomsToCreate?: string[];
  unknownColumns: string[];
}

/** Fields the Tasks page can change for many tasks at once */
export interface TaskBatchChanges {
  assignedUserIds?: number[];
  assignmentMode?: 'first' | 'shared' | 'custom' | 'rotating';
  customCoins?: number | null;
  showInDashboard?: boolean;
  onDemand?: boolean;
  roomId?: number;
  allowEarlyCompletion?: boolean;
  effort?: number;
  frequencyDays?: number;
}

/** Optional extras (Settings → Features) */
/** One thing at a time per person: null = the default (a button for kids, off for others) */
export type FocusModeSetting = 'off' | 'button' | 'home' | null;

export interface FeatureFlags {
  rescue: boolean;
  usual: boolean;
  forgot: boolean;
  todos: boolean;
  boardAwards: boolean;
  levels: boolean;
  nextBadge: boolean;
  seasonal: boolean;
  cheers: boolean;
  mascot: boolean;
  teamups: boolean;
  mascotShop: boolean;
  focus: boolean;
  shields: boolean;
  proofPhotos: boolean;
  webPush: boolean;
  /** "What's new" slides after a big update (NEW-38) */
  whatsNew: boolean;
}

/** Team-ups on a chore in a list: can you start one, and has a team claimed it today? */
export interface TeamUpInfo { canStart: boolean; teamId: number | null; claimedBy: string[] | null }
/** Home's Team-ups card: a team-up you're on or could join */
export interface TeamupItem {
  id: number; taskId: number; taskName: string; roomId: number; roomName: string; createdBy: number; invitedUserId: number | null;
  members: Array<{ id: number; displayName: string; helper: boolean }>; mine: boolean; canJoin: boolean; share: number | null;
}

/** Unlockables: what levels have unlocked for you and what you picked */
export interface UnlocksView {
  level: number;
  items: Array<{ level: number; kind: 'frame' | 'theme' | 'celebration' | 'title'; id: string; unlocked: boolean }>;
  badgeFrames: Array<{ id: string; titleKey: string; icon: string; unlocked: boolean }>;
  titles: Array<{ id: string; titleKey?: string; text?: string }>;
  titleLevel: number;
  chosen: { frame: string | null; celebration: string; title: string | null; theme: string | null };
  next: { level: number; kind: string; id: string } | null;
}

/** Cheers on one finished chore (counts in 👏 🎉 💪 ⭐ order, and the viewer's own) */
export interface CheerSummary { counts: Array<{ emoji: string; count: number; names: string[] }>; mine: string | null }

export type Look = 'fresh' | 'quest' | 'calm';
export interface FeaturesView { features: FeatureFlags; rescueMultiplier: number; holidaysOff: string[]; look?: Look; mascot: { creature: string; name: string; bedtimeFrom: string; bedtimeTo: string }; teamBonus: number; shieldPrice?: number;
  /** Every creature: the active one, resting ones (with their name and stage) and new eggs */
  mascotRoster?: Array<{ creature: string; status: 'active' | 'resting' | 'new'; name: string; stage: string }> }

export type NotifyKind = 'taskDue' | 'rewardRequest' | 'achievementUnlocked' | 'choreApproval' | 'coinBoost' | 'rescue' | 'outcome' | 'summary' | 'nudge' | 'reminder' | 'cheer' | 'teamup' | 'openChores';

export interface NotifySettings {
  morningTime: string;
  eveningTime: string;
  recapDay: number;
  recapTime: string;
  quietStart: string;
  quietEnd: string;
  schoolHoursEnabled: boolean;
  schoolStart: string;
  schoolEnd: string;
  haUrl: string;
  hasHaToken: boolean;
  haFamilyService: string;
}

export interface NotifyPerson {
  id: number;
  displayName: string;
  role: string;
  language: string;
  ntfyTopic: string;
  telegramChatId: string;
  haNotifyService: string;
  prefs: Record<NotifyKind, boolean>;
  /** Their own channels that are set up */
  channels: string[];
  /** false: a parent switched off their login, so nothing is sent to them (ENH-16) */
  canLogIn?: boolean;
  /** Phones and computers where they turned on web push (NEW-5) */
  devices: PushDeviceInfo[];
  /** A family channel is on: without one (and none of their own) they get nothing (ENH-31) */
  familyChannel?: boolean;
}

export interface PushDeviceInfo { id: number; label: string; createdAt: string; lastOkAt: string | null }

export interface CustomBadge {
  id: number;
  title: string;
  description: string | null;
  icon: string;
  metric: 'task_count' | 'room_count' | 'task_weeks' | 'goal_weeks' | 'completions' | 'streak' | 'coins_earned';
  taskIds: number[];
  roomId: number | null;
  threshold: number;
  bonusCoins: number;
  userIds: number[] | null;
  secret: boolean;
}
export type CustomBadgeInput = Omit<CustomBadge, 'id'>;

export type BoardPeriod = 'week' | 'lastWeek' | 'month' | 'quarter' | 'year';
export type BoardMode = 'coins' | 'goal' | 'improved';

export interface BoardPerson {
  id: number;
  displayName: string;
  avatarColor: string;
  avatarType: string | null;
  avatarPreset: string | null;
  avatarPhotoUrl: string | null;
  coins: number;
  currentStreak: number;
  /** Coins earned in the period */
  points: number;
  chores: number;
  /** Coins in the same stretch of the period before */
  comparePoints: number;
  improvement: number;
  goalTarget: number | null;
  goalPct: number | null;
  /** What the ranking uses in this mode (null: no goal) */
  score: number | null;
  rank: number;
  prevRank: number | null;
  /** Places gained (+) or lost (−) since the period before */
  movement: number;
}

export interface BoardData {
  period: BoardPeriod;
  mode: BoardMode;
  range: { startAt: string; endAt: string };
  people: BoardPerson[];
  /** Off in Settings → Features: no awards or trophy shelf */
  awardsEnabled?: boolean;
  awards: Array<{ key: 'earlyBird' | 'bountyHunter' | 'allRounder' | 'room'; userIds: number[]; value: number; roomId?: number; roomName?: string }>;
  familyGoal: { target: number; prize: string; total: number; reached: boolean } | null;
  trophies: { weeks: Array<{ weekStart: string; userIds: number[]; coins: number }>; wins: Record<number, number> };
}

/** Self-hosted: username. Hosted: a parent's email, or the family code and username. */
export type LoginDetails = { password: string; username?: string; email?: string; familyCode?: string };

/**
 * Drops the photos cookie (NEW-29) when this device signs out. keepalive lets it finish while the page moves on
 * to the login screen; a failure only leaves a cookie that stops working with the login anyway.
 */
export function forgetPhotos(): void {
  fetch(`${API_BASE}/auth/logout`, { method: 'POST', keepalive: true }).catch(() => {});
}

/**
 * Stops web push on this device when it signs out (NEW-5): the server forgets the device and the browser drops
 * its subscription, so whoever signs in next here doesn't get this person's notifications. Call it while the
 * token is still saved.
 */
export function forgetPush(): void {
  const owner = pushOwner();
  const token = getToken();
  if (owner && token) {
    fetch(`${API_BASE}/notify/push/devices/forget`, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: owner.endpoint }),
    }).catch(() => {});
  }
  setPushOwner(null);
  void unsubscribeBrowser();
}

/** Fired when this device gets a fresh login (a new password, "Log out everywhere else"): push signs up again. */
export const NEW_TOKEN_EVENT = 'tidyquest-new-token';
function saveNewToken(token: string): void {
  localStorage.setItem('tidyquest_token', token);
  window.dispatchEvent(new Event(NEW_TOKEN_EVENT));
}

function getToken(): string | null {
  return localStorage.getItem('tidyquest_token');
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // A signed-in request that's turned away means the login ended. Without a token (logging in, the
  // sign-up and email-link pages) the page shows the error itself.
  if (res.status === 401 && token) {
    forgetPush();
    localStorage.removeItem('tidyquest_token');
    forgetPhotos();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error(errorBody.error || 'Request failed') as any;
    err.body = errorBody;
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/** A failed upload's error, with the server's answer (its code and limit) as err.body. */
async function uploadError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => ({ error: 'Upload failed' }));
  return Object.assign(new Error(body.error || 'Upload failed'), { body });
}

export const api = {
  // Auth
  register: (data: { username: string; password: string; displayName: string; avatarColor?: string; language?: string; timeZone?: string }) =>
    apiFetch<{ token: string; user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: LoginDetails) =>
    apiFetch<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  // Hosted mode (tidyquest.org)
  hostedConfig: () => apiFetch<HostedConfig>('/hosted/config'),
  signUp: (data: { familyName: string; parentName: string; email: string; password: string; timeZone: string; language: string; captchaToken?: string; acceptTerms?: boolean; news?: boolean }) =>
    apiFetch<{ token: string; user: User }>('/hosted/signup', { method: 'POST', body: JSON.stringify(data) }),
  joinWaitlist: (data: { familyName: string; parentName: string; email: string; note: string; language: string; captchaToken?: string }) =>
    apiFetch<{ ok: boolean }>('/hosted/waitlist', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: (email: string) =>
    apiFetch<{ ok: boolean }>('/hosted/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    apiFetch<{ token: string; user: User }>('/hosted/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  confirmEmail: (token: string) =>
    apiFetch<{ ok: boolean; email: string }>('/hosted/confirm-email', { method: 'POST', body: JSON.stringify({ token }) }),
  hostedAccount: () => apiFetch<HostedAccount>('/hosted/account'),
  resendConfirmation: () => apiFetch<{ ok: boolean; email: string }>('/hosted/resend-confirmation', { method: 'POST' }),
  changeEmail: (email: string, password: string) =>
    apiFetch<{ ok: boolean; email: string }>('/hosted/change-email', { method: 'POST', body: JSON.stringify({ email, password }) }),
  newFamilyCode: () => apiFetch<{ familyCode: string; familyLink: string }>('/hosted/family-code', { method: 'POST' }),
  // NEW-34: agreeing to the terms, news emails; NEW-25: deleting the family
  agreeToTerms: () => apiFetch<{ ok: boolean }>('/hosted/agree', { method: 'POST' }),
  setNews: (on: boolean) => apiFetch<{ ok: boolean; news: boolean }>('/hosted/news', { method: 'POST', body: JSON.stringify({ on }) }),
  unsubscribe: (e: string, s: string) => apiFetch<{ ok: boolean }>('/hosted/unsubscribe', { method: 'POST', body: JSON.stringify({ e, s }) }),
  deleteFamily: (name: string, password: string) =>
    apiFetch<{ ok: boolean }>('/hosted/delete-family', { method: 'POST', body: JSON.stringify({ name, password }) }),
  me: async () => {
    const sent = getToken();
    const { renewedToken, ...user } = await apiFetch<any>('/auth/me');
    // A login over a day old comes back renewed for another 30 days (BUG-47). Not when this device signed out
    // or in again while the answer was on its way.
    if (renewedToken && sent && getToken() === sent) localStorage.setItem('tidyquest_token', renewedToken);
    return user;
  },

  // Dashboard
  dashboard: () => apiFetch<any>('/dashboard'),
  /** Moves whenever the family's data changes (ENH-20) */
  dataChanges: () => apiFetch<{ v: string }>('/dashboard/changes'),

  // Rooms
  getRooms: () => apiFetch<any[]>('/rooms'),
  getZones: () => apiFetch<any[]>('/zones'),
  createZone: (name: string) => apiFetch<any>('/zones', { method: 'POST', body: JSON.stringify({ name }) }),
  updateZone: (id: number, data: { name?: string; sortOrder?: number }) =>
    apiFetch<any>(`/zones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteZone: (id: number) => apiFetch<any>(`/zones/${id}`, { method: 'DELETE' }),
  // The setup wizard (NEW-17): starter lists and what the family has, the one save, and "Not now"
  getSetup: () => apiFetch<SetupCatalog>('/setup'),
  saveSetup: (data: unknown) =>
    apiFetch<{ people: number; rooms: number; chores: number; rewards: number; goals: number; removedRewards: number }>('/setup', { method: 'POST', body: JSON.stringify(data) }),
  skipSetup: () => apiFetch<{ success: boolean }>('/setup/skip', { method: 'POST' }),
  // "What's new" seen or skipped (NEW-38); no ids marks every one
  whatsNewSeen: (ids?: string[]) => apiFetch<{ success: boolean }>('/whats-new/seen', { method: 'POST', body: JSON.stringify({ ids }) }),
  getDefaultTasks: (roomType: string) =>
    apiFetch<Array<{ name: string; frequencyDays: number; effort: number; isSeasonal?: boolean }>>(`/rooms/defaults/${roomType}`),
  createRoom: (data: { name: string; roomType: string; color?: string; accentColor?: string; tasks?: any[]; assignedUserId?: number | null }) =>
    apiFetch<any>('/rooms', { method: 'POST', body: JSON.stringify(data) }),
  updateRoom: (id: number, data: any) =>
    apiFetch<any>(`/rooms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRoom: (id: number) =>
    apiFetch<any>(`/rooms/${id}`, { method: 'DELETE' }),
  /** Copy a room with its tasks; ownerUserId left out keeps the owner, null clears it */
  duplicateRoom: (id: number, data: { name: string; ownerUserId?: number | null }) =>
    apiFetch<{ id: number; name: string }>(`/rooms/${id}/duplicate`, { method: 'POST', body: JSON.stringify(data) }),

  // Tasks
  getTasks: (roomId: number) => apiFetch<any[]>(`/rooms/${roomId}/tasks`),
  createTask: (roomId: number, data: { name: string; notes?: string; frequencyDays?: number; effort?: number; isSeasonal?: boolean; health?: number; iconKey?: string; translationKey?: string; onDemand?: boolean; showInDashboard?: boolean; assignedToChildren?: boolean; assignedUserIds?: number[]; assignmentMode?: 'first' | 'shared' | 'custom' | 'rotating'; assignedUserPercentages?: Record<number, number>; customCoins?: number | null; allowEarlyCompletion?: boolean; repeatLimit?: number | null; repeatPeriod?: 'day' | 'week' }) =>
    apiFetch<any>(`/rooms/${roomId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: number, data: any) =>
    apiFetch<any>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id: number) =>
    apiFetch<{ success: boolean; trashId: number | null }>(`/tasks/${id}`, { method: 'DELETE' }),
  batchUpdateTasks: (ids: number[], changes: TaskBatchChanges) =>
    apiFetch<{ updated: number }>('/tasks/batch', { method: 'POST', body: JSON.stringify({ ids, changes }) }),
  batchDeleteTasks: (ids: number[]) =>
    apiFetch<{ deleted: number; trashIds: number[] }>('/tasks/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  duplicateTask: (id: number) =>
    apiFetch<any>(`/tasks/${id}/duplicate`, { method: 'POST' }),
  resetTask: (id: number) =>
    apiFetch<{ success: boolean; completionsRemoved: number; coinsDeducted: number; lastCompletedAt: string }>(`/tasks/${id}/reset`, { method: 'POST' }),
  /** doneOn: "Done earlier…" for a past day ('YYYY-MM-DD', up to 7 days back) */
  completeTask: (id: number, onBehalfOfUserId?: number, extra: { note?: string; doneOn?: string } = {}) =>
    apiFetch<{ coinsEarned: number; health: number; pendingApproval?: boolean; newAchievements?: string[]; newAchievementInfo?: Array<{ id: string; titleKey: string | null; title: string | null; icon: string }>; completionId?: number; late?: boolean }>(`/tasks/${id}/complete`, {
      method: 'POST', body: JSON.stringify({ ...(onBehalfOfUserId ? { onBehalfOfUserId } : {}), ...extra }),
    }),
  approveCompletionsBatch: (ids: number[]) =>
    apiFetch<{ approved: number[]; skipped: Array<{ id: number; error: string }> }>('/completions/approve-batch', { method: 'POST', body: JSON.stringify({ ids }) }),
  rejectCompletionsBatch: (ids: number[], reason?: string) =>
    apiFetch<{ rejected: number[]; skipped: Array<{ id: number; error: string }> }>('/completions/reject-batch', { method: 'POST', body: JSON.stringify({ ids, reason }) }),
  uploadCompletionPhoto: async (completionId: number, file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('photo', await shrinkPhoto(file, PROOF_PHOTO));
    const res = await fetch(`${API_BASE}/completions/${completionId}/photo`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw await uploadError(res);
    return res.json() as Promise<{ photoUrl: string }>;
  },
  getOverdueTasks: () =>
    apiFetch<any[]>('/tasks/overdue'),

  // Leaderboard
  leaderboard: (period: 'week' | 'month' | 'quarter' | 'year') => apiFetch<any[]>(`/leaderboard?period=${period}`),
  getFeatures: () => apiFetch<FeaturesView>('/features'),
  updateFeatures: (data: { features?: Partial<FeatureFlags>; rescueMultiplier?: number; holidaysOff?: string[]; look?: Look; mascot?: { creature?: string; name?: string; bedtimeFrom?: string; bedtimeTo?: string }; teamBonus?: number; shieldPrice?: number }) =>
    apiFetch<FeaturesView>('/features', { method: 'PUT', body: JSON.stringify(data) }),
  // Today's Rescue Mission (parents): another one, a chosen chore, or none today
  // Streak shields: buy one with your coins, or a parent gives one
  buyShield: () => apiFetch<{ shields: number; coins: number }>('/shields/buy', { method: 'POST' }),
  giveShield: (userId: number) => apiFetch<{ shields: number; coins: number }>('/shields/give', { method: 'POST', body: JSON.stringify({ userId }) }),
  rescueReroll: () => apiFetch<unknown>('/rescue/reroll', { method: 'POST' }),
  rescueChoose: (taskId: number) => apiFetch<unknown>('/rescue', { method: 'PUT', body: JSON.stringify({ taskId }) }),
  rescueSkip: () => apiFetch<unknown>('/rescue', { method: 'DELETE' }),
  // Home: pin to "Your usual", snooze in "Maybe you forgot" (for yourself)
  pinTask: (id: number) => apiFetch<{ pinned: boolean }>(`/tasks/${id}/pin`, { method: 'POST' }),
  unpinTask: (id: number) => apiFetch<{ pinned: boolean }>(`/tasks/${id}/pin`, { method: 'DELETE' }),
  snoozeTask: (id: number, days = 3) => apiFetch<{ snoozedUntil: string }>(`/tasks/${id}/snooze`, { method: 'POST', body: JSON.stringify({ days }) }),
  unsnoozeTask: (id: number) => apiFetch<{ success: boolean }>(`/tasks/${id}/snooze`, { method: 'DELETE' }),
  // ENH-1: parents pause a chore (until = 'YYYY-MM-DD' switches it back on that day) or switch it back on
  pauseTask: (id: number, until?: string | null) => apiFetch<{ pausedAt: string; pausedUntil: string | null }>(`/tasks/${id}/pause`, { method: 'POST', body: JSON.stringify({ until: until || null }) }),
  resumeTask: (id: number) => apiFetch<{ pausedAt: null }>(`/tasks/${id}/pause`, { method: 'DELETE' }),
  // "+ To-do" on Home (one-time chores, parents)
  createTodo: (data: { name: string; assignedUserIds?: number[]; doBy?: string | null; customCoins?: number | null; roomId?: number }) =>
    apiFetch<{ id: number; roomId: number }>('/todos', { method: 'POST', body: JSON.stringify(data) }),
  // Notifications to people (Settings → Notifications)
  getNotifySettings: () => apiFetch<NotifySettings>('/notify/settings'),
  updateNotifySettings: (data: Partial<NotifySettings> & { haToken?: string }) => apiFetch<NotifySettings>('/notify/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getNotifyPeople: () => apiFetch<NotifyPerson[]>('/notify/people'),
  getNotifyPerson: (id: number) => apiFetch<NotifyPerson>(`/notify/people/${id}`),
  updateNotifyPerson: (id: number, data: { ntfyTopic?: string; telegramChatId?: string; haNotifyService?: string; prefs?: Partial<Record<NotifyKind, boolean>> }) =>
    apiFetch<NotifyPerson>(`/notify/people/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  testNotifyPerson: (id: number) => apiFetch<{ results: Array<{ channel: string; ok: boolean; error?: string }> }>(`/notify/people/${id}/test`, { method: 'POST' }),
  // Web push on this device (NEW-5, utils/pushSync.ts)
  // The "turn on notifications" card on Today (ENH-31): Turn on worked, or Not now
  notifyCard: (answer: 'done' | 'snooze') => apiFetch<{ success: boolean }>('/notify/card', { method: 'POST', body: JSON.stringify({ answer }) }),
  pushInfo: () => apiFetch<{ publicKey: string; on: boolean; notificationsOn: boolean }>('/notify/push'),
  pushSignUp: (body: { endpoint: string; keys: { p256dh: string; auth: string }; label: string }) =>
    apiFetch<{ id: number }>('/notify/push/devices', { method: 'POST', body: JSON.stringify(body) }),
  pushForget: (endpoint: string) => apiFetch<{ success: boolean }>('/notify/push/devices/forget', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  removePushDevice: (userId: number, deviceId: number) => apiFetch<NotifyPerson>(`/notify/people/${userId}/devices/${deviceId}`, { method: 'DELETE' }),
  getNotifyLog: () => apiFetch<Array<{ id: number; sentAt: string; userId: number | null; displayName: string | null; channel: string; kind: string; message: string; ok: number; error: string | null }>>('/notify/log'),
  // Badges parents make (Settings → Badges)
  getCustomBadges: () => apiFetch<{ badges: Array<CustomBadge & { earnedBy: number }>; builtinBonusCoins: number }>('/achievements/custom'),
  createCustomBadge: (data: CustomBadgeInput) => apiFetch<CustomBadge>('/achievements/custom', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomBadge: (id: number, data: CustomBadgeInput) => apiFetch<CustomBadge>(`/achievements/custom/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomBadge: (id: number) => apiFetch<{ success: boolean }>(`/achievements/custom/${id}`, { method: 'DELETE' }),
  setBadgeConfig: (builtinBonusCoins: number) => apiFetch<{ builtinBonusCoins: number }>('/achievements/config', { method: 'PUT', body: JSON.stringify({ builtinBonusCoins }) }),
  getBoard: (period: BoardPeriod, mode: BoardMode) => apiFetch<BoardData>(`/leaderboard/board?period=${period}&mode=${mode}`),
  getFamilyGoal: () => apiFetch<{ target: number; prize: string; progress: { total: number; target: number } | null }>('/leaderboard/family-goal'),
  setFamilyGoal: (target: number, prize: string) =>
    apiFetch<{ target: number; prize: string; progress: { total: number; target: number } | null }>('/leaderboard/family-goal', { method: 'PUT', body: JSON.stringify({ target, prize }) }),

  // History
  history: (limit = 20, offset = 0, filters: { userId?: number; roomId?: number; from?: string; to?: string; q?: string } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return apiFetch<any>(`/history?${params}`);
  },

  // Users
  getUsers: () => apiFetch<any[]>('/users'),
  /** canLogIn: false adds someone who doesn't log in (ENH-16): no username or password */
  createUser: (data: { username?: string; password?: string; displayName: string; avatarColor?: string; language?: string; role?: 'admin' | 'member' | 'child'; canLogIn?: boolean }) =>
    apiFetch<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
  /** "Can log in" (ENH-16): off signs them out everywhere; on needs a new password */
  setUserLogin: (userId: number, data: { canLogIn: boolean; password?: string }) =>
    apiFetch<{ id: number; canLogIn: number }>(`/users/${userId}/login`, { method: 'PUT', body: JSON.stringify(data) }),
  updateSettings: (userId: number, data: { language?: string; isVacationMode?: boolean }) =>
    apiFetch<any>(`/users/${userId}/settings`, { method: 'PUT', body: JSON.stringify(data) }),
  updateProfile: (userId: number, data: { displayName?: string; avatarType?: string; avatarColor?: string; avatarPreset?: string | null; language?: string; birthday?: string | null; theme?: string | null; holidayColors?: boolean; homeLayout?: { order: string[]; hidden: string[] } | null }) =>
    apiFetch<any>(`/users/${userId}/profile`, { method: 'PUT', body: JSON.stringify(data) }),
  updatePassword: async (userId: number, data: { currentPassword?: string; newPassword: string }) => {
    const res = await apiFetch<{ success: boolean; token?: string }>(`/users/${userId}/password`, { method: 'PUT', body: JSON.stringify(data) });
    // A new password signs you out everywhere; your own change comes with a fresh login for this device (NEW-8)
    if (res.token) saveNewToken(res.token);
    return res;
  },
  /** Signs this person out on every other device; this one stays signed in */
  logoutOthers: async () => {
    const { token } = await apiFetch<{ token: string }>('/auth/logout-others', { method: 'POST' });
    saveNewToken(token);
  },
  /** A parent signs someone out on every device */
  logoutAllDevices: (userId: number) =>
    apiFetch<{ success: boolean }>(`/users/${userId}/logout-all`, { method: 'POST' }),
  updateUserRole: (userId: number, role: 'admin' | 'member' | 'child') =>
    apiFetch<any>(`/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  updateUserGoal: (userId: number, data: { goalCoins: number | null; goalStartAt?: string | null; goalEndAt?: string | null }) =>
    apiFetch<any>(`/users/${userId}/goal`, { method: 'PUT', body: JSON.stringify(data) }),
  getUserGoals: (userId: number) =>
    apiFetch<Array<{ id: number; userId: number; title: string; goalCoins: number; startAt?: string | null; endAt?: string | null; createdAt: string; rewardCoins?: number; repeatWeekly?: number; status?: string }>>(`/users/${userId}/goals`),
  createUserGoal: (userId: number, data: { title: string; goalCoins: number; startAt?: string | null; endAt?: string | null; rewardCoins?: number; repeatWeekly?: boolean }) =>
    apiFetch<any>(`/users/${userId}/goals`, { method: 'POST', body: JSON.stringify(data) }),
  updateGoal: (goalId: number, data: { title: string; goalCoins: number; startAt?: string | null; endAt?: string | null; rewardCoins?: number; repeatWeekly?: boolean }) =>
    apiFetch<any>(`/users/goals/${goalId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGoal: (goalId: number) =>
    apiFetch<{ success: boolean }>(`/users/goals/${goalId}`, { method: 'DELETE' }),
  deleteUser: (userId: number) =>
    apiFetch<{ success: boolean }>(`/users/${userId}`, { method: 'DELETE' }),
  getCoinsConfig: () => apiFetch<{ coinsByEffort: Record<number, number> }>('/users/coins-config'),
  updateCoinsConfig: (data: { coinsByEffort?: Record<number, number>; useDefault?: boolean }) =>
    apiFetch<{ coinsByEffort: Record<number, number> }>('/users/coins-config', { method: 'PUT', body: JSON.stringify(data) }),
  uploadAvatar: async (userId: number, file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('avatar', await shrinkPhoto(file, AVATAR_PHOTO));
    const res = await fetch(`${API_BASE}/users/${userId}/avatar-upload`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw await uploadError(res);
    return res.json();
  },

  // Data
  exportData: () => apiFetch<any>('/export'),
  importData: async (data: any) => {
    const res = await apiFetch<{ token?: string }>('/import', { method: 'POST', body: JSON.stringify(data) });
    // The backup may give you another id: it comes with a fresh login for this device (BUG-21)
    if (res.token) saveNewToken(res.token);
    return res;
  },
  achievements: () => apiFetch<any>('/achievements'),
  getRegistrationStatus: () =>
    fetch('/api/auth/registration-status').then((r) => r.json()) as Promise<{ registrationEnabled: boolean }>,
  getLoginAvatars: () =>
    fetch('/api/auth/avatars').then((r) => r.json()) as Promise<Array<{ username: string; displayName: string; avatarColor: string; avatarType: string; avatarPreset?: string; avatarPhotoUrl?: string }>>,
  getGamificationConfig: () =>
    apiFetch<{ gamificationEnabled: boolean }>('/users/gamification-config'),
  updateGamificationConfig: (data: { gamificationEnabled: boolean }) =>
    apiFetch<{ gamificationEnabled: boolean }>('/users/gamification-config', { method: 'PUT', body: JSON.stringify(data) }),
  getRegistrationConfig: () =>
    apiFetch<{ registrationEnabled: boolean }>('/users/registration-config'),
  updateRegistrationConfig: (data: { registrationEnabled: boolean }) =>
    apiFetch<{ registrationEnabled: boolean }>('/users/registration-config', { method: 'PUT', body: JSON.stringify(data) }),
  getNotificationsConfig: () =>
    apiFetch<{
      notificationsEnabled: boolean;
      telegramEnabled: boolean;
      chatId: string;
      hasToken: boolean;
      notificationTime: string;
      notificationTypes: { taskDue: boolean; rewardRequest: boolean; achievementUnlocked: boolean; choreApproval?: boolean; coinBoost?: boolean };
      ntfyEnabled: boolean;
      ntfyServerUrl: string;
      ntfyTopic: string;
      hasNtfyToken: boolean;
    }>('/users/notifications-config'),
  updateNotificationsConfig: (data: {
    notificationsEnabled?: boolean;
    telegramEnabled?: boolean;
    botToken?: string;
    chatId?: string;
    notificationTime?: string;
    notificationTypes?: { taskDue: boolean; rewardRequest: boolean; achievementUnlocked: boolean; choreApproval?: boolean; coinBoost?: boolean };
    ntfyEnabled?: boolean;
    ntfyServerUrl?: string;
    ntfyTopic?: string;
    ntfyToken?: string;
  }) =>
    apiFetch<{
      notificationsEnabled: boolean;
      telegramEnabled: boolean;
      chatId: string;
      hasToken: boolean;
      notificationTime: string;
      notificationTypes: { taskDue: boolean; rewardRequest: boolean; achievementUnlocked: boolean; choreApproval?: boolean; coinBoost?: boolean };
      ntfyEnabled: boolean;
      ntfyServerUrl: string;
      ntfyTopic: string;
      hasNtfyToken: boolean;
    }>('/users/notifications-config', { method: 'PUT', body: JSON.stringify(data) }),
  sendNotificationsTest: (data?: { botToken?: string; chatId?: string; provider?: 'telegram' | 'ntfy'; ntfyServerUrl?: string; ntfyTopic?: string; ntfyToken?: string }) =>
    apiFetch<{ success: boolean }>('/users/notifications-test', { method: 'POST', body: JSON.stringify(data || {}) }),
  /** forUserId: a parent shopping for someone else (ENH-16) gets their rewards, prices and coins */
  getRewards: (forUserId?: number) =>
    apiFetch<{ rewards: Array<{ id: number; title: string; description?: string | null; costCoins: number }>; mine: Array<{ id: number; title: string; costCoins: number; redeemedAt: string; status: string; boughtByName?: string | null; rejectNote?: string | null }>; coins?: number }>(forUserId ? `/rewards?for=${forUserId}` : '/rewards'),
  getRewardsAdmin: () =>
    apiFetch<{ rewards: any[]; redemptions: any[]; rotatingPerWeek?: number; rotatingThisWeek?: number[] }>('/rewards/admin'),
  /** note: an optional one-line reason for the kid, with a rejection */
  updateRedemptionStatus: (id: number, status: 'requested' | 'approved' | 'rejected', note?: string) =>
    apiFetch<any>(`/rewards/redemptions/${id}`, { method: 'PUT', body: JSON.stringify({ status, note: note || undefined }) }),
  refundRedemption: (id: number) =>
    apiFetch<{ id: number; status: string }>(`/rewards/redemptions/${id}/refund`, { method: 'POST' }),
  cancelRedemption: (id: number) =>
    apiFetch<{ redemption: any; coins: number }>(`/rewards/redemptions/${id}/cancel`, { method: 'POST' }),
  createReward: (data: { title: string; description?: string; costCoins: number }) =>
    apiFetch<any>('/rewards', { method: 'POST', body: JSON.stringify(data) }),
  updateReward: (id: number, data: { title: string; description?: string; costCoins: number; isActive?: boolean }) =>
    apiFetch<any>(`/rewards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReward: (id: number) =>
    apiFetch<{ success: boolean; trashId: number | null }>(`/rewards/${id}`, { method: 'DELETE' }),
  setRewardCategory: (id: number, category: string) =>
    apiFetch<{ id: number; category: string | null }>(`/rewards/${id}/category`, { method: 'PUT', body: JSON.stringify({ category }) }),
  /** The parents' "Featured" order, first to last */
  orderRewards: (ids: number[]) =>
    apiFetch<{ success: boolean }>('/rewards/order', { method: 'POST', body: JSON.stringify({ ids }) }),
  /** costCoins: the price the page showed (the server refuses with `price_changed` if it's no longer right);
   *  forUserId: a parent buying for someone else (ENH-16) */
  redeemReward: (id: number, opts: { costCoins?: number; forUserId?: number } = {}) =>
    apiFetch<{ redemption: any; coins: number }>(`/rewards/${id}/redeem`, { method: 'POST', body: JSON.stringify(opts) }),

  cancelCompletion: (completionId: number) =>
    apiFetch<{ success: boolean; coinsDeducted: number }>(`/completions/${completionId}`, { method: 'DELETE' }),
  getPendingCompletions: () =>
    apiFetch<{ pending: Array<{
      id: number;
      taskId: number;
      userId: number;
      completedAt: string;
      coinsEarned: number;
      taskName: string;
      translationKey?: string | null;
      roomId: number;
      roomName: string;
      displayName: string;
    }> }>('/completions/pending'),
  approveCompletion: (completionId: number, extras?: { note?: string; bonus?: number }) =>
    apiFetch<{ success: boolean }>(`/completions/${completionId}/approve`, { method: 'POST', ...(extras ? { body: JSON.stringify(extras) } : {}) }),
  buyAccessory: (itemId: string) =>
    apiFetch<{ outfit: Outfit; coins: number }>('/mascot/buy', { method: 'POST', body: JSON.stringify({ itemId }) }),
  takeOffAccessory: (slot: string) =>
    apiFetch<{ outfit: Outfit }>('/mascot/take-off', { method: 'POST', body: JSON.stringify({ slot }) }),
  startTeamup: (taskId: number, partnerId: number | null) =>
    apiFetch<{ teamup: unknown }>('/teamups', { method: 'POST', body: JSON.stringify({ taskId, partnerId }) }),
  joinTeamup: (id: number) => apiFetch<{ teamup: unknown }>(`/teamups/${id}/join`, { method: 'POST' }),
  leaveTeamup: (id: number) => apiFetch<{ ok: boolean }>(`/teamups/${id}/leave`, { method: 'POST' }),
  declineTeamup: (id: number) => apiFetch<{ ok: boolean }>(`/teamups/${id}/decline`, { method: 'POST' }),
  suggestIcon: (name: string) => apiFetch<{ iconKey: string }>(`/tasks/icon-suggestion?name=${encodeURIComponent(name)}`),
  getUnlocks: () => apiFetch<UnlocksView>('/unlocks'),
  updateUnlocks: (data: { frame?: string | null; celebration?: string; title?: string | null }) =>
    apiFetch<UnlocksView>('/unlocks', { method: 'PUT', body: JSON.stringify(data) }),
  cheer: (completionId: number, emoji: string) =>
    apiFetch<{ cheers: CheerSummary }>('/cheers', { method: 'POST', body: JSON.stringify({ completionId, emoji }) }),
  rejectPendingCompletion: (completionId: number, reason?: string) =>
    apiFetch<{ success: boolean }>(`/completions/${completionId}/reject`, { method: 'DELETE', body: JSON.stringify({ reason }) }),

  adjustCoins: (userId: number, amount: number, reason?: string) =>
    apiFetch<any>(`/users/${userId}/adjust-coins`, { method: 'POST', body: JSON.stringify({ amount, ...(reason ? { reason } : {}) }) }),
  // Reward rules (who sees it, prices, limits, dates, rotation, shared saving)
  updateRewardRules: (id: number, data: RewardRulesInput) =>
    apiFetch<RewardRules & { id: number }>(`/rewards/${id}/rules`, { method: 'PUT', body: JSON.stringify(data) }),
  updateRotationConfig: (rotatingPerWeek: number) =>
    apiFetch<{ rotatingPerWeek: number; rotatingThisWeek: number[] }>('/rewards/rotation-config', { method: 'PUT', body: JSON.stringify({ rotatingPerWeek }) }),
  contributeReward: (id: number, amount: number) =>
    apiFetch<{ coins: number; pot: RewardPot; redemption: unknown }>(`/rewards/${id}/contribute`, { method: 'POST', body: JSON.stringify({ amount }) }),
  // Double coins events
  getBoosts: () => apiFetch<CoinBoost[]>('/boosts'),
  createBoost: (data: { title: string; multiplier: number; startAt: string; endAt: string; roomIds?: number[] | null; taskIds?: number[] | null }) =>
    apiFetch<CoinBoost>('/boosts', { method: 'POST', body: JSON.stringify(data) }),
  deleteBoost: (id: number) => apiFetch<{ success: boolean }>(`/boosts/${id}`, { method: 'DELETE' }),

  // Recently deleted tasks and rewards (kept 30 days)
  // Insights for parents
  /** query: period=day|week|month|year&date=YYYY-MM-DD, or period=custom&from=…&to=… */
  getInsightsBars: (query: string) => apiFetch<InsightsBars>(`/insights/bars?${query}`),
  getInsightsSkipped: (query: string) => apiFetch<InsightsSkipped>(`/insights/skipped?${query}`),
  /** end: the last day (YYYY-MM-DD) the weeks cover */
  getInsightsCoins: (weeks: 8 | 26, end: string) => apiFetch<InsightsCoins>(`/insights/coins?weeks=${weeks}&end=${end}`),
  getInsightsHeatmap: (weeks: 4 | 12, end: string) => apiFetch<InsightsHeatmap>(`/insights/heatmap?weeks=${weeks}&end=${end}`),

  getTrash: () => apiFetch<{ items: TrashItem[]; keepDays: number }>('/trash'),
  restoreTrash: (id: number, roomId?: number) =>
    apiFetch<{ kind: 'task' | 'reward'; id: number; roomId?: number }>(`/trash/${id}/restore`, { method: 'POST', body: JSON.stringify(roomId ? { roomId } : {}) }),
  deleteTrash: (id: number) => apiFetch<{ success: boolean }>(`/trash/${id}`, { method: 'DELETE' }),

  // Spreadsheets
  exportCsv: async (kind: CsvKind): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/csv/${kind}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Request failed');
    return res.blob();
  },
  importCsv: (kind: CsvKind, csv: string, dryRun: boolean) =>
    apiFetch<CsvImportResult>(`/csv/${kind}/import`, { method: 'POST', body: JSON.stringify({ csv, dryRun }) }),

  getVacationConfig: () =>
    apiFetch<{ vacationMode: boolean; vacationStartDate: string | null; vacationEndDate: string | null }>('/users/vacation-config'),
  updateVacationConfig: (data: { vacationMode?: boolean; vacationEndDate?: string | null }) =>
    apiFetch<{ vacationMode: boolean; vacationStartDate: string | null; vacationEndDate: string | null }>('/users/vacation-config', { method: 'PUT', body: JSON.stringify(data) }),

  updateUserVacation: (userId: number, data: { isVacationMode?: boolean; vacationEndDate?: string | null }) =>
    apiFetch<any>(`/users/${userId}/vacation`, { method: 'PUT', body: JSON.stringify(data) }),

  updateUserParticipant: (userId: number, isParticipant: boolean) =>
    apiFetch<any>(`/users/${userId}/participant`, { method: 'PUT', body: JSON.stringify({ isParticipant }) }),

  updateUserView: (userId: number, data: { taskView?: 'all' | 'mine' | 'mineOnly'; kidMode?: boolean; focusMode?: FocusModeSetting }) =>
    apiFetch<{ id: number; taskView: 'all' | 'mine' | 'mineOnly'; kidMode: number }>(`/users/${userId}/view`, { method: 'PUT', body: JSON.stringify(data) }),
  /** The week's first day for the whole family: 1 = Monday, 0 = Sunday (FIX-11) */
  updateWeekStart: (weekStart: 0 | 1) =>
    apiFetch<{ weekStart: number }>('/users/week-start', { method: 'PUT', body: JSON.stringify({ weekStart }) }),
  updateTimeZone: (timeZone: string) =>
    apiFetch<{ timeZone: string; timeZoneSet: boolean }>('/users/time-zone', { method: 'PUT', body: JSON.stringify({ timeZone }) }),
  getKidsConfig: () => apiFetch<{ hidePrivateRooms: boolean }>('/users/kids-config'),
  updateKidsConfig: (data: { hidePrivateRooms: boolean }) =>
    apiFetch<{ hidePrivateRooms: boolean }>('/users/kids-config', { method: 'PUT', body: JSON.stringify(data) }),
  getStrictModeConfig: () =>
    apiFetch<{ strictMode: boolean }>('/users/strict-mode-config'),
  updateStrictModeConfig: (data: { strictMode: boolean }) =>
    apiFetch<{ strictMode: boolean }>('/users/strict-mode-config', { method: 'PUT', body: JSON.stringify(data) }),
};
