# Shopping List Sharing & Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user export a single shopping list to a `.json` file and share it (native share sheet or download), and let another user import such a file to create a new list in their own copy of Listify.

**Architecture:** Fully client-side, no backend. A new pure-function module (`shopping-list-export.ts`) owns encoding a `ShoppingList` to a versioned export DTO and decoding/validating untrusted JSON back into one. `ShoppingListsService` gets one new method, `importList`, that turns a validated DTO into a freshly-created, persisted list (new id, `active` status, unpurchased items). The existing `ConfirmDialog`/`ConfirmDialogService` gets a single-button "alert" mode, reused for the invalid-file error message. Two components get new buttons: "Share" on the list detail page, "Import" on the list overview page.

**Tech Stack:** Angular 22 (standalone components, signals, `@Service()` DI), `@angular/forms/signals` for existing forms (untouched by this plan), Angular CDK Dialog for the alert dialog, Vitest + Angular `TestBed` for tests (run via `npm test`, i.e. `ng test`).

**Spec:** `docs/superpowers/specs/2026-09-13-shopping-list-sharing-design.md`

## Global Constraints

- No backend and no new npm dependencies — everything runs client-side with the existing `localStorage`-backed collection pattern (`core/storage/local-storage-collection.ts`).
- All new UI copy is in English, matching the rest of the app.
- Services use the `@Service()` decorator (not `@Injectable`) and `inject()`, per existing convention (see `shopping-lists.service.ts:1,13`).
- Do NOT set `standalone: true` on any `@Component`/`@Directive` (default in v20+). Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly (default in v22+).
- Templates use native control flow (`@if`/`@for`), never `*ngIf`/`*ngFor`/`ngClass`/`ngStyle`; do not import `CommonModule`, only the specific directives/pipes used.
- New dialog behavior extends the existing CDK-Dialog-based `shared/confirm-dialog/` component rather than introducing a new dialog component.
- New buttons must pass WCAG AA / AXE: visible text (not icon-only) for Share/Import, and the alert dialog keeps `role="alertdialog"` with a focused, clearly labeled action.
- An exported list is always a "fresh start" on import: `status` is `active` and every item's `purchased` is `false`, regardless of the state of the list it was exported from. `note` is preserved.

---

### Task 1: Export/import data module

**Files:**
- Create: `src/app/features/shopping-lists/data/shopping-list-export.ts`
- Test: `src/app/features/shopping-lists/data/shopping-list-export.spec.ts`

**Interfaces:**
- Consumes: `ShoppingList`, `ShoppingListItem` from `./shopping-list.model` (existing).
- Produces (used by Task 2, Task 4, Task 5):
  - `interface ShoppingListExportItem { productName: string; unitLabel: string; categoryName: string; quantity: number; note?: string }`
  - `interface ShoppingListExport { version: 1; exportedAt: string; list: { name: string; items: ShoppingListExportItem[] } }`
  - `class ShoppingListImportError extends Error`
  - `function toShoppingListExport(list: ShoppingList): ShoppingListExport`
  - `function parseShoppingListExport(raw: string): ShoppingListExport` (throws `ShoppingListImportError` on any invalid input)
  - `function toExportFilename(listName: string): string`

- [ ] **Step 1: Write the failing tests**

Create `src/app/features/shopping-lists/data/shopping-list-export.spec.ts`:

