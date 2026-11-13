/** The color themes (index.css: html[data-theme=…]; orange is the default, no attribute). */
/** The 8 free themes, then the ones unlocked by levels (utils/unlocks.ts THEME_LEVELS) */
export const THEMES = ['orange', 'blue', 'rose', 'mint', 'grape', 'sunny', 'night', 'ocean', 'forest', 'galaxy', 'lava'] as const;
export type Theme = typeof THEMES[number];

/** Swatches for the picker: page background and accent (the light themes' deeper accents from ENH-30). */
export const THEME_SWATCHES: Record<Theme, { bg: string; accent: string }> = {
  orange: { bg: '#FFF8F0', accent: '#C94A0B' },
  blue: { bg: '#F3F9FF', accent: '#2157CF' },
  rose: { bg: '#FFF5F8', accent: '#C12269' },
  mint: { bg: '#F2FBF6', accent: '#04845C' },
  grape: { bg: '#F7F4FF', accent: '#6D33D1' },
  sunny: { bg: '#FFFBEA', accent: '#8E5606' },
  night: { bg: '#0B0F19', accent: '#60A5FA' },
  ocean: { bg: '#071A1F', accent: '#2DD4BF' },
  forest: { bg: '#F3F8F1', accent: '#225B40' },
  galaxy: { bg: '#0D0B1E', accent: '#A78BFA' },
  lava: { bg: '#170A08', accent: '#F97316' },
};

export const isTheme = (v: unknown): v is Theme => typeof v === 'string' && (THEMES as readonly string[]).includes(v);
export const themeLabelKey = (theme: Theme) => `settings.theme${theme[0].toUpperCase()}${theme.slice(1)}`;
