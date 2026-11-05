// The setup wizard's starter lists (NEW-17): chores and rewards by age group and room, picked from fixed lists
// (no AI). A family ticks what they want and POST /api/setup turns the picks into people, rooms, chores, rewards and
// weekly goals. The same lists can feed the website's printable "chore chart by age" page.
//
// Chore names are stored in English with a translationKey ("room.key"), so everyone sees them in their own language
// (client/src/i18n/*.json under tasks.<room>.<key>). Keys from routes/rooms.ts DEFAULT_TASKS are reused where they fit;
// new ones live under tasks.starter.*. Reward text comes from the client in the parent's language.

export type AgeGroup = '3-5' | '6-8' | '9-12' | '13+';
export const AGE_GROUPS: AgeGroup[] = ['3-5', '6-8', '9-12', '13+'];
/** Rewards also have a set for grown-ups who take part, so a household without kids gets rewards too */
export type Audience = AgeGroup | 'adult';

/** Where a chore goes: 'own' = the kid's own room; anything else is one of STARTER_ROOMS */
export type StarterRoomId = 'kitchen' | 'bathroom' | 'living' | 'laundry' | 'bedroom' | 'yard' | 'pets' | 'garage' | 'office';

export interface StarterRoom {
  id: StarterRoomId;
  /** rooms.roomType */
  type: 'kitchen' | 'bedroom' | 'bathroom' | 'living' | 'office' | 'garage' | 'laundry' | 'other';
  /** Ticked when the wizard opens */
  ticked: boolean;
  color: string;
  accent: string;
}

// 'bedroom' is the parents' room: each kid gets their own room automatically
export const STARTER_ROOMS: StarterRoom[] = [
  { id: 'kitchen', type: 'kitchen', ticked: true, color: '#FFE4CC', accent: '#F97316' },
  { id: 'bathroom', type: 'bathroom', ticked: true, color: '#DBEAFE', accent: '#2563EB' },
  { id: 'living', type: 'living', ticked: true, color: '#DCFCE7', accent: '#16A34A' },
  { id: 'laundry', type: 'laundry', ticked: true, color: '#E0F2FE', accent: '#0284C7' },
  { id: 'bedroom', type: 'bedroom', ticked: false, color: '#FCE7F3', accent: '#DB2777' },
  { id: 'yard', type: 'other', ticked: false, color: '#ECFCCB', accent: '#65A30D' },
  { id: 'pets', type: 'other', ticked: false, color: '#FEF3C7', accent: '#D97706' },
  { id: 'garage', type: 'garage', ticked: false, color: '#E5E7EB', accent: '#4B5563' },
  { id: 'office', type: 'office', ticked: false, color: '#EDE9FE', accent: '#7C3AED' },
];

/** Kids' own rooms take these in turn */
export const KID_ROOM_COLORS: Array<{ color: string; accent: string }> = [
  { color: '#EDE4FB', accent: '#7C3AED' },
  { color: '#FFE4E6', accent: '#E11D48' },
  { color: '#CCFBF1', accent: '#0D9488' },
  { color: '#FEF9C3', accent: '#CA8A04' },
  { color: '#E0E7FF', accent: '#4F46E5' },
];

export interface StarterChore {
  /** Also the translationKey */
  id: string;
  /** English name, stored as the task name */
  name: string;
  room: 'own' | StarterRoomId;
  frequencyDays: number;
  effort: 1 | 2 | 3 | 4 | 5;
  /** Age groups it's suggested for. Kids in more than one of them share it: whoever does it first gets the coins. */
  ages: AgeGroup[];
  /** Shared rooms only: the grown-ups get it when no kid in the family is in `ages` */
  adults?: boolean;
  /** Ticked when the wizard opens (otherwise it's under "More ideas") */
  ticked: boolean;
  timerMinutes?: number;
}

