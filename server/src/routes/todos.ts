import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { ensureTodoRoom } from '../utils/todoRoom';
import { createTask } from './tasks';

/**
 * "+ To-do" on Home (parents): add a one-time chore without opening a room. It goes into the room
 * picked, or the family's "To-dos" room (made the first time, then reused even if renamed: utils/todoRoom.ts).
 */
const router = Router();
router.use(authMiddleware);

router.post('/', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : '';
  if (!name) return res.status(400).json({ error: 'name is required' });
  const lang = (db.prepare('SELECT language FROM users WHERE id = ?').get(req.userId) as { language: string | null } | undefined)?.language ?? 'en';
  const roomId = req.body?.roomId ? Number(req.body.roomId) : ensureTodoRoom(lang);
  const result = createTask(roomId, {
    name,
    notes: req.body?.notes,
    effort: 1,
    frequencyDays: 7,
    oneTime: true,
    doBy: req.body?.doBy ?? null,
    customCoins: req.body?.customCoins,
    assignedUserIds: Array.isArray(req.body?.assignedUserIds) ? req.body.assignedUserIds : [],
    reminderTime: req.body?.reminderTime ?? null,
  });
  if (result.status === 201) {
    // Exactly the people chosen: a to-do filed in someone's room doesn't also go to the room's owner
    const keep = (Array.isArray(req.body?.assignedUserIds) ? req.body.assignedUserIds : []).map(Number);
    if (keep.length) {
      db.prepare(`DELETE FROM task_assignees WHERE taskId = ? AND userId NOT IN (${keep.map(() => '?').join(',')})`).run(result.body.id, ...keep);
    }
  }
  res.status(result.status).json(result.body);
});

export default router;
