import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { startOfLocalWeek } from '../utils/periods';
import { at, wall } from '../utils/clock';
import { BOARD_MODES, BOARD_PERIODS, buildBoard, familyGoal, participants, type BoardMode, type BoardPeriod } from '../utils/board';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  const requested = String(req.query.period || 'week');
  const period = ['week', 'month', 'quarter', 'year'].includes(requested)
    ? (requested as 'week' | 'month' | 'quarter' | 'year')
    : 'week';

  // Calculate date range
  const now = new Date();
  const w = wall(now);
  let startDate: string;

  if (period === 'week') {
    startDate = startOfLocalWeek(now).toISOString();
  } else if (period === 'month') {
    const firstOfMonth = at(w.year, w.month, 1);
    startDate = firstOfMonth.toISOString();
  } else if (period === 'quarter') {
    const quarterStartMonth = Math.floor(w.month / 3) * 3;
    const firstOfQuarter = at(w.year, quarterStartMonth, 1);
    startDate = firstOfQuarter.toISOString();
  } else {
    const firstOfYear = at(w.year, 0, 1);
    startDate = firstOfYear.toISOString();
  }

  // The same people as the Board page (#152): kids, members and parents who do chores, plus any other
  // parent who did one in the period. Nobody else's coins are sent (BUG-44).
  const points = new Map((db.prepare(
    "SELECT userId, COALESCE(SUM(coinsEarned), 0) AS points FROM task_completions WHERE status = 'approved' AND completedAt >= ? GROUP BY userId"
  ).all(startDate) as Array<{ userId: number; points: number }>).map((r) => [r.userId, r.points]));
  const leaderboard = participants(new Set(points.keys())).map((user) => ({ ...user, points: points.get(user.id) ?? 0 }));

  leaderboard.sort((a, b) => b.points - a.points);
  res.json(leaderboard);
});

// The Board page (utils/board.ts): ranking by mode, awards, family goal and trophy shelf
router.get('/board', (req: AuthRequest, res: Response) => {
  const period = (BOARD_PERIODS as readonly string[]).includes(String(req.query.period)) ? req.query.period as BoardPeriod : 'week';
  const mode = (BOARD_MODES as readonly string[]).includes(String(req.query.mode)) ? req.query.mode as BoardMode : 'coins';
  res.json(buildBoard(period, mode));
});

// Family team goal: a weekly coin target for everyone together, and the prize (0 turns it off)
router.get('/family-goal', (_req: AuthRequest, res: Response) => {
  const row = (key: string) => (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
  res.json({ target: Number(row('familyGoalCoins')) || 0, prize: row('familyGoalPrize') || '', progress: familyGoal() });
});

router.put('/family-goal', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const target = Math.round(Number(req.body?.target));
  if (!Number.isFinite(target) || target < 0 || target > 1000000) return res.status(400).json({ error: 'target must be 0 or more' });
  const prize = typeof req.body?.prize === 'string' ? req.body.prize.trim().slice(0, 80) : '';
  const set = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
  set.run('familyGoalCoins', String(target));
  set.run('familyGoalPrize', prize);
  res.json({ target, prize, progress: familyGoal() });
});

export default router;
