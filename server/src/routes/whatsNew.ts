import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { markWhatsNewSeen, WHATS_NEW } from '../utils/whatsNew';

/** "What's new" after a big update (NEW-38): the dashboard says what's unseen; this marks it seen (or skipped). */
const router = Router();
router.use(authMiddleware);

router.post('/seen', (req: AuthRequest, res: Response) => {
  const ids = req.body?.ids;
  if (ids !== undefined && (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))) {
    return res.status(400).json({ error: 'invalid_ids' });
  }
  markWhatsNewSeen([req.userId!], ids ?? WHATS_NEW);
  res.json({ success: true });
});

export default router;
