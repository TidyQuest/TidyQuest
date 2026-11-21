import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { cleanSettings, ensureTrail, giveStar, markEndSeen, questSettings, questState, saveQuestSettings, takeTurn } from '../utils/quest';
import db from '../database';

/** Quest Trail (NEW-40, utils/quest.ts): the month's board, rolling, and the parents' settings. */
const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => res.json(questState(req.userId!)));

/** Spend a star: roll (or, after the finish, cash it in). Parents can roll for someone else. */
router.post('/roll', (req: AuthRequest, res: Response) => {
  const forId = req.body?.userId == null ? req.userId! : Number(req.body.userId);
  if (forId !== req.userId && !ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const trail = ensureTrail();
  if (!trail) return res.status(404).json({ error: 'feature_off' });
  const result = takeTurn(trail, forId, { rolledBy: req.userId!, auto: false });
  if ('error' in result) return res.status(result.error === 'not_playing' ? 404 : 409).json(result);
  res.json(result);
});

/** The end-of-month screen has been seen. */
router.post('/end-seen', (req: AuthRequest, res: Response) => {
  markEndSeen(req.userId!);
  res.json({ success: true });
});

/** Parents: give someone a star. */
router.post('/stars', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const trail = ensureTrail();
  if (!trail) return res.status(404).json({ error: 'feature_off' });
  if (!giveStar(trail, Number(req.body?.userId), req.userId!)) return res.status(404).json({ error: 'not_playing' });
  res.json(questState(req.userId!));
});

router.get('/settings', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  res.json(questSettings());
});

router.put('/settings', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const { value, error } = cleanSettings(req.body ?? {});
  if (error) return res.status(400).json({ error: 'invalid_setting', field: error });
  if (value.prizeRewardId != null && !db.prepare('SELECT 1 FROM rewards WHERE id = ? AND deletedAt IS NULL').get(value.prizeRewardId)) {
    return res.status(400).json({ error: 'invalid_setting', field: 'prizeRewardId' });
  }
  res.json(saveQuestSettings(value));
});

export default router;
