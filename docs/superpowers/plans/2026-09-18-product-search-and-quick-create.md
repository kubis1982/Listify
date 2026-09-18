# Product Search & Quick-Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `<select>` product picker in the "Add item" flow with a searchable, typeahead combobox, and let the user create a brand-new product inline — via a modal — when their search has no matches, without leaving the shopping list page.

**Architecture:** A new standalone `ProductPicker` component (`shared/product-picker/`) implements Angular Signal Forms' `FormValueControl` contract so it drops directly into the existing `itemForm` via `[formField]`, exactly like the native `<select>` it replaces — no manual value-syncing glue needed. It renders an `<input>` plus `MatAutocomplete`/`MatOption` (Angular Material) for the search dropdown, filtering the in-memory product list client-side. When a search has zero matches, its only option becomes "Create product "…"", which opens a new `CreateProductDialog` (`features/products/create-product-dialog/`, `@angular/cdk/dialog`, same pattern as the existing `ConfirmDialog`) with a shortened add-product form. On save, the dialog returns the created `Product`, which `ProductPicker` selects automatically.

**Tech Stack:** Angular 22 (standalone components, signals, `@Service()` DI), `@angular/forms/signals` (`FormValueControl` custom-control contract) for `ProductPicker`, `@angular/forms/signals` (`form()`/`required()`) for `CreateProductDialog`'s form — same as `products-manager.ts`, Angular Material `MatAutocomplete`/`MatAutocompleteTrigger`/`MatOption` (first real Material component usage in this app; theming already configured in `styles.scss` via `mat.theme()`), Angular CDK Dialog for the create-product modal, Vitest + Angular `TestBed` for tests (run via `npm test`, i.e. `ng test`).

**Spec:** `docs/superpowers/specs/2026-09-18-product-search-and-quick-create-design.md`

## Global Constraints

- No backend and no new npm dependencies — `@angular/material`/`@angular/cdk` are already installed (`package.json`); this plan only wires up parts of them that weren't used yet.
- All new UI copy is in English, matching the rest of the app.
- Services use the `@Service()` decorator (not `@Injectable`) and `inject()`, per existing convention (see `products.service.ts:5`).
- Do NOT set `standalone: true` on any `@Component`/`@Directive` (default in v20+). Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly (default in v22+).
- Templates use native control flow (`@if`/`@for`), never `*ngIf`/`*ngFor`/`ngClass`/`ngStyle`; do not import `CommonModule`, only the specific directives/pipes/components used (including Material ones — import individual standalone directives like `MatAutocomplete`, not `MatAutocompleteModule`).
- Use `input()`/`output()`/`model()` functions, not decorators. Prefer Signal Forms (`@angular/forms/signals`) for the new `CreateProductDialog` form, matching `products-manager.ts`.
- New UI must pass WCAG AA / AXE: `MatAutocomplete` provides the ARIA 1.2 combobox pattern out of the box; the create-product dialog reuses CDK Dialog's built-in focus trap/return, same as `ConfirmDialog`.
- `Category` gets no `isDefault` concept — the quick-create dialog's category field always starts empty and is a required, deliberate choice every time.
- `ProductsService.add()` changes its return type from `void` to `Product` (non-breaking — existing callers that ignore the return value keep compiling).

---

### Task 1: `ProductsService.add()` returns the created product

**Files:**
- Modify: `src/app/features/products/data/products.service.ts:11-13`
- Test: `src/app/features/products/data/products.service.spec.ts`

**Interfaces:**
- Produces (used by Task 2): `ProductsService.add(product: Omit<Product, 'id'>): Product` (was `void`).

- [ ] **Step 1: Write the failing test**

Add to `src/app/features/products/data/products.service.spec.ts`, inside the existing `describe('ProductsService', ...)` block, after the `'adds a product with a generated id'` test:

```ts
  it('returns the created product, including its generated id', () => {
    const service = TestBed.inject(ProductsService);
    const created = service.add({ name: 'Milk 3.2%', defaultUnitId: 'unit-1', categoryId: 'category-1' });
    expect(created).toEqual(service.products()[0]);
    expect(created.id).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --include src/app/features/products/data/products.service.spec.ts --watch=false`
Expected: FAIL — `created` is `undefined` because `add()` currently returns `void`.