```ts
import { ShoppingList } from './shopping-list.model';
import {
  parseShoppingListExport,
  ShoppingListImportError,
  toExportFilename,
  toShoppingListExport,
} from './shopping-list-export';

describe('toShoppingListExport', () => {
  it('builds a version-1 export with the list name and items, dropping id/status/purchased', () => {
    const list: ShoppingList = {
      id: 'list-1',
      name: 'Weekly groceries',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'completed',
      items: [
        {
          id: 'item-1',
          productName: 'Milk',
          unitLabel: 'l',
          categoryName: 'Dairy',
          quantity: 2,
          purchased: true,
          note: 'organic',
        },
      ],
    };

    const result = toShoppingListExport(list);

    expect(result.version).toBe(1);
    expect(Number.isNaN(Date.parse(result.exportedAt))).toBe(false);
    expect(result.list).toEqual({
      name: 'Weekly groceries',
      items: [
        { productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2, note: 'organic' },
      ],
    });
  });

  it('omits note when the item has none', () => {
    const list: ShoppingList = {
      id: 'list-1',
      name: 'Weekly groceries',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'active',
      items: [
        { id: 'item-1', productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2, purchased: false },
      ],
    };

    const result = toShoppingListExport(list);

    expect(result.list.items[0]).not.toHaveProperty('note');
  });
});

describe('parseShoppingListExport', () => {
  const validJson = JSON.stringify({
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    list: {
      name: 'Weekly groceries',
      items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2, note: 'organic' }],
    },
  });

  it('parses a well-formed export', () => {
    const result = parseShoppingListExport(validJson);
    expect(result.list.name).toBe('Weekly groceries');
    expect(result.list.items).toEqual([
      { productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2, note: 'organic' },
    ]);
  });

  it('accepts an item with no note', () => {
    const json = JSON.stringify({
      version: 1,
      list: { name: 'x', items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2 }] },
    });
    expect(() => parseShoppingListExport(json)).not.toThrow();
  });

  it('throws ShoppingListImportError for invalid JSON', () => {
    expect(() => parseShoppingListExport('not json')).toThrow(ShoppingListImportError);
  });

  it('throws for an unsupported version', () => {
    const json = JSON.stringify({ version: 2, list: { name: 'x', items: [] } });
    expect(() => parseShoppingListExport(json)).toThrow(ShoppingListImportError);
  });

  it('throws when the list name is missing', () => {
    const json = JSON.stringify({ version: 1, list: { items: [] } });
    expect(() => parseShoppingListExport(json)).toThrow(ShoppingListImportError);
  });

  it('throws when items is not an array', () => {
    const json = JSON.stringify({ version: 1, list: { name: 'x', items: 'nope' } });
    expect(() => parseShoppingListExport(json)).toThrow(ShoppingListImportError);
  });

  it('throws when an item is missing a required field', () => {
    const json = JSON.stringify({
      version: 1,
      list: { name: 'x', items: [{ productName: 'Milk', unitLabel: 'l', quantity: 2 }] },
    });
    expect(() => parseShoppingListExport(json)).toThrow(ShoppingListImportError);
  });
});

describe('toExportFilename', () => {
  it('slugifies the list name into a .json filename', () => {
    expect(toExportFilename('Weekly groceries')).toBe('weekly-groceries.json');
  });

  it('falls back to a generic name when the list name has no usable characters', () => {
    expect(toExportFilename('   ')).toBe('shopping-list.json');
    expect(toExportFilename('!!!')).toBe('shopping-list.json');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --include src/app/features/shopping-lists/data/shopping-list-export.spec.ts --watch=false`
Expected: FAIL — `shopping-list-export.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/app/features/shopping-lists/data/shopping-list-export.ts`:

```ts
import { ShoppingList } from './shopping-list.model';

export interface ShoppingListExportItem {
  productName: string;
  unitLabel: string;
  categoryName: string;
  quantity: number;
  note?: string;
}

export interface ShoppingListExport {
  version: 1;
  exportedAt: string;
  list: {
    name: string;
    items: ShoppingListExportItem[];
  };
}

export class ShoppingListImportError extends Error {
  constructor() {
    super("Invalid shopping list export file");
    this.name = 'ShoppingListImportError';
  }
}

export function toShoppingListExport(list: ShoppingList): ShoppingListExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    list: {
      name: list.name,
      items: list.items.map((item) => ({
        productName: item.productName,
        unitLabel: item.unitLabel,
        categoryName: item.categoryName,
        quantity: item.quantity,
        ...(item.note ? { note: item.note } : {}),
      })),
    },
  };
}

export function parseShoppingListExport(raw: string): ShoppingListExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ShoppingListImportError();
  }
  if (!isValidExport(parsed)) {
    throw new ShoppingListImportError();
  }
  return parsed;
}

export function toExportFilename(listName: string): string {
  const slug = listName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'shopping-list'}.json`;
}

function isValidExport(value: unknown): value is ShoppingListExport {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate['version'] !== 1) {
    return false;
  }
  const list = candidate['list'];
  if (typeof list !== 'object' || list === null) {
    return false;
  }
  const listCandidate = list as Record<string, unknown>;
  if (typeof listCandidate['name'] !== 'string' || listCandidate['name'].trim() === '') {
    return false;
  }
  const items = listCandidate['items'];
  return Array.isArray(items) && items.every(isValidExportItem);
}

