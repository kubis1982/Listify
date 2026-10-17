import { Dialog } from '@angular/cdk/dialog';
import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { createFakeAuthService } from '../../../testing/fake-auth-service';
import { createFakeSharingService } from '../../../testing/fake-shopping-list-sharing-service';
import { provideFakeShoppingListsStore } from '../../../testing/in-memory-shopping-lists-store';
import { I18n } from '../../../core/i18n/i18n.service';
import { provideFakeCollection } from '../../../core/testing/in-memory-collection';
import { CategoriesService, CATEGORIES_COLLECTION } from '../../categories/data/categories.service';
import { ProductsService, PRODUCTS_COLLECTION } from '../../products/data/products.service';
import { UnitsService, UNITS_COLLECTION } from '../../units/data/units.service';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';
import { SHOPPING_LISTS_STORE } from '../data/shopping-lists.store';
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

async function typeInTextPicker(inputId: string, text: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(`#${inputId}`)!;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await TestBed.inject(ApplicationRef).whenStable();
}

function optionTexts(): string[] {
  return Array.from(document.querySelectorAll('mat-option')).map((el) => el.textContent?.trim() ?? '');
}

async function selectInTextPicker(inputId: string, optionText: string, query = optionText): Promise<void> {
  await typeInTextPicker(inputId, query);

  const option = Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find(
    (el) => el.textContent?.trim() === optionText,
  )!;
  option.click();
  await TestBed.inject(ApplicationRef).whenStable();
}

async function openAddItemPanel(fixture: ComponentFixture<ShoppingListDetail>): Promise<void> {
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.fab')!.click();
  fixture.detectChanges();
  await TestBed.inject(ApplicationRef).whenStable();
}

async function submitAddItemForm(fixture: ComponentFixture<ShoppingListDetail>): Promise<void> {
  (fixture.nativeElement as HTMLElement)
    .querySelector('#add-item-product')!
    .closest('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await TestBed.inject(ApplicationRef).whenStable();
  fixture.detectChanges();
}

async function answerConfirmDialog(
  fixture: ComponentFixture<ShoppingListDetail>,
  buttonText: string,
): Promise<void> {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')).find(
    (el) => el.textContent?.trim() === buttonText,
  )!;
  button.click();
  await TestBed.inject(ApplicationRef).whenStable();
  fixture.detectChanges();
}

