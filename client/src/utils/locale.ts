/** The app's language options, with their locales for dates and numbers. */
export const LANGUAGES = [
  { value: 'en', label: 'English', locale: 'en-US' },
  { value: 'fr', label: 'Français', locale: 'fr-FR' },
  { value: 'de', label: 'Deutsch', locale: 'de-DE' },
  { value: 'es', label: 'Español', locale: 'es-ES' },
  { value: 'it', label: 'Italiano', locale: 'it-IT' },
  { value: 'nl', label: 'Nederlands', locale: 'nl-NL' },
  { value: 'pt-BR', label: 'Português (Brasil)', locale: 'pt-BR' },
];

export function localeFor(language?: string | null): string {
  return LANGUAGES.find(({ value }) => value === language)?.locale ?? 'en-US';
}

export function browserLanguage(): string {
  const browser = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  const base = browser.split('-')[0];
  return LANGUAGES.find(({ value }) => value.toLowerCase() === browser)?.value
    ?? (base === 'pt' ? 'pt-BR' : LANGUAGES.find(({ value }) => value === base)?.value ?? 'en');
}
