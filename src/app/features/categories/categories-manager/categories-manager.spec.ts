import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { I18n } from '../../../core/i18n/i18n.service';
import { ProductsService } from '../../products/data/products.service';
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

  it('resets to add mode when editing is cancelled', () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Edit Dairy"]')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Edit category');

    root.querySelector<HTMLButtonElement>('.btn-outline-pill')!.click();
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Add category');
    expect(root.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('');
  });

  it('clears typed-in data when adding is cancelled without submitting', () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    setInputValue(root.querySelector<HTMLInputElement>('input[type="text"]')!, 'Dairy');
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.btn-outline-pill')!.click();
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Add category');
    expect(root.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('');
  });

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

  it('renders the page in Polish once Polish is selected', () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('No categories yet');

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect(root.textContent).toContain('Kategorie');
    expect(root.textContent).toContain('Nie masz jeszcze kategorii');
  });
});
