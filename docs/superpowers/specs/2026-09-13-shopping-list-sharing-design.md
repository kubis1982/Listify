# Shopping List Sharing & Import — Design Spec

Date: 2026-09-13

## Problem

Listify is a fully client-side SPA (Angular 22, standalone components, signals)
with no backend — all shopping lists live only in `localStorage`
(`core/storage/local-storage-collection.ts`). Users have no way to share a
list with someone else, or to bring a list someone shared with them into
their own copy of the app.

## Goals

- Let a user export a single shopping list to a file and share it via any
  channel they like (email, messaging apps, AirDrop, etc.).
- Let a user import a previously exported file to create a new list in
  their own app.
- No backend, no new infrastructure — the feature must work entirely
  client-side, consistent with the rest of the app.

## Non-goals

- Bulk export/import of all lists at once.
- Live/synced sharing (a link that reflects future edits).
- Preserving purchase history or "completed" status across a share — a
  shared/imported list always starts fresh.

## Decisions

These were settled with the user before design:

| Question | Decision |
|---|---|
| Sharing mechanism | File export/import (no backend, no encoded links) |
| Scope | Single list only, not bulk |
| Item/list state on import | Fresh start: `status` resets to `active`, every item's `purchased` resets to `false` |
| Notes | Preserved (they describe product preference, not purchase history) |
| Share button behavior | Try `navigator.share` with a file (native share sheet) first; fall back to a plain file download when unsupported |
| Import entry point | A button on the list overview page; opens a native file picker restricted to `.json` |
| Invalid import file | Show an error message and abort; no partial import |

## Data format

A new versioned export DTO, independent of the internal `ShoppingList`
model so the two can evolve separately:

```ts
interface ShoppingListExport {
  version: 1;
  exportedAt: string; // ISO timestamp, informational only
  list: {
    name: string;
    items: Array<{
      productName: string;
      unitLabel: string;
      categoryName: string;
      quantity: number;
      note?: string;
    }>;
  };
}
```

Deliberately excluded from the export: `id`, `createdAt`, `status`, and each
item's `id`/`purchased`. These are always regenerated fresh on import so an
imported list can never collide with an existing one and always starts
active/unpurchased.

## Components

### `features/shopping-lists/data/shopping-list-export.ts` (new, pure functions — no DI/state)

Owns only the encode/decode concerns for the file format:

- `toShoppingListExport(list: ShoppingList): ShoppingListExport` — builds the
  export DTO from a live list, applying the fresh-start transform (drops
  `id`/`purchased`/`status`, keeps `note`).
- `parseShoppingListExport(raw: string): ShoppingListExport` — parses and
  validates untrusted JSON text. Throws a `ShoppingListImportError` (new
  small error class) when:
  - the text isn't valid JSON,
  - `version` isn't `1`,
  - `list.name` isn't a non-empty string,
  - `list.items` isn't an array, or any item is missing/mistyped
    `productName`/`unitLabel`/`categoryName`/`quantity`.

This module stays independent of `ShoppingListsService` — it doesn't know
about `localStorage`, ids, or Angular DI. It's the same kind of boundary the
project already draws between a `*.model.ts` and its `*.service.ts`.

### `features/shopping-lists/data/shopping-lists.service.ts` (extended)

New method, mirroring the existing `addList`:

```ts
importList(data: ShoppingListExport['list']): ShoppingList {
  const list: ShoppingList = {
    id: crypto.randomUUID(),
    name: data.name,
    createdAt: new Date().toISOString(),
    status: 'active',
    items: data.items.map((item) => ({ ...item, id: crypto.randomUUID(), purchased: false })),
  };
  this.store.add(list);
  return list;
}
```

This keeps `ShoppingListsService` as the single place that owns creating and
persisting lists — the export/import module only ever hands it plain,
already-validated data.

### `features/shopping-lists/shopping-list-detail/shopping-list-detail.ts` (extended)

New "Share" button next to the existing "Mark completed" button (same
`btn-outline-pill` style, icon + visible text label — matching the existing
pattern rather than an icon-only button).

