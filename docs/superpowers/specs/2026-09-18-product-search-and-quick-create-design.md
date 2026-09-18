# Product Search & Quick-Create — Design Spec

Date: 2026-09-18

## Problem

When adding an item to a shopping list, the product picker in
`shopping-list-detail.ts` is a plain native `<select>` populated from
`productsService.products()`, sorted alphabetically with no search or
filtering. This is usable with a small catalog but becomes hard to use once
the product list grows past roughly 30 entries.

Separately, if the product a user wants isn't in the catalog yet, they must
leave the shopping list, navigate to the `/products` page, create the
product there, then navigate back and retry adding it to the list. This
breaks the flow of building a shopping list.

## Goals

- Let the user search/filter products by name while adding an item to a
  shopping list, instead of scanning a long unfiltered list.
- Let the user create a new product directly from the add-item flow, without
  leaving the shopping list page, when the product they want doesn't exist
  yet.
- Keep the app fully client-side (no backend exists — see
  `core/storage/local-storage-collection.ts`); search is in-memory
  filtering, not a server query.

## Non-goals

- Server-side search or pagination (no backend exists; the entire product
  catalog is already loaded as a `Signal<readonly Product[]>`).
- Editing or deleting products from within the add-item flow — that stays
  on the dedicated `/products` page.
- Adding an `isDefault` concept to `Category` (unlike `Unit`, `Category` has
  no default today; explicitly decided against introducing one for this
  feature).
- Product images, barcodes, bulk import, or any other new `Product` fields.

## Decisions

These were settled with the user before design:

| Question | Decision |
|---|---|
| Search UX | Typeahead combobox (replaces the native `<select>`), not a separate search box + list |
| When to offer "create new product" | Only when the typed query has zero matches |
| Quick-create form scope | Shortened form: name, unit, category — with sensible defaults where they exist |
| Default unit in quick-create | Pre-filled from `unitsService.defaultUnit()`, when one is marked default |
| Default category in quick-create | No default — field starts empty, category stays a required, deliberate choice every time |
| Where quick-create renders | Modal (`@angular/cdk/dialog`), layered over the still-open "Add item" panel |
| Combobox implementation | `MatAutocomplete` (Angular Material) |

## Components

### `shared/product-picker/product-picker.ts` (new)

A self-contained, reusable widget that owns the entire "search existing or
create new" interaction. Single responsibility: given a product catalog,
resolve to a chosen `ProductId`, creating a new product along the way if
needed.

- `products = input.required<readonly Product[]>()` — the candidate list;
  the caller supplies `productsService.products()`, keeping this component
  free of a direct `ProductsService` dependency for the *read* side.
- `productId = model<ProductId | null>(null)` — two-way bound selection,
  following the project's `model()` convention for `[(prop)]` bindings.
- Internal state: a `query` signal bound to the `matInput` text field, and a
  `computed()` that filters `products()` by case-insensitive substring
  match on `name`.
- Template renders a `MatAutocomplete` panel:
  - Non-empty filtered list → normal option list, `(optionSelected)` sets
    `productId` to the chosen product's id and `query` to its name.
  - Empty query → neutral placeholder text ("Zacznij pisać, aby wyszukać
    produkt"), no create action.
  - Non-empty query with zero matches → a single "Utwórz produkt „{{query}}""
    action in place of the option list.
- Selecting the create action opens `CreateProductDialog` (injected `Dialog`
  from `@angular/cdk/dialog`) with `initialName: query()`. On successful
  creation, the component sets `productId` and `query` to the newly created
  product's id/name and returns focus to the text input. On cancel, the
  dialog closes and `query` is left untouched so the user can adjust and
  retry.
- `ProductsService.add()` is called from inside `CreateProductDialog`, not
  from `ProductPicker` — `ProductPicker` only consumes the `Product` the
  dialog resolves with. This keeps the picker's own responsibility limited
  to search/selection, and mirrors the existing boundary where each feature
  owns its own writes.

Because this component owns selection but the parent's `itemForm` (built
with `@angular/forms/signals`) owns the actual submitted value, the caller
(`shopping-list-detail.ts`) keeps them in sync with an `effect()` that
writes `productPicker productId` changes into `itemForm.productId`, the
same way `selectedUnitId`'s `linkedSignal` already reacts to product
changes today (`shopping-list-detail.ts:701-706`). This wiring is confirmed
feasible at the design level; exact syntax is an implementation detail for
the plan.

### `features/products/create-product-dialog/create-product-dialog.ts` (new)

Mirrors the existing `shared/confirm-dialog/confirm-dialog.ts` /
`confirm-dialog.service.ts` pattern: a small `@angular/cdk/dialog` component
reading `DIALOG_DATA`, closing itself via `DialogRef<Product>`.

- `CreateProductDialogData { initialName: string }`.
- Form (via `@angular/forms/signals`, same as `products-manager.ts`):
  - `name: string`, required, trimmed, pre-filled from `initialName`,
    editable. Duplicate-name check identical to `products-manager.ts`
    (case-insensitive against `productsService.products()`), shown as an
    inline error, blocks submit.
  - `defaultUnitId: string`, required, native-style select populated from
    `unitsService.units()`, pre-filled with `unitsService.defaultUnit()?.id`
    when one exists, otherwise empty (user must choose).
  - `categoryId: string`, required, select populated from
    `categoriesService.categories()`, always starts empty.
