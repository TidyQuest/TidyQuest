import db, { prepared } from '../database';
import { getCoinsByEffortConfig } from './adminHelpers';
import { endOfDay } from './clock';
import { localDateStr } from './dateHelpers';
import { getCoinsForEffort } from './health';
import { isFeatureOn } from './features';
import { notifyPeople } from './notify';
import { taskName, tr, type TaskLabel } from './i18n';

/**
 * Team-ups (round 3): doing one chore together. Someone invites a partner (or anyone); once someone
 * joins, the chore is claimed by the team for the day. Either member taps Done: everyone on the team
 * gets their own completion (goals, board, streaks, badges), and the coins split with a team bonus.
 * A parent teamed with a kid is a helper: the kid keeps the full coins. Invites end at midnight.
 */
export const MAX_TEAM = 3;
export const MIN_COINS = 6;
export const TEAM_BONUSES = [10, 20, 30];

export interface TeamMember { userId: number; displayName: string; role: string }
export interface Teamup { id: number; taskId: number; day: string; createdBy: number; invitedUserId: number | null; status: string; members: TeamMember[] }

/** The team bonus in percent (Settings → Features; 20 by default) */
export function teamBonus(): number {
  const v = Number((prepared("SELECT value FROM app_settings WHERE key = 'teamBonus'").get() as { value: string } | undefined)?.value);
  return TEAM_BONUSES.includes(v) ? v : 20;
}

export const baseCoinsOf = (task: { customCoins?: number | null; effort: number }, coinsConfig = getCoinsByEffortConfig()) =>
  task.customCoins != null && task.customCoins > 0 ? task.customCoins : getCoinsForEffort(task.effort, coinsConfig);

/**
 * What a chore list needs to know about team-ups, read once for the whole list (ENH-19): the switch, the
 * coin table, room owners, assignees and today's open team-ups. Without it each chore read them again.
 */
export interface TeamUpContext {
  on: boolean;
  coinsConfig: Record<number, number>;
  roomOwner: Map<number, number | null>;
  assignees: Map<number, number[]>;
  open: Map<number, Teamup>;
}
export function teamUpContext(now = new Date()): TeamUpContext {
  const on = isFeatureOn('teamups');
  const roomOwner = new Map<number, number | null>();
  const assignees = new Map<number, number[]>();
  const open = new Map<number, Teamup>();
  if (on) {
    for (const r of prepared('SELECT id, assignedUserId FROM rooms').all() as { id: number; assignedUserId: number | null }[]) roomOwner.set(r.id, r.assignedUserId);
    for (const a of prepared('SELECT taskId, userId FROM task_assignees').all() as { taskId: number; userId: number }[]) {
      const list = assignees.get(a.taskId);
      if (list) list.push(a.userId); else assignees.set(a.taskId, [a.userId]);
    }
    // The newest open one per chore, as openTeamupFor picks
    for (const row of prepared("SELECT * FROM teamups WHERE day = ? AND status = 'open' ORDER BY id").all(localDateStr(now)) as Omit<Teamup, 'members'>[]) {
      open.set(row.taskId, { ...row, members: membersOf(row.id) });
    }
  }
  return { on, coinsConfig: getCoinsByEffortConfig(), roomOwner, assignees, open };
}

/**
 * Whether a chore can be done as a team: worth 6+ coins, not in someone's own room, not a one-person
 * duty (one assignee, or a rotating turn). Chores assigned to several people team up among them.
 */
