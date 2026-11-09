import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { cheersFor } from '../utils/cheers';
import { TREAT_EFFORT } from '../utils/mascot';
import { isFeatureOn } from '../utils/features';
import { shieldsOn } from '../utils/streaks';
import { dateStr, familyZone } from '../utils/clock';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  const offset = parseInt(req.query.offset as string) || 0;

  // Optional filters: userId, roomId, from/to (ISO timestamps, to is exclusive), q (task name)
  const filterUserId = parseInt(req.query.userId as string) || null;
  const filterRoomId = parseInt(req.query.roomId as string) || null;
  const isIso = (v: unknown) => typeof v === 'string' && !Number.isNaN(new Date(v).getTime());
  const from = isIso(req.query.from) ? new Date(req.query.from as string).toISOString() : null;
  const to = isIso(req.query.to) ? new Date(req.query.to as string).toISOString() : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  // A bounded date range (the calendar asks for a whole month) may fetch more rows at once
  const limit = Math.min(parseInt(req.query.limit as string) || 20, from && to ? 2000 : 100);

  const where: string[] = ["tc.status = 'approved'"];
  const params: (string | number)[] = [];
  if (filterRoomId) { where.push('t.roomId = ?'); params.push(filterRoomId); }
  if (from) { where.push('tc.completedAt >= ?'); params.push(from); }
  if (to) { where.push('tc.completedAt < ?'); params.push(to); }
  if (q) { where.push("t.name LIKE ? ESCAPE '\\'"); params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); }

  const rawHistory = db.prepare(`
    SELECT tc.id, tc.completedAt, tc.coinsEarned, tc.taskId, tc.approvalNote, tc.teamupId, tc.loggedAt, tc.note, tc.photoUrl,
           t.name as taskName, t.translationKey, t.roomId, t.assignmentMode, (t.effort >= ${TREAT_EFFORT}) AS mascotCheers,
           r.name as roomName, r.roomType,
           u.id as userId, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
    FROM task_completions tc
    JOIN tasks t ON tc.taskId = t.id
    JOIN rooms r ON t.roomId = r.id
    JOIN users u ON tc.userId = u.id
    WHERE ${where.join(' AND ')}
    ORDER BY tc.completedAt DESC
  `).all(...params) as any[];

  // Group shared-mode completions by (taskId, the family's day) into a single entry with all participants
  const grouped: any[] = [];
  const seenSharedKeys = new Set<string>();
  const tz = familyZone();
  const dayOf = new Map<any, string>(rawHistory.map((r: any) => [r, dateStr(r.completedAt, tz)]));

  for (const row of rawHistory) {
    row.type = 'completion';
    // A team-up is one entry with everyone on the team, like a shared chore
    if (row.assignmentMode === 'shared' || row.teamupId) {
      const key = row.teamupId ? `team:${row.teamupId}` : `${row.taskId}:${dayOf.get(row)}`;
      if (seenSharedKeys.has(key)) continue;
      seenSharedKeys.add(key);

      const partners = rawHistory.filter((r: any) => row.teamupId ? r.teamupId === row.teamupId : (
        r.taskId === row.taskId &&
        dayOf.get(r) === dayOf.get(row) &&
        r.assignmentMode === 'shared' && !r.teamupId
      ));

      // The proof is on whoever tapped Done
      const proof = partners.find((p: any) => p.photoUrl || p.note) ?? row;
      grouped.push({
        ...row,
        note: proof.note,
        photoUrl: proof.photoUrl,
        coinsEarned: partners.reduce((s: number, p: any) => s + p.coinsEarned, 0),
        participants: partners.map((p: any) => ({
          id: p.userId, displayName: p.displayName, avatarColor: p.avatarColor,
          avatarType: p.avatarType, avatarPreset: p.avatarPreset, avatarPhotoUrl: p.avatarPhotoUrl,
          coinsEarned: p.coinsEarned,
        })),
      });
    } else {
      grouped.push(row);
    }
  }

  // Person filter runs after grouping so a shared completion still shows all its participants
  const filtered = filterUserId
    ? grouped.filter((h) => h.userId === filterUserId || h.participants?.some((p: any) => p.id === filterUserId))
    : grouped;

  // Proof photos and notes: parents see everyone's; others only their own (photos of kids aren't for
  // the whole family)
  const viewerIsAdmin = ensureAdmin(req.userId);
  for (const h of filtered) {
    if (viewerIsAdmin || h.userId === req.userId || h.participants?.some((p: any) => p.id === req.userId)) continue;
    h.note = null;
    h.photoUrl = null;
  }

  // Coin adjustments by a parent, merged in by date. Parents see everyone's; others only their own.
  // They belong to no room, so a room filter leaves them out.
  let adjustments: any[] = [];
  if (!filterRoomId && (viewerIsAdmin || !filterUserId || filterUserId === req.userId)) {
    const aWhere: string[] = [];
    const aParams: (string | number)[] = [];
    if (!viewerIsAdmin) { aWhere.push('a.userId = ?'); aParams.push(req.userId!); }
    if (filterUserId) { aWhere.push('a.userId = ?'); aParams.push(filterUserId); }
    if (from) { aWhere.push('a.createdAt >= ?'); aParams.push(from); }
    if (to) { aWhere.push('a.createdAt < ?'); aParams.push(to); }
    if (q) { aWhere.push("a.reason LIKE ? ESCAPE '\\'"); aParams.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); }
    adjustments = db.prepare(`
      SELECT 'adjustment' AS type, a.id, a.createdAt AS completedAt, a.amount AS coinsEarned, a.reason,
             a.createdBy, c.displayName AS createdByName,
             u.id as userId, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
      FROM coin_adjustments a
      JOIN users u ON a.userId = u.id
      LEFT JOIN users c ON a.createdBy = c.id
      ${aWhere.length ? `WHERE ${aWhere.join(' AND ')}` : ''}
      ORDER BY a.createdAt DESC, a.id DESC
    `).all(...aParams) as any[];
  }
  // Chip-ins to shared rewards (Family Goals). The pot shows everyone's, so everyone sees them here too.
  // potStatus: 'open' (still saving) or the request's status ('requested' | 'approved' | 'rejected' = refunded).
  let contributions: any[] = [];
  if (!filterRoomId) {
    const cWhere: string[] = [];
    const cParams: (string | number)[] = [];
    if (filterUserId) { cWhere.push('c.userId = ?'); cParams.push(filterUserId); }
    if (from) { cWhere.push('c.createdAt >= ?'); cParams.push(from); }
    if (to) { cWhere.push('c.createdAt < ?'); cParams.push(to); }
    if (q) { cWhere.push("rw.title LIKE ? ESCAPE '\\'"); cParams.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); }
    contributions = db.prepare(`
      SELECT 'contribution' AS type, c.id, c.createdAt AS completedAt, -c.amount AS coinsEarned, c.rewardId,
             rw.title AS rewardTitle, COALESCE(rr.status, 'open') AS potStatus,
             u.id as userId, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
      FROM reward_contributions c
      JOIN rewards rw ON rw.id = c.rewardId
      JOIN users u ON c.userId = u.id
      LEFT JOIN reward_redemptions rr ON rr.id = c.redemptionId
      ${cWhere.length ? `WHERE ${cWhere.join(' AND ')}` : ''}
      ORDER BY c.createdAt DESC, c.id DESC
    `).all(...cParams) as any[];
  }

  // Accessories bought for the house mascot (everyone sees them, like the outfit itself)
  let purchases: any[] = [];
  if (!filterRoomId) {
    const pWhere: string[] = [];
    const pParams: (string | number)[] = [];
    if (filterUserId) { pWhere.push('p.userId = ?'); pParams.push(filterUserId); }
    if (from) { pWhere.push('p.createdAt >= ?'); pParams.push(from); }
    if (to) { pWhere.push('p.createdAt < ?'); pParams.push(to); }
    if (q) { pWhere.push('p.itemId LIKE ?'); pParams.push(`%${q.replace(/\s+/g, '')}%`); }
    purchases = db.prepare(`
      SELECT 'mascotPurchase' AS type, p.id, p.createdAt AS completedAt, -p.price AS coinsEarned, p.itemId,
             u.id as userId, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
      FROM mascot_purchases p JOIN users u ON u.id = p.userId
      ${pWhere.length ? `WHERE ${pWhere.join(' AND ')}` : ''}
      ORDER BY p.createdAt DESC, p.id DESC
    `).all(...pParams) as any[];
  }

  // Streak shields earned, bought, given or used. Each person sees their own; parents see everyone's.
  let shieldEvents: any[] = [];
  if (!filterRoomId && !q && shieldsOn()) {
    const sWhere: string[] = [];
    const sParams: (string | number)[] = [];
    if (!viewerIsAdmin) { sWhere.push('s.userId = ?'); sParams.push(req.userId!); }
    if (filterUserId) { sWhere.push('s.userId = ?'); sParams.push(filterUserId); }
    if (from) { sWhere.push('s.createdAt >= ?'); sParams.push(from); }
    if (to) { sWhere.push('s.createdAt < ?'); sParams.push(to); }
    shieldEvents = db.prepare(`
      SELECT 'shield' AS type, s.id, s.createdAt AS completedAt, -s.coins AS coinsEarned, s.kind AS shieldKind, s.count AS shieldCount,
             s.streak, b.displayName AS createdByName,
             u.id as userId, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
      FROM streak_shield_events s JOIN users u ON u.id = s.userId
      LEFT JOIN users b ON b.id = s.byUserId
      ${sWhere.length ? `WHERE ${sWhere.join(' AND ')}` : ''}
      ORDER BY s.createdAt DESC, s.id DESC
    `).all(...sParams) as any[];
  }

  // Rewards bought (ENH-16), including by a parent for someone who doesn't log in. Like shields: each person sees
  // their own, parents see everyone's. Shared pots show as chip-ins above; refunded ones are left out.
  let rewardBuys: any[] = [];
  if (!filterRoomId) {
    const rWhere: string[] = ["rr.status IN ('requested', 'approved')", 'NOT EXISTS (SELECT 1 FROM reward_contributions c WHERE c.redemptionId = rr.id)'];
    const rParams: (string | number)[] = [];
    if (!viewerIsAdmin) { rWhere.push('rr.userId = ?'); rParams.push(req.userId!); }
    if (filterUserId) { rWhere.push('rr.userId = ?'); rParams.push(filterUserId); }
    // redeemedAt is stored as 'YYYY-MM-DD HH:MM:SS' (UTC): compared and sorted as ISO like everything else here
    const at = "strftime('%Y-%m-%dT%H:%M:%fZ', rr.redeemedAt)";
    if (from) { rWhere.push(`${at} >= ?`); rParams.push(from); }
    if (to) { rWhere.push(`${at} < ?`); rParams.push(to); }
    if (q) { rWhere.push("rw.title LIKE ? ESCAPE '\\'"); rParams.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); }
    rewardBuys = db.prepare(`
      SELECT 'rewardPurchase' AS type, rr.id, ${at} AS completedAt, -rr.costCoins AS coinsEarned, rr.rewardId,
             rw.title AS rewardTitle, rr.status AS rewardStatus, b.displayName AS boughtByName,
             u.id as userId, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
      FROM reward_redemptions rr
      JOIN rewards rw ON rw.id = rr.rewardId
      JOIN users u ON u.id = rr.userId
      LEFT JOIN users b ON b.id = rr.boughtBy
      WHERE ${rWhere.join(' AND ')}
      ORDER BY rr.redeemedAt DESC, rr.id DESC
    `).all(...rParams) as any[];
  }

  // Stable sort: completions keep their order among themselves
  const extra = [...adjustments, ...contributions, ...purchases, ...shieldEvents, ...rewardBuys];
  const merged = extra.length
    ? [...filtered, ...extra].sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0))
    : filtered;

  const total = merged.length;
  const history = merged.slice(offset, offset + limit);
  // Cheers on the chores in this page
  if (isFeatureOn('cheers')) {
    const shown = history.filter((h) => h.type === 'completion');
    const cheers = cheersFor(shown.map((h) => h.id), req.userId!);
    // The mascot's 🐾 only goes on bigger chores (3★ or more), like its cookie-and-hop cheer
    for (const h of shown) { h.cheers = cheers.get(h.id) ?? { counts: [], mine: null }; h.mascotCheers = !!h.mascotCheers; }
  }

  // The viewer's own completions still waiting for a parent, shown above the list
  const pending = offset === 0
    ? db.prepare(`
      SELECT tc.id, tc.completedAt, tc.coinsEarned, tc.taskId, tc.note, tc.photoUrl,
             t.name AS taskName, t.translationKey, t.roomId, r.name AS roomName, r.roomType
      FROM task_completions tc
      JOIN tasks t ON tc.taskId = t.id
      JOIN rooms r ON t.roomId = r.id
      WHERE tc.status = 'pending' AND tc.userId = ?
      ORDER BY tc.completedAt DESC
      LIMIT 50`).all(req.userId)
    : [];

  res.json({ history, total, limit, offset, pending });
});

export default router;