function isValidExportItem(value: unknown): value is ShoppingListExportItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item['productName'] === 'string' &&
    typeof item['unitLabel'] === 'string' &&
    typeof item['categoryName'] === 'string' &&
    typeof item['quantity'] === 'number' &&
    (item['note'] === undefined || typeof item['note'] === 'string')
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --include src/app/features/shopping-lists/data/shopping-list-export.spec.ts --watch=false`
Expected: PASS (all `toShoppingListExport`, `parseShoppingListExport`, `toExportFilename` tests green)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/shopping-lists/data/shopping-list-export.ts src/app/features/shopping-lists/data/shopping-list-export.spec.ts
git commit -m "feat(shopping-lists): add shopping list export/import data format"
```

---

### Task 2: `ShoppingListsService.importList`

**Files:**
- Modify: `src/app/features/shopping-lists/data/shopping-lists.service.ts`
- Test: `src/app/features/shopping-lists/data/shopping-lists.service.spec.ts`

**Interfaces:**
- Consumes: `ShoppingListExport` type from `./shopping-list-export` (Task 1) — type-only import, no runtime dependency.
- Produces (used by Task 5): `ShoppingListsService.importList(data: ShoppingListExport['list']): ShoppingList`

- [ ] **Step 1: Write the failing test**

In `src/app/features/shopping-lists/data/shopping-lists.service.spec.ts`, add inside the existing `describe('ShoppingListsService', ...)` block (after the `addList` tests):

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --include src/app/features/shopping-lists/data/shopping-lists.service.spec.ts --watch=false`
Expected: FAIL — `service.importList is not a function`

- [ ] **Step 3: Implement `importList`**

In `src/app/features/shopping-lists/data/shopping-lists.service.ts`, leave the existing import lines untouched and add one new import line, positioned alphabetically right before the `./shopping-list.model` import:

```ts
import { ShoppingListExport } from './shopping-list-export';
```

So the last two import statements read (only the new line is added):

```ts
import { Unit } from '../../units/data/unit.model';
import { ShoppingListExport } from './shopping-list-export';
import {
  ShoppingList,
  ShoppingListId,
  ShoppingListItem,
  ShoppingListItemId,
} from './shopping-list.model';
```

Add the method to the `ShoppingListsService` class, right after `addList`:

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --include src/app/features/shopping-lists/data/shopping-lists.service.spec.ts --watch=false`
Expected: PASS (all existing tests plus the two new `importList` tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/shopping-lists/data/shopping-lists.service.ts src/app/features/shopping-lists/data/shopping-lists.service.spec.ts
git commit -m "feat(shopping-lists): add ShoppingListsService.importList"
```

---

### Task 3: Alert mode for the confirm dialog

**Files:**
- Modify: `src/app/shared/confirm-dialog/confirm-dialog.ts`
- Modify: `src/app/shared/confirm-dialog/confirm-dialog.service.ts`
- Test: `src/app/shared/confirm-dialog/confirm-dialog.service.spec.ts`

**Interfaces:**
- Produces (used by Task 5): `ConfirmDialogService.alert(data: { title: string; message: string }): Promise<void>`

- [ ] **Step 1: Write the failing test**

In `src/app/shared/confirm-dialog/confirm-dialog.service.spec.ts`, add a new `describe` block at the end of the file (after the closing `});` of the existing `describe('ConfirmDialogService', ...)`):

```ts
describe('ConfirmDialogService.alert', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    document
      .querySelectorAll('.cdk-overlay-container')
      .forEach((container) => container.remove());
  });

  function getButtons(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.confirm-dialog__actions button'));
  }

  it('shows the given title and message with a single OK button', async () => {
    const service = TestBed.inject(ConfirmDialogService);

    void service.alert({ title: 'Import failed', message: "We couldn't read this file." });
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.body.textContent).toContain('Import failed');
    expect(document.body.textContent).toContain("We couldn't read this file.");
    const buttons = getButtons();
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent?.trim()).toBe('OK');
  });

  it('resolves once the OK button is clicked', async () => {
    const service = TestBed.inject(ConfirmDialogService);
    const resultPromise = service.alert({ title: 'Import failed', message: 'Bad file.' });
    await TestBed.inject(ApplicationRef).whenStable();

    getButtons()[0].click();

    await expect(resultPromise).resolves.toBeUndefined();
  });

  it('removes the dialog from the DOM once closed', async () => {
    const service = TestBed.inject(ConfirmDialogService);
    const resultPromise = service.alert({ title: 'Import failed', message: 'Bad file.' });
    await TestBed.inject(ApplicationRef).whenStable();

    getButtons()[0].click();
    await resultPromise;

    expect(document.querySelector('.confirm-dialog')).toBeNull();
  });
});
```

The file already imports `ApplicationRef` from `@angular/core` at the top (used by the existing `confirm()` tests) — no import changes are needed for this test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --include src/app/shared/confirm-dialog/confirm-dialog.service.spec.ts --watch=false`
Expected: FAIL — `service.alert is not a function`

