# Shopping List Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Listify shopping-list management feature: multiple shopping lists, each holding items snapshotted from a global product catalog with unit-of-measure and category, all persisted in `localStorage`.

**Architecture:** Four feature areas (`units`, `categories`, `products`, `shopping-lists`), each with a `data/` layer (model + a small singleton service) and one or more standalone UI components, wired into lazy-loaded routes. All four services share one generic, reusable `localStorage`-backed signal collection store defined in `core/storage`.

**Tech Stack:** Angular 22 (standalone components, signals, `@Service()`), `@angular/forms/signals` (Signal Forms — `form`, `schema`, `required`, `min`, `FormField`), Angular Router (`loadChildren`, `withComponentInputBinding`), Vitest (`@angular/build:unit-test`), `localStorage` for persistence.

**Spec:** `docs/superpowers/specs/2026-09-12-shopping-list-management-design.md`

## Global Constraints

- Angular 22 standalone components — do not set `standalone: true` (default) and do not set `changeDetection: ChangeDetectionStrategy.OnPush` (default).
- Use `input()`/`output()`/`model()` instead of decorators; use `computed()` for derived state; use `linkedSignal()` only for state derived from a source that must stay overridable (the unit/category defaults on the "add item" form).
- Use Signal Forms (`@angular/forms/signals`: `form`, `schema`, `required`, `min`, `FormField`) for every form in this feature.
- Do not import `CommonModule`; import only the specific directives/pipes a template uses (e.g. `DatePipe`, `RouterLink`).
- Do not use `ngClass`/`ngStyle`; use `class`/`style` bindings if needed.
- Use native control flow (`@if`, `@for`) — never `*ngIf`/`*ngFor`.
- Prefer inline templates for small components (every component in this plan is small enough to stay inline).
- Every service is a small, single-responsibility class decorated with `@Service()` (not `@Injectable({providedIn: 'root'})`), using `inject()` instead of constructor injection.
- Data is persisted exclusively in `localStorage`. A `ShoppingListItem` is a full snapshot of the product/unit/category it was created from — it never stores `ProductId`/`UnitId`/`CategoryId` references.
- Routing paths are in English: `/lists`, `/lists/:id`, `/products`, `/units`, `/categories`.
- The product-catalog feature is named `products` throughout (folder, service, route) — never `assortment`.
- File/class naming follows the existing project convention: no `.component.` infix (e.g. `units-manager.ts`, not `units-manager.component.ts`), matching `src/app/app.ts`.
- Accessibility: every actionable control has an accessible name (via `<label>` or text content); destructive actions (delete) are confirmed via the native `confirm()` dialog, which is keyboard- and screen-reader-accessible by default.
- Test command for a single spec file (non-interactive, single run): `npx ng test --include <path-to-spec-relative-to-repo-root>`. Full suite: `npm test`.
- Code style: single quotes, 100-char print width (Prettier is already configured — run `npx prettier --write <file>` after writing/editing a file if unsure of formatting).

---

## Task 1: Generic local-storage collection store

**Files:**
- Create: `src/app/core/storage/local-storage-collection.ts`
- Test: `src/app/core/storage/local-storage-collection.spec.ts`

**Interfaces:**
- Produces: `LocalStorageCollection<T>` interface with `items: Signal<readonly T[]>`, `add(item: T): void`, `update(id: string, changes: Partial<T>): void`, `remove(id: string): void`.
- Produces: `createLocalStorageCollection<T extends { id: string }>(storageKey: string): LocalStorageCollection<T>`. **Must be invoked as a field initializer of an injectable class** (e.g. `private readonly store = createLocalStorageCollection<Unit>('listify:units');`), because it calls `effect()` internally, which requires an injection context at the time it runs.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/core/storage/local-storage-collection.spec.ts
import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createLocalStorageCollection } from './local-storage-collection';

interface TestItem {
  id: string;
  label: string;
}

@Injectable()
class TestCollectionHarness {
  readonly collection = createLocalStorageCollection<TestItem>('test:items');
}

