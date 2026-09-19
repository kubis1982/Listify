# Internationalization (EN/PL) — Design Spec

Date: 2026-09-19

## Problem

Every piece of user-facing text in Listify is hardcoded English, spelled out
inline in the 11 component templates and, for dialogs and accessible names,
in the TypeScript alongside them — `confirm({ title: 'Delete this unit?' })`
in `units-manager.ts`, `'Cannot edit ' + unit.name + ' — used by a product'`
as an `aria-label`, and so on. A Polish-speaking user has no way to use the
application in Polish, and there is no seam in the codebase where a second
language could be added.

## Goals

- Let the user read the entire interface in English or Polish and switch
  between them from inside the application, with the change taking effect
  immediately and without a page reload.
- Remember the choice across sessions and across PWA launches, and pick a
  sensible language on the first visit based on the browser.
- Make an untranslated string a build error rather than a runtime surprise.
- Keep the application fully offline-capable: a service worker is registered
  (`app.config.ts`), so translations must not depend on a network fetch.
- Keep accessibility at the WCAG AA level the project already holds:
  accessible names translate along with visible text, and the document
  language is announced correctly to screen readers.

## Non-goals

- Translating user data. Products, units, categories and list names are typed
  in by the user and are stored verbatim; they are never translated.
- Per-locale builds or locale-prefixed URLs. One build serves both languages.
- The browser tab title and `manifest.webmanifest`. The manifest is a static
  file with one name per file; translating it properly needs per-locale builds,
  which this design rejects.
- README and the documents under `docs/`. They are developer documentation,
  not part of the product.
- Plural forms / ICU messages. The UI contains exactly one counted string,
  the progress line in `shopping-list-detail.ts:107`
  (`"{purchased} of {total} purchased"`). Its Polish rendering,
  `"Kupiono {purchased} z {total}"`, puts no noun in agreement with either
  number, so it is correct for every count with plain parameter
  substitution. If a string that genuinely inflects with a count appears
  later, plural support is added then, for that string.
- Lazy-loaded translation files. Both dictionaries ship in the main bundle.
- Right-to-left layouts, and any third language.

## Decisions

These were settled with the user before design:

| Question | Decision |
|---|---|
| How the language is chosen | A switcher in the UI; the change is immediate, with no reload |
| Build strategy | One build, runtime translation |
| Default / fallback language | English — also the source language of the dictionary |
| First-visit detection | `navigator.language` starting with `pl` selects Polish; anything else falls back to English |
| Switcher placement | In the header, next to the hamburger button |
| Mechanism | A hand-written signal-based service; no `@angular/localize`, no Transloco or ngx-translate |
| Date formatting | Follows the selected language |
| Import/export failures | The message shown to the user is translated; the export file itself stays language-neutral |

### Why not the alternatives

`@angular/localize` is the official route, but swapping translations at
runtime requires `loadTranslations()` before bootstrap, so the language
cannot change without a reload — which rules it out given the decision above.

Transloco supports runtime switching, but it fetches JSON over HTTP, which
would have to be added to `ngsw-config.json` for the PWA to keep working
offline; it adds a dependency and its upgrade cycle; and it gives no key
type-safety without a code generator. For roughly 200 strings in a closed,
small application that trade is not worth making.

A hand-written service costs one small file, has no dependencies, matches the
signal-first style the codebase already uses (`@Service`, `inject()`,
`signal()`), and — through the dictionary's type — turns a missing translation
into a compile error.

## Architecture

A new `src/app/core/i18n/` directory, sitting beside the existing
`core/storage/`:

```
src/app/core/i18n/
  language.model.ts
  i18n.service.ts
  translations/
    en.ts
    pl.ts
```

### `language.model.ts`

```ts
export type Language = 'en' | 'pl';

export const LANGUAGES: readonly Language[] = ['en', 'pl'];
export const DEFAULT_LANGUAGE: Language = 'en';
```

### `translations/en.ts`

A flat object literal with dot-separated keys, declared `as const`, plus the
key type derived from it:

```ts
export const en = {
  'nav.label': 'Main navigation',
  'nav.lists': 'Shopping lists',
  'units.title': 'Units of measure',
  'units.setDefault': 'Set {name} as default',
  // …
} as const;

export type TranslationKey = keyof typeof en;
```

