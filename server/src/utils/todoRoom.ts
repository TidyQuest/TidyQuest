import db, { prepared } from '../database';
import { LANGUAGES, tr } from './i18n';
import { oneTimeOverdue, type ScheduledTask } from './schedule';

/**
 * The family's To-dos room (ENH-18): made by the first "+ To-do" on Home, remembered as app_settings
 * `todoRoomId` (so renaming it is fine). Nothing in it counts toward room or house health, the
 * mascot or Insights, and anything added to it is a one-time to-do.
 */

/** The To-dos room's id, or null when the family has none (never made, or deleted). */
export function todoRoomId(): number | null {
  const saved = Number((prepared("SELECT value FROM app_settings WHERE key = 'todoRoomId'").get() as { value: string } | undefined)?.value);
  if (!saved) return null;
  return prepared('SELECT 1 FROM rooms WHERE id = ? AND deletedAt IS NULL').get(saved) ? saved : null;
}

export const isTodoRoom = (roomId: number | string | null | undefined): boolean =>
  roomId !== null && roomId !== undefined && Number(roomId) === todoRoomId();

/** "To-dos", "todos" and "To do's" are the same name */
const sameName = (name: string) => String(name).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * The To-dos room, made the first time. A room already called "To-dos" (in any of the app's
 * languages) is used instead of making a second one.
 */
export function ensureTodoRoom(language: string): number {
  const saved = todoRoomId();
  if (saved) return saved;
  const names = new Set([language, ...LANGUAGES].map((l) => sameName(tr(l, 'todos.roomName'))));
  const existing = (prepared('SELECT id, name FROM rooms WHERE deletedAt IS NULL ORDER BY id').all() as Array<{ id: number; name: string }>)
    .find((r) => names.has(sameName(r.name)));
  const id = existing?.id ?? Number(prepared("INSERT INTO rooms (name, roomType, color, accentColor) VALUES (?, 'other', '#E0F2FE', '#0284C7')")
    .run(tr(language, 'todos.roomName')).lastInsertRowid);
  prepared("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('todoRoomId', ?)").run(String(id));
  return id;
}

/** "5 to do · 2 overdue" for the To-dos room's card: its to-dos, and those past their do-by date. */
export function todoCounts(tasks: ScheduledTask[], now: Date = new Date()): { todoCount: number; todoOverdue: number } {
  const todos = tasks.filter((t) => t.oneTime);
  return { todoCount: todos.length, todoOverdue: todos.filter((t) => oneTimeOverdue(t, now)).length };
}
