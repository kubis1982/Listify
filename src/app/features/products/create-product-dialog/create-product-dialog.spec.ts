import { Dialog } from '@angular/cdk/dialog';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideFakeCollection } from '../../../core/testing/in-memory-collection';
import { CategoriesService, CATEGORIES_COLLECTION } from '../../categories/data/categories.service';
import { UnitsService, UNITS_COLLECTION } from '../../units/data/units.service';
import { Product } from '../data/product.model';
import { ProductsService, PRODUCTS_COLLECTION } from '../data/products.service';
import { CreateProductDialog, CreateProductDialogData } from './create-product-dialog';

async function typeInPicker(inputId: string, query: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(`#${inputId}`)!;
  input.value = query;
  input.dispatchEvent(new Event('input'));
  await TestBed.inject(ApplicationRef).whenStable();
}

function clickOption(text: string): void {
  const option = Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find(
    (el) => el.textContent?.trim() === text,
  )!;
  option.click();
}

async function selectExisting(inputId: string, text: string): Promise<void> {
  await typeInPicker(inputId, text);
  clickOption(text);
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('CreateProductDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideFakeCollection(CATEGORIES_COLLECTION),
        provideFakeCollection(UNITS_COLLECTION),
        provideFakeCollection(PRODUCTS_COLLECTION),
      ],
    });
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

    const unitInput = document.querySelector<HTMLInputElement>('#create-product-unit')!;
    const categoryInput = document.querySelector<HTMLInputElement>('#create-product-category')!;
    expect(unitInput.value).toBe('l');
    expect(categoryInput.value).toBe('');
  });

  it('blocks submit and shows an error when the name duplicates an existing product', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });

    openDialog('Milk');
    await TestBed.inject(ApplicationRef).whenStable();

    await selectExisting('create-product-unit', 'l');
    await selectExisting('create-product-category', 'Dairy');

    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.body.textContent).toContain('A product with this name already exists.');
    expect(productsService.products().length).toBe(1);
  });

  it('creates the product and closes with it on valid submit', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });

    const dialogRef = openDialog('Oat milk');
    const resultPromise = firstValueFrom(dialogRef.closed);
    await TestBed.inject(ApplicationRef).whenStable();

    await selectExisting('create-product-unit', 'l');
    await selectExisting('create-product-category', 'Dairy');

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

  it('creating a new unit through the picker saves it immediately, even before the product is submitted', async () => {
    openDialog('Oat milk');
    await TestBed.inject(ApplicationRef).whenStable();

    await typeInPicker('create-product-unit', 'ml');
    clickOption('Create unit "ml"');
    await TestBed.inject(ApplicationRef).whenStable();

    const unitsService = TestBed.inject(UnitsService);
    expect(unitsService.units().map((unit) => unit.symbol)).toEqual(['ml']);
    expect(document.querySelector<HTMLInputElement>('#create-product-unit')!.value).toBe('ml');
  });

  it('creating a new category through the picker saves it immediately, even before the product is submitted', async () => {
    openDialog('Oat milk');
    await TestBed.inject(ApplicationRef).whenStable();

    await typeInPicker('create-product-category', 'Beverages');
    clickOption('Create category "Beverages"');
    await TestBed.inject(ApplicationRef).whenStable();

    const categoriesService = TestBed.inject(CategoriesService);
    expect(categoriesService.categories().map((category) => category.name)).toEqual(['Beverages']);
    expect(document.querySelector<HTMLInputElement>('#create-product-category')!.value).toBe(
      'Beverages',
    );
  });

  it('creates the product using a freshly created unit and category', async () => {
    const dialogRef = openDialog('Oat milk');
    const resultPromise = firstValueFrom(dialogRef.closed);
    await TestBed.inject(ApplicationRef).whenStable();

    await typeInPicker('create-product-unit', 'ml');
    clickOption('Create unit "ml"');
    await TestBed.inject(ApplicationRef).whenStable();

    await typeInPicker('create-product-category', 'Beverages');
    clickOption('Create category "Beverages"');
    await TestBed.inject(ApplicationRef).whenStable();

    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

    const result = await resultPromise;
    expect(result).toEqual(
      expect.objectContaining({ name: 'Oat milk', unitSymbol: 'ml', categoryName: 'Beverages' }),
    );
  });
});