- [ ] **Step 3: Implement**

In `src/app/features/products/data/products.service.ts`, replace the `add` method (lines 11-13):

```ts
  add(product: Omit<Product, 'id'>): Product {
    const created: Product = { ...product, id: crypto.randomUUID() };
    this.store.add(created);
    return created;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --include src/app/features/products/data/products.service.spec.ts --watch=false`
Expected: PASS — all existing tests plus the new one.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/products/data/products.service.ts src/app/features/products/data/products.service.spec.ts
git commit -m "feat(products): return the created product from ProductsService.add"
```

---

### Task 2: `CreateProductDialog` component

**Files:**
- Create: `src/app/features/products/create-product-dialog/create-product-dialog.ts`
- Test: `src/app/features/products/create-product-dialog/create-product-dialog.spec.ts`

**Interfaces:**
- Consumes: `Product` from `../data/product.model` (existing), `ProductsService.add()` from Task 1, `UnitsService`/`CategoriesService` (existing).
- Produces (used by Task 3):
  - `interface CreateProductDialogData { readonly initialName: string }`
  - `class CreateProductDialog` — a CDK Dialog component. Opened via `dialog.open<Product | undefined, CreateProductDialogData>(CreateProductDialog, { data })`. Resolves (`dialogRef.closed`) with the created `Product` on success, or `undefined` on cancel.

- [ ] **Step 1: Write the failing tests**

Create `src/app/features/products/create-product-dialog/create-product-dialog.spec.ts`:

```ts
import { Dialog } from '@angular/cdk/dialog';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
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
    unitsService.add({ name: 'Litre', symbol: 'l', isDefault: true });
    const defaultUnitId = unitsService.units()[0].id;

    openDialog('Oat milk');
    await TestBed.inject(ApplicationRef).whenStable();

    const unitSelect = document.querySelector<HTMLSelectElement>('#create-product-unit')!;
    const categorySelect = document.querySelector<HTMLSelectElement>('#create-product-category')!;
    expect(unitSelect.value).toBe(defaultUnitId);
    expect(categorySelect.value).toBe('');
  });

  it('blocks submit and shows an error when the name duplicates an existing product', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'Litre', symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({
      name: 'Milk',
      defaultUnitId: unitsService.units()[0].id,
      categoryId: categoriesService.categories()[0].id,
    });

    const dialogRef = openDialog('Milk');
    await TestBed.inject(ApplicationRef).whenStable();

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

    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.body.textContent).toContain('A product with this name already exists.');
    expect(productsService.products().length).toBe(1);
    expect(dialogRef.closed).toBeDefined();
  });

  it('creates the product and closes with it on valid submit', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'Litre', symbol: 'l' });
    const unitId = unitsService.units()[0].id;
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const categoryId = categoriesService.categories()[0].id;

    const dialogRef = openDialog('Oat milk');
    const resultPromise = firstValueFrom(dialogRef.closed);
    await TestBed.inject(ApplicationRef).whenStable();

    document.querySelector<HTMLSelectElement>('#create-product-unit')!.value = unitId;
    document
      .querySelector<HTMLSelectElement>('#create-product-unit')!
      .dispatchEvent(new Event('input'));
    document.querySelector<HTMLSelectElement>('#create-product-category')!.value = categoryId;
    document
      .querySelector<HTMLSelectElement>('#create-product-category')!
      .dispatchEvent(new Event('input'));

    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

    const result = await resultPromise;
    expect(result).toEqual(
      expect.objectContaining({ name: 'Oat milk', defaultUnitId: unitId, categoryId }),
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --include src/app/features/products/create-product-dialog/create-product-dialog.spec.ts --watch=false`
Expected: FAIL — `create-product-dialog.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/app/features/products/create-product-dialog/create-product-dialog.ts`:

```ts
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import {
  afterRenderEffect,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { Product } from '../data/product.model';
import { ProductsService } from '../data/products.service';

export interface CreateProductDialogData {
  readonly initialName: string;
}

interface CreateProductFormValue {
  name: string;
  defaultUnitId: string;
  categoryId: string;
}

@Component({
  selector: 'app-create-product-dialog',
  imports: [FormField],
  template: `
    <div class="add-panel">
      <div class="add-panel__header">
        <h2>Create product</h2>
      </div>
      <form novalidate (submit)="handleSubmit($event)">
        <label class="field-label" for="create-product-name">Name</label>
        <input
          #nameInput
          id="create-product-name"
          type="text"
          class="field-input"
          [formField]="productForm.name"
        />
        @if (productForm.name().invalid() && productForm.name().touched()) {
          <span class="field-error">Name is required.</span>
        }
        @if (duplicateNameError()) {
          <p class="field-error" role="alert">A product with this name already exists.</p>
        }

        <label class="field-label" for="create-product-unit">Default unit</label>
        <select
          id="create-product-unit"
          class="field-input"
          [formField]="productForm.defaultUnitId"
        >
          <option value="" disabled>Select a unit</option>
          @for (unit of unitsService.units(); track unit.id) {
            <option [value]="unit.id">{{ unit.name }} ({{ unit.symbol }})</option>
          }
        </select>
        @if (productForm.defaultUnitId().invalid() && productForm.defaultUnitId().touched()) {
          <span class="field-error">A unit is required.</span>
        }

        <label class="field-label" for="create-product-category">Category</label>
        <select id="create-product-category" class="field-input" [formField]="productForm.categoryId">
          <option value="" disabled>Select a category</option>
          @for (category of categoriesService.categories(); track category.id) {
            <option [value]="category.id">{{ category.name }}</option>
          }
        </select>
        @if (productForm.categoryId().invalid() && productForm.categoryId().touched()) {
          <span class="field-error">A category is required.</span>
        }

        <div class="form-actions">
          <button type="button" class="btn-outline-pill" (click)="cancel()">Cancel</button>
          <button type="submit" class="btn-accent-pill-lg">Create</button>
        </div>
      </form>
    </div>
  `,
})
export class CreateProductDialog {
  protected readonly data = inject<CreateProductDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<Product | undefined>>(DialogRef);
  protected readonly productsService = inject(ProductsService);
  protected readonly unitsService = inject(UnitsService);
  protected readonly categoriesService = inject(CategoriesService);

  protected readonly duplicateNameError = signal(false);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  private readonly model = signal<CreateProductFormValue>({
    name: this.data.initialName,
    defaultUnitId: this.unitsService.defaultUnit()?.id ?? '',
    categoryId: '',
  });
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

    afterRenderEffect(() => {
      this.nameInput()?.nativeElement.focus();
    });
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    this.productForm().markAsTouched();
    if (this.productForm().invalid()) {
      return;
    }

    const value = { ...this.model(), name: this.model().name.trim() };
    if (!value.name) {
      return;
    }

    const isDuplicate = this.productsService
      .products()
      .some((product) => product.name.toLowerCase() === value.name.toLowerCase());
    if (isDuplicate) {
      this.duplicateNameError.set(true);
      return;
    }

    const created = this.productsService.add(value);
    this.dialogRef.close(created);
  }

  protected cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --include src/app/features/products/create-product-dialog/create-product-dialog.spec.ts --watch=false`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/products/create-product-dialog/
git commit -m "feat(products): add CreateProductDialog for quick product creation"
```

---

### Task 3: `ProductPicker` component (search + create, Signal Forms custom control)

**Files:**
- Modify: `src/app/app.config.ts` (add a Material animations provider — required once any Material component with its own open/close animation, like `MatAutocomplete`, is rendered)
- Create: `src/app/shared/product-picker/product-picker.ts`
- Test: `src/app/shared/product-picker/product-picker.spec.ts`

**Interfaces:**
- Consumes: `Product`, `ProductId` from `../../features/products/data/product.model` (existing), `CreateProductDialog`/`CreateProductDialogData` from Task 2.
- Produces (used by Task 4):
  - `class ProductPicker implements FormValueControl<ProductId>` — selector `app-product-picker`. Inputs: `products = input.required<readonly Product[]>()`, `inputId = input.required<string>()`. `value = model.required<ProductId>()` (the Signal Forms custom-control contract — bindable via `[formField]` directly, same as a native `<select>`).

- [ ] **Step 1: Write the failing tests**

Create `src/app/shared/product-picker/product-picker.spec.ts`:

```ts
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CategoriesService } from '../../features/categories/data/categories.service';
import { UnitsService } from '../../features/units/data/units.service';
import { Product } from '../../features/products/data/product.model';
import { ProductsService } from '../../features/products/data/products.service';
import { ProductPicker } from './product-picker';

async function typeQuery(root: HTMLElement, query: string): Promise<void> {
  const input = root.querySelector<HTMLInputElement>('input')!;
  input.value = query;
  input.dispatchEvent(new Event('input'));
  await TestBed.inject(ApplicationRef).whenStable();
}

function optionTexts(): string[] {
  return Array.from(document.querySelectorAll('mat-option')).map((el) => el.textContent?.trim() ?? '');
}

function clickOption(text: string): void {
  const option = Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find(
    (el) => el.textContent?.trim() === text,
  )!;
  option.click();
}

describe('ProductPicker', () => {
  let milk: Product;
  let bread: Product;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ProductPicker],
      providers: [provideAnimationsAsync('noop')],
    });

    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'litre', symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
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
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((container) => container.remove());
  });

  function createPicker() {
    const fixture = TestBed.createComponent(ProductPicker);
    fixture.componentRef.setInput('products', [milk, bread]);
    fixture.componentRef.setInput('inputId', 'test-product-picker');
    fixture.componentRef.setInput('value', '');
    fixture.detectChanges();
    return fixture;
  }

  it('shows no options when the query is blank', () => {
    createPicker();
    expect(document.querySelectorAll('mat-option').length).toBe(0);
  });

  it('filters products by case-insensitive substring match', async () => {
    const fixture = createPicker();
    await typeQuery(fixture.nativeElement, 'mil');
    expect(optionTexts()).toEqual(['Milk']);
  });

  it('shows a create action when the query has no matches', async () => {
    const fixture = createPicker();
    await typeQuery(fixture.nativeElement, 'Eggs');
    expect(optionTexts()).toEqual(['Create product "Eggs"']);
  });

  it('selecting an existing product sets the value and updates the input text', async () => {
    const fixture = createPicker();
    await typeQuery(fixture.nativeElement, 'mil');
    clickOption('Milk');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(fixture.componentInstance.value()).toBe(milk.id);
    expect(fixture.nativeElement.querySelector('input').value).toBe('Milk');
  });

  it('selecting the create action opens the dialog and selects the created product on save', async () => {
    const fixture = createPicker();
    await typeQuery(fixture.nativeElement, 'Eggs');
    clickOption('Create product "Eggs"');
    await TestBed.inject(ApplicationRef).whenStable();

    const nameInput = document.querySelector<HTMLInputElement>('#create-product-name')!;
    expect(nameInput.value).toBe('Eggs');

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
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await TestBed.inject(ApplicationRef).whenStable();

    const productsService = TestBed.inject(ProductsService);
    const created = productsService.products().find((p) => p.name === 'Eggs')!;
    expect(fixture.componentInstance.value()).toBe(created.id);
    expect(fixture.nativeElement.querySelector('input').value).toBe('Eggs');
  });

  it('leaves the value unchanged when the create dialog is cancelled', async () => {
    const fixture = createPicker();
    await typeQuery(fixture.nativeElement, 'Eggs');
    clickOption('Create product "Eggs"');
    await TestBed.inject(ApplicationRef).whenStable();

    document.querySelector<HTMLButtonElement>('.btn-outline-pill')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(fixture.componentInstance.value()).toBe('');
    expect(fixture.nativeElement.querySelector('input').value).toBe('Eggs');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --include src/app/shared/product-picker/product-picker.spec.ts --watch=false`
Expected: FAIL — `product-picker.ts` doesn't exist yet.

- [ ] **Step 3: Add the animations provider**

In `src/app/app.config.ts`, add the import and provider (Material components like `MatAutocomplete` declare open/close animations and need a driver registered, even a no-op one, or Angular throws at runtime when such a component renders):

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAnimationsAsync('noop'),
  ],
};
```

`'noop'` keeps bundle size down (no `@angular/animations` runtime is loaded) while satisfying Material's `AnimationDriver` requirement — the autocomplete panel will open/close instantly rather than fading, which is an acceptable default for this app's otherwise-bespoke, non-Material UI.

- [ ] **Step 4: Implement `ProductPicker`**

Create `src/app/shared/product-picker/product-picker.ts`:

```ts
import { Dialog } from '@angular/cdk/dialog';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
  MatOption,
} from '@angular/material/autocomplete';
import { firstValueFrom } from 'rxjs';
import {
  CreateProductDialog,
  CreateProductDialogData,
} from '../../features/products/create-product-dialog/create-product-dialog';
import { Product, ProductId } from '../../features/products/data/product.model';

