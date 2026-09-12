# Listify — shopping list management system (design)

Date: 2026-09-12
Status: approved for implementation

## Purpose and context

Listify is an Angular application (v22, standalone, signals) that lets a user
create multiple shopping lists. Within a list, the user adds shopping items
picked from a global product catalog, each with an assigned unit of measure
and category. All data is stored exclusively locally, in the browser's
`localStorage` — no backend, no cross-device synchronization.

## Data model

```typescript
type UnitId = string;
interface Unit {
  id: UnitId;
  name: string;    // e.g. "kilogram"
  symbol: string;  // e.g. "kg"
}

type CategoryId = string;
interface Category {
  id: CategoryId;
  name: string;    // e.g. "Dairy"
}

type ProductId = string;
interface Product {   // product catalog (global dictionary)
  id: ProductId;
  name: string;           // e.g. "Milk 3.2%"
  defaultUnitId: UnitId;
  categoryId: CategoryId;
}

type ShoppingListId = string;
interface ShoppingList {
  id: ShoppingListId;
  name: string;
  createdAt: string;              // ISO 8601 string
  status: 'active' | 'completed';
  items: ShoppingListItem[];
}

type ShoppingListItemId = string;
interface ShoppingListItem {
  id: ShoppingListItemId;
  productName: string;   // snapshot of Product at the time it was added
  unitLabel: string;     // snapshot of Unit.symbol at the time it was added
  categoryName: string;  // snapshot of Category.name at the time it was added
  quantity: number;
  purchased: boolean;
  note?: string;
}
```

### Key rule: a list item is a snapshot

`ShoppingListItem` does **not** store references (IDs) to `Product`, `Unit`,
or `Category` — instead, it copies their text data at the moment the item is
added to the list. As a result:

- a shopping list is fully self-contained and doesn't depend on an entry
  still existing in the catalog (relevant e.g. for a future list-sharing
  feature),
- deleting or editing a product/unit/category in a dictionary **does not
  affect** existing items already added to lists,
- there's no need to validate "is this product used anywhere" when deleting
  it from a dictionary.

`createdAt` is an ISO string (not a `Date` object) — in line with the
project's rule against relying on the global `new Date()` without need, and
because `Date` doesn't serialize directly through the `JSON.stringify`/`parse`
used for `localStorage`.

## Project structure and routing

```
src/app/
  core/
    storage/
      local-storage-collection.ts   // generic collection store + persistence
  features/
    shopping-lists/
      shopping-lists.routes.ts
      data/
        shopping-list.model.ts
        shopping-lists.service.ts
      shopping-lists-overview/       // screen: all shopping lists
      shopping-list-detail/          // screen: details + items of one list
    products/
      products.routes.ts
      data/
        product.model.ts
        products.service.ts
      products-manager/
    units/
      units.routes.ts
      data/
        unit.model.ts
        units.service.ts
      units-manager/
    categories/
      categories.routes.ts
      data/
        category.model.ts
        categories.service.ts
      categories-manager/
  app.routes.ts
```

Routing paths (matching the folder names):

| Path | View |
|---|---|
| `/` | redirect to `/lists` |
| `/lists` | overview of all shopping lists |
| `/lists/:id` | details of a list with its items |
| `/products` | product catalog management |
| `/units` | unit-of-measure management |
| `/categories` | category management |

Each feature is lazy-loaded (`loadChildren`), per the lazy-loading rule for
feature routes.

## State management and persistence

A generic, reusable signal-based collection store, used by all four domains:

```typescript
function createLocalStorageCollection<T extends { id: string }>(storageKey: string) {
  const items = signal<T[]>(readFromStorage(storageKey));
  effect(() => writeToStorage(storageKey, items()));

  return {
    items: items.asReadonly(),
    add: (item: T) => items.update(list => [...list, item]),
    update: (id: string, changes: Partial<T>) =>
      items.update(list => list.map(i => i.id === id ? { ...i, ...changes } : i)),
    remove: (id: string) => items.update(list => list.filter(i => i.id !== id)),
  };
}
```

Domain services (`ShoppingListsService`, `ProductsService`, `UnitsService`,
`CategoriesService`) wrap this function and add domain-specific logic. For
example, `ShoppingListsService` exposes
`addItemFromProduct(listId, product, unit, category, quantity, note?)`,
which builds a `ShoppingListItem` as a snapshot from the given
`Product`/`Unit`/`Category`.

Each service: `@Service()` decorator (singleton, Angular v22+), `inject()`
instead of constructor injection.

## Components and forms

- Forms are built with Signal Forms (`@angular/forms/signals`) for all
  add/edit operations: product, unit, category, list, and list item.
- `shopping-list-detail` screen: a form for adding an item with a product
  picker (select/combobox) from the catalog. Selecting a product sets, via
  `linkedSignal()`, the default unit (based on the product's `defaultUnitId`),
  overridable before submitting. The category is not user-editable here — it
  is always taken from the selected product's `categoryId` and is not shown
  as a separate control. Additional fields: quantity, note.
- Dictionary management screens (`products-manager`, `units-manager`,
  `categories-manager`): a single component per screen combining the list
  view and the add/edit form (see the implementation plan's rationale) —
  each stays small and cohesive at its current size; split into `*-list`/
  `*-form` components only if a screen's responsibilities grow.
- All components are standalone, use `input()`/`output()`/`model()` instead
  of decorators, native control flow (`@if`/`@for`), `class`/`style`
  bindings instead of `ngClass`/`ngStyle`, and avoid importing
  `CommonModule` (only the directives/pipes actually used, e.g. `DatePipe`).

## Error handling and edge cases

- **`localStorage` unavailable or full** (private mode, quota exceeded):
  writes are wrapped in `try/catch`; on error, state stays in memory for the
  session, and the user sees a non-blocking warning.
- **Form validation** via Signal Forms schemas: required fields (product/
  unit/category/list name), `quantity > 0`, name uniqueness within a given
  dictionary.
- **Deleting entries** (product, unit, category, list): requires
  confirmation (a dialog) — the operation is irreversible locally.
- **Empty states**: clear calls to action (e.g. "No shopping lists yet —
  create your first one") instead of blank screens.
- **Accessibility (WCAG AA / AXE)**: focus management when opening/closing
  dialogs, `aria-live` for save-error messages, sufficient color contrast,
  properly labeled purchased-status checkboxes and form fields.

## Testing

- Unit tests (Vitest) for: `local-storage-collection` (the generic store),
  each domain service (CRUD plus the snapshot-creation logic for building an
  item from a product), form validation.
- Component tests for key interactions: adding an item to a list, marking an
  item as purchased, managing dictionaries (add/edit/remove an entry).
- Implementation follows a TDD approach — tests written before
  implementation code.

## Out of scope for this version

- Cross-device sync / backend.
- Sharing lists with other users (the data model supports this via
  snapshots, but the sharing feature itself is not part of this spec).
- Data import/export.
- Sorting/grouping list items by category (could be considered as a next
  step; the data model supports it via `categoryName` on each item).
