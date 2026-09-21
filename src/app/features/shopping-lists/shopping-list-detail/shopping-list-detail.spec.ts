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

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect(root.textContent).toContain('Zaktualizowano ilość istniejącej pozycji.');
  });

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

    const createProductUnitSelect = document.querySelector<HTMLSelectElement>('#create-product-unit')!;
    createProductUnitSelect.value = unitId;
    createProductUnitSelect.dispatchEvent(new Event('input'));
    const createProductCategorySelect = document.querySelector<HTMLSelectElement>(
      '#create-product-category',
    )!;
    createProductCategorySelect.value = categoryId;
    createProductCategorySelect.dispatchEvent(new Event('input'));
    createProductUnitSelect.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
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

  it('focuses the quantity field after creating a product from the add-item form', async () => {
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

    const createProductUnitSelect = document.querySelector<HTMLSelectElement>('#create-product-unit')!;
    createProductUnitSelect.value = unitId;
    createProductUnitSelect.dispatchEvent(new Event('input'));
    const createProductCategorySelect = document.querySelector<HTMLSelectElement>(
      '#create-product-category',
    )!;
    createProductCategorySelect.value = categoryId;
    createProductCategorySelect.dispatchEvent(new Event('input'));
    createProductUnitSelect.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    const quantityInput = root.querySelector<HTMLInputElement>('#add-item-quantity')!;
    expect(document.activeElement).toBe(quantityInput);
  });

  it('groups items into sections by category, sorted alphabetically', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'litre', symbol: 'l' });
    const unitId = unitsService.units()[0].id;
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Produce' });
    categoriesService.add({ name: 'Dairy' });
    const [produceCategory, dairyCategory] = categoriesService.categories();
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Apples', defaultUnitId: unitId, categoryId: produceCategory.id });
    productsService.add({ name: 'Milk', defaultUnitId: unitId, categoryId: dairyCategory.id });
    const [applesProduct, milkProduct] = productsService.products();
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const listId = shoppingListsService.lists()[0].id;
    shoppingListsService.addItemFromProduct(
      listId,
      applesProduct,
      unitsService.units()[0],
      produceCategory,
      3,
    );
    shoppingListsService.addItemFromProduct(
      listId,
      milkProduct,
      unitsService.units()[0],
      dairyCategory,
      1,
    );

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
    checkbox.click();
    fixture.detectChanges();

    expect(shoppingListsService.lists()[0].items[0].purchased).toBe(true);
  });

  it('edits the quantity of an item via the edit panel', () => {
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
      1,
    );
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
