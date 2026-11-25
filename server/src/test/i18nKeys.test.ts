import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LADDERS } from '../utils/achievementStats';
import { LANGUAGES, LOCALES, taskName, tr } from '../utils/i18n';

// A key with no English text shows as the raw key (e.g. "badges.ladder_team_ups", #175)
const APP = join(__dirname, '../../..');
const catalog = (lang: string) => JSON.parse(readFileSync(join(APP, 'client/src/i18n', `${lang}.json`), 'utf8'));
const ui = (lang: string) => catalog(lang).ui;

/** Every key in a language file as "section.key" (nested ones as "section.group.key"). */
function flatten(o: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]);
}

/** The app's and server's own code: no tests, language files or guide text. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return ['node_modules', 'i18n', 'docs', 'test'].includes(name) ? [] : sourceFiles(p);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [p] : [];
  });
}

describe('Translations', () => {
  it('every row of badges on the Achievements page has a heading in every supported language', () => {
    const missing = LANGUAGES.flatMap((lang) => {
      const badges = ui(lang).badges ?? {};
      return [...LADDERS].filter((m) => typeof badges[`ladder_${m}`] !== 'string').map((m) => `${lang}: badges.ladder_${m}`);
    });
    expect(LADDERS.size).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('covers the English catalog in Brazilian Portuguese and preserves interpolation tokens', () => {
    const en = catalog('en');
    const ptBR = catalog('pt-BR');
    const keys = flatten(en);
    expect(flatten(ptBR).sort()).toEqual(keys.slice().sort());

    const tokens = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort();
    const invalid = keys.filter((key) => {
      const parts = key.split('.');
      const original = parts.reduce((value, part) => value[part], en);
      const translated = parts.reduce((value, part) => value[part], ptBR);
      return typeof translated !== 'string' || !translated.trim()
        || tokens(original).join(' ') !== tokens(translated).join(' ');
    });
    expect(invalid).toEqual([]);
  });

  it('uses Brazilian Portuguese for server messages, task names and date formatting', () => {
    expect(LOCALES['pt-BR']).toBe('pt-BR');
    expect(taskName('pt-BR', { name: 'Wash dishes', translationKey: 'kitchen.wash_dishes' })).toBe('Lavar a louça');
    expect(tr('pt-BR', 'trash.deleted', { name: 'Louça' })).toBe('“Louça” foi excluída');
  });

  it('every fixed key the app or server names has English text', () => {
    const en = ui('en');
    const keys = new Set(flatten(en));
    const sections = new Set(Object.keys(en));
    const missing: string[] = [];
    for (const root of ['client/src', 'server/src']) {
      for (const file of sourceFiles(join(APP, root))) {
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          for (const m of line.matchAll(/(['"`])([a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z0-9_.]+)\1/g)) {
            const key = m[2];
            if (!sections.has(key.split('.')[0]) || key.endsWith('.') || keys.has(key)) continue;
            if ([...keys].some((k) => k.startsWith(`${key}.`))) continue; // a group, like rewardsPreset.chore_pass
            missing.push(`${key} (${relative(APP, file)}:${i + 1})`);
          }
        });
      }
    }
    expect(missing).toEqual([]);
  });
});
