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
  players: (QuestAvatar & { userId: number; displayName: string; isKid: boolean; position: number; place: number | null; finishedAt: string | null; prizeWon: boolean })[];
}
export interface QuestState {
  enabled: true;
  trail: { month: string; world: WorldKey; length: number; startDay: string; endDay: string; spaces: Record<number, MapSpace> };
  players: QuestPlayer[];
  me: { starsLeft: number; owed: number; today: { chores: number; stars: number; card: 'none' | 'open' | 'done' }; bonusAt: number } | null;
  prize: { rewardId: number | null; rewardTitle: string | null; coins: number; kidsOnly: boolean };
  finisherCoins: number;
  coinsPerStar: number;
  timeOfDay: 'day' | 'sunset' | 'night';
  fog: boolean;
  lastMonth: QuestLastMonth | null;
}
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