export function teamableTask(task: { id: number; roomId: number; customCoins?: number | null; effort: number; assignmentMode?: string | null }, ctx?: TeamUpContext): { ok: boolean; assignees: number[] } {
  const roomOwner = ctx ? ctx.roomOwner.get(task.roomId)
    : (prepared('SELECT assignedUserId FROM rooms WHERE id = ?').get(task.roomId) as { assignedUserId: number | null } | undefined)?.assignedUserId;
  const assignees = ctx ? ctx.assignees.get(task.id) ?? []
    : (prepared('SELECT userId FROM task_assignees WHERE taskId = ?').all(task.id) as { userId: number }[]).map((a) => a.userId);
  const ok = (ctx ? ctx.on : isFeatureOn('teamups')) && baseCoinsOf(task, ctx?.coinsConfig) >= MIN_COINS && !roomOwner
    && assignees.length !== 1 && task.assignmentMode !== 'rotating';
  return { ok, assignees };
}
export const canBeOnTeam = (t: { ok: boolean; assignees: number[] }, userId: number) => t.ok && (t.assignees.length === 0 || t.assignees.includes(userId));

function membersOf(teamupId: number): TeamMember[] {
  return prepared(`SELECT m.userId, u.displayName, u.role FROM teamup_members m JOIN users u ON u.id = m.userId WHERE m.teamupId = ? ORDER BY m.id`).all(teamupId) as TeamMember[];
}

/** Today's open team-up on a chore, if any */
export function openTeamupFor(taskId: number, now = new Date()): Teamup | null {
  const row = prepared("SELECT * FROM teamups WHERE taskId = ? AND day = ? AND status = 'open' ORDER BY id DESC").get(taskId, localDateStr(now)) as Omit<Teamup, 'members'> | undefined;
  return row ? { ...row, members: membersOf(row.id) } : null;
}
export function getTeamup(id: number): Teamup | null {
  const row = prepared('SELECT * FROM teamups WHERE id = ?').get(id) as Omit<Teamup, 'members'> | undefined;
  return row ? { ...row, members: membersOf(row.id) } : null;
}

/**
 * Each member's coins before multipliers. A parent with a kid on the team is a helper (0 coins); the
 * others split coins × (1 + bonus) evenly, at least 1 each. One earner (a kid with a parent) keeps it all.
 */
export function teamShares(base: number, members: TeamMember[], bonusPct = teamBonus()): Map<number, number> {
  const hasKid = members.some((m) => m.role !== 'admin');
  const earners = members.filter((m) => !(hasKid && m.role === 'admin'));
  const share = earners.length <= 1 ? base : Math.max(1, Math.round((base * (1 + bonusPct / 100)) / earners.length));
  return new Map(members.map((m) => [m.userId, earners.includes(m) ? share : 0]));
}

const labelOf = (taskId: number): TaskLabel => (prepared('SELECT name, translationKey FROM tasks WHERE id = ?').get(taskId) as TaskLabel | undefined) ?? { name: '' };
/** A team-up is for one day: a message about it that waits out quiet hours is dropped after that */
const today = (now: Date) => ({ now, expiresAt: endOfDay(now) });
const nameOf = (userId: number) => (prepared('SELECT displayName FROM users WHERE id = ?').get(userId) as { displayName: string } | undefined)?.displayName ?? '';

/** Start a team-up on a chore: invite one person, or anyone who can do it. Returns an error code or the team-up. */
export function startTeamup(taskId: number, userId: number, partnerId: number | null, now = new Date()): { error: string } | { teamup: Teamup } {
  const task = prepared('SELECT * FROM tasks WHERE id = ? AND archivedAt IS NULL AND deletedAt IS NULL AND pausedAt IS NULL').get(taskId) as any;
  if (!task) return { error: 'not_found' };
  const team = teamableTask(task);
  if (!team.ok) return { error: 'not_teamable' };
  if (!canBeOnTeam(team, userId)) return { error: 'not_assigned' };
  if (partnerId != null) {
    if (partnerId === userId || !nameOf(partnerId) || !canBeOnTeam(team, partnerId)) return { error: 'invalid_partner' };
    // Someone who can't log in could never answer the invite (ENH-16); a parent logs shared work with "who did it?"
    if ((prepared('SELECT canLogIn FROM users WHERE id = ?').get(partnerId) as { canLogIn: number }).canLogIn === 0) return { error: 'invalid_partner' };
  }
  if (openTeamupFor(taskId, now)) return { error: 'already_teamed' };
  const id = Number(prepared("INSERT INTO teamups (taskId, day, createdBy, invitedUserId, status) VALUES (?, ?, ?, ?, 'open')")
    .run(taskId, localDateStr(now), userId, partnerId).lastInsertRowid);
  prepared('INSERT INTO teamup_members (teamupId, userId) VALUES (?, ?)').run(id, userId);
  // The invite goes to the partner, or to everyone else who could join
  const audience = partnerId != null ? [partnerId]
    : (prepared('SELECT id FROM users WHERE id != ?').all(userId) as { id: number }[]).map((u) => u.id).filter((uid) => canBeOnTeam(team, uid));
  const from = nameOf(userId);
  // An invite that waits out quiet hours is dropped once the team-up is done or called off (BUG-41)
  void notifyPeople(audience, 'teamup', (lang) => tr(lang, partnerId != null ? 'notify.teamupInvite' : 'notify.teamupAnyone', { name: from, task: taskName(lang, task) }),
    { ...today(now), dedupeKey: `teamup:${id}`, onlyIf: { teamupOpen: id } });
  return { teamup: getTeamup(id)! };
}