- On submit: `productsService.add(value)`, then look up the created record
  (same id-generation path `ProductsService.add` already uses — no new
  return-value plumbing needed in the service itself, since `add()` can be
  changed to return the created `Product`, matching how `ShoppingListsService
  .importList` already returns the created list) and close the dialog via
  `dialogRef.close(createdProduct)`.
- `ProductsService.add()` signature changes from `void` to `Product` (small,
  backward-compatible change — the two existing callers, `products-manager
  .ts` and this new dialog, either ignore or use the return value).

### `features/shopping-lists/shopping-list-detail/shopping-list-detail.ts` (extended)

Replace the native product `<select>` (lines 293-298) with:

```html
<app-product-picker
  [products]="sortedProducts()"
  [(productId)]="selectedProductId"
/>
```

`selectedProductId` is a plain `signal<ProductId | null>(null)`, wired to
`itemForm.productId` the same way `selectedUnitId` is already wired today.
Everything downstream — the unit `linkedSignal` defaulting off the chosen
product, `addItem()`'s lookup of the full `Product`/`Unit`/`Category`
objects — is unchanged, because a newly created product flows through
exactly the same "product selected" path as one picked from the existing
list.

## Data flow

1. User opens the "Add item" panel (unchanged `app-fab-panel`).
2. Types into `ProductPicker`'s input → `computed()` filters
   `productsService.products()` by name (case-insensitive substring), fully
   in-memory, no debounce needed (already-loaded signal, cheap to
   recompute).
3. Matches exist → `MatAutocomplete` option list; picking one sets
   `productId`.
4. No matches, query non-blank → single "Utwórz produkt „{{query}}"" action
   instead of the option list.
5. Picking an existing product → `productId` propagates to
   `itemForm.productId`; the existing unit-defaulting `linkedSignal` reacts
   unchanged.
6. Picking "Utwórz produkt" → `CreateProductDialog` opens (CDK Dialog,
   modal) over the still-open "Add item" panel, with `initialName` set to
   the typed query.
7. Dialog saved → `ProductsService.add()` persists to `localStorage` →
   dialog resolves with the created `Product` → `ProductPicker` sets
   `productId` and the input's display text to the new product → focus
   returns to the search input → user fills in quantity/note and submits
   the "Add item" form as today.
8. Dialog cancelled → closes, focus returns to the search input, the typed
   query is preserved so the user can adjust and retry.

Because the dialog is modal, the "Add item" panel underneath can't be
dismissed while the dialog is open — the user must resolve or cancel it
first, so there's no need to handle a concurrent panel-close/dialog-open
race.

## Error handling

- Duplicate product name in `CreateProductDialog` → inline error, same
  case-insensitive check and message pattern as `products-manager.ts`,
  blocks submit.
- Missing required field (name/unit/category) in `CreateProductDialog` →
  existing `required()` signal-forms validators, same error presentation
  used elsewhere in the app.
- Blank query in `ProductPicker` → neutral hint text, no create action (an
  empty-named product is never offered).
- Query with zero matches → only the create action is offered; there is no
  separate "no results" dead-end state.

## Accessibility

- `MatAutocomplete` implements the ARIA 1.2 combobox pattern out of the box
  (`role="combobox"`, `aria-expanded`, `aria-activedescendant`), satisfying
  the project's AXE/WCAG AA requirement without custom keyboard-handling
  code.
- `CreateProductDialog` reuses `@angular/cdk/dialog`, which already provides
  focus trapping and focus return, as used by `ConfirmDialog` today.
- This is the first place in the app that renders an actual Angular
  Material component (`MatAutocomplete`); `styles.scss` already generates
  `--mat-sys-*` tokens via `mat.theme()` (currently unused by any
  component), so the autocomplete inherits the app's existing color/type
  scale rather than introducing a separate visual system. Contrast still
  needs to be confirmed with a real AXE scan during implementation, since
  no Material component has been rendered in this codebase before.

## Testing

- `product-picker.spec.ts` (new): filtering with an empty catalog, an exact
  match, a partial/case-insensitive match; blank query shows no create
  action; a query with zero matches shows the create action; selecting the
  create action opens the dialog with the typed query as `initialName`.
- `create-product-dialog.spec.ts` (new): duplicate name blocks submit;
  valid submit calls `productsService.add()` and closes with the created
  `Product`; missing required fields block submit via existing signal-forms
  validation.
- `products.service.spec.ts` (extended): `add()` returns the created
  `Product` (with generated `id`), not just `void`.
- `shopping-list-detail.spec.ts` (extended): typing a query with no match →
  triggering create → completing the dialog → the newly created product
  ends up selected in `ProductPicker` → submitting the form creates a
  `ShoppingListItem` referencing it. Per this project's testing pattern,
  the new `@if` branches added to the template (empty/no-match/results
  states) mean existing synchronous tests exercising this form need
  `await whenStable()` added where they didn't need it before.

## Open questions / risks

None outstanding — all key product decisions were confirmed with the user
during brainstorming (see Decisions table above). The exact mechanism for
keeping `ProductPicker`'s `productId` model in sync with `itemForm
.productId` (a Signal Forms field) is left to the implementation plan; the
design only guarantees the two are kept consistent via a reactive
`effect()`/`linkedSignal`, following the existing `selectedUnitId` pattern.