const CREATE_OPTION = Symbol('create-product-option');

@Component({
  selector: 'app-product-picker',
  imports: [MatAutocomplete, MatAutocompleteTrigger, MatOption],
  template: `
    <input
      #inputEl
      type="text"
      class="field-input"
      [id]="inputId()"
      autocomplete="off"
      [value]="queryText()"
      [matAutocomplete]="auto"
      (input)="onQueryInput($event)"
      (blur)="touch.emit()"
    />
    @if (queryText().trim() === '') {
      <span class="product-picker__hint">Start typing to search products.</span>
    }
    <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onOptionSelected($event)">
      @for (product of filteredProducts(); track product.id) {
        <mat-option [value]="product.id">{{ product.name }}</mat-option>
      } @empty {
        @if (queryText().trim() !== '') {
          <mat-option [value]="createOptionValue">
            Create product "{{ queryText().trim() }}"
          </mat-option>
        }
      }
    </mat-autocomplete>
  `,
  styles: `
    .product-picker__hint {
      display: block;
      font-size: 0.7rem;
      color: rgba(20, 32, 29, 0.65);
      margin-top: 0.25rem;
    }
  `,
})
export class ProductPicker implements FormValueControl<ProductId> {
  readonly products = input.required<readonly Product[]>();
  readonly inputId = input.required<string>();
  readonly value = model.required<ProductId>();
  readonly touch = output<void>();

