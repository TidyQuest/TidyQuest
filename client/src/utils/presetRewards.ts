// The 8 starter rewards a new family gets (server/src/database.ts). While a starter reward keeps its title and
// description, everyone sees it in their own language. Once a parent changes the text, it shows as saved (#150).

type Translate = (key: string) => string;
interface RewardText { title: string; description?: string | null }

// Title (lowercase) → i18n key, and the descriptions it was seeded with: French in older installs, English in new ones
const PRESETS: Record<string, { key: string; seeds: string[] }> = {
  'movie night pick': { key: 'movie_night', seeds: ['Choisir le film du soir en famille.', "Choose tonight's family movie."] },
  'ice cream treat': { key: 'ice_cream', seeds: ['Une glace ou un dessert special.', 'Get an ice cream or special dessert.'] },
  'stay up 30 min': { key: 'late_bedtime', seeds: ['Se coucher 30 minutes plus tard.', 'Go to bed 30 minutes later.'] },
  'game time bonus': { key: 'game_bonus', seeds: ['30 minutes de jeu supplementaire.', 'Get 30 extra minutes of game time.'] },
  'choose dinner': { key: 'choose_dinner', seeds: ['Choisir le menu du diner.', 'Pick what the family eats tonight.'] },
  'park adventure': { key: 'park_adventure', seeds: ['Sortie au parc en mode aventure.', 'Special family park outing.'] },
  'no-chore pass': { key: 'chore_pass', seeds: ['Une tache au choix sautee cette semaine.', 'Skip one chore this week.'] },
  'family board game': { key: 'board_game', seeds: ['Choisir un jeu de societe pour la soiree.', 'Pick the board game for family night.'] },
};

const presetOf = (title: string) => PRESETS[title.trim().toLowerCase()];

/** The title to show: a starter reward's in the reader's language, anything else as saved. */
export function rewardTitleText(title: string, t: Translate): string {
  const p = presetOf(title);
  return p ? t(`rewardsPreset.${p.key}.title`) : title;
}

/** The description to show, or '' when there is none. Translated only while it's still the starter text. */
export function rewardDescText(r: RewardText, t: Translate): string {
  const p = presetOf(r.title);
  const desc = (r.description ?? '').trim();
  return p && p.seeds.includes(desc) ? t(`rewardsPreset.${p.key}.desc`) : desc;
}

/** What to save from the edit form: a field left as shown keeps its saved text, so it stays translated for others. */
export function rewardTextToSave(r: RewardText, title: string, description: string, t: Translate): { title: string; description: string } {
  return {
    title: title === rewardTitleText(r.title, t) ? r.title : title,
    description: description === rewardDescText(r, t) ? (r.description ?? '') : description,
  };
}
