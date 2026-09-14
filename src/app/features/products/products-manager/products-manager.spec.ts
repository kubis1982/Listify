import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

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

  it('removes a product after the user confirms in the dialog', async () => {
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', defaultUnitId: 'u1', categoryId: 'c1' });
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
    productsService.add({ name: 'Milk', defaultUnitId: 'u1', categoryId: 'c1' });
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
    productsService.add({ name: 'Milk', defaultUnitId: 'u1', categoryId: 'c1' });
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
    unitsService.add({ name: 'Litre', symbol: 'l', isDefault: true });
    const defaultUnitId = unitsService.units()[0].id;

    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const unitSelect = root.querySelectorAll<HTMLSelectElement>('select')[0];
    expect(unitSelect.value).toBe(defaultUnitId);
  });

  it('keeps the default unit selected after the form resets following a successful add', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'Litre', symbol: 'l', isDefault: true });
    const defaultUnitId = unitsService.units()[0].id;
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const categoryId = categoriesService.categories()[0].id;

    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const nameInput = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    nameInput.value = 'Milk';
    nameInput.dispatchEvent(new Event('input'));
    const selects = root.querySelectorAll<HTMLSelectElement>('select');
    selects[1].value = categoryId;
    selects[1].dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    const unitSelectAfterReset = root.querySelectorAll<HTMLSelectElement>('select')[0];
    expect(unitSelectAfterReset.value).toBe(defaultUnitId);
  });
});
