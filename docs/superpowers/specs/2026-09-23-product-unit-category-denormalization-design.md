# Product Unit/Category Denormalization — Design Spec

Date: 2026-09-23

## Problem

`Product` currently references its default unit and category by id
(`defaultUnitId: UnitId`, `categoryId: CategoryId`). Because of this,
`UnitsManager` and `CategoriesManager` must block editing/deleting a
unit or category whenever any `Product` still references it
(`usedUnitIds` / `usedCategoryIds`, computed from
`productsService.products()`), and the app needs an extra `ProductsService`
dependency in both managers purely to compute that block.

This is the odd one out: `ShoppingListItem` already stores
`productName` / `unitLabel` / `categoryName` as plain denormalized
strings, with no id references at all, and neither
`ShoppingListsService` nor the shopping-list UI has ever needed a
"used by a list item" guard — deleting a unit or category simply has no
effect on lists that already captured its symbol/name as a snapshot.

The app is moving toward that same document-oriented, reference-free
shape everywhere (framed by the user as "preparing for a NoSQL
approach"). Bringing `Product` in line removes the need for the
used-by checks entirely, at the cost of `Product`'s stored unit/category
becoming a point-in-time snapshot rather than a live-updating reference
(matching how `ShoppingListItem` already behaves).

## Goals

- `Product` stores its default unit and category as plain strings
  (`unitSymbol`, `categoryName`), not ids — no reference to `Unit` or
  `Category` remains on `Product`.
- Editing or deleting a `Unit` or `Category` never touches existing
  `Product` records — their stored `unitSymbol`/`categoryName` values
  are unaffected, exactly like `ShoppingListItem` today.
- The "used by a product" edit/delete guard is removed entirely from
  `UnitsManager` and `CategoriesManager` — editing/deleting is always
  allowed.
- Existing `localStorage` data (old `Product` shape with
  `defaultUnitId`/`categoryId`) is migrated in place to the new shape
  the first time it's read, resolving each id against the current
  `Unit`/`Category` collections.
- Editing a product whose stored unit/category text no longer matches
  any current `Unit`/`Category` (renamed or deleted after the product
  was created/last edited) still shows that stored value in the edit
  form, so the user can see what's set and deliberately change it.

## Non-goals

- Renaming/relabeling historical `Product` records when a `Unit` or
  `Category` is later renamed. A `Product`'s `unitSymbol`/`categoryName`
  is a snapshot, not a live reference — this is the explicit point of
  the change, not a gap to close.
- Denormalizing anything else on `Product` (no barcode/image/etc. —
  out of scope, unrelated to this change).
- A generic/reusable schema-migration framework. `migrate` on
  `createLocalStorageCollection` is a minimal, single-purpose hook —
  just enough for this one migration — not a versioned migration
  system.
- Changing `ShoppingListItem` or `ShoppingListsService`'s existing
  denormalized shape — it's already correct and is the pattern this
  change follows.

## Decisions

These were settled with the user before design:

| Question | Decision |
|---|---|
| Field names on `Product` | `unitSymbol: string` and `categoryName: string` (not `defaultUnitLabel`) |
| Editing a product whose stored unit/category no longer matches any current option | Show the stale value as an extra `<option>` in the `<select>`, alongside the current list |
| Existing `localStorage` data in the old shape | One-time migration on read, resolving old ids against current `Unit`/`Category` collections |

## Data model

### `product.model.ts`

```typescript
export type ProductId = string;

export interface Product {
  id: ProductId;
  name: string;
  unitSymbol: string;
  categoryName: string;
}
```

`CategoryId`/`UnitId` imports are dropped from this file — nothing on
`Product` references them anymore.

### `core/storage/local-storage-collection.ts`

Add an optional one-shot migration hook, run once against the raw
parsed JSON before the collection's initial signal value is set:

```typescript
export interface LocalStorageCollectionOptions<T> {
  migrate?: (raw: unknown[]) => T[];
}

export function createLocalStorageCollection<T extends { id: string }>(
  storageKey: string,
  options?: LocalStorageCollectionOptions<T>,
): LocalStorageCollection<T> {
  const raw = readRawFromStorage(storageKey); // unknown[], was T[]
  const items = signal<T[]>(options?.migrate ? options.migrate(raw) : (raw as T[]));

  effect(() => writeToStorage(storageKey, items()));
  // ...unchanged
}
```

The existing `effect(() => writeToStorage(...))` already runs once at
construction and persists whatever the initial signal value is — so a
migrated shape is written back to `localStorage` automatically on the
next app load, with no extra write step needed. `readFromStorage`
becomes generic-free (`unknown[]`) since callers now decide the cast
via `migrate` (or an identity cast when `migrate` is omitted, matching
today's behavior for every other collection).

### `products.service.ts`

```typescript
@Service()
export class ProductsService {
  private readonly unitsService = inject(UnitsService);
  private readonly categoriesService = inject(CategoriesService);

  private readonly store = createLocalStorageCollection<Product>('listify:products', {
    migrate: (raw) => raw.map((item) => this.migrateProduct(item)),
  });

  readonly products = this.store.items;

  // add/update/remove unchanged

  private migrateProduct(raw: unknown): Product {
    const item = raw as Product & { defaultUnitId?: string; categoryId?: string };
    if (item.unitSymbol !== undefined && item.categoryName !== undefined) {
      return item; // already in the new shape
    }
    return {
      id: item.id,
      name: item.name,
      unitSymbol:
        item.unitSymbol ??
        this.unitsService.units().find((u) => u.id === item.defaultUnitId)?.symbol ??
        '',
      categoryName:
        item.categoryName ??
        this.categoriesService.categories().find((c) => c.id === item.categoryId)?.name ??
        '',
    };
  }
}
```

`ProductsService` gains a new dependency on `UnitsService` and
`CategoriesService`, needed only to resolve old ids during migration.
This is a one-directional edge (neither of those services depends on
`ProductsService`), so it doesn't introduce a cycle. The `''` fallback
only matters for data that predates this change *and* whose referenced
unit/category was somehow already gone — not expected to occur in
practice, since deleting a used unit/category was blocked until this
same change ships, but kept as a safe default rather than a crash.

## Component changes

### `products-manager.ts`

- `ProductFormValue.defaultUnitId`/`categoryId` → `unitSymbol`/`categoryName`.
- `<select [formField]="productForm.unitSymbol">` — `<option>` values
  become unit symbols instead of ids; same for
  `productForm.categoryName` with category names.
- New computed option lists, so an edited product's stale value still
  shows as a selectable/selected option:

  ```typescript
  protected readonly unitSymbolOptions = computed(() => {
    const symbols = this.unitsService.units().map((u) => u.symbol);
    const current = this.model().unitSymbol;
    return current && !symbols.includes(current) ? [...symbols, current] : symbols;
  });

  protected readonly categoryNameOptions = computed(() => {
    const names = this.categoriesService.categories().map((c) => c.name);
    const current = this.model().categoryName;
    return current && !names.includes(current) ? [...names, current] : names;
  });
  ```

- List rendering: `{{ product.unitSymbol }} · {{ product.categoryName }}`
  directly — the `unitLabel()`/`categoryLabel()` lookup helpers and the
  `products.unknownUnit`/`products.unknownCategory` translations are
  deleted (nothing to look up anymore; the text is already on the
  product).
- `startEdit()` sets `{ name, unitSymbol: product.unitSymbol, categoryName: product.categoryName }`.
- `buildEmptyProductForm()` keeps defaulting the unit from
  `unitsService.defaultUnit()?.symbol ?? ''`.

### `create-product-dialog.ts`

Same field rename (`defaultUnitId`→`unitSymbol`,
`categoryId`→`categoryName`) and `<option>` value switch to
symbol/name. No stale-option handling needed here — this dialog only
ever creates a brand-new product, so `model().unitSymbol`/`categoryName`
always starts from `unitsService.defaultUnit()?.symbol ?? ''` / `''`
and can't already hold a value absent from the current lists.

### `units-manager.ts`

- Remove `usedUnitIds` computed and the `ProductsService` injection.
- Remove `[disabled]="usedUnitIds().has(unit.id)"` from the edit and
  delete buttons.
- Collapse the conditional `aria-label`/`title` pairs
  (`cannotEditFor`/`editFor`, `cannotDeleteFor`/`deleteFor`,
  `cannotEdit`/`cannotDelete` title) down to just the "always allowed"
  branch.
- `remove()` drops its `if (this.usedUnitIds().has(id)) return;` guard
  — it always proceeds to the confirm dialog.

### `categories-manager.ts`

Same shape of change as `units-manager.ts`: remove
`usedCategoryIds`/`ProductsService`, remove the `disabled` bindings,
collapse the aria-label/title conditionals, drop the guard in
`remove()`.

### `en.ts` / `pl.ts` translations

Remove (now unused, both files):

- `products.unknownUnit`, `products.unknownCategory`
- `units.cannotEditFor`, `units.cannotEdit`, `units.cannotDeleteFor`, `units.cannotDelete`
- `categories.cannotEditFor`, `categories.cannotEdit`, `categories.cannotDeleteFor`, `categories.cannotDelete`

`units.editFor`/`deleteFor` and `categories.editFor`/`deleteFor` stay
(now the only variant used).

### `shopping-list-detail.ts`

- `selectedUnitId` (a `UnitId`) → `selectedUnitSymbol` (a `string`),
  `linkedSignal(() => product?.unitSymbol ?? '')` instead of looking up
  `product?.defaultUnitId`.
- Unit `<select>`: `[value]="selectedUnitSymbol()"`, `<option
  [value]="unit.symbol">` (was `[value]="unit.id"`) — this select still
  lists every current unit, since overriding the unit for a single
  list item is existing, kept behavior; only the value it commits
  changes from an id to a symbol string.
- `CategoriesService` injection is removed — nothing in this component
  needs it anymore once category comes straight off the product.
- `addItem()`:

  ```typescript
  const product = this.productsService.products().find((p) => p.id === productId);
  const unitSymbol = this.selectedUnitSymbol().trim();
  if (!product || !unitSymbol) {
    return;
  }
  const merged = this.shoppingListsService.addItemFromProduct(
    this.id(),
    product,
    unitSymbol,
    quantity,
    note.trim() ? note.trim() : undefined,
  );
  ```

### `shopping-lists.service.ts`

`addItemFromProduct` drops its `unit: Unit` / `category: Category`
parameters in favor of a single `unitSymbol: string`; category comes
from `product.categoryName` directly:

```typescript
addItemFromProduct(
  listId: ShoppingListId,
  product: Product,
  unitSymbol: string,
  quantity: number,
  note?: string,
): boolean {
  // ...
  const existing = list.items.find((item) =>
    this.isSameUnpurchasedItem(item, product, unitSymbol, note),
  );
  // ...
  const item: ShoppingListItem = {
    id: crypto.randomUUID(),
    productName: product.name,
    unitLabel: unitSymbol,
    categoryName: product.categoryName,
    quantity,
    purchased: false,
    note,
  };
  // ...
}

private isSameUnpurchasedItem(
  item: ShoppingListItem,
  product: Product,
  unitSymbol: string,
  note?: string,
): boolean {
  return (
    !item.purchased &&
    item.productName.toLowerCase() === product.name.toLowerCase() &&
    item.unitLabel.toLowerCase() === unitSymbol.toLowerCase() &&
    (item.note ?? '').toLowerCase() === (note ?? '').toLowerCase()
  );
}
```

The `Unit`/`Category` model imports are dropped from this file — it no
longer needs either type.

### `product-picker.ts`

No change. It only ever reads `product.id`/`product.name`, never the
unit/category fields.

## Data flow (migration)

1. App loads; `ProductsService` is constructed, which injects
   `UnitsService`/`CategoriesService` (already-constructed singletons,
   themselves reading their own `localStorage` keys synchronously) and
   then reads `listify:products`.
2. Each stored record is passed through `migrateProduct`. A record
   already in the new shape (`unitSymbol`/`categoryName` present) is
   returned unchanged. An old-shape record has its `defaultUnitId`/
   `categoryId` resolved against the just-loaded `Unit`/`Category`
   collections and replaced with `unitSymbol`/`categoryName`.
3. The resulting `Product[]` becomes the collection's initial signal
   value; the collection's existing persistence `effect()` writes it
   straight back to `localStorage`, completing the migration for that
   browser/profile with no further action needed on subsequent loads.

## Error handling

- Migration fallback (`''`) for an unresolvable legacy id is treated
  the same as any other empty `unitSymbol`/`categoryName` — the
  product simply shows blank for that field until the user edits it
  and picks a current value; no error is surfaced, since this isn't
  expected to happen with real data (see Non-goals).
- `ProductsManager`'s form validation is unchanged in kind:
  `unitSymbol`/`categoryName` stay `required()` fields, so a blank
  value (migrated or otherwise) blocks saving until the user picks
  something — it doesn't block *reading/displaying* the existing
  product list, only editing it.

## Accessibility

No new interactive patterns are introduced — the unit/category
`<select>` elements keep their existing `<label for>` associations and
native semantics; only the bound value type changes (string id →
string symbol/name), which is invisible to assistive tech. The
extra "stale value" `<option>` in `products-manager.ts` is a normal
`<option>` with visible text, so it's announced like any other choice.

## Testing

- `local-storage-collection.spec.ts` (extended, already exists): add
  coverage that `migrate` is called once with the raw parsed array and
  its return value becomes the initial `items()`; omitting `migrate`
  behaves exactly as before (identity).
- `products.service.spec.ts`: rewrite existing `add`/`update`/`remove`
  tests around `unitSymbol`/`categoryName`; add migration tests —
  seeding `localStorage` directly with an old-shape array, asserting
  the service resolves ids to symbol/name on load, and that a legacy
  record whose id no longer matches any unit/category migrates to
  `''` rather than throwing.
- `products-manager.spec.ts`: update all product fixtures and
  `<select>` interactions to use symbol/name values; add a test that
  editing a product whose stored unit/category isn't in the current
  list still shows it as a selected, distinct `<option>`.
- `create-product-dialog.spec.ts`: update fixtures/interactions the
  same way; no stale-option case to add (see Component changes above).
- `units-manager.spec.ts` / `categories-manager.spec.ts`: remove all
  assertions around disabled/blocked edit-delete buttons; add/keep
  coverage that editing and deleting succeed even while a `Product`
  still holds the same unit symbol/category name text.
- `shopping-list-detail.spec.ts`: update product fixtures to the new
  shape; keep existing coverage of the unit-override `<select>` and
  merge/duplicate-detection behavior, adjusted to string comparisons
  instead of id lookups.
- `shopping-lists.service.spec.ts`: update `addItemFromProduct` call
  sites to the new `unitSymbol: string` signature; drop now-unused
  `Unit`/`Category` fixture imports where they're no longer needed.
- `product-picker.spec.ts`: update `Product` fixtures to the new shape
  only; no behavioral change expected.

## Open questions / risks

None outstanding — all key decisions were confirmed with the user
during brainstorming (see Decisions table above).
