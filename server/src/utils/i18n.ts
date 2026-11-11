import fs from 'fs';
import path from 'path';

/**
 * The app's own translations (client/src/i18n/<lang>.json, also copied into the Docker image), so
 * server messages like notifications use the same words, in each person's language.
 * From server/src/utils and server/dist/utils alike, ../../../ is the app root.
 */
const I18N_DIR = path.join(__dirname, '..', '..', '..', 'client', 'src', 'i18n');
export const LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'nl'];
/** Each language's locale, for dates and times. */
export const LOCALES: Record<string, string> = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT', nl: 'nl-NL' };

type Sections = Record<string, Record<string, string>>;
/** A language file: the app's texts ("ui") and the names of the starter and room-default chores ("tasks") */
const cache = new Map<string, { ui: Sections; tasks: Sections }>();

function file(lang: string): { ui: Sections; tasks: Sections } {
  if (!cache.has(lang)) {
    try {
      const all = JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${lang}.json`), 'utf-8'));
      cache.set(lang, { ui: all.ui ?? {}, tasks: all.tasks ?? {} });
    } catch {
      cache.set(lang, { ui: {}, tasks: {} });
    }
  }
  return cache.get(lang)!;
}
const strings = (lang: string) => file(lang).ui;
const known = (lang: string | null | undefined) => (lang && LANGUAGES.includes(lang) ? lang : 'en');

/** "section.key" in `lang` (falls back to English, then the key), with {name} placeholders filled. */
export function tr(lang: string | null | undefined, key: string, vars: Record<string, string | number> = {}): string {
  const [section, ...rest] = key.split('.');
  const k = rest.join('.');
  const text = strings(known(lang))[section]?.[k] ?? strings('en')[section]?.[k] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/** What a message needs to name a chore */
export interface TaskLabel { name: string; translationKey?: string | null }

/**
 * A chore's name in `lang`. Starter and room-default chores are saved with an English name and a
 * translationKey ("kitchen.wash_dishes") until someone renames them; the app translates those the same way
 * (client useTranslation `taskName`).
 */
export function taskName(lang: string | null | undefined, task: TaskLabel): string {
  if (!task.translationKey) return task.name;
  const [room, ...rest] = task.translationKey.split('.');
  const key = rest.join('.');
  return file(known(lang)).tasks[room]?.[key] ?? file('en').tasks[room]?.[key] ?? task.name;
}
