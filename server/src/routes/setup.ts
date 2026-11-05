import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin, getCoinsByEffortConfig } from '../utils/adminHelpers';
import { todoRoomId } from '../utils/todoRoom';
import { applySetup, setupNeeded, skipSetup } from '../setup/apply';
import { AGE_GROUPS, CASH_AMOUNTS, STARTER_CHORES, STARTER_REWARDS, STARTER_ROOMS } from '../setup/starter';

// The setup wizard (NEW-17). Parents only.
const router = Router();
router.use(authMiddleware);
router.use((req: AuthRequest, res: Response, next) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  next();
});

// The starter lists, plus who and what the family already has (the wizard can run again and only adds)
router.get('/', (_req: AuthRequest, res: Response) => {
  const todo = todoRoomId() ?? 0;
  res.json({
    needed: setupNeeded(),
    coinsByEffort: getCoinsByEffortConfig(),
    ageGroups: AGE_GROUPS,
    rooms: STARTER_ROOMS,
    chores: STARTER_CHORES,
    rewards: STARTER_REWARDS,
    cashAmounts: CASH_AMOUNTS,
    family: {
      people: db.prepare('SELECT id, displayName, role, isParticipant, canLogIn, avatarColor FROM users ORDER BY id').all(),
      rooms: db.prepare('SELECT id, name, roomType, assignedUserId FROM rooms WHERE deletedAt IS NULL AND id != ? ORDER BY sortOrder, id').all(todo),
      presetRewards: (db.prepare('SELECT title FROM rewards WHERE isPreset = 1 AND deletedAt IS NULL').all() as Array<{ title: string }>).map((r) => r.title),
    },
  });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const result = applySetup(req.userId!, req.body);
  if (!result.ok) {
    const { ok: _ok, status, ...error } = result;
    return res.status(status).json(error);
  }
  res.status(201).json(result.made);
});

// "Not now": the wizard stops opening by itself (Settings can still start it)
router.post('/skip', (_req: AuthRequest, res: Response) => {
  skipSetup();
  res.json({ success: true });
});

export default router;