  private readonly dialog = inject(Dialog);
  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('inputEl');

  protected readonly queryText = signal('');
  protected readonly createOptionValue = CREATE_OPTION;

  protected readonly filteredProducts = computed(() => {
    const query = this.queryText().trim().toLowerCase();
    if (!query) {
      return [];
    }
    return this.products().filter((product) => product.name.toLowerCase().includes(query));
  });

  constructor() {
    effect(() => {
      const selected = this.products().find((product) => product.id === this.value());
      this.queryText.set(selected?.name ?? '');
    });
  }

  focus(options?: FocusOptions): void {
    this.inputRef().nativeElement.focus(options);
  }

  protected onQueryInput(event: Event): void {
    this.queryText.set((event.target as HTMLInputElement).value);
  }

  protected async onOptionSelected(event: MatAutocompleteSelectedEvent): Promise<void> {
    const selected = event.option.value as ProductId | typeof CREATE_OPTION;
    if (selected === CREATE_OPTION) {
      const created = await this.openCreateDialog(this.queryText().trim());
      if (created) {
        this.value.set(created.id);
      }
      return;
    }
    this.value.set(selected);
  }

  private openCreateDialog(initialName: string): Promise<Product | undefined> {
    const dialogRef = this.dialog.open<Product | undefined, CreateProductDialogData>(
      CreateProductDialog,
      { data: { initialName } },
    );
    return firstValueFrom(dialogRef.closed);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --include src/app/shared/product-picker/product-picker.spec.ts --watch=false`
Expected: PASS (all 6 tests). If the "shows no options when the query is blank" test fails because the panel doesn't render `@empty` content for an empty `filteredProducts()` array even with a blank query, double check the `@if (queryText().trim() !== '')` guard inside `@empty` is present — with a blank query, `filteredProducts()` is `[]`, so `@empty` fires, but the inner `@if` suppresses the create option, leaving the panel with zero `mat-option`s.

- [ ] **Step 6: Commit**

```bash
git add src/app/app.config.ts src/app/shared/product-picker/
git commit -m "feat(shared): add ProductPicker search-and-create combobox"
```

---

### Task 4: Wire `ProductPicker` into the "Add item" flow

**Files:**
- Modify: `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.ts:1-21,37,293-301`
- Modify: `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts` (fix tests that drove the old `<select>`; add a new end-to-end creation test)

**Interfaces:**
- Consumes: `ProductPicker` from Task 3.

- [ ] **Step 1: Update the failing/breaking tests first**

`shopping-list-detail.spec.ts` currently selects the product via `root.querySelector('select')`, which will stop being the product field once `ProductPicker` replaces the native `<select>` (the first, and after this change the *only*, `<select>` left in the "Add item" form is the unit selector). Update the file as follows:

Add this helper near the top of the file, after the imports:

```ts
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
```

In the `TestBed.configureTestingModule` call inside the first `describe('ShoppingListDetail', ...)` block (lines 14-18), add the animations provider:

```ts
    TestBed.configureTestingModule({
      imports: [ShoppingListDetail],
      providers: [provideRouter([]), provideAnimationsAsync('noop')],
    });
```

Add the import at the top of the file:

```ts
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
```

Add `afterEach` cleanup for the autocomplete/dialog overlay, right after the `beforeEach` in the first `describe` block:

```ts
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((container) => container.remove());
  });