- [ ] **Step 3: Implement the alert mode**

In `src/app/shared/confirm-dialog/confirm-dialog.ts`, update `ConfirmDialogData`:

```ts
export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly hideCancel?: boolean;
}
```

Update the actions block in the template from:

```html
      <div class="confirm-dialog__actions">
        <button type="button" class="btn-outline-pill" (click)="cancel()">
          {{ data.cancelLabel ?? 'Cancel' }}
        </button>
        <button type="button" class="btn-accent-pill-lg" (click)="confirm()">
          {{ data.confirmLabel ?? 'Delete' }}
        </button>
      </div>
```

to:

```html
      <div class="confirm-dialog__actions">
        @if (!data.hideCancel) {
          <button type="button" class="btn-outline-pill" (click)="cancel()">
            {{ data.cancelLabel ?? 'Cancel' }}
          </button>
        }
        <button type="button" class="btn-accent-pill-lg" (click)="confirm()">
          {{ data.confirmLabel ?? 'Delete' }}
        </button>
      </div>
```

In `src/app/shared/confirm-dialog/confirm-dialog.service.ts`, add the `alert` method to `ConfirmDialogService`:

```ts
  async alert(data: { title: string; message: string }): Promise<void> {
    const dialogRef = this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      data: { ...data, hideCancel: true, confirmLabel: 'OK' },
      role: 'alertdialog',
      autoFocus: '.btn-accent-pill-lg',
    });
    await firstValueFrom(dialogRef.closed);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --include src/app/shared/confirm-dialog/confirm-dialog.service.spec.ts --watch=false`
Expected: PASS — existing `ConfirmDialogService` tests still pass (cancel button still renders by default) and the new `ConfirmDialogService.alert` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/confirm-dialog/confirm-dialog.ts src/app/shared/confirm-dialog/confirm-dialog.service.ts src/app/shared/confirm-dialog/confirm-dialog.service.spec.ts
git commit -m "feat(confirm-dialog): add single-button alert mode"
```

---

### Task 4: Share button on the list detail page

**Files:**
- Modify: `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.ts`
- Test: `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts`

**Interfaces:**
- Consumes: `toShoppingListExport`, `toExportFilename` from `../data/shopping-list-export` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts`, the file currently has no `@angular/core` import at all (only `@angular/core/testing`) — add a new line `import { ApplicationRef } from '@angular/core';` as the first line of the file, above the existing `import { TestBed } from '@angular/core/testing';` line. Then add this `describe` block as a new top-level block at the end of the file, after the closing `});` of the existing `describe('ShoppingListDetail', ...)`:

```ts
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
      'organic',
    );
    return listId;
  }

  it('downloads a JSON file when the Web Share API is unavailable', async () => {
    const listId = setupListWithItem();
    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

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
    expect(callArgs.files[0].name).toBe('weekly-groceries.json');
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
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Share Weekly groceries"]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });
});
```

