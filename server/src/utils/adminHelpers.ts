import db from '../database';
import { DEFAULT_COINS_BY_EFFORT, normalizeCoinsByEffortConfig } from './health';
import { endFamilyVacation, endPersonVacation, returnDay, returnMoment } from './vacation';

export function getGlobalVacation(): { isVacation: boolean; startDate: string | null; endDate: string | null } {
  const mode = (db.prepare("SELECT value FROM app_settings WHERE key = 'vacationMode'").get() as any)?.value;
  const startDate = (db.prepare("SELECT value FROM app_settings WHERE key = 'vacationStartDate'").get() as any)?.value || null;
  // The return date is a day ('YYYY-MM-DD'): the vacation is over from the start of it (utils/vacation.ts)
  const endDate = returnDay((db.prepare("SELECT value FROM app_settings WHERE key = 'vacationEndDate'").get() as any)?.value);
  const back = returnMoment(endDate);
  if (mode === '1' && back && back.getTime() <= Date.now()) {
    endFamilyVacation(back);
    return { isVacation: false, startDate: null, endDate: null };
  }
  return { isVacation: mode === '1', startDate: startDate || null, endDate };
}

export function getUserVacation(userId: number): { isVacation: boolean; startDate: string | null } {
  const user = db.prepare('SELECT isVacationMode, vacationStartDate, vacationEndDate FROM users WHERE id = ?').get(userId) as
    { isVacationMode: number; vacationStartDate: string | null; vacationEndDate: string | null } | undefined;
  if (!user) return { isVacation: false, startDate: null };
  // Their return day has come (BUG-30)
  const back = user.isVacationMode === 1 ? returnMoment(user.vacationEndDate) : null;
  if (back && back.getTime() <= Date.now()) {
    endPersonVacation(userId, back);
    return { isVacation: false, startDate: null };
  }
  return { isVacation: user.isVacationMode === 1, startDate: user.vacationStartDate || null };
}

export function resolveVacation(
  global: { isVacation: boolean; startDate: string | null },
  user: { isVacation: boolean; startDate: string | null }
): { isVacation: boolean; startDate: string | null } {
  if (global.isVacation) return { isVacation: true, startDate: global.startDate };
  if (user.isVacation) return { isVacation: true, startDate: user.startDate };
  return { isVacation: false, startDate: null };
}

export function ensureAdmin(userId: number | undefined): boolean {
  if (!userId) return false;
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  return user?.role === 'admin';
}

export function getCoinsByEffortConfig(): Record<number, number> {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'coinsByEffort'").get() as { value?: string } | undefined;
  if (!row?.value) return DEFAULT_COINS_BY_EFFORT;
  try {
    return normalizeCoinsByEffortConfig(JSON.parse(row.value));
  } catch {
    return DEFAULT_COINS_BY_EFFORT;
  }
}

/** Kids don't see other people's private rooms (rooms assigned to someone else). On unless turned off. */
export function isHidePrivateRoomsEnabled(): boolean {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'hidePrivateRooms'").get() as { value?: string } | undefined;
  return row?.value !== '0';
}

/** Room ids hidden from this viewer: other people's private rooms, for children, when the setting is on. */
export function hiddenRoomIdsFor(userId: number | undefined): Set<number> {
  if (!userId || !isHidePrivateRoomsEnabled()) return new Set();
  const viewer = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role?: string } | undefined;
  if (viewer?.role !== 'child') return new Set();
  const rows = db.prepare('SELECT id FROM rooms WHERE deletedAt IS NULL AND assignedUserId IS NOT NULL AND assignedUserId != ?').all(userId) as { id: number }[];
  return new Set(rows.map((r) => r.id));
}

export function isStrictModeEnabled(): boolean {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'strictMode'").get() as { value?: string } | undefined;
  return row?.value === '1';
}
