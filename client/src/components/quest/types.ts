import type { MapSpace, WorldKey } from './trailBuild';

/** GET /api/quest (server/src/utils/quest.ts questState) */
export interface QuestAvatar {
  avatarColor: string | null;
  avatarType: 'letter' | 'preset' | 'photo' | null;
  avatarPreset: string | null;
  avatarPhotoUrl: string | null;
}
export interface QuestPlayer extends QuestAvatar {
  userId: number;
  displayName: string;
  isKid: boolean;
  position: number;
  finishedAt: string | null;
  place: number | null;
  prizeWon: boolean;
  starsLeft: number;
}
export interface QuestLastMonth {
  month: string;
  world: WorldKey;
  length: number;
  prize: { rewardTitle: string | null; coins: number } | null;
  myCoins: number;
  badges: string[];
  /** Months this year the viewer came first (ENH-44) */
  firsts?: string[];
  players: (QuestAvatar & { userId: number; displayName: string; isKid: boolean; position: number; place: number | null; finishedAt: string | null; prizeWon: boolean })[];
}
export interface QuestState {
  enabled: true;
  trail: { month: string; world: WorldKey; length: number; startDay: string; endDay: string; spaces: Record<number, MapSpace> };
  players: QuestPlayer[];
  /** today: chores done, chores waiting for a parent's OK (Strict Mode), today's two stars, the chore card */
  me: { starsLeft: number; today: { chores: number; pending: number; stars: number; card: 'none' | 'open' | 'done' }; bonusAt: number } | null;
  /** won: who won it this month, and what (the sign at the finish then says so) */
  prize: { rewardId: number | null; rewardTitle: string | null; coins: number; kidsOnly: boolean;
    won: { userId: number; displayName: string; rewardTitle: string | null; coins: number } | null };
  finisherCoins: number;
  coinsPerStar: number;
  timeOfDay: 'day' | 'sunset' | 'night';
  fog: boolean;
  /** The viewer's trail badges this year (ENH-44); null if they haven't played */
  badges: TrailBadges | null;
  /** Who wears last winner's crown on the race strip (ENH-44) */
  crown: number | null;
  lastMonth: QuestLastMonth | null;
}
export interface TrailBadges { year: string; finished: string[]; first: string[] }
export type QuestEvent =
  | { t: 'move'; from: number; to: number }
  | { t: 'coins'; n: number }
  | { t: 'shortcut'; from: number; to: number }
  | { t: 'slide'; from: number; to: number }
  | { t: 'card'; fresh: boolean }
  | { t: 'treat'; item: string }
  | { t: 'treatCoins'; n: number }
  | { t: 'highFive'; with: number[] }
  | { t: 'finish'; place: number; coins: number; prize: { rewardId: number | null; rewardTitle: string | null; coins: number } | null }
  | { t: 'cashIn'; coins: number };
export interface QuestTurn { roll: number; from: number; to: number; events: QuestEvent[]; coins: number; starsLeft: number }