describe('ShoppingListDetail', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShoppingListDetail],
      providers: [
        provideRouter([]),
        provideFakeShoppingListsStore(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: ShoppingListSharingService, useValue: createFakeSharingService() },
        provideFakeCollection(CATEGORIES_COLLECTION),
        provideFakeCollection(UNITS_COLLECTION),
        provideFakeCollection(PRODUCTS_COLLECTION),
      ],
    });
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((container) => container.remove());
  });

  it('opens the share dialog from the Share button', async () => {
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const list = shoppingListsService.addList('Weekly groceries');
    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', list.id);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Share Weekly groceries"]')!
      .click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.querySelector('app-share-list-dialog')).not.toBeNull();
    TestBed.inject(Dialog).closeAll();
  });

  it('switches to "List not found" when the list disappears while open (removed member)', () => {
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const list = shoppingListsService.addList('Weekly groceries');
    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', list.id);
    fixture.detectChanges();

    TestBed.inject(SHOPPING_LISTS_STORE).removeList(list.id);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('List not found');
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
    shoppingListsService.addItem(listId, productsService.products()[0], 'l', 1);

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
      shoppingListsService.addItem(listId, productsService.products()[0], 'l', 1);

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

  it('prefills unit and category from an existing product and offers no create action for them', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    unitsService.add({ symbol: 'pcs' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const list = shoppingListsService.addList('Weekly groceries');

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', list.id);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    await openAddItemPanel(fixture);

    await selectProductViaPicker(root, 'Milk');
    fixture.detectChanges();

    expect(root.querySelector<HTMLInputElement>('#add-item-unit')!.value).toBe('l');
    expect(root.querySelector<HTMLInputElement>('#add-item-category')!.value).toBe('Dairy');
    expect(root.textContent).not.toContain('New product');

    await typeInTextPicker('add-item-unit', 'box');
    expect(optionTexts()).toEqual([]);
    await typeInTextPicker('add-item-category', 'Bakery');
    expect(optionTexts()).toEqual([]);
  });

  it('lets an existing product use another existing unit and category without changing the product', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    unitsService.add({ symbol: 'pcs' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    categoriesService.add({ name: 'Drinks' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const list = shoppingListsService.addList('Weekly groceries');

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', list.id);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    await openAddItemPanel(fixture);

    await selectProductViaPicker(root, 'Milk');
    await selectInTextPicker('add-item-unit', 'pcs');
    await selectInTextPicker('add-item-category', 'Drinks');
    await submitAddItemForm(fixture);

    expect(document.querySelector('app-confirm-dialog')).toBeNull();
    expect(shoppingListsService.lists()[0].items).toEqual([
      expect.objectContaining({ productName: 'Milk', unitLabel: 'pcs', categoryName: 'Drinks' }),
    ]);
    expect(productsService.products()).toEqual([
      expect.objectContaining({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' }),
    ]);
    expect(document.activeElement).toBe(root.querySelector('#add-item-product'));
  });

  it('registers a new product with its new unit and category when the user confirms', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const list = shoppingListsService.addList('Weekly groceries');

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', list.id);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    await openAddItemPanel(fixture);

    await typeInTextPicker('add-item-product', 'Oat milk');
    fixture.detectChanges();
    expect(root.textContent).toContain('New product — choose its unit and category.');

    await selectInTextPicker('add-item-unit', 'Create unit "Carton"', 'Carton');
    await selectInTextPicker('add-item-category', 'Create category "Plant drinks"', 'Plant drinks');

    // Nothing is registered just by picking "create" — only on submit.
    expect(unitsService.units().map((unit) => unit.symbol)).toEqual(['l']);
    expect(categoriesService.categories().map((category) => category.name)).toEqual(['Dairy']);

    await submitAddItemForm(fixture);
    expect(document.querySelector('app-confirm-dialog')!.textContent).toContain(
      '"Oat milk" is not in your products yet.',
    );
    await answerConfirmDialog(fixture, 'Yes, register');

    expect(productsService.products()).toEqual([
      expect.objectContaining({ name: 'Oat milk', unitSymbol: 'carton', categoryName: 'Plant drinks' }),
    ]);
    expect(unitsService.units().map((unit) => unit.symbol)).toEqual(['l', 'carton']);
    expect(categoriesService.categories().map((category) => category.name)).toEqual([
      'Dairy',
      'Plant drinks',
    ]);
    expect(shoppingListsService.lists()[0].items).toEqual([
      expect.objectContaining({ productName: 'Oat milk', unitLabel: 'carton', categoryName: 'Plant drinks' }),
    ]);
    expect(root.querySelector<HTMLInputElement>('#add-item-product')!.value).toBe('');
    expect(document.activeElement).toBe(root.querySelector('#add-item-product'));
  });

  it('adds only the list item, registering nothing else, when the user declines registering', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const list = shoppingListsService.addList('Weekly groceries');

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', list.id);
    fixture.detectChanges();
    await openAddItemPanel(fixture);

    await typeInTextPicker('add-item-product', 'Oat milk');
    await selectInTextPicker('add-item-unit', 'Create unit "Carton"', 'Carton');
    await selectInTextPicker('add-item-category', 'Create category "Plant drinks"', 'Plant drinks');
    await submitAddItemForm(fixture);
    await answerConfirmDialog(fixture, 'No, this list only');

    expect(productsService.products()).toEqual([]);
    expect(unitsService.units().map((unit) => unit.symbol)).toEqual(['l']);
    expect(categoriesService.categories().map((category) => category.name)).toEqual(['Dairy']);
    expect(shoppingListsService.lists()[0].items).toEqual([
      expect.objectContaining({ productName: 'Oat milk', unitLabel: 'carton', categoryName: 'Plant drinks' }),
    ]);
  });

  it('adds nothing and keeps the form filled when the register question is dismissed', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const list = shoppingListsService.addList('Weekly groceries');

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', list.id);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    await openAddItemPanel(fixture);

    await typeInTextPicker('add-item-product', 'Oat milk');
    await selectInTextPicker('add-item-unit', 'l');
    await selectInTextPicker('add-item-category', 'Dairy');
    await submitAddItemForm(fixture);
    TestBed.inject(Dialog).closeAll();
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    expect(shoppingListsService.lists()[0].items).toEqual([]);
    expect(TestBed.inject(ProductsService).products()).toEqual([]);
    expect(root.querySelector<HTMLInputElement>('#add-item-product')!.value).toBe('Oat milk');
  });

  it('requires a category for a new product', async () => {
    TestBed.inject(UnitsService).add({ symbol: 'l', isDefault: true });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const list = shoppingListsService.addList('Weekly groceries');

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', list.id);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    await openAddItemPanel(fixture);

    await typeInTextPicker('add-item-product', 'Oat milk');
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>('#add-item-unit')!.value).toBe('l');

    await submitAddItemForm(fixture);

    expect(document.querySelector('app-confirm-dialog')).toBeNull();
    expect(shoppingListsService.lists()[0].items).toEqual([]);
    expect(root.textContent).toContain('A category is required.');
  });

  it('focuses the quantity field after picking a suggested product', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const list = shoppingListsService.addList('Weekly groceries');

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', list.id);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    await openAddItemPanel(fixture);

    await selectProductViaPicker(root, 'Milk');

    expect(document.activeElement).toBe(root.querySelector('#add-item-quantity'));
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
    shoppingListsService.addItem(listId, applesProduct, 'l', 3);
    shoppingListsService.addItem(listId, milkProduct, 'l', 1);

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

  it('sorts products within a category alphabetically regardless of the order they were added', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Yogurt', unitSymbol: 'l', categoryName: 'Dairy' });
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    productsService.add({ name: 'Cheese', unitSymbol: 'l', categoryName: 'Dairy' });
    const [yogurtProduct, milkProduct, cheeseProduct] = productsService.products();
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;
    shoppingListsService.addItem(listId, yogurtProduct, 'l', 1);
    shoppingListsService.addItem(listId, milkProduct, 'l', 1);
    shoppingListsService.addItem(listId, cheeseProduct, 'l', 1);

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const itemNames = Array.from(root.querySelectorAll('.item-card__name')).map(
      (name) => name.textContent?.trim(),
    );
    expect(itemNames).toEqual(['Cheese', 'Milk', 'Yogurt']);
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
    shoppingListsService.addItem(listId, productsService.products()[0], 'l', 2);

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
    shoppingListsService.addItem(listId, productsService.products()[0], 'l', 2);

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Edit Milk"]')!.click();
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

  it('edits the note of an item via the edit panel, prefilled with the current note', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;
    shoppingListsService.addItem(listId, productsService.products()[0], 'l', 2, 'organic');

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Edit Milk"]')!.click();
    fixture.detectChanges();

    const noteInput = root.querySelector<HTMLInputElement>('#edit-item-note')!;
    expect(noteInput.value).toBe('organic');

    noteInput.value = 'skimmed';
    noteInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(shoppingListsService.lists()[0].items[0].note).toBe('skimmed');
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
    shoppingListsService.addItem(listId, productsService.products()[0], 'l', 1);
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
      root.querySelector<HTMLButtonElement>('button[aria-label="Edit Milk"]')!.disabled,
    ).toBe(true);
  });

  it('keeps a stale unit symbol from the product even when that unit no longer exists', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;

    const unitId = unitsService.units()[0].id;
    unitsService.remove(unitId);

    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', listId);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    await selectProductViaPicker(root, 'Milk');
    fixture.detectChanges();

    expect(root.querySelector<HTMLInputElement>('#add-item-unit')!.value).toBe('l');
    await submitAddItemForm(fixture);
    expect(shoppingListsService.lists()[0].items).toEqual([
      expect.objectContaining({ productName: 'Milk', unitLabel: 'l' }),
    ]);
  });

  it('shows a required-unit error and does not add the item when the product has no resolvable unit', async () => {
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: '', categoryName: 'Dairy' });
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

    expect(shoppingListsService.lists()[0].items).toEqual([]);
    expect(root.textContent).toContain('A unit is required.');
  });
});

describe('ShoppingListDetail sharing', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShoppingListDetail],
      providers: [
        provideRouter([]),
        provideFakeShoppingListsStore(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: ShoppingListSharingService, useValue: createFakeSharingService() },
        provideFakeCollection(CATEGORIES_COLLECTION),
        provideFakeCollection(UNITS_COLLECTION),
        provideFakeCollection(PRODUCTS_COLLECTION),
      ],
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
    shoppingListsService.addItem(listId, productsService.products()[0], 'l', 2, 'organic');
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
    root.querySelector<HTMLButtonElement>('button[aria-label="Export Weekly groceries"]')!.click();
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
    root.querySelector<HTMLButtonElement>('button[aria-label="Export Weekly groceries"]')!.click();
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
    root.querySelector<HTMLButtonElement>('button[aria-label="Export Weekly groceries"]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });
});
