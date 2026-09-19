import { effect, Service, signal, Signal } from '@angular/core';
import { DEFAULT_LANGUAGE, Language, LANGUAGES } from './language.model';
import { en, TranslationKey } from './translations/en';
import { pl } from './translations/pl';

const STORAGE_KEY = 'listify:language';

const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { en, pl };

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    // localStorage unavailable — fall through to browser detection.
    return null;
  }
}

function readBrowserLanguage(): Language | null {
  const base = navigator.language?.toLowerCase().split('-')[0];
  return isLanguage(base) ? base : null;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

@Service()
export class I18n {
  private readonly current = signal<Language>(
    readStoredLanguage() ?? readBrowserLanguage() ?? DEFAULT_LANGUAGE,
  );

  readonly language: Signal<Language> = this.current.asReadonly();

  constructor() {
    effect(() => {
      const language = this.current();
      document.documentElement.lang = language;
      try {
        localStorage.setItem(STORAGE_KEY, language);
      } catch {
        // localStorage unavailable or full — the choice stays in memory for this session.
      }
    });
  }

  setLanguage(language: Language): void {
    this.current.set(language);
  }

  /**
   * Declared as an arrow-function property, not a method, so a component can
   * expose it directly (`protected readonly t = inject(I18n).t`) and call it
   * unqualified from its template. Reading `current()` inside is what makes
   * every `t(...)` expression in a template re-evaluate on a language change.
   */
  readonly t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const template = DICTIONARIES[this.current()][key] ?? en[key];
    return params ? interpolate(template, params) : template;
  };
}