export const STARTER_CHORES: StarterChore[] = [
  // ── Their own room: routines (each kid gets their own copy) ──
  { id: 'starter.morning_routine', name: 'Morning: get dressed · brush teeth · make the bed', room: 'own', frequencyDays: 1, effort: 1, ages: ['3-5', '6-8', '9-12'], ticked: true },
  { id: 'starter.bedtime_routine', name: 'Bedtime: bath or shower · teeth · clothes in the hamper', room: 'own', frequencyDays: 1, effort: 1, ages: ['3-5', '6-8', '9-12'], ticked: true },
  { id: 'starter.toys_away', name: 'Put the toys away (5 minutes)', room: 'own', frequencyDays: 1, effort: 1, ages: ['3-5'], ticked: true, timerMinutes: 5 },
  { id: 'starter.backpack_ready', name: 'Backpack and shoes by the door', room: 'own', frequencyDays: 1, effort: 1, ages: ['6-8', '9-12'], ticked: true },
  { id: 'starter.room_tidy', name: '10-minute room tidy', room: 'own', frequencyDays: 3, effort: 2, ages: ['6-8', '9-12'], ticked: true, timerMinutes: 10 },
  { id: 'starter.put_away_laundry', name: 'Put away your clean laundry', room: 'own', frequencyDays: 7, effort: 2, ages: ['6-8', '9-12'], ticked: true },
  { id: 'bedroom.make_bed', name: 'Make Bed', room: 'own', frequencyDays: 1, effort: 1, ages: ['13+'], ticked: true },
  { id: 'bedroom.vacuum_floor', name: 'Vacuum Floor', room: 'own', frequencyDays: 7, effort: 2, ages: ['9-12', '13+'], ticked: true },
  { id: 'starter.empty_room_trash', name: "Empty your room's trash", room: 'own', frequencyDays: 7, effort: 1, ages: ['9-12', '13+'], ticked: false },
  { id: 'bedroom.change_sheets', name: 'Change Sheets', room: 'own', frequencyDays: 14, effort: 3, ages: ['13+'], ticked: true },
  { id: 'starter.own_laundry', name: 'Your laundry: wash · dry · fold · put away', room: 'own', frequencyDays: 7, effort: 4, ages: ['13+'], ticked: true },

  // ── Kitchen ──
  { id: 'starter.set_clear_table', name: 'Set and clear the table', room: 'kitchen', frequencyDays: 1, effort: 2, ages: ['3-5', '6-8'], ticked: true },
  { id: 'starter.unload_dishwasher', name: 'Unload the dishwasher', room: 'kitchen', frequencyDays: 1, effort: 2, ages: ['9-12'], adults: false, ticked: true },
  { id: 'kitchen.wash_dishes', name: 'Wash Dishes', room: 'kitchen', frequencyDays: 1, effort: 2, ages: ['13+'], adults: true, ticked: true },
  { id: 'kitchen.empty_household_waste', name: 'Empty Household Waste', room: 'kitchen', frequencyDays: 2, effort: 1, ages: ['9-12', '13+'], adults: true, ticked: true },
  { id: 'starter.bins_to_curb', name: 'Bins to the curb and back', room: 'kitchen', frequencyDays: 7, effort: 2, ages: ['13+'], adults: true, ticked: true },
  { id: 'kitchen.clean_counters', name: 'Clean Counters', room: 'kitchen', frequencyDays: 1, effort: 1, ages: [], adults: true, ticked: true },
  { id: 'kitchen.wipe_stovetop', name: 'Wipe Stovetop', room: 'kitchen', frequencyDays: 3, effort: 2, ages: [], adults: true, ticked: true },
  { id: 'kitchen.clean_microwave', name: 'Clean Microwave', room: 'kitchen', frequencyDays: 7, effort: 2, ages: ['9-12'], adults: true, ticked: false },
  { id: 'kitchen.mop_floor', name: 'Mop Floor', room: 'kitchen', frequencyDays: 7, effort: 4, ages: ['13+'], adults: true, ticked: false },
  { id: 'kitchen.clean_fridge', name: 'Clean Fridge', room: 'kitchen', frequencyDays: 14, effort: 3, ages: [], adults: true, ticked: true },
  { id: 'starter.cook_dinner', name: 'Cook dinner one night', room: 'kitchen', frequencyDays: 7, effort: 4, ages: ['13+'], ticked: false },

  // ── Bathroom ──
  { id: 'bathroom.clean_mirror', name: 'Clean Mirror', room: 'bathroom', frequencyDays: 7, effort: 1, ages: ['6-8'], ticked: false },
  { id: 'starter.empty_bathroom_trash', name: 'Empty the bathroom trash', room: 'bathroom', frequencyDays: 7, effort: 1, ages: ['6-8'], adults: true, ticked: true },
  { id: 'bathroom.wipe_sink_counter', name: 'Wipe Sink & Counter', room: 'bathroom', frequencyDays: 3, effort: 1, ages: ['9-12'], adults: true, ticked: true },
  { id: 'bathroom.scrub_toilet', name: 'Scrub Toilet', room: 'bathroom', frequencyDays: 7, effort: 3, ages: ['13+'], adults: true, ticked: true },
  { id: 'bathroom.clean_shower_tub', name: 'Clean Shower/Tub', room: 'bathroom', frequencyDays: 7, effort: 4, ages: [], adults: true, ticked: true },
  { id: 'bathroom.wash_towels', name: 'Wash Towels', room: 'bathroom', frequencyDays: 7, effort: 2, ages: [], adults: true, ticked: true },
  { id: 'bathroom.mop_floor', name: 'Mop Floor', room: 'bathroom', frequencyDays: 14, effort: 3, ages: [], adults: true, ticked: false },

  // ── Living room ──
  { id: 'living.tidy_up', name: 'Tidy Up / Put Things Away', room: 'living', frequencyDays: 1, effort: 1, ages: ['3-5', '6-8'], adults: true, ticked: true },
  { id: 'living.vacuum_carpet', name: 'Vacuum Carpet/Floor', room: 'living', frequencyDays: 7, effort: 3, ages: ['9-12', '13+'], adults: true, ticked: true },
  { id: 'living.dust_surfaces_shelves', name: 'Dust Surfaces & Shelves', room: 'living', frequencyDays: 14, effort: 2, ages: ['9-12'], adults: true, ticked: false },
  { id: 'living.fluff_cushions', name: 'Fluff & Tidy Cushions', room: 'living', frequencyDays: 3, effort: 1, ages: ['3-5'], ticked: false },

  // ── Laundry ──
  { id: 'starter.match_socks', name: 'Match the socks', room: 'laundry', frequencyDays: 7, effort: 1, ages: ['3-5'], ticked: false },
  { id: 'starter.fold_towels', name: 'Fold and put away the towels', room: 'laundry', frequencyDays: 7, effort: 2, ages: ['6-8', '9-12'], adults: true, ticked: false },
  { id: 'starter.family_laundry', name: 'Wash and dry the family laundry', room: 'laundry', frequencyDays: 3, effort: 3, ages: [], adults: true, ticked: true },
  { id: 'laundry.clean_lint_filter', name: 'Clean Lint Filter', room: 'laundry', frequencyDays: 7, effort: 1, ages: [], adults: true, ticked: false },

  // ── The parents' bedroom ──
  { id: 'bedroom.make_bed', name: 'Make Bed', room: 'bedroom', frequencyDays: 1, effort: 1, ages: [], adults: true, ticked: true },
  { id: 'bedroom.change_sheets', name: 'Change Sheets', room: 'bedroom', frequencyDays: 7, effort: 3, ages: [], adults: true, ticked: true },
  { id: 'bedroom.vacuum_floor', name: 'Vacuum Floor', room: 'bedroom', frequencyDays: 7, effort: 2, ages: [], adults: true, ticked: false },

  // ── Yard ──
  { id: 'starter.water_plants', name: 'Water the plants', room: 'yard', frequencyDays: 3, effort: 1, ages: ['3-5', '6-8'], adults: true, ticked: false },
  { id: 'starter.pick_up_yard', name: 'Pick up the yard', room: 'yard', frequencyDays: 7, effort: 2, ages: ['6-8', '9-12'], adults: true, ticked: true },
  { id: 'starter.pull_weeds', name: 'Pull weeds (15 minutes)', room: 'yard', frequencyDays: 14, effort: 3, ages: ['9-12', '13+'], ticked: false, timerMinutes: 15 },
  { id: 'starter.mow_lawn', name: 'Mow the lawn', room: 'yard', frequencyDays: 7, effort: 4, ages: ['13+'], adults: true, ticked: true },

  // ── Pets ──
  { id: 'starter.pet_water', name: 'Fill the water bowl', room: 'pets', frequencyDays: 1, effort: 1, ages: ['3-5'], ticked: true },
  { id: 'starter.feed_pets', name: 'Feed the pets', room: 'pets', frequencyDays: 1, effort: 1, ages: ['6-8', '9-12'], adults: true, ticked: true },
  { id: 'starter.pet_cleanup', name: 'Scoop the litter or poop patrol', room: 'pets', frequencyDays: 2, effort: 2, ages: ['13+'], adults: true, ticked: true },
  { id: 'starter.walk_dog', name: 'Walk the dog (20 minutes)', room: 'pets', frequencyDays: 1, effort: 2, ages: ['9-12', '13+'], ticked: false, timerMinutes: 20 },

  // ── Garage ──
  { id: 'garage.sweep_floor', name: 'Sweep Floor', room: 'garage', frequencyDays: 30, effort: 3, ages: ['13+'], adults: true, ticked: false },
  { id: 'garage.clear_cobwebs', name: 'Clear Cobwebs', room: 'garage', frequencyDays: 30, effort: 2, ages: [], adults: true, ticked: false },

  // ── Office ──
  { id: 'office.clear_desk', name: 'Clear Desk', room: 'office', frequencyDays: 1, effort: 1, ages: [], adults: true, ticked: true },
  { id: 'office.vacuum_floor', name: 'Vacuum Floor', room: 'office', frequencyDays: 7, effort: 2, ages: [], adults: true, ticked: false },
];

