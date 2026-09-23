# Product Unit/Category Denormalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Product` stores its default unit and category as plain snapshot text (`unitSymbol`, `categoryName`) instead of ids, matching how `ShoppingListItem` already works — so editing or deleting a `Unit`/`Category` never needs to check whether a `Product` still "uses" it.

**Architecture:** Add a one-shot `migrate` hook to `createLocalStorageCollection` so `ProductsService` can upgrade any `Product` stored in the old `{defaultUnitId, categoryId}` shape to the new `{unitSymbol, categoryName}` shape the first time it's read, resolving each id against the current `Unit`/`Category` collections. Every component that reads or writes `Product.defaultUnitId`/`categoryId` is updated to use `unitSymbol`/`categoryName` instead — as plain strings, not ids, so `<select>` elements bind by symbol/name text. `UnitsManager` and `CategoriesManager` drop their "used by a product" edit/delete guard entirely, since nothing references them by id anymore.

**Tech Stack:** Angular 22 (standalone components, signals, `@Service`, Signal Forms), TypeScript strict, Vitest + jsdom via `@angular/build:unit-test`, `@angular/cdk/dialog`, `@angular/material/autocomplete`.

**Spec:** `docs/superpowers/specs/2026-09-23-product-unit-category-denormalization-design.md`

## Global Constraints

- Angular v22 house rules from `CLAUDE.md`: no `standalone: true`, no explicit `ChangeDetectionStrategy.OnPush`, no `@HostBinding`/`@HostListener` (use the `host` object), no `ngClass`/`ngStyle`, never import `CommonModule`, `inject()` over constructor injection, `@Service` over `@Injectable({providedIn: 'root'})`, native control flow (`@if`/`@for`), signals for state, `computed()` for derived state, never `mutate()` on a signal.
- TypeScript: strict; never `any`, use `unknown` when uncertain.
- Accessibility: must pass AXE and WCAG AA. No new interactive pattern is introduced by this plan — existing `<label for>`/`aria-label` associations must be preserved exactly, just re-targeted at symbol/name values instead of ids.
- Commits: Conventional Commits, description in English, no `Co-Authored-By` / AI-attribution footer (per the repo's `git:commit` skill and this repo's own project memory — commit messages are English even though this conversation is in Polish).
- Test command shape: `npx ng test --include <path-to-spec> --watch=false` for a single task's own spec file(s). Full suite: `npx ng test --watch=false`. Type-check: `npx tsc --noEmit -p tsconfig.app.json` and `npx tsc --noEmit -p tsconfig.spec.json`. Lint: `npx ng lint`.
- **Expected transient breakage:** `Product`'s shape changes in Task 2. Between Task 2 and the task that updates each consumer (Tasks 3–5), every other file that still reads `product.defaultUnitId`/`categoryId` — production code and spec fixtures alike — will have stale TypeScript types, and any spec file among them that asserts on those fields will have runtime assertions that no longer hold. This is expected and is not a reason to stop mid-task — run only the task's own scoped test command (per the Global Constraint above) until Task 8's full-suite sweep. Do not run the full suite or a whole-project type-check as a gate on Tasks 2–7; only Task 8 requires a fully green project.
- `crypto.randomUUID()` and `Omit<T, 'id'>` conventions already used by `UnitsService`/`CategoriesService`/`ProductsService` stay as-is — no change to id generation.

## Review Focus

- Editing a product whose stored `unitSymbol`/`categoryName` no longer matches any current `Unit`/`Category` (deleted or renamed after the product was last saved) must still show that stored value as a visible, selected option — not silently fall back to blank or to whatever option happens to be first. (Task 3)
- Migrating a legacy product whose `defaultUnitId`/`categoryId` no longer resolves against the current `Unit`/`Category` collections must fall back to `''` rather than throwing or producing `undefined`. (Task 2)
- Migration must be idempotent: a product record already in the new shape (`unitSymbol`/`categoryName` present) must pass through unchanged, not be re-processed or corrupted, so a second app load never double-migrates. (Task 2)
- The shopping-list add-item duplicate/merge check must stay case-insensitive on the unit text after switching from a `Unit` object's `.symbol` to a plain `string` parameter. (Task 5)
- Deleting or editing a `Unit`/`Category` that many `Product` records still hold the same symbol/name text for must now always succeed, and must leave those products' stored text untouched (no cascading rename/clear). (Tasks 6, 7)

---

### Task 1: `local-storage-collection` migration hook

**Files:**
- Modify: `src/app/core/storage/local-storage-collection.ts`
- Test: `src/app/core/storage/local-storage-collection.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `interface LocalStorageCollectionOptions<T> { migrate?: (raw: unknown[]) => T[] }`
  - `createLocalStorageCollection<T extends { id: string }>(storageKey: string, options?: LocalStorageCollectionOptions<T>): LocalStorageCollection<T>` — the existing signature gains an optional second parameter; omitting it behaves exactly as today.
  - Task 2 consumes this: `ProductsService` passes `{ migrate: ... }`.

- [ ] **Step 1: Write the failing tests**

Add to `src/app/core/storage/local-storage-collection.spec.ts`, after the existing `TestCollectionHarness` class and before the first `describe`:

```ts
interface LegacyTestItem {
  id: string;
  oldLabel: string;
}

let lastMigrateRawInput: unknown[] | undefined;