```

Replace these three whole tests (each currently selects the product via `root.querySelector('select')`) with the versions below — each becomes `async`, uses `selectProductViaPicker`, and drops its now-unused `productId` local (it was only ever read to drive the old `<select>`):

Replace `'adds an item built from the selected product, unit, and category'` (was lines 27-68) with:

```ts
  it('adds an item built from the selected product, unit, and category', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'litre', symbol: 'l' });
    const unitId = unitsService.units()[0].id;
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const categoryId = categoriesService.categories()[0].id;
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', defaultUnitId: unitId, categoryId });
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
```

Replace `'shows a feedback message when the submitted item merges into an existing unpurchased item'` (was lines 70-109) with:

```ts
  it('shows a feedback message when the submitted item merges into an existing unpurchased item', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'litre', symbol: 'l' });
    const unitId = unitsService.units()[0].id;
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const categoryId = categoriesService.categories()[0].id;
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', defaultUnitId: unitId, categoryId });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;
    shoppingListsService.addItemFromProduct(
      listId,
      productsService.products()[0],
      unitsService.units()[0],
      categoriesService.categories()[0],
      1,
    );

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
  });
```

Replace `'clears the feedback message a few seconds after it appears'` (was lines 111-159) with:

```ts
  it('clears the feedback message a few seconds after it appears', async () => {
    vi.useFakeTimers();
    try {
      const unitsService = TestBed.inject(UnitsService);
      unitsService.add({ name: 'litre', symbol: 'l' });
      const unitId = unitsService.units()[0].id;
      const categoriesService = TestBed.inject(CategoriesService);
      categoriesService.add({ name: 'Dairy' });
      const categoryId = categoriesService.categories()[0].id;
      const productsService = TestBed.inject(ProductsService);
      productsService.add({ name: 'Milk', defaultUnitId: unitId, categoryId });
      const shoppingListsService = TestBed.inject(ShoppingListsService);
      shoppingListsService.addList('Weekly groceries');
      const listId = shoppingListsService.lists()[0].id;
      shoppingListsService.addItemFromProduct(
        listId,
        productsService.products()[0],
        unitsService.units()[0],
        categoriesService.categories()[0],
        1,
      );

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

      vi.advanceTimersByTime(3000);
      fixture.detectChanges();

      expect(root.textContent).not.toContain('Quantity updated for existing item.');
    } finally {
      vi.useRealTimers();
    }
  });