export interface StarterReward {
  id: string;
  /** About how many weeks of this kid's chores it costs (each kid gets their own price) */
  weeks: number;
  ages: Audience[];
  ticked: boolean;
  /** One of the 8 rewards every new family starts with (database.ts): the wizard keeps or removes that one */
  presetTitle?: string;
}

// Reward text is in the client's i18n (ui.setup.rewards.<id>); presets use the existing rewardsPreset.* text
export const STARTER_REWARDS: StarterReward[] = [
  { id: 'sticker', weeks: 0.15, ages: ['3-5'], ticked: true },
  { id: 'extra_story', weeks: 0.15, ages: ['3-5', '6-8'], ticked: true },
  { id: 'board_game', weeks: 0.25, ages: ['3-5', '6-8', '9-12'], ticked: true, presetTitle: 'Family Board Game' },
  { id: 'car_music', weeks: 0.2, ages: ['6-8', '9-12', '13+'], ticked: true },
  { id: 'ice_cream', weeks: 0.3, ages: ['3-5', '6-8', '9-12'], ticked: true, presetTitle: 'Ice Cream Treat' },
  { id: 'pick_breakfast', weeks: 0.3, ages: ['3-5', '6-8'], ticked: false },
  { id: 'game_bonus', weeks: 0.4, ages: ['6-8', '9-12', '13+'], ticked: true, presetTitle: 'Game Time Bonus' },
  { id: 'movie_night', weeks: 0.5, ages: ['3-5', '6-8', '9-12', '13+', 'adult'], ticked: true, presetTitle: 'Movie Night Pick' },
  { id: 'choose_dinner', weeks: 0.5, ages: ['3-5', '6-8', '9-12', '13+', 'adult'], ticked: true, presetTitle: 'Choose Dinner' },
  { id: 'late_bedtime', weeks: 0.5, ages: ['6-8', '9-12'], ticked: true, presetTitle: 'Stay Up 30 Min' },
  { id: 'one_on_one', weeks: 1, ages: ['3-5', '6-8', '9-12', '13+'], ticked: true },
  { id: 'bake_together', weeks: 1, ages: ['3-5', '6-8', '9-12'], ticked: false },
  { id: 'park_adventure', weeks: 1, ages: ['3-5', '6-8', '9-12'], ticked: true, presetTitle: 'Park Adventure' },
  { id: 'later_curfew', weeks: 1, ages: ['13+'], ticked: true },
  { id: 'takeout_pick', weeks: 1, ages: ['9-12', '13+', 'adult'], ticked: false },
  { id: 'chore_pass', weeks: 1.5, ages: ['6-8', '9-12', '13+', 'adult'], ticked: true, presetTitle: 'No-Chore Pass' },
  { id: 'friend_over', weeks: 2, ages: ['6-8', '9-12', '13+'], ticked: true },
  { id: 'small_toy', weeks: 3, ages: ['3-5', '6-8', '9-12'], ticked: true },
  { id: 'sleepover', weeks: 4, ages: ['9-12', '13+'], ticked: false },
  { id: 'day_out', weeks: 4, ages: ['3-5', '6-8', '9-12', '13+'], ticked: true },
  // Grown-ups
  { id: 'coffee_out', weeks: 0.3, ages: ['adult'], ticked: true },
  { id: 'sleep_in', weeks: 0.5, ages: ['adult'], ticked: true },
  { id: 'me_time', weeks: 1, ages: ['adult'], ticked: true },
  { id: 'night_off', weeks: 1, ages: ['adult'], ticked: true },
  { id: 'pick_outing', weeks: 3, ages: ['adult'], ticked: false },
];