Flat keys, not nested objects: they keep the key type a plain string union,
which needs no template-literal type machinery and gives editor completion
for free.

### `translations/pl.ts`

```ts
import { TranslationKey } from './en';

export const pl: Record<TranslationKey, string> = {
  'nav.label': 'Nawigacja główna',
  // …
};
```

This annotation is the type-safety guarantee: a key missing from `pl` and a
key misspelled in `pl` both fail `ng build`.

### `i18n.service.ts`

```ts
@Service()
export class I18n {
  readonly language: Signal<Language>;
  setLanguage(language: Language): void;
  readonly t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}
```

`t` is declared as an arrow-function property, not a method, so a component
can expose it directly:

```ts
protected readonly t = inject(I18n).t;
```

and the template reads `{{ t('units.title') }}` — no pipe, no entry in the
component's `imports`. Because `t` reads the `language()` signal internally,
every template expression that calls it re-evaluates when the language
changes; reactivity needs no further machinery.

Parameters use `{name}` placeholders, substituted by a small internal
`interpolate` helper. This covers the accessible names currently assembled by
string concatenation, for example
`t('units.setDefault', { name: unit.name })` for `'Set {name} as default'`.

Lookup falls back to the English entry if a Polish value is ever absent at
runtime (it cannot be, per the type, but the fallback costs nothing and keeps
the function total).

### Language resolution and persistence

On construction, the service resolves the starting language in order:

1. The value stored in `localStorage` under `listify:language`, if it is one
   of `LANGUAGES` — the key follows the existing `listify:*` convention used
   by `local-storage-collection.ts`.
2. `navigator.language` with a `pl` prefix → `'pl'`.
3. `DEFAULT_LANGUAGE` (`'en'`).

Reads and writes to `localStorage` are wrapped in `try/catch`, mirroring
`readFromStorage` / `writeToStorage` in
`core/storage/local-storage-collection.ts:10-29`: storage being unavailable
degrades to an in-memory choice for the session, never to an exception.

An `effect()` in the service persists the current language and sets
`document.documentElement.lang`. The `lang` attribute is required by WCAG
3.1.1 — without it a screen reader announces Polish text with English
pronunciation rules.

## Components

### `shared/language-switcher/language-switcher.ts` (new)

Two buttons labelled "EN" and "PL" inside a `role="group"` whose
`aria-label` is itself translated. The active one carries
`aria-pressed="true"`; each button's `aria-label` spells the language out in
full ("English", "Polski") so a screen reader does not read a two-letter
abbreviation. Styling reuses the existing pill classes in `styles.scss`, so
contrast stays at the AA ratio already verified for those classes.

Activating a button calls `I18n.setLanguage()`. Focus stays on the pressed
button — nothing is re-created or removed, so no focus management is needed.

### `app.html` (change)

The switcher goes in the header, between the brand and the menu toggle, and
deliberately **outside** `#main-nav`. The navigation is collapsed and made
inert below the mobile breakpoint; placing the switcher inside it would make
the language unreachable on a phone whenever the menu is closed.

### All 11 templates and their components (change)

Every literal string becomes a `t(...)` call: visible text, `aria-label`,
`title`, `placeholder`, and the `title` / `fabLabel` inputs passed to
`app-fab-panel`, plus the `title` / `message` / `confirmLabel` /
`cancelLabel` passed to `ConfirmDialogService.confirm()`.

`FabPanel` and `ConfirmDialog` need no keys of their own: both already take
their text as inputs / dialog data, so translation happens at the call sites.
`ConfirmDialog`'s two inline defaults (`'Cancel'`, `'Delete'`) are the one
exception — they move to `common.cancel` and `common.delete`.

Key namespaces, one per area:

| Namespace | Covers |
|---|---|
| `common.*` | Cancel, Save, Add, Edit, Delete and other repeated button labels |
| `nav.*` | Header: navigation links, menu open/close labels, navigation landmark |
| `language.*` | Switcher group label and the two language names |
| `lists.*` | Shopping lists overview |
| `listDetail.*` | Shopping list detail, including import/export messages |
| `products.*` | Products manager |
| `productDialog.*` | Quick-create product dialog |
| `picker.*` | Product picker (search hint, results label, dialog label) |
| `units.*` | Units manager |
| `categories.*` | Categories manager |