```

`vi.useFakeTimers()` only mocks `setTimeout`/`setInterval`; it doesn't touch the microtask queue Promises resolve through, so `await selectProductViaPicker(...)` still resolves normally inside this test. If `whenStable()` unexpectedly hangs here, replace it with a couple of `await Promise.resolve()` ticks followed by `fixture.detectChanges()` instead — but try the direct approach first.

Update `'does not show a category selector — category is derived from the product'` (was lines 161-187): change the single line `expect(selects.length).toBe(2);` to `expect(selects.length).toBe(1);` (only the unit `<select>` remains — the product field is now `ProductPicker`, not a `<select>`). No other line in that test changes.

- [ ] **Step 2: Add the new end-to-end creation test**

Add this test to the first `describe('ShoppingListDetail', ...)` block, after `'does not show a category selector — category is derived from the product'`:

```ts
  it('creates a new product from the search field and adds it to the list', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'litre', symbol: 'l' });
    const unitId = unitsService.units()[0].id;
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const categoryId = categoriesService.categories()[0].id;
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

    document.querySelector<HTMLSelectElement>('#create-product-unit')!.value = unitId;
    document
      .querySelector<HTMLSelectElement>('#create-product-unit')!
      .dispatchEvent(new Event('input'));
    document.querySelector<HTMLSelectElement>('#create-product-category')!.value = categoryId;
    document
      .querySelector<HTMLSelectElement>('#create-product-category')!
      .dispatchEvent(new Event('input'));
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    const productsService = TestBed.inject(ProductsService);
    expect(productsService.products()).toEqual([
      expect.objectContaining({ name: 'Oat milk', defaultUnitId: unitId, categoryId }),
    ]);
    const items = shoppingListsService.lists()[0].items;
    expect(items.length).toBe(1);
    expect(items[0]).toEqual(
      expect.objectContaining({ productName: 'Oat milk', unitLabel: 'l', categoryName: 'Dairy' }),
    );
  });
