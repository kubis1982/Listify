import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProductsService } from '../../products/data/products.service';
import { UnitsService } from '../../units/data/units.service';
import { CategoriesService } from '../data/categories.service';
import { CategoriesManager } from './categories-manager';

function clickConfirmDialogButton(which: 'cancel' | 'confirm'): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.confirm-dialog__actions button');
  (which === 'cancel' ? buttons[0] : buttons[1]).click();
}

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
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    setInputValue(root.querySelector<HTMLInputElement>('input[type="text"]')!, 'Dairy');
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(root.querySelectorAll('.list-card').length).toBe(1);
    expect(root.textContent).toContain('Dairy');
  });

  it('removes a category after the user confirms in the dialog', async () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Delete Dairy"]')!
      .click();
    await TestBed.inject(ApplicationRef).whenStable();

    clickConfirmDialogButton('confirm');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(categoriesService.categories()).toEqual([]);
  });

  it('keeps the category when the user cancels the delete dialog', async () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Delete Dairy"]')!
      .click();
    await TestBed.inject(ApplicationRef).whenStable();

    clickConfirmDialogButton('cancel');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(categoriesService.categories().length).toBe(1);
  });

  it('resets to add mode when the edit panel is closed via the panel close button', () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Edit Dairy"]')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Edit category');

    root.querySelector<HTMLButtonElement>('button[aria-label="Close form"]')!.click();
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Add category');
    expect(root.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('');
  });

  it('clears typed-in data when the add panel is closed without submitting', () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    setInputValue(root.querySelector<HTMLInputElement>('input[type="text"]')!, 'Dairy');
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('button[aria-label="Close form"]')!.click();
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Add category');
    expect(root.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('');
  });

  it('disables delete for a category used by a product and does not remove it', () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    const categoriesService = TestBed.inject(CategoriesService);
    const unitsService = TestBed.inject(UnitsService);
    const productsService = TestBed.inject(ProductsService);

    categoriesService.add({ name: 'Dairy' });
    unitsService.add({ name: 'Kilogram', symbol: 'kg' });
    fixture.detectChanges();

    const categoryId = categoriesService.categories()[0].id;
    const unitId = unitsService.units()[0].id;
    productsService.add({ name: 'Milk', categoryId, defaultUnitId: unitId });
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Cannot delete Dairy — used by a product"]',
    );
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(true);

    button!.click();
    fixture.detectChanges();

    expect(categoriesService.categories().length).toBe(1);
  });
});
