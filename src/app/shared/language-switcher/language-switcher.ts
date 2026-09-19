import { Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { Language, LANGUAGES } from '../../core/i18n/language.model';
import { TranslationKey } from '../../core/i18n/translations/en';

const LANGUAGE_NAME_KEYS: Record<Language, TranslationKey> = {
  en: 'language.en',
  pl: 'language.pl',
};

@Component({
  selector: 'app-language-switcher',
  template: `
    <div class="language-switcher" role="group" [attr.aria-label]="t('language.label')">
      @for (language of languages; track language) {
        <button
          type="button"
          class="language-switcher__option"
          [class.language-switcher__option--active]="language === i18n.language()"
          [attr.aria-pressed]="language === i18n.language()"
          [attr.aria-label]="t(nameKeys[language])"
          (click)="select(language)"
        >
          {{ language.toUpperCase() }}
        </button>
      }
    </div>
  `,
  styles: `
    .language-switcher {
      display: inline-flex;
      gap: 0.125rem;
      padding: 0.125rem;
      border: 1px solid rgba(199, 208, 205, 0.7);
      border-radius: 999px;
    }

    .language-switcher__option {
      min-width: 2.75rem;
      min-height: 2.75rem;
      padding: 0 0.75rem;
      border: none;
      border-radius: 999px;
      background: transparent;
      /* rgba(20, 32, 29, 0.65) on the header background clears 4.5:1; the
         same value the app uses for its other secondary text. */
      color: rgba(20, 32, 29, 0.65);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      cursor: pointer;

      &:hover {
        color: var(--color-ink);
      }

      &:focus-visible {
        outline: 2px solid var(--color-accent);
        outline-offset: 2px;
      }
    }

    .language-switcher__option--active {
      /* A dedicated shade, darker than --color-accent (#0f8a6c), so white
         text on this small (12px/800) label clears the WCAG AA 4.5:1
         contrast minimum — verified ≈5.15:1. Scoped to this component only;
         --color-accent itself is used unchanged in ~15 other places in the
         app and redesigning it globally is out of scope for this fix. */
      background-color: #0e7c61;
      color: #ffffff;
    }
  `,
})
export class LanguageSwitcher {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly languages = LANGUAGES;
  protected readonly nameKeys = LANGUAGE_NAME_KEYS;

  protected select(language: Language): void {
    this.i18n.setLanguage(language);
  }
}