On click:
1. `toShoppingListExport(list)` → `JSON.stringify(..., null, 2)`.
2. Build a filename from the list name (slugified, e.g. `weekend-shopping.json`).
3. If `navigator.canShare?.({ files: [file] })` is true, call
   `navigator.share({ files: [file], title: list.name })`. A user-cancelled
   share throws `AbortError` — caught and ignored silently.
4. Otherwise, fall back to a plain download: object URL + temporary
   `<a download>` click, then `URL.revokeObjectURL`.

### `features/shopping-lists/shopping-lists-overview/shopping-lists-overview.ts` (extended)

New "Import" button in the page header, next to the "Shopping lists" title.
It triggers a hidden `<input type="file" accept="application/json,.json">`
(via `viewChild` + `.click()`).

On file selection:
1. Read the file as text (`file.text()`).
2. `parseShoppingListExport(text)`.
   - On success: `shoppingListsService.importList(parsed.list)`, then
     navigate to `/lists/:id` for the new list (mirrors the existing
     create-list flow in `handleSubmit`).
   - On failure (`ShoppingListImportError`): show an alert dialog (see
     below) and do not create anything.
3. Reset the file input's value afterward so re-selecting the same file
   fires `change` again.

### `shared/confirm-dialog/` (extended, not replaced)

Add an `alert()` mode to the existing CDK-Dialog-based component instead of
building a new dialog:

- `ConfirmDialogData` gets an optional `hideCancel?: boolean`.
- `ConfirmDialog`'s template hides the Cancel button when `hideCancel` is
  true, leaving a single "OK"-style button.
- `ConfirmDialogService` gets a new `alert(data: { title: string; message: string }): Promise<void>`
  that opens the dialog with `hideCancel: true` and `confirmLabel: 'OK'`,
  resolving once closed.

This is used for the invalid-import error message: *"We couldn't read this
file — check it's a valid Listify export."*

## Error handling

- Invalid/corrupted/foreign JSON file on import → `ShoppingListImportError`
  is thrown by `parseShoppingListExport`, caught in the overview component,
  shown via `confirmDialogService.alert(...)`. No list is created.
- User cancels the native share sheet → silently ignored (not an error).
- `navigator.share` rejects for a reason other than user cancellation (e.g.
  permission denied) → falls back to the plain download, same as when the
  API isn't supported at all.

## Accessibility

- Share and Import buttons use icon + visible text (consistent with
  "Mark complete" / "Restore", not icon-only like the delete button), so
  they don't rely on `aria-label` alone. An AXE check on the overview and
  detail pages is part of verifying the implementation, per the project's
  accessibility requirements.
- The alert dialog keeps the existing `role="alertdialog"` and autofocus
  behavior already used by the confirm dialog, with a single, clearly
  labeled "OK" action.
- The hidden file input is triggered programmatically from a labeled
  button; no visible label of its own is needed since it's never focused
  directly by the user.

## Testing

- `shopping-list-export.spec.ts` (new):
  - `toShoppingListExport` strips `id`/`purchased`/`status`, keeps `note`,
    sets `version: 1`.
  - `parseShoppingListExport` accepts a well-formed export and rejects:
    invalid JSON, wrong `version`, missing `list.name`, non-array `items`,
    an item missing a required field.
- `shopping-lists.service.spec.ts` (extended): `importList` creates a list
  with a fresh id/createdAt/`active` status and items with fresh ids and
  `purchased: false`.
- `shopping-list-detail.spec.ts` (extended): Share falls back to download
  when `navigator.share`/`canShare` are unavailable (the default in the
  jsdom test environment); when mocked as available, calls
  `navigator.share` with a file built from the current list.
- `shopping-lists-overview.spec.ts` (extended): selecting a valid file
  calls `importList` and navigates to the new list; selecting an invalid
  file shows the alert dialog and does not call `importList`.
- `confirm-dialog` spec (extended): `hideCancel` hides the Cancel button;
  `ConfirmDialogService.alert()` resolves after the dialog closes.

## Open questions / risks

None outstanding — all key decisions were confirmed with the user during
brainstorming (see Decisions table above).