Note: the last test asserts that an aborted native share does **not** fall back to download (per spec: user cancellation is silently ignored, not treated as "unsupported").

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --include src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts --watch=false`
Expected: FAIL — no button matches `[aria-label="Share Weekly groceries"]`.

- [ ] **Step 3: Implement the Share button**

In `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.ts`, leave the existing import lines untouched and add one new import line, positioned alphabetically right before the `../data/shopping-list.model` import:

```ts
import { toExportFilename, toShoppingListExport } from '../data/shopping-list-export';
```

So the last three import lines read (only the new line is added):

```ts
import { UnitsService } from '../../units/data/units.service';
import { toExportFilename, toShoppingListExport } from '../data/shopping-list-export';
import { ShoppingListItem, ShoppingListItemId } from '../data/shopping-list.model';
import { ShoppingListsService } from '../data/shopping-lists.service';
```

Replace the single toggle-status button in the template:

```html
          <button
            type="button"
            class="btn-accent-pill-lg"
            (click)="toggleStatus(currentList.status)"
          >
            {{ currentList.status === 'active' ? 'Mark completed' : 'Mark active' }}
          </button>
```

with a wrapping actions row containing both buttons:

```html
          <div class="list-header__actions">
            <button
              type="button"
              class="btn-accent-pill-lg"
              (click)="toggleStatus(currentList.status)"
            >
              {{ currentList.status === 'active' ? 'Mark completed' : 'Mark active' }}
            </button>
            <button
              type="button"
              class="btn-outline-pill"
              (click)="shareList()"
              [attr.aria-label]="'Share ' + currentList.name"
            >
              <svg
                class="icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
          </div>
```

Add the matching style rule inside the component's `styles` template literal, right after `.list-header__title-row { ... }`:

```scss
    .list-header__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }
```

Add the class methods, right after `toggleStatus`:

```ts
  protected async shareList(): Promise<void> {
    const currentList = this.list();
    if (!currentList) {
      return;
    }
    const json = JSON.stringify(toShoppingListExport(currentList), null, 2);
    const file = new File([json], toExportFilename(currentList.name), { type: 'application/json' });

    const shared = await this.tryNativeShare(file, currentList.name);
    if (!shared) {
      this.downloadFile(file);
    }
  }

  private async tryNativeShare(file: File, title: string): Promise<boolean> {
    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean;
      share?: (data: { files: File[]; title?: string }) => Promise<void>;
    };
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function' || !nav.canShare({ files: [file] })) {
      return false;
    }
    try {
      await nav.share({ files: [file], title });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return true;
      }
      return false;
    }
  }

  private downloadFile(file: File): void {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  }
```

`tryNativeShare` returning `true` on `AbortError` is what makes the fall-through skip the download — the share sheet was available and the user made a choice (cancel), so we don't silently also download the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --include src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts --watch=false`
Expected: PASS — all existing `ShoppingListDetail` tests plus the three new sharing tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.ts src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts
git commit -m "feat(shopping-lists): add Share button to list detail page"
```

---

### Task 5: Import button on the list overview page

**Files:**
- Modify: `src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.ts`
- Modify: `src/styles.scss`
- Test: `src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts`

**Interfaces:**
- Consumes: `parseShoppingListExport`, `ShoppingListImportError` from `../data/shopping-list-export` (Task 1); `ShoppingListsService.importList` (Task 2); `ConfirmDialogService.alert` (Task 3).

- [ ] **Step 1: Write the failing tests**

In `src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts`, add near the top of the file (after existing imports):

```ts
function createImportFile(content: string): File {
  return new File([content], 'list.json', { type: 'application/json' });
}