/** The starter rewards' English descriptions (database.ts), so a re-made one still shows in each reader's language */
export const PRESET_DESCRIPTIONS: Record<string, string> = {
  'Movie Night Pick': "Choose tonight's family movie.",
  'Ice Cream Treat': 'Get an ice cream or special dessert.',
  'Stay Up 30 Min': 'Go to bed 30 minutes later.',
  'Game Time Bonus': 'Get 30 extra minutes of game time.',
  'Choose Dinner': 'Pick what the family eats tonight.',
  'Park Adventure': 'Special family park outing.',
  'No-Chore Pass': 'Skip one chore this week.',
  'Family Board Game': 'Pick the board game for family night.',
};

/** Cash-out rewards when a kid gets an allowance: this many units of money each */
export const CASH_AMOUNTS = [1, 5];

// ── The math (shared by the server's save step and its tests; the client repeats weeklyCoins for its preview) ──

/** Coins a chore pays a week when it's done every time it's due, split between the people sharing it */
export function choreWeeklyCoins(chore: { frequencyDays: number; effort: number }, coinsByEffort: Record<number, number>, sharedBy = 1): number {
  return (coinsByEffort[chore.effort] ?? 0) * (7 / chore.frequencyDays) / Math.max(1, sharedBy);
}

/** A friendly price: 5s under 50, 10s under 200, 25s above; never under 5 */
export function nicePrice(coins: number): number {
  const step = coins < 50 ? 5 : coins < 200 ? 10 : 25;
  return Math.max(5, Math.round(coins / step) * step);
}

/** A reward's price for someone earning `weekly` coins a week */
export function rewardPrice(weeks: number, weekly: number): number {
  return nicePrice(weeks * weekly);
}

/** The weekly goal: about 70% of what their chores pay, with a 10% bonus for reaching it */
export function weeklyGoal(weekly: number): { goalCoins: number; rewardCoins: number } {
  return { goalCoins: nicePrice(weekly * 0.7), rewardCoins: nicePrice(weekly * 0.1) };
}

/** Coins for one unit of allowance money: a kid who does every chore earns `allowance` a week */
export function coinsPerMoney(weekly: number, allowance: number): number {
  return allowance > 0 ? weekly / allowance : 0;
}

export function starterChore(id: string, room: StarterChore['room']): StarterChore | undefined {
  return STARTER_CHORES.find((c) => c.id === id && c.room === room);
}

export function starterReward(id: string): StarterReward | undefined {
  return STARTER_REWARDS.find((r) => r.id === id);
}