export function joinTeamup(id: number, userId: number, now = new Date()): { error: string } | { teamup: Teamup } {
  const t = getTeamup(id);
  if (!t || t.status !== 'open' || t.day !== localDateStr(now)) return { error: 'not_found' };
  if (t.members.some((m) => m.userId === userId)) return { teamup: t };
  if (t.invitedUserId != null && t.invitedUserId !== userId) return { error: 'not_invited' };
  if (declined(id, userId)) return { error: 'declined' };
  if (t.members.length >= MAX_TEAM) return { error: 'team_full' };
  const task = prepared('SELECT * FROM tasks WHERE id = ?').get(t.taskId) as any;
  if (!canBeOnTeam(teamableTask(task), userId)) return { error: 'not_assigned' };
  prepared('INSERT INTO teamup_members (teamupId, userId) VALUES (?, ?)').run(id, userId);
  const who = nameOf(userId);
  const label = labelOf(t.taskId);
  void notifyPeople(t.members.map((m) => m.userId), 'teamup', (lang) => tr(lang, 'notify.teamupJoined', { name: who, task: taskName(lang, label) }), today(now));
  return { teamup: getTeamup(id)! };
}

/** Leave a team-up; the one who started it calls it off for everyone. */
export function leaveTeamup(id: number, userId: number): { error: string } | { ok: true } {
  const t = getTeamup(id);
  if (!t || t.status !== 'open' || !t.members.some((m) => m.userId === userId)) return { error: 'not_found' };
  if (t.createdBy === userId) prepared("UPDATE teamups SET status = 'cancelled' WHERE id = ?").run(id);
  else prepared('DELETE FROM teamup_members WHERE teamupId = ? AND userId = ?').run(id, userId);
  return { ok: true };
}

const declined = (teamupId: number, userId: number) => !!prepared('SELECT 1 FROM teamup_declines WHERE teamupId = ? AND userId = ?').get(teamupId, userId);

/**
 * Say no to an invite. A personal invite ends (the starter hears about it and can ask someone else);
 * an "anyone" invite just stops showing for you.
 */
export function declineTeamup(id: number, userId: number, now = new Date()): { error: string } | { ok: true } {
  const t = getTeamup(id);
  if (!t || t.status !== 'open' || t.day !== localDateStr(now) || t.members.some((m) => m.userId === userId)) return { error: 'not_found' };
  if (t.invitedUserId == null) {
    prepared('INSERT OR IGNORE INTO teamup_declines (teamupId, userId) VALUES (?, ?)').run(id, userId);
    return { ok: true };
  }
  if (t.invitedUserId !== userId) return { error: 'not_invited' };
  prepared("UPDATE teamups SET status = 'cancelled' WHERE id = ?").run(id);
  const who = nameOf(userId);
  const label = labelOf(t.taskId);
  void notifyPeople([t.createdBy], 'teamup', (lang) => tr(lang, 'notify.teamupDeclined', { name: who, task: taskName(lang, label) }), today(now));
  return { ok: true };
}