```

- [ ] **Step 3: Run tests to verify they fail for the right reason**

Run: `npm test -- --include src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts --watch=false`
Expected: FAIL — `#add-item-product` doesn't exist yet (the template still renders a `<select id="add-item-product">`), so `selectProductViaPicker` and the new test can't find the input.

- [ ] **Step 4: Wire `ProductPicker` into the component**

In `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.ts`, add the import (after the existing `FabPanel` import, line 14):

```ts
import { ProductPicker } from '../../../shared/product-picker/product-picker';
```

Add `ProductPicker` to the component's `imports` array (line 37):

```ts
  imports: [RouterLink, FormField, FabPanel, ProductPicker],
```

Replace the product `<select>` block (lines 292-301):

```html
                <label class="field-label" for="add-item-product">Product</label>
                <select id="add-item-product" class="field-input" [formField]="itemForm.productId">
                  <option value="" disabled>Select a product</option>
                  @for (product of sortedProducts(); track product.id) {
                    <option [value]="product.id">{{ product.name }}</option>
                  }
                </select>
                @if (itemForm.productId().invalid() && itemForm.productId().touched()) {
                  <span class="field-error">Please select a product.</span>
                }
```

with:

```html
                <label class="field-label" for="add-item-product">Product</label>
                <app-product-picker
                  [inputId]="'add-item-product'"
                  [products]="sortedProducts()"
                  [formField]="itemForm.productId"
                />
                @if (itemForm.productId().invalid() && itemForm.productId().touched()) {
                  <span class="field-error">Please select a product.</span>
                }
```

`itemForm.productId` keeps its existing `required()` validator (`shopping-list-detail.ts:687-691`) unchanged — `ProductPicker` slots into the same `[formField]` binding the `<select>` used, since it implements the `FormValueControl` contract (its `value` model is what the `Field` directive reads/writes).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --include src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts --watch=false`
Expected: PASS — all existing `ShoppingListDetail` tests (updated) plus the new product-creation test.

- [ ] **Step 6: Run the full test suite and build**

Run: `npm test -- --watch=false`
Expected: PASS — no regressions in `products-manager.spec.ts`, `products.service.spec.ts`, or any other suite.

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/shopping-lists/shopping-list-detail/
git commit -m "feat(shopping-lists): search and quick-create products when adding a list item"
```

---

## Manual verification (do this after Task 4)

The plan's automated tests cover behavior; the spec also calls out accessibility and visual concerns that need a real browser, not jsdom:

1. Run `npm start`, open a shopping list with 30+ products in the catalog, open "Add item", and confirm typing narrows the list smoothly and the create flow works end to end (search miss → create → item added).
2. Run an AXE scan (e.g. via the `chrome-devtools-mcp:a11y-debugging` skill) on the "Add item" panel with the autocomplete open, and on the create-product dialog — this is the first real Angular Material component in the app, and contrast/ARIA wiring should be confirmed against the app's actual rendered theme, not just assumed from Material's defaults.
3. Confirm keyboard-only use works: Tab into the product field, type, arrow down to the create option, Enter to open the dialog, Tab through its fields, Enter to submit, confirm focus returns sensibly and the new product is selected.