@Injectable()
class TestCollectionWithMigrationHarness {
  readonly collection = createLocalStorageCollection<TestItem>('test:migrated-items', {
    migrate: (raw) => {
      lastMigrateRawInput = raw;
      return (raw as LegacyTestItem[]).map((item) => ({ id: item.id, label: item.oldLabel }));
    },
  });
}
```

Then add a second top-level `describe`, after the existing one's closing `});`:

```ts
describe('createLocalStorageCollection migration', () => {
  beforeEach(() => {
    localStorage.clear();
    lastMigrateRawInput = undefined;
    TestBed.configureTestingModule({ providers: [TestCollectionWithMigrationHarness] });
  });

  it('applies the migrate function to raw items read from storage', () => {
    localStorage.setItem('test:migrated-items', JSON.stringify([{ id: '1', oldLabel: 'Legacy' }]));
    const harness = TestBed.inject(TestCollectionWithMigrationHarness);
    expect(harness.collection.items()).toEqual([{ id: '1', label: 'Legacy' }]);
  });

  it('persists the migrated shape back to storage', () => {
    localStorage.setItem('test:migrated-items', JSON.stringify([{ id: '1', oldLabel: 'Legacy' }]));
    TestBed.inject(TestCollectionWithMigrationHarness);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('test:migrated-items')!)).toEqual([
      { id: '1', label: 'Legacy' },
    ]);
  });

  it('calls migrate with an empty array when storage has no entry for the key', () => {
    TestBed.inject(TestCollectionWithMigrationHarness);
    expect(lastMigrateRawInput).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/core/storage/local-storage-collection.spec.ts --watch=false`
Expected: FAIL — `createLocalStorageCollection` does not accept a second argument (TypeScript build error surfaced by Vitest) and/or `migrate` is never called.

- [ ] **Step 3: Implement the migrate hook**

Replace the full contents of `src/app/core/storage/local-storage-collection.ts` with:

```ts
import { effect, signal, Signal } from '@angular/core';

export interface LocalStorageCollection<T> {
  readonly items: Signal<readonly T[]>;
  add(item: T): void;
  update(id: string, changes: Partial<T>): void;
  remove(id: string): void;
}

export interface LocalStorageCollectionOptions<T> {
  /**
   * Runs once against the raw parsed JSON read from storage, before it
   * becomes the collection's initial value. Lets a caller upgrade records
   * stored in an older shape. Omit to use the stored data as-is.
   */
  migrate?: (raw: unknown[]) => T[];
}

function readRawFromStorage(storageKey: string): unknown[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeToStorage<T>(storageKey: string, items: readonly T[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    // localStorage unavailable or full — state stays in-memory for this session only.
  }
}

/**
 * Creates a signal-backed collection of items of type `T`, persisted to `localStorage`
 * under `storageKey`. Must be called as a field initializer of an injectable class,
 * since it uses `effect()` internally and therefore needs an injection context.
 */
export function createLocalStorageCollection<T extends { id: string }>(
  storageKey: string,
  options?: LocalStorageCollectionOptions<T>,
): LocalStorageCollection<T> {
  const raw = readRawFromStorage(storageKey);
  const items = signal<T[]>(options?.migrate ? options.migrate(raw) : (raw as T[]));

  effect(() => writeToStorage(storageKey, items()));

  return {
    items: items.asReadonly(),
    add: (item: T) => items.update((list) => [...list, item]),
    update: (id: string, changes: Partial<T>) =>
      items.update((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item))),
    remove: (id: string) => items.update((list) => list.filter((item) => item.id !== id)),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/core/storage/local-storage-collection.spec.ts --watch=false`
Expected: PASS, all tests including the pre-existing ones (the identity path with no `migrate` is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/storage/local-storage-collection.ts src/app/core/storage/local-storage-collection.spec.ts
git commit -m "feat(storage): add an optional migrate hook to createLocalStorageCollection"
```

---

### Task 2: `Product` model + `ProductsService` migration

**Files:**
- Modify: `src/app/features/products/data/product.model.ts`
- Modify: `src/app/features/products/data/products.service.ts`
- Test: `src/app/features/products/data/products.service.spec.ts`

**Interfaces:**
- Consumes: `createLocalStorageCollection`'s `migrate` option (Task 1); `UnitsService.units(): Signal<readonly Unit[]>`, `CategoriesService.categories(): Signal<readonly Category[]>` (both already exist, unchanged).
- Produces:
  - `interface Product { id: ProductId; name: string; unitSymbol: string; categoryName: string }` — `defaultUnitId`/`categoryId` are gone.
  - `ProductsService.add(product: Omit<Product, 'id'>): Product`, `.update(id, changes: Partial<Omit<Product, 'id'>>): void`, `.remove(id): void` — same method names/shapes as today, just the `Product` fields they accept have changed.
  - Every later task (3, 4, 5) consumes the new `Product` shape.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/features/products/data/products.service.spec.ts` with:

```ts
import { TestBed } from '@angular/core/testing';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts with no products', () => {
    const service = TestBed.inject(ProductsService);
    expect(service.products()).toEqual([]);
  });

  it('adds a product with a generated id', () => {
    const service = TestBed.inject(ProductsService);
    service.add({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' });
    expect(service.products()).toEqual([
      expect.objectContaining({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' }),
    ]);
    expect(service.products()[0].id).toBeTruthy();
  });

  it('returns the created product, including its generated id', () => {
    const service = TestBed.inject(ProductsService);
    const created = service.add({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' });
    expect(created).toEqual(service.products()[0]);
    expect(created.id).toBeTruthy();
  });

  it('updates an existing product', () => {
    const service = TestBed.inject(ProductsService);
    service.add({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' });
    const id = service.products()[0].id;
    service.update(id, { name: 'Milk 1.5%' });
    expect(service.products()[0].name).toBe('Milk 1.5%');
  });

  it('removes a product', () => {
    const service = TestBed.inject(ProductsService);
    service.add({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' });
    const id = service.products()[0].id;
    service.remove(id);
    expect(service.products()).toEqual([]);
  });

  it('migrates a legacy product record on load, resolving ids to the current unit/category text', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'kg' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const unitId = unitsService.units()[0].id;
    const categoryId = categoriesService.categories()[0].id;

    localStorage.setItem(
      'listify:products',
      JSON.stringify([{ id: 'p1', name: 'Milk', defaultUnitId: unitId, categoryId }]),
    );

    const service = TestBed.inject(ProductsService);
    expect(service.products()).toEqual([
      { id: 'p1', name: 'Milk', unitSymbol: 'kg', categoryName: 'Dairy' },
    ]);
  });

  it('migrates a legacy product whose referenced unit/category no longer exists to empty strings', () => {
    localStorage.setItem(
      'listify:products',
      JSON.stringify([
        { id: 'p1', name: 'Milk', defaultUnitId: 'missing-unit', categoryId: 'missing-category' },
      ]),
    );

    const service = TestBed.inject(ProductsService);
    expect(service.products()).toEqual([{ id: 'p1', name: 'Milk', unitSymbol: '', categoryName: '' }]);
  });

  it('leaves an already-migrated product unchanged', () => {
    localStorage.setItem(
      'listify:products',
      JSON.stringify([{ id: 'p1', name: 'Milk', unitSymbol: 'kg', categoryName: 'Dairy' }]),
    );

    const service = TestBed.inject(ProductsService);
    expect(service.products()).toEqual([
      { id: 'p1', name: 'Milk', unitSymbol: 'kg', categoryName: 'Dairy' },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/products/data/products.service.spec.ts --watch=false`
Expected: FAIL — `add()`/`service.products()` assertions fail because `Product` still has `defaultUnitId`/`categoryId`, and the migration tests fail because no migration runs yet.

- [ ] **Step 3: Update the `Product` model**

Replace the full contents of `src/app/features/products/data/product.model.ts` with:

```ts
export type ProductId = string;

export interface Product {
  id: ProductId;
  name: string;
  unitSymbol: string;
  categoryName: string;
}
```

- [ ] **Step 4: Add migration to `ProductsService`**

Replace the full contents of `src/app/features/products/data/products.service.ts` with:

```ts
import { inject, Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { Product, ProductId } from './product.model';

interface LegacyProductV1 {
  id: string;
  name: string;
  defaultUnitId?: string;
  categoryId?: string;
  unitSymbol?: string;
  categoryName?: string;
}

@Service()
export class ProductsService {
  private readonly unitsService = inject(UnitsService);
  private readonly categoriesService = inject(CategoriesService);

  private readonly store = createLocalStorageCollection<Product>('listify:products', {
    migrate: (raw) => (raw as LegacyProductV1[]).map((item) => this.migrateProduct(item)),
  });

  readonly products = this.store.items;

  add(product: Omit<Product, 'id'>): Product {
    const created: Product = { ...product, id: crypto.randomUUID() };
    this.store.add(created);
    return created;
  }

  update(id: ProductId, changes: Partial<Omit<Product, 'id'>>): void {
    this.store.update(id, changes);
  }

  remove(id: ProductId): void {
    this.store.remove(id);
  }

  private migrateProduct(item: LegacyProductV1): Product {
    if (item.unitSymbol !== undefined && item.categoryName !== undefined) {
      return { id: item.id, name: item.name, unitSymbol: item.unitSymbol, categoryName: item.categoryName };
    }
    return {
      id: item.id,
      name: item.name,
      unitSymbol:
        item.unitSymbol ??
        this.unitsService.units().find((unit) => unit.id === item.defaultUnitId)?.symbol ??
        '',
      categoryName:
        item.categoryName ??
        this.categoriesService.categories().find((category) => category.id === item.categoryId)?.name ??
        '',
    };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/products/data/products.service.spec.ts --watch=false`
Expected: PASS.

Do **not** run the full suite yet — per the Global Constraints, every other file that still reads `product.defaultUnitId`/`categoryId` is expected to be broken until Tasks 3–5 land.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/products/data/product.model.ts src/app/features/products/data/products.service.ts src/app/features/products/data/products.service.spec.ts
git commit -m "feat(products): store unit/category as denormalized text, migrate legacy records"
```

---

### Task 3: `ProductsManager`

**Files:**
- Modify: `src/app/features/products/products-manager/products-manager.ts`
- Modify: `src/app/core/i18n/translations/en.ts`, `src/app/core/i18n/translations/pl.ts` (remove `products.unknownUnit`, `products.unknownCategory`)
- Test: `src/app/features/products/products-manager/products-manager.spec.ts`

**Interfaces:**
- Consumes: `Product.unitSymbol`/`categoryName` (Task 2), `UnitsService.units()`, `CategoriesService.categories()` (unchanged).
- Produces: no public API change — `ProductsManager` is a leaf component. `unitSymbolOptions`/`categoryNameOptions` are new `protected readonly` computed signals local to this component.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/features/products/products-manager/products-manager.spec.ts` with:

```ts
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { I18n } from '../../../core/i18n/i18n.service';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { ProductsService } from '../data/products.service';
import { ProductsManager } from './products-manager';

function clickConfirmDialogButton(which: 'cancel' | 'confirm'): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.confirm-dialog__actions button');
  (which === 'cancel' ? buttons[0] : buttons[1]).click();
}

describe('ProductsManager', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ProductsManager] });
  });

  it('shows an empty-state message when there are no products', () => {
    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No products yet');
  });

  it('renders the page in Polish once Polish is selected', () => {
    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('No products yet');

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect(root.textContent).toContain('Produkty');
    expect(root.textContent).toContain('Nie masz jeszcze produktów');
  });

  it('adds a product using the selected default unit and category', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });

    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const nameInput = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    nameInput.value = 'Milk 3.2%';
    nameInput.dispatchEvent(new Event('input'));

    const selects = root.querySelectorAll<HTMLSelectElement>('select');
    selects[0].value = 'l';
    selects[0].dispatchEvent(new Event('input'));
    selects[1].value = 'Dairy';
    selects[1].dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    const productsService = TestBed.inject(ProductsService);
    expect(productsService.products()).toEqual([
      expect.objectContaining({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' }),
    ]);
    const meta = root.querySelector('.list-card__meta');
    expect(meta?.textContent).toContain('l');
    expect(meta?.textContent).toContain('Dairy');
  });

  it('removes a product after the user confirms in the dialog', async () => {
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Delete Milk"]')!
      .click();
    await TestBed.inject(ApplicationRef).whenStable();

    clickConfirmDialogButton('confirm');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(productsService.products()).toEqual([]);
  });

  it('keeps the product when the user cancels the delete dialog', async () => {
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Delete Milk"]')!
      .click();
    await TestBed.inject(ApplicationRef).whenStable();

    clickConfirmDialogButton('cancel');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(productsService.products().length).toBe(1);
  });

  it('resets to add mode when editing is cancelled', () => {
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Edit Milk"]')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Edit product');

    root.querySelector<HTMLButtonElement>('.btn-outline-pill')!.click();
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Add product');
    expect(root.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('');
  });

  it('clears typed-in data when adding is cancelled without submitting', () => {
    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const nameInput = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    nameInput.value = 'Milk 3.2%';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.btn-outline-pill')!.click();
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Add product');
    expect(root.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('');
  });

  it('pre-selects the default unit when adding a new product', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l', isDefault: true });

    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const unitSelect = root.querySelectorAll<HTMLSelectElement>('select')[0];
    expect(unitSelect.value).toBe('l');
  });

  it('keeps the default unit selected after the form resets following a successful add', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l', isDefault: true });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });

    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const nameInput = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    nameInput.value = 'Milk';
    nameInput.dispatchEvent(new Event('input'));
    const selects = root.querySelectorAll<HTMLSelectElement>('select');
    selects[1].value = 'Dairy';
    selects[1].dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    const unitSelectAfterReset = root.querySelectorAll<HTMLSelectElement>('select')[0];
    expect(unitSelectAfterReset.value).toBe('l');
  });

  it('shows a stale unit and category as an extra selected option when editing a product whose values no longer exist', () => {
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'kg' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Produce' });

    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('button[aria-label="Edit Milk"]')!.click();
    fixture.detectChanges();

    const [unitSelect, categorySelect] = Array.from(root.querySelectorAll<HTMLSelectElement>('select'));
    expect(Array.from(unitSelect.options).map((option) => option.value)).toEqual(['', 'kg', 'l']);
    expect(Array.from(categorySelect.options).map((option) => option.value)).toEqual([
      '',
      'Produce',
      'Dairy',
    ]);
    expect(unitSelect.value).toBe('l');
    expect(categorySelect.value).toBe('Dairy');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/products/products-manager/products-manager.spec.ts --watch=false`
Expected: FAIL — the component still reads/writes `defaultUnitId`/`categoryId`, so the `<select>` values and assertions don't match.

- [ ] **Step 3: Update `products-manager.ts`**

Replace the `ProductFormValue` interface and constant:

```ts
interface ProductFormValue {
  name: string;
  unitSymbol: string;
  categoryName: string;
}

const EMPTY_PRODUCT_FORM: ProductFormValue = { name: '', unitSymbol: '', categoryName: '' };
```

In the template, replace the list item's meta line:

```html
                <span class="list-card__meta">{{ product.unitSymbol }} · {{ product.categoryName }}</span>
```

Replace the unit and category `<select>` blocks:

```html
        <label class="field-label" for="product-unit">{{ t('products.defaultUnit') }}</label>
        <select id="product-unit" class="field-input" [formField]="productForm.unitSymbol">
          <option value="" disabled>{{ t('products.selectUnit') }}</option>
          @for (symbol of unitSymbolOptions(); track symbol) {
            <option [value]="symbol">{{ symbol }}</option>
          }
        </select>
        @if (productForm.unitSymbol().invalid() && productForm.unitSymbol().touched()) {
          <span class="field-error">{{ t('products.unitRequired') }}</span>
        }

        <label class="field-label" for="product-category">{{ t('products.category') }}</label>
        <select id="product-category" class="field-input" [formField]="productForm.categoryName">
          <option value="" disabled>{{ t('products.selectCategory') }}</option>
          @for (name of categoryNameOptions(); track name) {
            <option [value]="name">{{ name }}</option>
          }
        </select>
        @if (productForm.categoryName().invalid() && productForm.categoryName().touched()) {
          <span class="field-error">{{ t('products.categoryRequired') }}</span>
        }
```

In the class body, delete the `unitLabel()` and `categoryLabel()` methods entirely, and add these two computed signals next to `sortedProducts`:

```ts
  protected readonly unitSymbolOptions = computed(() => {
    const symbols = this.unitsService.units().map((unit) => unit.symbol);
    const current = this.model().unitSymbol;
    return current && !symbols.includes(current) ? [...symbols, current] : symbols;
  });

  protected readonly categoryNameOptions = computed(() => {
    const names = this.categoriesService.categories().map((category) => category.name);
    const current = this.model().categoryName;
    return current && !names.includes(current) ? [...names, current] : names;
  });
```

Update the form validators:

```ts
  protected readonly productForm = form(this.model, (path) => {
    required(path.name);
    required(path.unitSymbol);
    required(path.categoryName);
  });
```

Update `startEdit()`:

```ts
  protected startEdit(product: Product): void {
    this.editingId.set(product.id);
    this.model.set({
      name: product.name,
      unitSymbol: product.unitSymbol,
      categoryName: product.categoryName,
    });
    this.isPanelOpen.set(true);
  }
```

Update `buildEmptyProductForm()`:

```ts
  private buildEmptyProductForm(): ProductFormValue {
    return { ...EMPTY_PRODUCT_FORM, unitSymbol: this.unitsService.defaultUnit()?.symbol ?? '' };
  }
```

`handleSubmit()` needs no structural change — it already spreads `this.model()`, which now carries `unitSymbol`/`categoryName`.

- [ ] **Step 4: Remove the now-unused translations**

In both `src/app/core/i18n/translations/en.ts` and `src/app/core/i18n/translations/pl.ts`, delete the two lines:

```ts
  'products.unknownUnit': '...',
  'products.unknownCategory': '...',
```

(English values: `Unknown unit`, `Unknown category`; Polish: `Nieznana jednostka`, `Nieznana kategoria`.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/products/products-manager/products-manager.spec.ts --watch=false`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/products/products-manager/products-manager.ts src/app/features/products/products-manager/products-manager.spec.ts src/app/core/i18n/translations/en.ts src/app/core/i18n/translations/pl.ts
git commit -m "feat(products): bind the product form's unit/category selects by text, not id"
```

---

### Task 4: `CreateProductDialog` + `ProductPicker` spec fixtures

**Files:**
- Modify: `src/app/features/products/create-product-dialog/create-product-dialog.ts`
- Test: `src/app/features/products/create-product-dialog/create-product-dialog.spec.ts`
- Test: `src/app/shared/product-picker/product-picker.spec.ts` (fixtures + embedded dialog interaction only — `product-picker.ts` itself is unchanged, see spec's Component changes)

**Interfaces:**
- Consumes: `Product.unitSymbol`/`categoryName` (Task 2).
- Produces: no public API change — `CreateProductDialogData`/`DialogRef<Product | undefined>` are unchanged.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/features/products/create-product-dialog/create-product-dialog.spec.ts` with:

```ts
import { Dialog } from '@angular/cdk/dialog';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { Product } from '../data/product.model';
import { ProductsService } from '../data/products.service';
import { CreateProductDialog, CreateProductDialogData } from './create-product-dialog';

describe('CreateProductDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((container) => container.remove());
  });

  function openDialog(initialName: string) {
    const dialog = TestBed.inject(Dialog);
    return dialog.open<Product | undefined, CreateProductDialogData>(CreateProductDialog, {
      data: { initialName },
    });
  }

  it('pre-fills the name field with the typed query', async () => {
    openDialog('Oat milk');
    await TestBed.inject(ApplicationRef).whenStable();

    const nameInput = document.querySelector<HTMLInputElement>('#create-product-name')!;
    expect(nameInput.value).toBe('Oat milk');
  });

  it('pre-fills the default unit when one is marked default, leaves category empty', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l', isDefault: true });

    openDialog('Oat milk');
    await TestBed.inject(ApplicationRef).whenStable();

    const unitSelect = document.querySelector<HTMLSelectElement>('#create-product-unit')!;
    const categorySelect = document.querySelector<HTMLSelectElement>('#create-product-category')!;
    expect(unitSelect.value).toBe('l');
    expect(categorySelect.value).toBe('');
  });

  it('blocks submit and shows an error when the name duplicates an existing product', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });

    const dialogRef = openDialog('Milk');
    await TestBed.inject(ApplicationRef).whenStable();

    document.querySelector<HTMLSelectElement>('#create-product-unit')!.value = 'l';
    document
      .querySelector<HTMLSelectElement>('#create-product-unit')!
      .dispatchEvent(new Event('input'));
    document.querySelector<HTMLSelectElement>('#create-product-category')!.value = 'Dairy';
    document
      .querySelector<HTMLSelectElement>('#create-product-category')!
      .dispatchEvent(new Event('input'));

    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.body.textContent).toContain('A product with this name already exists.');
    expect(productsService.products().length).toBe(1);
    expect(dialogRef.closed).toBeDefined();
  });

  it('creates the product and closes with it on valid submit', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });

    const dialogRef = openDialog('Oat milk');
    const resultPromise = firstValueFrom(dialogRef.closed);
    await TestBed.inject(ApplicationRef).whenStable();

    document.querySelector<HTMLSelectElement>('#create-product-unit')!.value = 'l';
    document
      .querySelector<HTMLSelectElement>('#create-product-unit')!
      .dispatchEvent(new Event('input'));
    document.querySelector<HTMLSelectElement>('#create-product-category')!.value = 'Dairy';
    document
      .querySelector<HTMLSelectElement>('#create-product-category')!
      .dispatchEvent(new Event('input'));

    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

    const result = await resultPromise;
    expect(result).toEqual(
      expect.objectContaining({ name: 'Oat milk', unitSymbol: 'l', categoryName: 'Dairy' }),
    );
    const productsService = TestBed.inject(ProductsService);
    expect(productsService.products()).toEqual([result]);
  });

  it('blocks submit when unit or category is missing', async () => {
    openDialog('Oat milk');
    await TestBed.inject(ApplicationRef).whenStable();

    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.body.textContent).toContain('A unit is required.');
    expect(document.body.textContent).toContain('A category is required.');
    const productsService = TestBed.inject(ProductsService);
    expect(productsService.products()).toEqual([]);
  });

  it('closes with undefined when cancelled', async () => {
    const dialogRef = openDialog('Oat milk');
    const resultPromise = firstValueFrom(dialogRef.closed);
    await TestBed.inject(ApplicationRef).whenStable();

    document.querySelector<HTMLButtonElement>('.btn-outline-pill')!.click();

    expect(await resultPromise).toBeUndefined();
  });
});
```

Also update `src/app/shared/product-picker/product-picker.spec.ts`, which drives this same dialog's DOM from inside `ProductPicker`'s "create product" flow:

- In `beforeEach`, replace:

```ts
    const productsService = TestBed.inject(ProductsService);
    milk = productsService.add({
      name: 'Milk',
      defaultUnitId: unitsService.units()[0].id,
      categoryId: categoriesService.categories()[0].id,
    });
    bread = productsService.add({
      name: 'Bread',
      defaultUnitId: unitsService.units()[0].id,
      categoryId: categoriesService.categories()[0].id,
    });
```

with:

```ts
    const productsService = TestBed.inject(ProductsService);
    milk = productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    bread = productsService.add({ name: 'Bread', unitSymbol: 'l', categoryName: 'Dairy' });
```

- In `'selecting the create action opens the dialog and selects the created product on save'`, replace:

```ts
    const unitsService = TestBed.inject(UnitsService);
    const categoriesService = TestBed.inject(CategoriesService);
    document.querySelector<HTMLSelectElement>('#create-product-unit')!.value =
      unitsService.units()[0].id;
    document
      .querySelector<HTMLSelectElement>('#create-product-unit')!
      .dispatchEvent(new Event('input'));
    document.querySelector<HTMLSelectElement>('#create-product-category')!.value =
      categoriesService.categories()[0].id;
    document
      .querySelector<HTMLSelectElement>('#create-product-category')!
      .dispatchEvent(new Event('input'));
```

with:

```ts
    document.querySelector<HTMLSelectElement>('#create-product-unit')!.value = 'l';
    document
      .querySelector<HTMLSelectElement>('#create-product-unit')!
      .dispatchEvent(new Event('input'));
    document.querySelector<HTMLSelectElement>('#create-product-category')!.value = 'Dairy';
    document
      .querySelector<HTMLSelectElement>('#create-product-category')!
      .dispatchEvent(new Event('input'));
```

(`UnitsService`/`CategoriesService` are still imported and used earlier in that same `beforeEach` to seed the `l` unit and `Dairy` category, so leave those imports in place.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/products/create-product-dialog/create-product-dialog.spec.ts --include src/app/shared/product-picker/product-picker.spec.ts --watch=false`
Expected: FAIL — the dialog's `<select>` options are still id-valued.

- [ ] **Step 3: Update `create-product-dialog.ts`**

Replace the `CreateProductFormValue` interface:

```ts
interface CreateProductFormValue {
  name: string;
  unitSymbol: string;
  categoryName: string;
}
```

Replace the unit and category `<select>` blocks:

```html
        <label class="field-label" for="create-product-unit">{{ t('products.defaultUnit') }}</label>
        <select
          id="create-product-unit"
          class="field-input"
          [formField]="productForm.unitSymbol"
        >
          <option value="" disabled>{{ t('products.selectUnit') }}</option>
          @for (unit of unitsService.units(); track unit.id) {
            <option [value]="unit.symbol">{{ unit.symbol }}</option>
          }
        </select>
        @if (productForm.unitSymbol().invalid() && productForm.unitSymbol().touched()) {
          <span class="field-error">{{ t('products.unitRequired') }}</span>
        }

        <label class="field-label" for="create-product-category">{{ t('products.category') }}</label>
        <select id="create-product-category" class="field-input" [formField]="productForm.categoryName">
          <option value="" disabled>{{ t('products.selectCategory') }}</option>
          @for (category of categoriesService.categories(); track category.id) {
            <option [value]="category.name">{{ category.name }}</option>
          }
        </select>
        @if (productForm.categoryName().invalid() && productForm.categoryName().touched()) {
          <span class="field-error">{{ t('products.categoryRequired') }}</span>
        }
```

(No stale-option handling here — see the spec's Component changes: this dialog only ever creates a brand-new product, so its model can never start from a value absent from the current lists.)

Update the initial model:

```ts
  private readonly model = signal<CreateProductFormValue>({
    name: this.data.initialName,
    unitSymbol: this.unitsService.defaultUnit()?.symbol ?? '',
    categoryName: '',
  });
  protected readonly productForm = form(this.model, (path) => {
    required(path.name);
    required(path.unitSymbol);
    required(path.categoryName);
  });
```

`handleSubmit()` needs no structural change — it already spreads `this.model()`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/products/create-product-dialog/create-product-dialog.spec.ts --include src/app/shared/product-picker/product-picker.spec.ts --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/products/create-product-dialog/create-product-dialog.ts src/app/features/products/create-product-dialog/create-product-dialog.spec.ts src/app/shared/product-picker/product-picker.spec.ts
git commit -m "feat(products): bind the quick-create dialog's unit/category selects by text, not id"
```

---

### Task 5: `ShoppingListsService` + `ShoppingListDetail`

**Files:**
- Modify: `src/app/features/shopping-lists/data/shopping-lists.service.ts`
- Modify: `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.ts`
- Test: `src/app/features/shopping-lists/data/shopping-lists.service.spec.ts`
- Test: `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts`

**Interfaces:**
- Consumes: `Product.unitSymbol`/`categoryName` (Task 2); `CreateProductDialog`'s text-valued selects (Task 4, exercised transitively through `ProductPicker`).
- Produces: `ShoppingListsService.addItemFromProduct(listId: ShoppingListId, product: Product, unitSymbol: string, quantity: number, note?: string): boolean` — was `(..., unit: Unit, category: Category, ...)`. No other public signature changes.

This task changes both files together because `ShoppingListDetail.addItem()` is `addItemFromProduct`'s only caller — an intermediate state where only one of the two is updated fails at runtime, not just at the type level (see Global Constraints).

- [ ] **Step 1: Write the failing test for `ShoppingListsService`**

Replace the full contents of `src/app/features/shopping-lists/data/shopping-lists.service.spec.ts` with:

```ts
import { TestBed } from '@angular/core/testing';
import { Product } from '../../products/data/product.model';
import { ShoppingListsService } from './shopping-lists.service';

describe('ShoppingListsService', () => {
  const product: Product = { id: 'p1', name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts with no lists', () => {
    const service = TestBed.inject(ShoppingListsService);
    expect(service.lists()).toEqual([]);
  });

  it('creates a list with active status, a timestamp, and no items', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const [list] = service.lists();
    expect(list.name).toBe('Weekly groceries');
    expect(list.status).toBe('active');
    expect(list.items).toEqual([]);
    expect(Number.isNaN(Date.parse(list.createdAt))).toBe(false);
  });

  it('returns the created list from addList', () => {
    const service = TestBed.inject(ShoppingListsService);
    const created = service.addList('Weekly groceries');
    expect(created).toEqual(service.lists()[0]);
  });

  it('changes the status of a list', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const id = service.lists()[0].id;
    service.setStatus(id, 'completed');
    expect(service.lists()[0].status).toBe('completed');
  });

  it('removes a list', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const id = service.lists()[0].id;
    service.removeList(id);
    expect(service.lists()).toEqual([]);
  });

  it('adds an item to a list as a snapshot of the given product and unit', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;

    service.addItemFromProduct(listId, product, 'l', 2, 'organic');

    const [item] = service.lists()[0].items;
    expect(item).toEqual(
      expect.objectContaining({
        productName: 'Milk 3.2%',
        unitLabel: 'l',
        categoryName: 'Dairy',
        quantity: 2,
        purchased: false,
        note: 'organic',
      }),
    );
    expect(item.id).toBeTruthy();
  });

  it('marks an item as purchased', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 1);
    const itemId = service.lists()[0].items[0].id;

    service.setItemPurchased(listId, itemId, true);

    expect(service.lists()[0].items[0].purchased).toBe(true);
  });

  it('updates the quantity of an item', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 1);
    const itemId = service.lists()[0].items[0].id;

    service.updateItemQuantity(listId, itemId, 3.5);

    expect(service.lists()[0].items[0].quantity).toBe(3.5);
  });

  it('removes an item from a list', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 1);
    const itemId = service.lists()[0].items[0].id;

    service.removeItem(listId, itemId);

    expect(service.lists()[0].items).toEqual([]);
  });

  it('merges quantity into an existing unpurchased item with the same product, unit, and note', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 2, 'organic');

    const merged = service.addItemFromProduct(listId, product, 'l', 3, 'organic');

    expect(merged).toBe(true);
    const list = service.lists()[0];
    expect(list.items.length).toBe(1);
    expect(list.items[0].quantity).toBe(5);
  });

  it('merges quantity case-insensitively across product name, unit, and note', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 2, 'Organic');

    const upperProduct: Product = { ...product, name: 'MILK 3.2%' };
    const merged = service.addItemFromProduct(listId, upperProduct, 'L', 1, 'organic');

    expect(merged).toBe(true);
    const list = service.lists()[0];
    expect(list.items.length).toBe(1);
    expect(list.items[0].quantity).toBe(3);
  });

  it('does not merge when the note differs', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 2, 'organic');

    const merged = service.addItemFromProduct(listId, product, 'l', 1, 'skimmed');

    expect(merged).toBe(false);
    expect(service.lists()[0].items.length).toBe(2);
  });

  it('does not merge into an item already marked as purchased', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 2, 'organic');
    const itemId = service.lists()[0].items[0].id;
    service.setItemPurchased(listId, itemId, true);

    const merged = service.addItemFromProduct(listId, product, 'l', 1, 'organic');

    expect(merged).toBe(false);
    const list = service.lists()[0];
    expect(list.items.length).toBe(2);
    expect(list.items[0].quantity).toBe(2);
  });

  it('ignores item changes for a completed list', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 1);
    const itemId = service.lists()[0].items[0].id;
    service.setStatus(listId, 'completed');

    service.addItemFromProduct(listId, product, 'l', 2);
    service.setItemPurchased(listId, itemId, true);
    service.updateItemQuantity(listId, itemId, 9);
    service.removeItem(listId, itemId);

    const list = service.lists()[0];
    expect(list.items.length).toBe(1);
    expect(list.items[0].purchased).toBe(false);
    expect(list.items[0].quantity).toBe(1);
  });

  it('imports a list with a fresh id, active status, and unpurchased items', () => {
    const service = TestBed.inject(ShoppingListsService);

    const created = service.importList({
      name: 'Shared list',
      items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2, note: 'organic' }],
    });

    expect(created.status).toBe('active');
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
    expect(created.id).toBeTruthy();
    expect(created.items.length).toBe(1);
    expect(created.items[0]).toEqual(
      expect.objectContaining({
        productName: 'Milk',
        unitLabel: 'l',
        categoryName: 'Dairy',
        quantity: 2,
        purchased: false,
        note: 'organic',
      }),
    );
    expect(created.items[0].id).toBeTruthy();
    expect(service.lists()).toEqual([created]);
  });

  it('imports items without a note as items with no note', () => {
    const service = TestBed.inject(ShoppingListsService);

    const created = service.importList({
      name: 'Shared list',
      items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2 }],
    });

    expect(created.items[0].note).toBeUndefined();
  });

  it('does not persist unexpected extra fields on an imported item', () => {
    const service = TestBed.inject(ShoppingListsService);

    const itemWithExtraField = {
      productName: 'Milk',
      unitLabel: 'l',
      categoryName: 'Dairy',
      quantity: 2,
      note: 'organic',
      maliciousField: 'should not survive import',
    } as unknown as { productName: string; unitLabel: string; categoryName: string; quantity: number; note?: string };

    const created = service.importList({
      name: 'Shared list',
      items: [itemWithExtraField],
    });

    expect(Object.keys(created.items[0]).sort()).toEqual(
      ['id', 'productName', 'unitLabel', 'categoryName', 'quantity', 'purchased', 'note'].sort(),
    );
    expect(created.items[0]).not.toHaveProperty('maliciousField');
  });
});
```

Note this drops the `Category`/`Unit` fixture imports and the top-level `unit`/`category` consts entirely — `product.categoryName` supplies the category text directly now, and the unit is passed as a plain string literal per call.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx ng test --include src/app/features/shopping-lists/data/shopping-lists.service.spec.ts --watch=false`
Expected: FAIL — `addItemFromProduct` still expects `(product, unit: Unit, category: Category, quantity, note)`.

- [ ] **Step 3: Update `shopping-lists.service.ts`**

Replace the `import` block at the top (drop `Category` and `Unit`):

```ts
import { Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { Product } from '../../products/data/product.model';
import { type ShoppingListExport } from './shopping-list-export';
import {
  ShoppingList,
  ShoppingListId,
  ShoppingListItem,
  ShoppingListItemId,
} from './shopping-list.model';
```

Replace `addItemFromProduct` and `isSameUnpurchasedItem`:

```ts
  addItemFromProduct(
    listId: ShoppingListId,
    product: Product,
    unitSymbol: string,
    quantity: number,
    note?: string,
  ): boolean {
    const list = this.lists().find((l) => l.id === listId);
    if (!list || list.status !== 'active') {
      return false;
    }
    const existing = list.items.find((item) =>
      this.isSameUnpurchasedItem(item, product, unitSymbol, note),
    );
    if (existing) {
      this.store.update(listId, {
        items: list.items.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + quantity } : item,
        ),
      });
      return true;
    }
    const item: ShoppingListItem = {
      id: crypto.randomUUID(),
      productName: product.name,
      unitLabel: unitSymbol,
      categoryName: product.categoryName,
      quantity,
      purchased: false,
      note,
    };
    this.store.update(listId, { items: [...list.items, item] });
    return false;
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

Every other method (`addList`, `importList`, `setStatus`, `rename`, `removeList`, `setItemPurchased`, `updateItemQuantity`, `removeItem`) is unchanged.

- [ ] **Step 4: Run the `ShoppingListsService` test to verify it passes**

Run: `npx ng test --include src/app/features/shopping-lists/data/shopping-lists.service.spec.ts --watch=false`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `ShoppingListDetail`**

Replace the full contents of `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts` with:

```ts
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { I18n } from '../../../core/i18n/i18n.service';
import { CategoriesService } from '../../categories/data/categories.service';
import { ProductsService } from '../../products/data/products.service';
import { UnitsService } from '../../units/data/units.service';
import { ShoppingListsService } from '../data/shopping-lists.service';
import { ShoppingListDetail } from './shopping-list-detail';

async function selectProductViaPicker(root: HTMLElement, productName: string): Promise<void> {
  const input = root.querySelector<HTMLInputElement>('#add-item-product')!;
  input.value = productName;
  input.dispatchEvent(new Event('input'));
  await TestBed.inject(ApplicationRef).whenStable();

  const option = Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find(
    (el) => el.textContent?.trim() === productName,
  )!;
  option.click();
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('ShoppingListDetail', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShoppingListDetail],
      providers: [provideRouter([])],
    });
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((container) => container.remove());
  });

  it('shows "List not found" for an unknown id', () => {
    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', 'missing');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('List not found');
  });

  it('renders the page in Polish once Polish is selected', () => {
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Back to lists');

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect(root.textContent).toContain('Powrót do list');
    expect(root.textContent).toContain('Brak pozycji');
  });

  it('adds an item built from the selected product, unit, and category', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    await selectProductViaPicker(root, 'Milk');
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    const items = shoppingListsService.lists()[0].items;
    expect(items.length).toBe(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        productName: 'Milk',
        unitLabel: 'l',
        categoryName: 'Dairy',
        quantity: 1,
      }),
    );
  });

  it('shows a feedback message when the submitted item merges into an existing unpurchased item', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;
    shoppingListsService.addItemFromProduct(listId, productsService.products()[0], 'l', 1);

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    await selectProductViaPicker(root, 'Milk');
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(root.textContent).toContain('Quantity updated for existing item.');

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect(root.textContent).toContain('Zaktualizowano ilość istniejącej pozycji.');
  });

  it('clears the feedback message a few seconds after it appears', async () => {
    vi.useFakeTimers();
    try {
      const unitsService = TestBed.inject(UnitsService);
      unitsService.add({ symbol: 'l' });
      const categoriesService = TestBed.inject(CategoriesService);
      categoriesService.add({ name: 'Dairy' });
      const productsService = TestBed.inject(ProductsService);
      productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
      const shoppingListsService = TestBed.inject(ShoppingListsService);
      shoppingListsService.addList('Weekly groceries');
      const listId = shoppingListsService.lists()[0].id;
      shoppingListsService.addItemFromProduct(listId, productsService.products()[0], 'l', 1);

      const fixture = TestBed.createComponent(ShoppingListDetail);
      fixture.componentRef.setInput('id', listId);
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.fab')!.click();
      fixture.detectChanges();

      // whenStable() can hang under vi.useFakeTimers() — the zoneless scheduler's
      // stability check relies on a macrotask that fake timers intercept without
      // advancing. Use plain microtask ticks instead, as the brief anticipates.
      const productInput = root.querySelector<HTMLInputElement>('#add-item-product')!;
      productInput.value = 'Milk';
      productInput.dispatchEvent(new Event('input'));
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      const option = Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find(
        (el) => el.textContent?.trim() === 'Milk',
      )!;
      option.click();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      fixture.detectChanges();
      expect(root.textContent).toContain('Quantity updated for existing item.');

      vi.advanceTimersByTime(3000);
      fixture.detectChanges();

      expect(root.textContent).not.toContain('Quantity updated for existing item.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not show a category selector — category is derived from the product', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const selects = root.querySelectorAll('select');
    expect(selects.length).toBe(1);
    expect(root.textContent).not.toContain('Category');
  });

  it('creates a new product from the search field and adds it to the list', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const input = root.querySelector<HTMLInputElement>('#add-item-product')!;
    input.value = 'Oat milk';
    input.dispatchEvent(new Event('input'));
    await TestBed.inject(ApplicationRef).whenStable();

    const createOption = Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find(
      (el) => el.textContent?.trim() === 'Create product "Oat milk"',
    )!;
    createOption.click();
    await TestBed.inject(ApplicationRef).whenStable();

    const createProductUnitSelect = document.querySelector<HTMLSelectElement>('#create-product-unit')!;
    createProductUnitSelect.value = 'l';
    createProductUnitSelect.dispatchEvent(new Event('input'));
    const createProductCategorySelect = document.querySelector<HTMLSelectElement>(
      '#create-product-category',
    )!;
    createProductCategorySelect.value = 'Dairy';
    createProductCategorySelect.dispatchEvent(new Event('input'));
    createProductUnitSelect.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    const productsService = TestBed.inject(ProductsService);
    expect(productsService.products()).toEqual([
      expect.objectContaining({ name: 'Oat milk', unitSymbol: 'l', categoryName: 'Dairy' }),
    ]);
    const items = shoppingListsService.lists()[0].items;
    expect(items.length).toBe(1);
    expect(items[0]).toEqual(
      expect.objectContaining({ productName: 'Oat milk', unitLabel: 'l', categoryName: 'Dairy' }),
    );
  });

  it('focuses the quantity field after creating a product from the add-item form', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const input = root.querySelector<HTMLInputElement>('#add-item-product')!;
    input.value = 'Oat milk';
    input.dispatchEvent(new Event('input'));
    await TestBed.inject(ApplicationRef).whenStable();

    const createOption = Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find(
      (el) => el.textContent?.trim() === 'Create product "Oat milk"',
    )!;
    createOption.click();
    await TestBed.inject(ApplicationRef).whenStable();

    const createProductUnitSelect = document.querySelector<HTMLSelectElement>('#create-product-unit')!;
    createProductUnitSelect.value = 'l';
    createProductUnitSelect.dispatchEvent(new Event('input'));
    const createProductCategorySelect = document.querySelector<HTMLSelectElement>(
      '#create-product-category',
    )!;
    createProductCategorySelect.value = 'Dairy';
    createProductCategorySelect.dispatchEvent(new Event('input'));
    createProductUnitSelect.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    const quantityInput = root.querySelector<HTMLInputElement>('#add-item-quantity')!;
    expect(document.activeElement).toBe(quantityInput);
  });

  it('groups items into sections by category, sorted alphabetically', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Produce' });
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Apples', unitSymbol: 'l', categoryName: 'Produce' });
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const [applesProduct, milkProduct] = productsService.products();
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;
    shoppingListsService.addItemFromProduct(listId, applesProduct, 'l', 3);
    shoppingListsService.addItemFromProduct(listId, milkProduct, 'l', 1);

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const headings = Array.from(root.querySelectorAll('.section-heading h2')).map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual(['Dairy', 'Produce']);

    const itemLists = root.querySelectorAll('.item-list');
    expect(itemLists.length).toBe(2);
    expect(itemLists[0].textContent).toContain('Milk');
    expect(itemLists[1].textContent).toContain('Apples');
  });

  it('marks an item as purchased when its checkbox is toggled', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;
    shoppingListsService.addItemFromProduct(listId, productsService.products()[0], 'l', 2);

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const checkbox = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    checkbox.click();
    fixture.detectChanges();

    expect(shoppingListsService.lists()[0].items[0].purchased).toBe(true);
  });

  it('edits the quantity of an item via the edit panel', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;
    shoppingListsService.addItemFromProduct(listId, productsService.products()[0], 'l', 2);

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Edit Milk quantity"]')!.click();
    fixture.detectChanges();

    expect(root.querySelectorAll('select').length).toBe(0);
    const quantityInput = root.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(quantityInput.value).toBe('2');
    expect(document.activeElement).toBe(quantityInput);

    quantityInput.value = '5';
    quantityInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(shoppingListsService.lists()[0].items[0].quantity).toBe(5);
    expect(root.querySelector('.add-panel')).toBeNull();
  });

  it('focuses the product field when opening the add-item panel', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const productInput = root.querySelector<HTMLInputElement>('#add-item-product')!;
    expect(document.activeElement).toBe(productInput);
  });

  it('clears the product field when the add-item form is cancelled after typing without selecting', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const productInput = root.querySelector<HTMLInputElement>('#add-item-product')!;
    productInput.value = 'Choc';
    productInput.dispatchEvent(new Event('input'));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    const cancelButton = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Cancel',
    )!;
    cancelButton.click();
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const reopenedProductInput = root.querySelector<HTMLInputElement>('#add-item-product')!;
    expect(reopenedProductInput.value).toBe('');
  });

  it('hides the add-item form and disables item actions for a completed list', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;
    shoppingListsService.addItemFromProduct(listId, productsService.products()[0], 'l', 1);
    shoppingListsService.setStatus(listId, 'completed');

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.fab')).toBeNull();
    expect(root.textContent).toContain('This list is completed');
    expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('button[aria-label="Remove Milk"]')!.disabled).toBe(
      true,
    );
    expect(
      root.querySelector<HTMLButtonElement>('button[aria-label="Edit Milk quantity"]')!.disabled,
    ).toBe(true);
  });
});

describe('ShoppingListDetail sharing', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShoppingListDetail],
      providers: [provideRouter([])],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { canShare?: unknown }).canShare;
    delete (navigator as { share?: unknown }).share;
  });

  function setupListWithItem(): string {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;
    shoppingListsService.addItemFromProduct(listId, productsService.products()[0], 'l', 2, 'organic');
    return listId;
  }

  it('downloads a text file when the Web Share API is unavailable', async () => {
    const listId = setupListWithItem();
    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Share Weekly groceries"]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url');
  });

  it('uses the Web Share API with a file when supported', async () => {
    const listId = setupListWithItem();
    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: shareSpy, configurable: true });

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Share Weekly groceries"]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const [callArgs] = shareSpy.mock.calls[0];
    expect(callArgs.title).toBe('Weekly groceries');
    expect(callArgs.files[0].name).toBe('weekly-groceries.txt');
  });

  it('does not fall back to download when the user cancels the native share sheet', async () => {
    const listId = setupListWithItem();
    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
      configurable: true,
    });
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Share Weekly groceries"]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });
});
```

No import changes are needed in this file — it never imported the `Unit`/`Category` model types directly, only the `UnitsService`/`CategoriesService` classes (both still used, to seed units/categories via `unitsService.add`/`categoriesService.add`). `productsService.add(...)` fixtures throughout use `unitSymbol`/`categoryName` directly, and every `addItemFromProduct(...)` call passes the unit as a plain string (`'l'`) instead of a `Unit` object.

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx ng test --include src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts --watch=false`
Expected: FAIL — the component still reads `product.defaultUnitId`/`categoryId` and calls `addItemFromProduct` with `(unit, category)` objects.

- [ ] **Step 7: Update `shopping-list-detail.ts`**

Remove the `CategoriesService` import and injection — replace:

```ts
import { CategoriesService } from '../../categories/data/categories.service';
```

by deleting that line entirely, and delete this line from the class body:

```ts
  protected readonly categoriesService = inject(CategoriesService);
```

Replace the unit `<select>` in the template:

```html
                  <div class="field-group">
                    <label class="field-label" for="add-item-unit">{{ t('listDetail.unit') }}</label>
                    <select
                      id="add-item-unit"
                      class="field-input"
                      [value]="selectedUnitSymbol()"
                      (change)="onUnitChange($event)"
                    >
                      @for (unit of unitsService.units(); track unit.id) {
                        <option [value]="unit.symbol">{{ unit.symbol }}</option>
                      }
                    </select>
                  </div>
```

Replace `selectedUnitId` and `onUnitChange`:

```ts
  protected readonly selectedUnitSymbol = linkedSignal(() => {
    const product = this.productsService
      .products()
      .find((p) => p.id === this.itemForm.productId().value());
    return product?.unitSymbol ?? '';
  });
```

```ts
  protected onUnitChange(event: Event): void {
    this.selectedUnitSymbol.set((event.target as HTMLSelectElement).value);
  }
```

Replace `addItem()`:

```ts
  protected addItem(event: Event): void {
    event.preventDefault();
    this.itemForm().markAsTouched();
    if (this.itemForm().invalid()) {
      return;
    }

    const { productId, quantity, note } = this.itemModel();
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

    this.itemForm().reset({ ...EMPTY_ITEM_FORM });
    this.showFeedback(merged ? 'listDetail.mergedFeedback' : null);
  }
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx ng test --include src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts --watch=false`
Expected: PASS.

- [ ] **Step 9: Run the full suite**

Run: `npx ng test --watch=false`
Expected: PASS — every consumer of `Product` and `addItemFromProduct` has now been updated (Tasks 2–5).

- [ ] **Step 10: Commit**

```bash
git add src/app/features/shopping-lists/data/shopping-lists.service.ts src/app/features/shopping-lists/data/shopping-lists.service.spec.ts src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.ts src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts
git commit -m "feat(shopping-lists): add items using the product's own unit/category text"
```

---

### Task 6: Remove the "used by a product" guard from `UnitsManager`

**Files:**
- Modify: `src/app/features/units/units-manager/units-manager.ts`
- Modify: `src/app/core/i18n/translations/en.ts`, `src/app/core/i18n/translations/pl.ts` (remove `units.cannotEdit`, `units.cannotEditFor`, `units.cannotDelete`, `units.cannotDeleteFor`)
- Test: `src/app/features/units/units-manager/units-manager.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no public API change. `ProductsService` is no longer injected by this component.

- [ ] **Step 1: Replace the failing/obsolete test**

In `src/app/features/units/units-manager/units-manager.spec.ts`, replace the `it('disables delete for a unit used by a product and does not remove it', ...)` test with:

```ts
  it('allows deleting a unit even while a product still holds its symbol as stored text', async () => {
    const fixture = TestBed.createComponent(UnitsManager);
    const unitsService = TestBed.inject(UnitsService);
    const productsService = TestBed.inject(ProductsService);

    unitsService.add({ symbol: 'l' });
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Delete l"]',
    )!;
    expect(button.disabled).toBe(false);

    button.click();
    await TestBed.inject(ApplicationRef).whenStable();

    clickConfirmDialogButton('confirm');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(unitsService.units()).toEqual([]);
    expect(productsService.products()[0].unitSymbol).toBe('l');
  });
```

Also remove the now-unused `CategoriesService` import (`import { CategoriesService } from '../../categories/data/categories.service';`) — nothing else in the file uses it. Keep the `ProductsService` import; the new test above still uses it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx ng test --include src/app/features/units/units-manager/units-manager.spec.ts --watch=false`
Expected: FAIL — the delete button is still disabled while the unit's symbol matches a product's `unitSymbol`.

- [ ] **Step 3: Update `units-manager.ts`**

Remove the `ProductsService` import and injection:

```ts
import { ProductsService } from '../../products/data/products.service';
```

and

```ts
  private readonly productsService = inject(ProductsService);
```

Remove the `usedUnitIds` computed signal entirely:

```ts
  protected readonly usedUnitIds = computed(
    () => new Set(this.productsService.products().map((product) => product.defaultUnitId)),
  );
```

In the template, replace the "set as default" button's `aria-label` (unaffected by the guard, kept for reference) and the edit button:

```html
                <button
                  type="button"
                  class="icon-btn"
                  (click)="startEdit(unit)"
                  [attr.aria-label]="t('units.editFor', { name: unit.symbol })"
                >
```

Delete the `[disabled]="usedUnitIds().has(unit.id)"` binding and the `[attr.title]="usedUnitIds().has(unit.id) ? t('units.cannotEdit') : null"` binding from that same button — the block above is its complete replacement (no `disabled`, no `title`).

Replace the delete button the same way:

```html
                <button
                  type="button"
                  class="icon-btn"
                  (click)="remove(unit.id)"
                  [attr.aria-label]="t('units.deleteFor', { name: unit.symbol })"
                >
```

(again, no `disabled`, no `title` — this is the button's complete replacement).

Simplify `remove()`:

```ts
  protected async remove(id: UnitId): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: this.t('units.deleteTitle'),
      message: this.t('units.deleteMessage'),
    });
    if (confirmed) {
      this.unitsService.remove(id);
    }
  }
```

- [ ] **Step 4: Remove the now-unused translations**

In both `src/app/core/i18n/translations/en.ts` and `src/app/core/i18n/translations/pl.ts`, delete the four lines:

```ts
  'units.cannotEditFor': '...',
  'units.cannotEdit': '...',
  'units.cannotDeleteFor': '...',
  'units.cannotDelete': '...',
```

(`units.editFor`/`units.deleteFor` stay — they're now the only variant used.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx ng test --include src/app/features/units/units-manager/units-manager.spec.ts --watch=false`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/units/units-manager/units-manager.ts src/app/features/units/units-manager/units-manager.spec.ts src/app/core/i18n/translations/en.ts src/app/core/i18n/translations/pl.ts
git commit -m "feat(units): allow editing and deleting a unit regardless of product usage"
```

---

### Task 7: Remove the "used by a product" guard from `CategoriesManager`

**Files:**
- Modify: `src/app/features/categories/categories-manager/categories-manager.ts`
- Modify: `src/app/core/i18n/translations/en.ts`, `src/app/core/i18n/translations/pl.ts` (remove `categories.cannotEdit`, `categories.cannotEditFor`, `categories.cannotDelete`, `categories.cannotDeleteFor`)
- Test: `src/app/features/categories/categories-manager/categories-manager.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no public API change. `ProductsService`/`UnitsService` are no longer injected by this component.

- [ ] **Step 1: Replace the failing/obsolete test**

In `src/app/features/categories/categories-manager/categories-manager.spec.ts`, replace the `it('disables delete for a category used by a product and does not remove it', ...)` test with:

```ts
  it('allows deleting a category even while a product still holds its name as stored text', async () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    const categoriesService = TestBed.inject(CategoriesService);
    const productsService = TestBed.inject(ProductsService);

    categoriesService.add({ name: 'Dairy' });
    productsService.add({ name: 'Milk', unitSymbol: 'kg', categoryName: 'Dairy' });
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Delete Dairy"]',
    )!;
    expect(button.disabled).toBe(false);

    button.click();
    await TestBed.inject(ApplicationRef).whenStable();

    clickConfirmDialogButton('confirm');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(categoriesService.categories()).toEqual([]);
    expect(productsService.products()[0].categoryName).toBe('Dairy');
  });
```

Also remove the now-unused `UnitsService` import (`import { UnitsService } from '../../units/data/units.service';`) — nothing else in the file uses it. Keep the `ProductsService` import; the new test above still uses it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx ng test --include src/app/features/categories/categories-manager/categories-manager.spec.ts --watch=false`
Expected: FAIL — the delete button is still disabled while the category's name matches a product's `categoryName`.

- [ ] **Step 3: Update `categories-manager.ts`**

Remove the `ProductsService` import and injection:

```ts
import { ProductsService } from '../../products/data/products.service';
```

and

```ts
  private readonly productsService = inject(ProductsService);
```

Remove the `usedCategoryIds` computed signal entirely:

```ts
  protected readonly usedCategoryIds = computed(
    () => new Set(this.productsService.products().map((product) => product.categoryId)),
  );
```

In the template, replace the edit button:

```html
                <button
                  type="button"
                  class="icon-btn"
                  (click)="startEdit(category)"
                  [attr.aria-label]="t('categories.editFor', { name: category.name })"
                >
```

(no `disabled`, no `title` — complete replacement of that button's opening tag through `>`).

Replace the delete button:

```html
                <button
                  type="button"
                  class="icon-btn"
                  (click)="remove(category.id)"
                  [attr.aria-label]="t('categories.deleteFor', { name: category.name })"
                >
```

(same — no `disabled`, no `title`).

Simplify `remove()`:

```ts
  protected async remove(id: CategoryId): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: this.t('categories.deleteTitle'),
      message: this.t('categories.deleteMessage'),
    });
    if (confirmed) {
      this.categoriesService.remove(id);
    }
  }
```

- [ ] **Step 4: Remove the now-unused translations**

In both `src/app/core/i18n/translations/en.ts` and `src/app/core/i18n/translations/pl.ts`, delete the four lines:

```ts
  'categories.cannotEditFor': '...',
  'categories.cannotEdit': '...',
  'categories.cannotDeleteFor': '...',
  'categories.cannotDelete': '...',
```

(`categories.editFor`/`categories.deleteFor` stay.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx ng test --include src/app/features/categories/categories-manager/categories-manager.spec.ts --watch=false`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/categories/categories-manager/categories-manager.ts src/app/features/categories/categories-manager/categories-manager.spec.ts src/app/core/i18n/translations/en.ts src/app/core/i18n/translations/pl.ts
git commit -m "feat(categories): allow editing and deleting a category regardless of product usage"
```

---

### Task 8: Full verification sweep

**Files:**
- Modify: whatever the sweep turns up. No new files expected.

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: nothing new — this task only verifies and, if needed, fixes stragglers.

- [ ] **Step 1: Type-check the app**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors. If there are any, they're leftover references to `Product.defaultUnitId`/`categoryId`, `Unit`/`Category` params on `addItemFromProduct`, or the removed `usedUnitIds`/`usedCategoryIds`/`unitLabel`/`categoryLabel` symbols — fix them in the relevant file from Tasks 2–7 (a missed occurrence, not new design work).

- [ ] **Step 2: Type-check the tests**

Run: `npx tsc --noEmit -p tsconfig.spec.json`
Expected: no errors, same fix approach as Step 1 if any surface.

- [ ] **Step 3: Lint**

Run: `npx ng lint`
Expected: `All files pass linting.` If not, fix what it flags (e.g., an import left unused by one of the removals in Tasks 6–7).

- [ ] **Step 4: Full test suite**

Run: `npx ng test --watch=false`
Expected: every test file passes, including the ones untouched by this plan (`app.spec.ts`, `shopping-lists-overview.spec.ts`, `shopping-list-export.spec.ts`, etc. — confirming this refactor didn't reach further than intended).

- [ ] **Step 5: Grep for anything missed**

Run: `git grep -n "defaultUnitId\|categoryId\|usedUnitIds\|usedCategoryIds\|unitLabel(\|categoryLabel(" -- src`

Expected: no matches. `categoryId` as a `CategoryId`-typed field only ever lived on `Product` (now removed) and on `Category.id`'s own declaration/consumers in `category.model.ts`/`categories.service.ts`/`categories-manager.ts` (those are fine — `Category.id` itself is untouched by this plan); if the grep surfaces one of those, that's expected and not a bug. Anything under `products/`, `shopping-lists/`, `units/` referencing the old `Product` shape is not.

- [ ] **Step 6: Commit (only if Steps 1–5 required fixes)**

```bash
git add -A
git commit -m "fix: clean up stragglers from the product unit/category denormalization"
```

If nothing needed fixing, skip this step — there's nothing to commit.