describe('createLocalStorageCollection', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [TestCollectionHarness] });
  });

  it('starts empty when localStorage has no entry for the key', () => {
    const harness = TestBed.inject(TestCollectionHarness);
    expect(harness.collection.items()).toEqual([]);
  });

  it('loads existing items from localStorage on creation', () => {
    localStorage.setItem('test:items', JSON.stringify([{ id: '9', label: 'Existing' }]));
    const harness = TestBed.inject(TestCollectionHarness);
    expect(harness.collection.items()).toEqual([{ id: '9', label: 'Existing' }]);
  });

  it('adds an item and exposes it via items()', () => {
    const harness = TestBed.inject(TestCollectionHarness);
    harness.collection.add({ id: '1', label: 'First' });
    expect(harness.collection.items()).toEqual([{ id: '1', label: 'First' }]);
  });

  it('persists added items to localStorage', () => {
    const harness = TestBed.inject(TestCollectionHarness);
    harness.collection.add({ id: '1', label: 'First' });
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('test:items')!)).toEqual([
      { id: '1', label: 'First' },
    ]);
  });

  it('updates an existing item by id, leaving others untouched', () => {
    const harness = TestBed.inject(TestCollectionHarness);
    harness.collection.add({ id: '1', label: 'First' });
    harness.collection.add({ id: '2', label: 'Second' });
    harness.collection.update('1', { label: 'Updated' });
    expect(harness.collection.items()).toEqual([
      { id: '1', label: 'Updated' },
      { id: '2', label: 'Second' },
    ]);
  });

  it('removes an item by id', () => {
    const harness = TestBed.inject(TestCollectionHarness);
    harness.collection.add({ id: '1', label: 'First' });
    harness.collection.remove('1');
    expect(harness.collection.items()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/core/storage/local-storage-collection.spec.ts`
Expected: FAIL — `Cannot find module './local-storage-collection'` (the file doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/app/core/storage/local-storage-collection.ts
import { effect, signal, Signal } from '@angular/core';

export interface LocalStorageCollection<T> {
  readonly items: Signal<readonly T[]>;
  add(item: T): void;
  update(id: string, changes: Partial<T>): void;
  remove(id: string): void;
}

function readFromStorage<T>(storageKey: string): T[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T[]) : [];
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
): LocalStorageCollection<T> {
  const items = signal<T[]>(readFromStorage<T>(storageKey));

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

Run: `npx ng test --include src/app/core/storage/local-storage-collection.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/core/storage/local-storage-collection.ts src/app/core/storage/local-storage-collection.spec.ts
git commit -m "feat: add generic localStorage-backed signal collection store"
```

---

## Task 2: Units domain (model + service)

**Files:**
- Create: `src/app/features/units/data/unit.model.ts`
- Create: `src/app/features/units/data/units.service.ts`
- Test: `src/app/features/units/data/units.service.spec.ts`

**Interfaces:**
- Consumes: `createLocalStorageCollection<T>(storageKey)` from `src/app/core/storage/local-storage-collection.ts` (Task 1).
- Produces: `UnitId = string`, `Unit { id, name, symbol }` (`src/app/features/units/data/unit.model.ts`).
- Produces: `UnitsService` (`@Service()`) with `units: Signal<readonly Unit[]>`, `add(unit: Omit<Unit, 'id'>): void`, `update(id: UnitId, changes: Partial<Omit<Unit, 'id'>>): void`, `remove(id: UnitId): void`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/features/units/data/units.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { UnitsService } from './units.service';

describe('UnitsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts with no units', () => {
    const service = TestBed.inject(UnitsService);
    expect(service.units()).toEqual([]);
  });

  it('adds a unit with a generated id', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ name: 'Kilogram', symbol: 'kg' });
    expect(service.units()).toEqual([
      expect.objectContaining({ name: 'Kilogram', symbol: 'kg' }),
    ]);
    expect(service.units()[0].id).toBeTruthy();
  });

  it('updates an existing unit', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ name: 'Kilogram', symbol: 'kg' });
    const id = service.units()[0].id;
    service.update(id, { symbol: 'KG' });
    expect(service.units()[0].symbol).toBe('KG');
  });

  it('removes a unit', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ name: 'Kilogram', symbol: 'kg' });
    const id = service.units()[0].id;
    service.remove(id);
    expect(service.units()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/units/data/units.service.spec.ts`
Expected: FAIL — `Cannot find module './units.service'`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/app/features/units/data/unit.model.ts
export type UnitId = string;

export interface Unit {
  id: UnitId;
  name: string;
  symbol: string;
}
```

```typescript
// src/app/features/units/data/units.service.ts
import { Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { Unit, UnitId } from './unit.model';

@Service()
export class UnitsService {
  private readonly store = createLocalStorageCollection<Unit>('listify:units');

  readonly units = this.store.items;

  add(unit: Omit<Unit, 'id'>): void {
    this.store.add({ ...unit, id: crypto.randomUUID() });
  }

  update(id: UnitId, changes: Partial<Omit<Unit, 'id'>>): void {
    this.store.update(id, changes);
  }

  remove(id: UnitId): void {
    this.store.remove(id);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/units/data/units.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/units/data/unit.model.ts src/app/features/units/data/units.service.ts src/app/features/units/data/units.service.spec.ts
git commit -m "feat: add units domain model and service"
```

---

## Task 3: Categories domain (model + service)

**Files:**
- Create: `src/app/features/categories/data/category.model.ts`
- Create: `src/app/features/categories/data/categories.service.ts`
- Test: `src/app/features/categories/data/categories.service.spec.ts`

**Interfaces:**
- Consumes: `createLocalStorageCollection<T>(storageKey)` from Task 1.
- Produces: `CategoryId = string`, `Category { id, name }` (`src/app/features/categories/data/category.model.ts`).
- Produces: `CategoriesService` (`@Service()`) with `categories: Signal<readonly Category[]>`, `add(category: Omit<Category, 'id'>): void`, `update(id: CategoryId, changes: Partial<Omit<Category, 'id'>>): void`, `remove(id: CategoryId): void`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/features/categories/data/categories.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts with no categories', () => {
    const service = TestBed.inject(CategoriesService);
    expect(service.categories()).toEqual([]);
  });

  it('adds a category with a generated id', () => {
    const service = TestBed.inject(CategoriesService);
    service.add({ name: 'Dairy' });
    expect(service.categories()).toEqual([expect.objectContaining({ name: 'Dairy' })]);
    expect(service.categories()[0].id).toBeTruthy();
  });

  it('updates an existing category', () => {
    const service = TestBed.inject(CategoriesService);
    service.add({ name: 'Dairy' });
    const id = service.categories()[0].id;
    service.update(id, { name: 'Dairy & Eggs' });
    expect(service.categories()[0].name).toBe('Dairy & Eggs');
  });

  it('removes a category', () => {
    const service = TestBed.inject(CategoriesService);
    service.add({ name: 'Dairy' });
    const id = service.categories()[0].id;
    service.remove(id);
    expect(service.categories()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/categories/data/categories.service.spec.ts`
Expected: FAIL — `Cannot find module './categories.service'`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/app/features/categories/data/category.model.ts
export type CategoryId = string;

export interface Category {
  id: CategoryId;
  name: string;
}
```

```typescript
// src/app/features/categories/data/categories.service.ts
import { Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { Category, CategoryId } from './category.model';

@Service()
export class CategoriesService {
  private readonly store = createLocalStorageCollection<Category>('listify:categories');

  readonly categories = this.store.items;

  add(category: Omit<Category, 'id'>): void {
    this.store.add({ ...category, id: crypto.randomUUID() });
  }

  update(id: CategoryId, changes: Partial<Omit<Category, 'id'>>): void {
    this.store.update(id, changes);
  }

  remove(id: CategoryId): void {
    this.store.remove(id);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/categories/data/categories.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/categories/data/category.model.ts src/app/features/categories/data/categories.service.ts src/app/features/categories/data/categories.service.spec.ts
git commit -m "feat: add categories domain model and service"
```

---

## Task 4: Products domain (model + service)

**Files:**
- Create: `src/app/features/products/data/product.model.ts`
- Create: `src/app/features/products/data/products.service.ts`
- Test: `src/app/features/products/data/products.service.spec.ts`

**Interfaces:**
- Consumes: `createLocalStorageCollection<T>(storageKey)` from Task 1; `UnitId` from `src/app/features/units/data/unit.model.ts` (Task 2); `CategoryId` from `src/app/features/categories/data/category.model.ts` (Task 3).
- Produces: `ProductId = string`, `Product { id, name, defaultUnitId: UnitId, categoryId: CategoryId }` (`src/app/features/products/data/product.model.ts`).
- Produces: `ProductsService` (`@Service()`) with `products: Signal<readonly Product[]>`, `add(product: Omit<Product, 'id'>): void`, `update(id: ProductId, changes: Partial<Omit<Product, 'id'>>): void`, `remove(id: ProductId): void`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/features/products/data/products.service.spec.ts
import { TestBed } from '@angular/core/testing';
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
    service.add({ name: 'Milk 3.2%', defaultUnitId: 'unit-1', categoryId: 'category-1' });
    expect(service.products()).toEqual([
      expect.objectContaining({
        name: 'Milk 3.2%',
        defaultUnitId: 'unit-1',
        categoryId: 'category-1',
      }),
    ]);
    expect(service.products()[0].id).toBeTruthy();
  });

  it('updates an existing product', () => {
    const service = TestBed.inject(ProductsService);
    service.add({ name: 'Milk 3.2%', defaultUnitId: 'unit-1', categoryId: 'category-1' });
    const id = service.products()[0].id;
    service.update(id, { name: 'Milk 1.5%' });
    expect(service.products()[0].name).toBe('Milk 1.5%');
  });

  it('removes a product', () => {
    const service = TestBed.inject(ProductsService);
    service.add({ name: 'Milk 3.2%', defaultUnitId: 'unit-1', categoryId: 'category-1' });
    const id = service.products()[0].id;
    service.remove(id);
    expect(service.products()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/products/data/products.service.spec.ts`
Expected: FAIL — `Cannot find module './products.service'`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/app/features/products/data/product.model.ts
import { CategoryId } from '../../categories/data/category.model';
import { UnitId } from '../../units/data/unit.model';

export type ProductId = string;

export interface Product {
  id: ProductId;
  name: string;
  defaultUnitId: UnitId;
  categoryId: CategoryId;
}
```

```typescript
// src/app/features/products/data/products.service.ts
import { Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { Product, ProductId } from './product.model';

@Service()
export class ProductsService {
  private readonly store = createLocalStorageCollection<Product>('listify:products');

  readonly products = this.store.items;

  add(product: Omit<Product, 'id'>): void {
    this.store.add({ ...product, id: crypto.randomUUID() });
  }

  update(id: ProductId, changes: Partial<Omit<Product, 'id'>>): void {
    this.store.update(id, changes);
  }

  remove(id: ProductId): void {
    this.store.remove(id);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/products/data/products.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/products/data/product.model.ts src/app/features/products/data/products.service.ts src/app/features/products/data/products.service.spec.ts
git commit -m "feat: add products domain model and service"
```

---

## Task 5: Shopping lists domain (model + service)

**Files:**
- Create: `src/app/features/shopping-lists/data/shopping-list.model.ts`
- Create: `src/app/features/shopping-lists/data/shopping-lists.service.ts`
- Test: `src/app/features/shopping-lists/data/shopping-lists.service.spec.ts`

**Interfaces:**
- Consumes: `createLocalStorageCollection<T>(storageKey)` from Task 1; `Product` from Task 4; `Unit` from Task 2; `Category` from Task 3.
- Produces: `ShoppingListId = string`, `ShoppingListItemId = string`, `ShoppingListItem { id, productName, unitLabel, categoryName, quantity, purchased, note? }`, `ShoppingList { id, name, createdAt, status: 'active' | 'completed', items: ShoppingListItem[] }` (`src/app/features/shopping-lists/data/shopping-list.model.ts`).
- Produces: `ShoppingListsService` (`@Service()`) with:
  - `lists: Signal<readonly ShoppingList[]>`
  - `addList(name: string): void`
  - `setStatus(id: ShoppingListId, status: ShoppingList['status']): void`
  - `removeList(id: ShoppingListId): void`
  - `addItemFromProduct(listId: ShoppingListId, product: Product, unit: Unit, category: Category, quantity: number, note?: string): void`
  - `setItemPurchased(listId: ShoppingListId, itemId: ShoppingListItemId, purchased: boolean): void`
  - `removeItem(listId: ShoppingListId, itemId: ShoppingListItemId): void`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/features/shopping-lists/data/shopping-lists.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { Category } from '../../categories/data/category.model';
import { Product } from '../../products/data/product.model';
import { Unit } from '../../units/data/unit.model';
import { ShoppingListsService } from './shopping-lists.service';

describe('ShoppingListsService', () => {
  const product: Product = { id: 'p1', name: 'Milk 3.2%', defaultUnitId: 'u1', categoryId: 'c1' };
  const unit: Unit = { id: 'u1', name: 'litre', symbol: 'l' };
  const category: Category = { id: 'c1', name: 'Dairy' };

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

  it('adds an item to a list as a snapshot of the given product, unit, and category', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;

    service.addItemFromProduct(listId, product, unit, category, 2, 'organic');

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
    service.addItemFromProduct(listId, product, unit, category, 1);
    const itemId = service.lists()[0].items[0].id;

    service.setItemPurchased(listId, itemId, true);

    expect(service.lists()[0].items[0].purchased).toBe(true);
  });

  it('removes an item from a list', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, unit, category, 1);
    const itemId = service.lists()[0].items[0].id;

    service.removeItem(listId, itemId);

    expect(service.lists()[0].items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/shopping-lists/data/shopping-lists.service.spec.ts`
Expected: FAIL — `Cannot find module './shopping-lists.service'`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/app/features/shopping-lists/data/shopping-list.model.ts
export type ShoppingListId = string;
export type ShoppingListItemId = string;

export interface ShoppingListItem {
  id: ShoppingListItemId;
  productName: string;
  unitLabel: string;
  categoryName: string;
  quantity: number;
  purchased: boolean;
  note?: string;
}

export interface ShoppingList {
  id: ShoppingListId;
  name: string;
  createdAt: string;
  status: 'active' | 'completed';
  items: ShoppingListItem[];
}
```

```typescript
// src/app/features/shopping-lists/data/shopping-lists.service.ts
import { Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { Category } from '../../categories/data/category.model';
import { Product } from '../../products/data/product.model';
import { Unit } from '../../units/data/unit.model';
import {
  ShoppingList,
  ShoppingListId,
  ShoppingListItem,
  ShoppingListItemId,
} from './shopping-list.model';

@Service()
export class ShoppingListsService {
  private readonly store = createLocalStorageCollection<ShoppingList>('listify:shopping-lists');

  readonly lists = this.store.items;

  addList(name: string): void {
    this.store.add({
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      status: 'active',
      items: [],
    });
  }

  setStatus(id: ShoppingListId, status: ShoppingList['status']): void {
    this.store.update(id, { status });
  }

  removeList(id: ShoppingListId): void {
    this.store.remove(id);
  }

  addItemFromProduct(
    listId: ShoppingListId,
    product: Product,
    unit: Unit,
    category: Category,
    quantity: number,
    note?: string,
  ): void {
    const list = this.lists().find((l) => l.id === listId);
    if (!list) {
      return;
    }
    const item: ShoppingListItem = {
      id: crypto.randomUUID(),
      productName: product.name,
      unitLabel: unit.symbol,
      categoryName: category.name,
      quantity,
      purchased: false,
      note,
    };
    this.store.update(listId, { items: [...list.items, item] });
  }

  setItemPurchased(listId: ShoppingListId, itemId: ShoppingListItemId, purchased: boolean): void {
    const list = this.lists().find((l) => l.id === listId);
    if (!list) {
      return;
    }
    this.store.update(listId, {
      items: list.items.map((item) => (item.id === itemId ? { ...item, purchased } : item)),
    });
  }

  removeItem(listId: ShoppingListId, itemId: ShoppingListItemId): void {
    const list = this.lists().find((l) => l.id === listId);
    if (!list) {
      return;
    }
    this.store.update(listId, { items: list.items.filter((item) => item.id !== itemId) });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/shopping-lists/data/shopping-lists.service.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/shopping-lists/data/shopping-list.model.ts src/app/features/shopping-lists/data/shopping-lists.service.ts src/app/features/shopping-lists/data/shopping-lists.service.spec.ts
git commit -m "feat: add shopping lists domain model and service"
```

---

## Task 6: Units management UI

**Files:**
- Create: `src/app/features/units/units-manager/units-manager.ts`
- Create: `src/app/features/units/units-manager/units-manager.spec.ts`
- Create: `src/app/features/units/units.routes.ts`

**Interfaces:**
- Consumes: `UnitsService` from Task 2 (`units`, `add`, `update`, `remove`); `FormField`, `form`, `required` from `@angular/forms/signals`.
- Produces: `UnitsManager` standalone component (selector `app-units-manager`). Produces: `UNITS_ROUTES: Routes` (`src/app/features/units/units.routes.ts`), a single route rendering `UnitsManager` at the feature's root path.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/features/units/units-manager/units-manager.spec.ts
import { TestBed } from '@angular/core/testing';
import { UnitsService } from '../data/units.service';
import { UnitsManager } from './units-manager';

describe('UnitsManager', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [UnitsManager] });
  });

  function setInputValue(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('shows an empty-state message when there are no units', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No units yet');
  });

  it('adds a unit from the form and lists it', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const inputs = root.querySelectorAll<HTMLInputElement>('input[type="text"]');

    setInputValue(inputs[0], 'Kilogram');
    setInputValue(inputs[1], 'kg');
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(root.querySelectorAll('li').length).toBe(1);
    expect(root.textContent).toContain('Kilogram (kg)');
  });

  it('removes a unit after the user confirms', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'Litre', symbol: 'l' });
    fixture.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('li button + button')!
      .click();
    fixture.detectChanges();

    expect(unitsService.units()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/units/units-manager/units-manager.spec.ts`
Expected: FAIL — `Cannot find module './units-manager'`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/app/features/units/units-manager/units-manager.ts
import { Component, effect, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { Unit, UnitId } from '../data/unit.model';
import { UnitsService } from '../data/units.service';

interface UnitFormValue {
  name: string;
  symbol: string;
}

const EMPTY_UNIT_FORM: UnitFormValue = { name: '', symbol: '' };

@Component({
  selector: 'app-units-manager',
  imports: [FormField],
  template: `
    <h1>Units of measure</h1>

    @if (unitsService.units().length === 0) {
      <p>No units yet — add the first one below.</p>
    } @else {
      <ul>
        @for (unit of unitsService.units(); track unit.id) {
          <li>
            <span>{{ unit.name }} ({{ unit.symbol }})</span>
            <button type="button" (click)="startEdit(unit)">Edit</button>
            <button type="button" (click)="remove(unit.id)">Delete</button>
          </li>
        }
      </ul>
    }

    <h2>{{ editingId() ? 'Edit unit' : 'Add unit' }}</h2>
    <form (submit)="handleSubmit($event)">
      <label>
        Name
        <input type="text" [formField]="unitForm.name" />
      </label>
      @if (unitForm.name().invalid() && unitForm.name().touched()) {
        <p role="alert">Name is required.</p>
      }

      <label>
        Symbol
        <input type="text" [formField]="unitForm.symbol" />
      </label>
      @if (unitForm.symbol().invalid() && unitForm.symbol().touched()) {
        <p role="alert">Symbol is required.</p>
      }

      @if (duplicateNameError()) {
        <p role="alert">A unit with this name already exists.</p>
      }

      <button type="submit">{{ editingId() ? 'Save' : 'Add' }}</button>
      @if (editingId()) {
        <button type="button" (click)="cancelEdit()">Cancel</button>
      }
    </form>
  `,
})
export class UnitsManager {
  protected readonly unitsService = inject(UnitsService);

  protected readonly editingId = signal<UnitId | null>(null);
  protected readonly duplicateNameError = signal(false);

  private readonly model = signal<UnitFormValue>({ ...EMPTY_UNIT_FORM });
  protected readonly unitForm = form(this.model, (path) => {
    required(path.name);
    required(path.symbol);
  });

  constructor() {
    effect(() => {
      this.unitForm.name().value();
      this.duplicateNameError.set(false);
    });
  }

  protected startEdit(unit: Unit): void {
    this.editingId.set(unit.id);
    this.model.set({ name: unit.name, symbol: unit.symbol });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.model.set({ ...EMPTY_UNIT_FORM });
  }

  protected remove(id: UnitId): void {
    if (confirm('Delete this unit?')) {
      this.unitsService.remove(id);
    }
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    if (this.unitForm().invalid()) {
      return;
    }

    const value = this.model();
    const editingId = this.editingId();
    const isDuplicate = this.unitsService
      .units()
      .some((unit) => unit.id !== editingId && unit.name.toLowerCase() === value.name.toLowerCase());
    if (isDuplicate) {
      this.duplicateNameError.set(true);
      return;
    }

    if (editingId) {
      this.unitsService.update(editingId, value);
    } else {
      this.unitsService.add(value);
    }
    this.cancelEdit();
  }
}
```

```typescript
// src/app/features/units/units.routes.ts
import { Routes } from '@angular/router';
import { UnitsManager } from './units-manager/units-manager';

export const UNITS_ROUTES: Routes = [{ path: '', component: UnitsManager }];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/units/units-manager/units-manager.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/units/units-manager/units-manager.ts src/app/features/units/units-manager/units-manager.spec.ts src/app/features/units/units.routes.ts
git commit -m "feat: add units management UI and route"
```

---

## Task 7: Categories management UI

**Files:**
- Create: `src/app/features/categories/categories-manager/categories-manager.ts`
- Create: `src/app/features/categories/categories-manager/categories-manager.spec.ts`
- Create: `src/app/features/categories/categories.routes.ts`

**Interfaces:**
- Consumes: `CategoriesService` from Task 3 (`categories`, `add`, `update`, `remove`); `FormField`, `form`, `required` from `@angular/forms/signals`.
- Produces: `CategoriesManager` standalone component (selector `app-categories-manager`). Produces: `CATEGORIES_ROUTES: Routes` (`src/app/features/categories/categories.routes.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/features/categories/categories-manager/categories-manager.spec.ts
import { TestBed } from '@angular/core/testing';
import { CategoriesService } from '../data/categories.service';
import { CategoriesManager } from './categories-manager';

describe('CategoriesManager', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [CategoriesManager] });
  });

  function setInputValue(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('shows an empty-state message when there are no categories', () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No categories yet');
  });

  it('adds a category from the form and lists it', () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    setInputValue(root.querySelector<HTMLInputElement>('input[type="text"]')!, 'Dairy');
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(root.querySelectorAll('li').length).toBe(1);
    expect(root.textContent).toContain('Dairy');
  });

  it('removes a category after the user confirms', () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    fixture.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('li button + button')!
      .click();
    fixture.detectChanges();

    expect(categoriesService.categories()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/categories/categories-manager/categories-manager.spec.ts`
Expected: FAIL — `Cannot find module './categories-manager'`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/app/features/categories/categories-manager/categories-manager.ts
import { Component, effect, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { Category, CategoryId } from '../data/category.model';
import { CategoriesService } from '../data/categories.service';

interface CategoryFormValue {
  name: string;
}

const EMPTY_CATEGORY_FORM: CategoryFormValue = { name: '' };

@Component({
  selector: 'app-categories-manager',
  imports: [FormField],
  template: `
    <h1>Categories</h1>

    @if (categoriesService.categories().length === 0) {
      <p>No categories yet — add the first one below.</p>
    } @else {
      <ul>
        @for (category of categoriesService.categories(); track category.id) {
          <li>
            <span>{{ category.name }}</span>
            <button type="button" (click)="startEdit(category)">Edit</button>
            <button type="button" (click)="remove(category.id)">Delete</button>
          </li>
        }
      </ul>
    }

    <h2>{{ editingId() ? 'Edit category' : 'Add category' }}</h2>
    <form (submit)="handleSubmit($event)">
      <label>
        Name
        <input type="text" [formField]="categoryForm.name" />
      </label>
      @if (categoryForm.name().invalid() && categoryForm.name().touched()) {
        <p role="alert">Name is required.</p>
      }
      @if (duplicateNameError()) {
        <p role="alert">A category with this name already exists.</p>
      }

      <button type="submit">{{ editingId() ? 'Save' : 'Add' }}</button>
      @if (editingId()) {
        <button type="button" (click)="cancelEdit()">Cancel</button>
      }
    </form>
  `,
})
export class CategoriesManager {
  protected readonly categoriesService = inject(CategoriesService);

  protected readonly editingId = signal<CategoryId | null>(null);
  protected readonly duplicateNameError = signal(false);

  private readonly model = signal<CategoryFormValue>({ ...EMPTY_CATEGORY_FORM });
  protected readonly categoryForm = form(this.model, (path) => {
    required(path.name);
  });

  constructor() {
    effect(() => {
      this.categoryForm.name().value();
      this.duplicateNameError.set(false);
    });
  }

  protected startEdit(category: Category): void {
    this.editingId.set(category.id);
    this.model.set({ name: category.name });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.model.set({ ...EMPTY_CATEGORY_FORM });
  }

  protected remove(id: CategoryId): void {
    if (confirm('Delete this category?')) {
      this.categoriesService.remove(id);
    }
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    if (this.categoryForm().invalid()) {
      return;
    }

    const value = this.model();
    const editingId = this.editingId();
    const isDuplicate = this.categoriesService
      .categories()
      .some(
        (category) =>
          category.id !== editingId && category.name.toLowerCase() === value.name.toLowerCase(),
      );
    if (isDuplicate) {
      this.duplicateNameError.set(true);
      return;
    }

    if (editingId) {
      this.categoriesService.update(editingId, value);
    } else {
      this.categoriesService.add(value);
    }
    this.cancelEdit();
  }
}
```

```typescript
// src/app/features/categories/categories.routes.ts
import { Routes } from '@angular/router';
import { CategoriesManager } from './categories-manager/categories-manager';

export const CATEGORIES_ROUTES: Routes = [{ path: '', component: CategoriesManager }];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/categories/categories-manager/categories-manager.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/categories/categories-manager/categories-manager.ts src/app/features/categories/categories-manager/categories-manager.spec.ts src/app/features/categories/categories.routes.ts
git commit -m "feat: add categories management UI and route"
```

---

## Task 8: Products management UI

**Files:**
- Create: `src/app/features/products/products-manager/products-manager.ts`
- Create: `src/app/features/products/products-manager/products-manager.spec.ts`
- Create: `src/app/features/products/products.routes.ts`

**Interfaces:**
- Consumes: `ProductsService` from Task 4; `UnitsService` from Task 2 (for the unit `<select>` options); `CategoriesService` from Task 3 (for the category `<select>` options); `FormField`, `form`, `required` from `@angular/forms/signals`.
- Produces: `ProductsManager` standalone component (selector `app-products-manager`). Produces: `PRODUCTS_ROUTES: Routes` (`src/app/features/products/products.routes.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/features/products/products-manager/products-manager.spec.ts
import { TestBed } from '@angular/core/testing';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { ProductsService } from '../data/products.service';
import { ProductsManager } from './products-manager';

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

  it('adds a product using the selected default unit and category', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'litre', symbol: 'l' });
    const unitId = unitsService.units()[0].id;
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const categoryId = categoriesService.categories()[0].id;

    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    const nameInput = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    nameInput.value = 'Milk 3.2%';
    nameInput.dispatchEvent(new Event('input'));

    const selects = root.querySelectorAll<HTMLSelectElement>('select');
    selects[0].value = unitId;
    selects[0].dispatchEvent(new Event('input'));
    selects[1].value = categoryId;
    selects[1].dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    const productsService = TestBed.inject(ProductsService);
    expect(productsService.products()).toEqual([
      expect.objectContaining({ name: 'Milk 3.2%', defaultUnitId: unitId, categoryId }),
    ]);
    expect(root.textContent).toContain('Milk 3.2%');
  });

  it('removes a product after the user confirms', () => {
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', defaultUnitId: 'u1', categoryId: 'c1' });
    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('li button + button')!
      .click();
    fixture.detectChanges();

    expect(productsService.products()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/products/products-manager/products-manager.spec.ts`
Expected: FAIL — `Cannot find module './products-manager'`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/app/features/products/products-manager/products-manager.ts
import { Component, effect, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { Product, ProductId } from '../data/product.model';
import { ProductsService } from '../data/products.service';

interface ProductFormValue {
  name: string;
  defaultUnitId: string;
  categoryId: string;
}

const EMPTY_PRODUCT_FORM: ProductFormValue = { name: '', defaultUnitId: '', categoryId: '' };

@Component({
  selector: 'app-products-manager',
  imports: [FormField],
  template: `
    <h1>Products</h1>

    @if (productsService.products().length === 0) {
      <p>No products yet — add the first one below.</p>
    } @else {
      <ul>
        @for (product of productsService.products(); track product.id) {
          <li>
            <span
              >{{ product.name }} — {{ unitLabel(product.defaultUnitId) }},
              {{ categoryLabel(product.categoryId) }}</span
            >
            <button type="button" (click)="startEdit(product)">Edit</button>
            <button type="button" (click)="remove(product.id)">Delete</button>
          </li>
        }
      </ul>
    }

    <h2>{{ editingId() ? 'Edit product' : 'Add product' }}</h2>
    <form (submit)="handleSubmit($event)">
      <label>
        Name
        <input type="text" [formField]="productForm.name" />
      </label>
      @if (productForm.name().invalid() && productForm.name().touched()) {
        <p role="alert">Name is required.</p>
      }

      <label>
        Default unit
        <select [formField]="productForm.defaultUnitId">
          <option value="" disabled>Select a unit</option>
          @for (unit of unitsService.units(); track unit.id) {
            <option [value]="unit.id">{{ unit.name }} ({{ unit.symbol }})</option>
          }
        </select>
      </label>
      @if (productForm.defaultUnitId().invalid() && productForm.defaultUnitId().touched()) {
        <p role="alert">A unit is required.</p>
      }

      <label>
        Category
        <select [formField]="productForm.categoryId">
          <option value="" disabled>Select a category</option>
          @for (category of categoriesService.categories(); track category.id) {
            <option [value]="category.id">{{ category.name }}</option>
          }
        </select>
      </label>
      @if (productForm.categoryId().invalid() && productForm.categoryId().touched()) {
        <p role="alert">A category is required.</p>
      }

      @if (duplicateNameError()) {
        <p role="alert">A product with this name already exists.</p>
      }

      <button type="submit">{{ editingId() ? 'Save' : 'Add' }}</button>
      @if (editingId()) {
        <button type="button" (click)="cancelEdit()">Cancel</button>
      }
    </form>
  `,
})
export class ProductsManager {
  protected readonly productsService = inject(ProductsService);
  protected readonly unitsService = inject(UnitsService);
  protected readonly categoriesService = inject(CategoriesService);

  protected readonly editingId = signal<ProductId | null>(null);
  protected readonly duplicateNameError = signal(false);

  private readonly model = signal<ProductFormValue>({ ...EMPTY_PRODUCT_FORM });
  protected readonly productForm = form(this.model, (path) => {
    required(path.name);
    required(path.defaultUnitId);
    required(path.categoryId);
  });

  constructor() {
    effect(() => {
      this.productForm.name().value();
      this.duplicateNameError.set(false);
    });
  }

  protected unitLabel(unitId: string): string {
    const unit = this.unitsService.units().find((u) => u.id === unitId);
    return unit ? `${unit.name} (${unit.symbol})` : 'Unknown unit';
  }

  protected categoryLabel(categoryId: string): string {
    const category = this.categoriesService.categories().find((c) => c.id === categoryId);
    return category ? category.name : 'Unknown category';
  }

  protected startEdit(product: Product): void {
    this.editingId.set(product.id);
    this.model.set({
      name: product.name,
      defaultUnitId: product.defaultUnitId,
      categoryId: product.categoryId,
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.model.set({ ...EMPTY_PRODUCT_FORM });
  }

  protected remove(id: ProductId): void {
    if (confirm('Delete this product?')) {
      this.productsService.remove(id);
    }
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    if (this.productForm().invalid()) {
      return;
    }

    const value = this.model();
    const editingId = this.editingId();
    const isDuplicate = this.productsService
      .products()
      .some(
        (product) =>
          product.id !== editingId && product.name.toLowerCase() === value.name.toLowerCase(),
      );
    if (isDuplicate) {
      this.duplicateNameError.set(true);
      return;
    }

    if (editingId) {
      this.productsService.update(editingId, value);
    } else {
      this.productsService.add(value);
    }
    this.cancelEdit();
  }
}
```

```typescript
// src/app/features/products/products.routes.ts
import { Routes } from '@angular/router';
import { ProductsManager } from './products-manager/products-manager';

export const PRODUCTS_ROUTES: Routes = [{ path: '', component: ProductsManager }];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/products/products-manager/products-manager.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/products/products-manager/products-manager.ts src/app/features/products/products-manager/products-manager.spec.ts src/app/features/products/products.routes.ts
git commit -m "feat: add products management UI and route"
```

---

## Task 9: Shopping lists overview UI

**Files:**
- Create: `src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.ts`
- Create: `src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts`

**Interfaces:**
- Consumes: `ShoppingListsService` from Task 5 (`lists`, `addList`, `setStatus`, `removeList`); `FormField`, `form`, `required` from `@angular/forms/signals`; `DatePipe` from `@angular/common`; `RouterLink` from `@angular/router`.
- Produces: `ShoppingListsOverview` standalone component (selector `app-shopping-lists-overview`), linking to `/lists/:id` for each list.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ShoppingListsService } from '../data/shopping-lists.service';
import { ShoppingListsOverview } from './shopping-lists-overview';

describe('ShoppingListsOverview', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShoppingListsOverview],
      providers: [provideRouter([])],
    });
  });

  it('shows an empty-state message when there are no lists', () => {
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No shopping lists yet');
  });

  it('creates a list from the form and lists it', () => {
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.value = 'Weekly groceries';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(root.querySelectorAll('li').length).toBe(1);
    expect(root.textContent).toContain('Weekly groceries');
  });

  it('deletes a list after the user confirms', () => {
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('li button:last-of-type')!
      .click();
    fixture.detectChanges();

    expect(shoppingListsService.lists()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts`
Expected: FAIL — `Cannot find module './shopping-lists-overview'`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.ts
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { ShoppingListsService } from '../data/shopping-lists.service';

interface NewListFormValue {
  name: string;
}

@Component({
  selector: 'app-shopping-lists-overview',
  imports: [DatePipe, RouterLink, FormField],
  template: `
    <h1>Shopping lists</h1>

    @if (shoppingListsService.lists().length === 0) {
      <p>No shopping lists yet — create your first one below.</p>
    } @else {
      <ul>
        @for (list of shoppingListsService.lists(); track list.id) {
          <li>
            <a [routerLink]="['/lists', list.id]">{{ list.name }}</a>
            <span>{{ list.createdAt | date: 'medium' }}</span>
            <span>{{ list.status === 'active' ? 'Active' : 'Completed' }}</span>
            <button type="button" (click)="toggleStatus(list.id, list.status)">
              {{ list.status === 'active' ? 'Mark completed' : 'Mark active' }}
            </button>
            <button type="button" (click)="remove(list.id)">Delete</button>
          </li>
        }
      </ul>
    }

    <h2>New shopping list</h2>
    <form (submit)="handleSubmit($event)">
      <label>
        Name
        <input type="text" [formField]="newListForm.name" />
      </label>
      @if (newListForm.name().invalid() && newListForm.name().touched()) {
        <p role="alert">Name is required.</p>
      }
      <button type="submit">Create list</button>
    </form>
  `,
})
export class ShoppingListsOverview {
  protected readonly shoppingListsService = inject(ShoppingListsService);

  private readonly model = signal<NewListFormValue>({ name: '' });
  protected readonly newListForm = form(this.model, (path) => {
    required(path.name);
  });

  protected toggleStatus(id: string, status: 'active' | 'completed'): void {
    this.shoppingListsService.setStatus(id, status === 'active' ? 'completed' : 'active');
  }

  protected remove(id: string): void {
    if (confirm('Delete this shopping list?')) {
      this.shoppingListsService.removeList(id);
    }
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    if (this.newListForm().invalid()) {
      return;
    }
    this.shoppingListsService.addList(this.model().name);
    this.model.set({ name: '' });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.ts src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts
git commit -m "feat: add shopping lists overview UI"
```

---

## Task 10: Shopping list detail UI

**Files:**
- Create: `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.ts`
- Create: `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts`
- Create: `src/app/features/shopping-lists/shopping-lists.routes.ts`

**Interfaces:**
- Consumes: `ShoppingListsService` from Task 5; `ProductsService` from Task 4; `UnitsService` from Task 2; `CategoriesService` from Task 3; `ShoppingListsOverview` from Task 9; `FormField`, `form`, `min` from `@angular/forms/signals`; `RouterLink` from `@angular/router`.
- Produces: `ShoppingListDetail` standalone component (selector `app-shopping-list-detail`) with a required `id` input (bound from the `:id` route parameter). Produces: `SHOPPING_LISTS_ROUTES: Routes` (`src/app/features/shopping-lists/shopping-lists.routes.ts`) with two routes: `''` → `ShoppingListsOverview`, `':id'` → `ShoppingListDetail`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoriesService } from '../../categories/data/categories.service';
import { ProductsService } from '../../products/data/products.service';
import { UnitsService } from '../../units/data/units.service';
import { ShoppingListsService } from '../data/shopping-lists.service';
import { ShoppingListDetail } from './shopping-list-detail';

describe('ShoppingListDetail', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShoppingListDetail],
      providers: [provideRouter([])],
    });
  });

  it('shows "List not found" for an unknown id', () => {
    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', 'missing');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('List not found');
  });

  it('adds an item built from the selected product, unit, and category', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'litre', symbol: 'l' });
    const unitId = unitsService.units()[0].id;
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const categoryId = categoriesService.categories()[0].id;
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', defaultUnitId: unitId, categoryId });
    const productId = productsService.products()[0].id;
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const productSelect = root.querySelector<HTMLSelectElement>('select')!;
    productSelect.value = productId;
    productSelect.dispatchEvent(new Event('change'));
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

  it('marks an item as purchased when its checkbox is toggled', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'litre', symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({
      name: 'Milk',
      defaultUnitId: unitsService.units()[0].id,
      categoryId: categoriesService.categories()[0].id,
    });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;
    shoppingListsService.addItemFromProduct(
      listId,
      productsService.products()[0],
      unitsService.units()[0],
      categoriesService.categories()[0],
      2,
    );

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const checkbox = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(shoppingListsService.lists()[0].items[0].purchased).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts`
Expected: FAIL — `Cannot find module './shopping-list-detail'`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.ts
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormField, form, min } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { CategoriesService } from '../../categories/data/categories.service';
import { ProductsService } from '../../products/data/products.service';
import { UnitsService } from '../../units/data/units.service';
import { ShoppingListsService } from '../data/shopping-lists.service';

interface ItemFormValue {
  quantity: number;
  note: string;
}

const EMPTY_ITEM_FORM: ItemFormValue = { quantity: 1, note: '' };

@Component({
  selector: 'app-shopping-list-detail',
  imports: [RouterLink, FormField],
  template: `
    <a routerLink="/lists">Back to lists</a>

    @if (list(); as currentList) {
      <h1>{{ currentList.name }}</h1>
      <p>Status: {{ currentList.status === 'active' ? 'Active' : 'Completed' }}</p>
      <button type="button" (click)="toggleStatus(currentList.status)">
        {{ currentList.status === 'active' ? 'Mark completed' : 'Mark active' }}
      </button>

      @if (currentList.items.length === 0) {
        <p>No items yet — add the first one below.</p>
      } @else {
        <ul>
          @for (item of currentList.items; track item.id) {
            <li>
              <label>
                <input
                  type="checkbox"
                  [checked]="item.purchased"
                  (change)="togglePurchased(item.id, item.purchased)"
                />
                {{ item.productName }} — {{ item.quantity }} {{ item.unitLabel }} ({{
                  item.categoryName
                }})
                @if (item.note) {
                  <span> — {{ item.note }}</span>
                }
              </label>
              <button type="button" (click)="removeItem(item.id)">Remove</button>
            </li>
          }
        </ul>
      }

      <h2>Add item</h2>
      <form (submit)="addItem($event)">
        <label>
          Product
          <select [value]="productId()" (change)="onProductChange($event)">
            <option value="" disabled>Select a product</option>
            @for (product of productsService.products(); track product.id) {
              <option [value]="product.id">{{ product.name }}</option>
            }
          </select>
        </label>

        <label>
          Unit
          <select [value]="selectedUnitId()" (change)="onUnitChange($event)">
            @for (unit of unitsService.units(); track unit.id) {
              <option [value]="unit.id">{{ unit.name }} ({{ unit.symbol }})</option>
            }
          </select>
        </label>

        <label>
          Category
          <select [value]="selectedCategoryId()" (change)="onCategoryChange($event)">
            @for (category of categoriesService.categories(); track category.id) {
              <option [value]="category.id">{{ category.name }}</option>
            }
          </select>
        </label>

        <label>
          Quantity
          <input type="number" [formField]="itemForm.quantity" step="0.01" />
        </label>
        @if (itemForm.quantity().invalid() && itemForm.quantity().touched()) {
          <p role="alert">Quantity must be greater than 0.</p>
        }

        <label>
          Note
          <input type="text" [formField]="itemForm.note" />
        </label>

        <button type="submit">Add item</button>
      </form>
    } @else {
      <p>List not found.</p>
    }
  `,
})
export class ShoppingListDetail {
  readonly id = input.required<string>();

  protected readonly shoppingListsService = inject(ShoppingListsService);
  protected readonly productsService = inject(ProductsService);
  protected readonly unitsService = inject(UnitsService);
  protected readonly categoriesService = inject(CategoriesService);

  protected readonly list = computed(() =>
    this.shoppingListsService.lists().find((l) => l.id === this.id()),
  );

  protected readonly productId = signal('');
  protected readonly selectedUnitId = linkedSignal(() => {
    const product = this.productsService.products().find((p) => p.id === this.productId());
    return product?.defaultUnitId ?? '';
  });
  protected readonly selectedCategoryId = linkedSignal(() => {
    const product = this.productsService.products().find((p) => p.id === this.productId());
    return product?.categoryId ?? '';
  });

  private readonly itemModel = signal<ItemFormValue>({ ...EMPTY_ITEM_FORM });
  protected readonly itemForm = form(this.itemModel, (path) => {
    min(path.quantity, 0.01);
  });

  protected onProductChange(event: Event): void {
    this.productId.set((event.target as HTMLSelectElement).value);
  }

  protected onUnitChange(event: Event): void {
    this.selectedUnitId.set((event.target as HTMLSelectElement).value);
  }

  protected onCategoryChange(event: Event): void {
    this.selectedCategoryId.set((event.target as HTMLSelectElement).value);
  }

  protected toggleStatus(status: 'active' | 'completed'): void {
    this.shoppingListsService.setStatus(this.id(), status === 'active' ? 'completed' : 'active');
  }

  protected togglePurchased(itemId: string, purchased: boolean): void {
    this.shoppingListsService.setItemPurchased(this.id(), itemId, !purchased);
  }

  protected removeItem(itemId: string): void {
    this.shoppingListsService.removeItem(this.id(), itemId);
  }

  protected addItem(event: Event): void {
    event.preventDefault();
    const productId = this.productId();
    if (!productId || this.itemForm().invalid()) {
      return;
    }

    const product = this.productsService.products().find((p) => p.id === productId);
    const unit = this.unitsService.units().find((u) => u.id === this.selectedUnitId());
    const category = this.categoriesService
      .categories()
      .find((c) => c.id === this.selectedCategoryId());
    if (!product || !unit || !category) {
      return;
    }

    const { quantity, note } = this.itemModel();
    this.shoppingListsService.addItemFromProduct(
      this.id(),
      product,
      unit,
      category,
      quantity,
      note.trim() ? note.trim() : undefined,
    );

    this.productId.set('');
    this.itemModel.set({ ...EMPTY_ITEM_FORM });
  }
}
```

```typescript
// src/app/features/shopping-lists/shopping-lists.routes.ts
import { Routes } from '@angular/router';
import { ShoppingListDetail } from './shopping-list-detail/shopping-list-detail';
import { ShoppingListsOverview } from './shopping-lists-overview/shopping-lists-overview';

export const SHOPPING_LISTS_ROUTES: Routes = [
  { path: '', component: ShoppingListsOverview },
  { path: ':id', component: ShoppingListDetail },
];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.ts src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts src/app/features/shopping-lists/shopping-lists.routes.ts
git commit -m "feat: add shopping list detail UI and shopping-lists feature routes"
```

---

## Task 11: App shell and root routing

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/app.config.ts`
- Modify: `src/app/app.ts`
- Modify: `src/app/app.html`
- Modify: `src/app/app.scss`
- Modify: `src/app/app.spec.ts`

**Interfaces:**
- Consumes: `UNITS_ROUTES` (Task 6), `CATEGORIES_ROUTES` (Task 7), `PRODUCTS_ROUTES` (Task 8), `SHOPPING_LISTS_ROUTES` (Task 10).
- Produces: the root `routes` array wiring `/lists`, `/products`, `/units`, `/categories` as lazy-loaded feature routes with `/` redirecting to `/lists`; an `App` shell component with a navigation bar linking to all four sections and a `<router-outlet>`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/app.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders navigation links to all sections', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('nav a'),
    ).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/lists', '/products', '/units', '/categories']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --include src/app/app.spec.ts`
Expected: FAIL — the current `App` template still renders the scaffold placeholder, so it has no `<nav>` and the "renders navigation links" assertion fails (empty array vs. the expected 4 links).

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/app/app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'lists' },
  {
    path: 'lists',
    loadChildren: () =>
      import('./features/shopping-lists/shopping-lists.routes').then(
        (m) => m.SHOPPING_LISTS_ROUTES,
      ),
  },
  {
    path: 'products',
    loadChildren: () =>
      import('./features/products/products.routes').then((m) => m.PRODUCTS_ROUTES),
  },
  {
    path: 'units',
    loadChildren: () => import('./features/units/units.routes').then((m) => m.UNITS_ROUTES),
  },
  {
    path: 'categories',
    loadChildren: () =>
      import('./features/categories/categories.routes').then((m) => m.CATEGORIES_ROUTES),
  },
];
```

```typescript
// src/app/app.config.ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
  ],
};
```

```typescript
// src/app/app.ts
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
```

```html
<!-- src/app/app.html -->
<nav aria-label="Main navigation">
  <a routerLink="/lists" routerLinkActive="active">Shopping lists</a>
  <a routerLink="/products" routerLinkActive="active">Products</a>
  <a routerLink="/units" routerLinkActive="active">Units</a>
  <a routerLink="/categories" routerLinkActive="active">Categories</a>
</nav>

<main>
  <router-outlet />
</main>
```

```scss
// src/app/app.scss
:host {
  display: block;
  min-height: 100dvh;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
}

nav {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid #ddd;

  a.active {
    font-weight: 700;
  }
}

main {
  padding: 1rem;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --include src/app/app.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — every spec file from Tasks 1–11 passes.

- [ ] **Step 6: Commit**

```bash
git add src/app/app.routes.ts src/app/app.config.ts src/app/app.ts src/app/app.html src/app/app.scss src/app/app.spec.ts
git commit -m "feat: wire app shell navigation and lazy feature routes"
```

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task — data model → Tasks 1–5; routing table → Tasks 6–11; state/persistence pattern → Task 1 (generic store) plus Tasks 2–5 (domain services); components/forms → Tasks 6–10; error handling (localStorage failure, validation, delete confirmation, empty states) → covered inline in Tasks 1 and 6–10; testing approach (unit + component, TDD) → every task follows red/green/commit.
- **Out of scope items** (sync, sharing, import/export, sorting/grouping) are intentionally not covered by any task, per the spec.
- **Type consistency verified:** `Unit`/`UnitId` (Task 2) are reused unchanged by `Product` (Task 4), `ProductsManager` (Task 8), and `ShoppingListDetail` (Task 10); `Category`/`CategoryId` (Task 3) likewise; `Product`/`Unit`/`Category` passed into `ShoppingListsService.addItemFromProduct` (Task 5) match the exact shapes produced by Tasks 2–4; `SHOPPING_LISTS_ROUTES` (Task 10) is the exact symbol imported by `app.routes.ts` (Task 11).