## Dates

`registerLocaleData(localePl)` is called in `app.config.ts`. The one place a
date is rendered — `shopping-lists-overview.ts`, which imports `DatePipe` —
passes the language as the pipe's fourth argument:

```
{{ list.createdAt | date: 'mediumDate' : undefined : language() }}
```

This is deliberately not `LOCALE_ID`: that token is resolved once at
injection time and cannot follow a runtime language change. Passing the
locale per call keeps date formatting reactive with the rest of the UI.

## Import / export

`ShoppingListImportError` keeps its current English message. It is a marker
for developers and for logs; the user never sees it. The component that
catches it renders `t('listDetail.importError')` instead. This keeps
`shopping-list-export.ts` a pure, dependency-free module.

The export file's contents stay language-neutral: its JSON keys are part of
the file format (`version: 1`) and must not change with the UI language, or
a file exported in Polish would not import in English.

One targeted fix belongs with this work. `toExportFilename`
(`shopping-list-export.ts:57-64`) strips everything outside `[a-z0-9]`, so a
list named "Zakupy świąteczne" produces `zakupy-wi-teczne.json`. Polish list
names make this visible in normal use. The slug step gains Unicode
normalization (NFD, then strip combining marks) before the existing
replacement, yielding `zakupy-swiateczne.json`.

## Testing

English remains the default, and the test environment reinforces it: jsdom
reports `navigator.language` as `en-US`, and `vitest.setup.ts` installs a
fresh in-memory `localStorage` with no stored choice. The 44 existing
assertions against English text therefore keep passing without modification —
they become, in effect, the English regression suite.

New tests:

- **`i18n.service.spec.ts`** — a stored choice wins over the browser; `pl-PL`
  from the browser selects Polish; an unsupported locale such as `de` falls
  back to English; `setLanguage` persists to `listify:language`;
  `documentElement.lang` follows the current language; `t` interpolates
  parameters and returns the key's English value when asked for a language
  it has no entry for.
- **`language-switcher.spec.ts`** — both languages render, `aria-pressed`
  marks exactly the active one, clicking the inactive one switches the
  language.
- **One integration test** — a feature component rendered with Polish
  selected shows Polish text. One representative component, not all eleven;
  the rest is covered by the type system and by the existing English suite.
- **Dictionary sanity** — no value in `pl` is an empty string. Key parity
  needs no test: the compiler enforces it.

Adding an element to the header may require `await whenStable()` in
`app.spec.ts` before its assertions, since the header's structure changes.

## Risks

- **Touching all 11 components at once.** Mitigated by making the change
  incremental: `en.ts` starts small and grows per area, and because
  `TranslationKey` is derived from it, adding keys never breaks existing
  ones. Work proceeds one feature area at a time, with the English suite
  green after each.
- **A translated string escaping the dictionary.** `t()` is the only source
  of user-facing text after this work; a literal left behind in a template
  simply stays English in both languages. The review step for each area is a
  read-through of the template for remaining quoted text.
- **Bundle growth.** Two dictionaries of 111 strings plus the Polish locale
  data add a few tens of kilobytes to the initial bundle, against a 500 kB
  warning budget. Acceptable, and the cost of guaranteed offline operation.

## Scope

Walking all 11 templates and their components gives **111 keys**:

| Namespace | Keys |
|---|---|
| `common.*` | 11 |
| `nav.*` | 7 |
| `language.*` | 3 |
| `lists.*` | 17 |
| `listDetail.*` | 22 |
| `products.*` | 17 |
| `productDialog.*` | 1 |
| `picker.*` | 3 |
| `units.*` | 18 |
| `categories.*` | 12 |

The count is well below a per-template tally of the literals because
repeated labels — Cancel, Save, Add, Name, "Name is required.", the quantity
stepper's controls — collapse into `common.*`, and the quick-create product
dialog reuses the `products.*` field labels rather than duplicating them.

The full key list with both languages' values lives in the implementation
plan, which introduces the keys area by area.