function selectImportFile(root: HTMLElement, file: File): void {
  const fileInput = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
  fileInput.dispatchEvent(new Event('change'));
}
```

Add these tests inside the existing `describe('ShoppingListsOverview', ...)` block:

```ts
  it('imports a valid file and navigates to the new list', async () => {
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const file = createImportFile(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        list: {
          name: 'Shared list',
          items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2 }],
        },
      }),
    );
    selectImportFile(fixture.nativeElement as HTMLElement, file);
    await TestBed.inject(ApplicationRef).whenStable();

    const shoppingListsService = TestBed.inject(ShoppingListsService);
    expect(shoppingListsService.lists().length).toBe(1);
    expect(shoppingListsService.lists()[0].name).toBe('Shared list');
    const createdId = shoppingListsService.lists()[0].id;
    expect(navigateSpy).toHaveBeenCalledWith(['/lists', createdId]);
  });

  it('shows an alert and creates no list when the file is invalid', async () => {
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    const shoppingListsService = TestBed.inject(ShoppingListsService);

    const file = createImportFile('not valid json');
    selectImportFile(fixture.nativeElement as HTMLElement, file);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(shoppingListsService.lists()).toEqual([]);
    expect(document.body.textContent).toContain('Import failed');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --include src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts --watch=false`
Expected: FAIL — no `input[type="file"]` exists in the rendered template yet.

- [ ] **Step 3: Implement the Import button**

In `src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.ts`, leave the existing import lines untouched and add one new import line, positioned alphabetically right before the `../data/shopping-list.model` import:

```ts
import { parseShoppingListExport, ShoppingListImportError } from '../data/shopping-list-export';
```

So the full import section reads (only the new line is added — `DatePipe`, `afterRenderEffect`, etc. stay exactly as they already are):

```ts
import { DatePipe } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { FabPanel } from '../../../shared/fab-panel/fab-panel';
import { parseShoppingListExport, ShoppingListImportError } from '../data/shopping-list-export';
import { ShoppingList, ShoppingListId } from '../data/shopping-list.model';
import { ShoppingListsService } from '../data/shopping-lists.service';
```

Replace the page header:

```html
      <div class="page-header">
        <h1>Shopping lists</h1>
      </div>
```

with:

```html
      <div class="page-header">
        <h1>Shopping lists</h1>
        <button type="button" class="btn-outline-pill" (click)="triggerImport()">
          <svg
            class="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Import
        </button>
        <input
          #importInput
          type="file"
          accept="application/json,.json"
          hidden
          (change)="handleImportFileSelected($event)"
        />
      </div>
```

Add the class members, right after `private readonly nameInput = viewChild<...>(...)`:

```ts
  private readonly importInput = viewChild<ElementRef<HTMLInputElement>>('importInput');
```

Add these methods, right after `handleSubmit`:

```ts
  protected triggerImport(): void {
    this.importInput()?.nativeElement.click();
  }

  protected async handleImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseShoppingListExport(text);
      const list = this.shoppingListsService.importList(parsed.list);
      this.router.navigate(['/lists', list.id]);
    } catch (error) {
      if (error instanceof ShoppingListImportError) {
        await this.confirmDialogService.alert({
          title: 'Import failed',
          message: "We couldn't read this file — check it's a valid Listify export.",
        });
      }
    }
  }
```

In `src/styles.scss`, update the `.page-header` rule (around line 82) from:

```scss
.page-header {
  margin-bottom: 3rem;

  h1 {
    margin: 0;
    font-size: 2.25rem;
    font-weight: 900;
    letter-spacing: -0.02em;
  }
}
```

to:

```scss
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 3rem;

  h1 {
    margin: 0;
    font-size: 2.25rem;
    font-weight: 900;
    letter-spacing: -0.02em;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --include src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts --watch=false`
Expected: PASS — all existing overview tests plus the two new import tests.

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test -- --watch=false`
Expected: PASS — every spec in the project, including the new ones from Tasks 1-5.

Run: `npm run build`
Expected: succeeds with no TypeScript errors (this is what surfaces any DOM-lib typing mismatch for `navigator.share`/`canShare`, which Task 4's code sidesteps via an explicit local cast — if the build still complains, adjust the cast in `tryNativeShare`, don't change the runtime behavior).

- [ ] **Step 6: Commit**

```bash
git add src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.ts src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts src/styles.scss
git commit -m "feat(shopping-lists): add Import button to list overview page"
```

---

## Manual verification (after all tasks)

These aren't automatable with the current test setup and should be checked by hand once Task 5 is committed:

1. Run `npm start`, open a list with a couple of items, click **Share**. In a browser without file-sharing support (most desktop browsers), confirm a `.json` file downloads with a sensible filename. Open the file and confirm it has `version`, `exportedAt`, and `list.items` with `productName`/`unitLabel`/`categoryName`/`quantity`/`note`.
2. On the list overview page, click **Import**, pick the file downloaded in step 1, and confirm a new list appears with the same items, `status: active`, and all items unpurchased — and that you land on that list's detail page.
3. Try importing a non-JSON file (e.g. rename any `.txt` file to `.json`) and confirm the "Import failed" alert dialog appears with a single OK button, focus lands on it, and no new list is created.
4. Run an AXE check (e.g. via the `chrome-devtools-mcp:a11y-debugging` skill or the browser extension) on both the list overview and list detail pages with the new buttons visible, and fix anything it flags.
