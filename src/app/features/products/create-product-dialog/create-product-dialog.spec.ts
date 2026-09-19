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