/** The chore got done another way: today's open team-up on it ends */
export const endTeamupsFor = (taskId: number, now = new Date()) =>
  prepared("UPDATE teamups SET status = 'cancelled' WHERE taskId = ? AND day = ? AND status = 'open'").run(taskId, localDateStr(now));

/** Home's Team-ups card: today's team-ups you're in or could join */
/** A team-up only lasts its day: close any still open from an earlier day (runs with the server's timers). */
export function closeOldTeamups(now = new Date()): number {
  return prepared("UPDATE teamups SET status = 'cancelled' WHERE status = 'open' AND day < ?").run(localDateStr(now)).changes;
}

export function teamupsFor(userId: number, now = new Date()) {
  const rows = prepared(`
    SELECT tu.id, tu.taskId, tu.createdBy, tu.invitedUserId, t.name AS taskName, t.roomId, r.name AS roomName, t.customCoins, t.effort, t.assignmentMode
    FROM teamups tu JOIN tasks t ON t.id = tu.taskId JOIN rooms r ON r.id = t.roomId
    WHERE tu.day = ? AND tu.status = 'open'
      AND NOT EXISTS (SELECT 1 FROM teamup_declines d WHERE d.teamupId = tu.id AND d.userId = ?)
    ORDER BY tu.id
  `).all(localDateStr(now), userId) as any[];
  return rows.map((r) => {
    const members = membersOf(r.id);
    const mine = members.some((m) => m.userId === userId);
    const canJoin = !mine && members.length < MAX_TEAM && (r.invitedUserId == null || r.invitedUserId === userId)
      && canBeOnTeam(teamableTask({ id: r.taskId, roomId: r.roomId, customCoins: r.customCoins, effort: r.effort, assignmentMode: r.assignmentMode }), userId);
    const shares = teamShares(baseCoinsOf(r), members.length >= 2 ? members : [...members, { userId: -1, displayName: '', role: 'child' }]);
    return {
      id: r.id, taskId: r.taskId, taskName: r.taskName, roomId: r.roomId, roomName: r.roomName, createdBy: r.createdBy, invitedUserId: r.invitedUserId,
      members: members.map((m) => ({ id: m.userId, displayName: m.displayName, helper: shares.get(m.userId) === 0 })),
      mine, canJoin, share: shares.get(mine ? userId : -1) ?? null,
    };
  }).filter((x) => x.mine || x.canJoin);
}

/** For a chore list: can the viewer start a team-up here, and has a team claimed it today? */
export function teamUpInfo(t: { id: number; roomId: number; customCoins?: number | null; effort: number; assignmentMode?: string | null; archivedAt?: string | null; pausedAt?: string | null }, viewerId: number, ctx?: TeamUpContext) {
  if (!(ctx ? ctx.on : isFeatureOn('teamups')) || t.archivedAt || t.pausedAt) return null;
  const open = ctx ? ctx.open.get(t.id) ?? null : openTeamupFor(t.id);
  const claimed = open && open.members.length >= 2 ? open.members : null;
  return {
    canStart: !open && canBeOnTeam(teamableTask(t, ctx), viewerId),
    teamId: open?.id ?? null,
    claimedBy: claimed && !claimed.some((m) => m.userId === viewerId) ? claimed.map((m) => m.displayName) : null,
  };
}

/** Waiting completions: a team's chore is one item ("Sam + Alex", coins added up), approved or turned down together */
export function groupTeamPending<T extends { teamupId?: number | null; displayName: string; coinsEarned: number }>(rows: T[]): T[] {
  const firstOf = new Map<number, T>();
  return rows.filter((p) => {
    if (!p.teamupId) return true;
    const first = firstOf.get(p.teamupId);
    if (!first) { firstOf.set(p.teamupId, p); return true; }
    first.displayName = `${first.displayName} + ${p.displayName}`;
    first.coinsEarned += p.coinsEarned;
    return false;
  });
}
