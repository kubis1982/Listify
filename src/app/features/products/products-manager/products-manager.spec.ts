import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { I18n } from '../../../core/i18n/i18n.service';
import { provideFakeCollection } from '../../../core/testing/in-memory-collection';
import { CategoriesService, CATEGORIES_COLLECTION } from '../../categories/data/categories.service';
import { UnitsService, UNITS_COLLECTION } from '../../units/data/units.service';
import { ProductsService, PRODUCTS_COLLECTION } from '../data/products.service';
import { ProductsManager } from './products-manager';

function clickConfirmDialogButton(which: 'cancel' | 'confirm'): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.confirm-dialog__actions button');
  (which === 'cancel' ? buttons[0] : buttons[1]).click();
}

async function typeInPicker(inputId: string, query: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(`#${inputId}`)!;
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

async function selectExisting(inputId: string, text: string): Promise<void> {
  await typeInPicker(inputId, text);
  clickOption(text);
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('ProductsManager', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ProductsManager],
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

  it('shows an empty-state message when there are no products', () => {
    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No products yet');
  });

  it('renders the page in Polish once Polish is selected', () => {
    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('No products yet');

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect(root.textContent).toContain('Produkty');
    expect(root.textContent).toContain('Nie masz jeszcze produktów');
  });

  it('adds a product using the selected default unit and category', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });

    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const nameInput = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    nameInput.value = 'Milk 3.2%';
    nameInput.dispatchEvent(new Event('input'));

    await selectExisting('product-unit', 'l');
    await selectExisting('product-category', 'Dairy');
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    const productsService = TestBed.inject(ProductsService);
    expect(productsService.products()).toEqual([
      expect.objectContaining({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' }),
    ]);
    const meta = root.querySelector('.list-card__meta');
    expect(meta?.textContent).toContain('l');
    expect(meta?.textContent).toContain('Dairy');
  });

  it('removes a product after the user confirms in the dialog', async () => {
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
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
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
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
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
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
    unitsService.add({ symbol: 'l', isDefault: true });

    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const unitInput = root.querySelector<HTMLInputElement>('#product-unit')!;
    expect(unitInput.value).toBe('l');
  });

  it('keeps the default unit selected after the form resets following a successful add', async () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l', isDefault: true });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });

    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const nameInput = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    nameInput.value = 'Milk';
    nameInput.dispatchEvent(new Event('input'));
    await selectExisting('product-category', 'Dairy');
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    const unitInputAfterReset = root.querySelector<HTMLInputElement>('#product-unit')!;
    expect(unitInputAfterReset.value).toBe('l');
  });

  it('shows a stale unit and category as the selected value when editing a product whose values no longer exist', async () => {
    const productsService = TestBed.inject(ProductsService);
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'kg' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Produce' });

    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('button[aria-label="Edit Milk"]')!.click();
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(root.querySelector<HTMLInputElement>('#product-unit')!.value).toBe('l');
    expect(root.querySelector<HTMLInputElement>('#product-category')!.value).toBe('Dairy');

    await typeInPicker('product-unit', 'l');
    expect(optionTexts()).toEqual(['l']);
  });

  it('creating a new unit through the picker saves it immediately', async () => {
    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    await typeInPicker('product-unit', 'ml');
    clickOption('Create unit "ml"');
    await TestBed.inject(ApplicationRef).whenStable();

    const unitsService = TestBed.inject(UnitsService);
    expect(unitsService.units().map((unit) => unit.symbol)).toEqual(['ml']);
    expect(root.querySelector<HTMLInputElement>('#product-unit')!.value).toBe('ml');
  });

  it('creating a new category through the picker saves it immediately', async () => {
    const fixture = TestBed.createComponent(ProductsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    await typeInPicker('product-category', 'Beverages');
    clickOption('Create category "Beverages"');
    await TestBed.inject(ApplicationRef).whenStable();

    const categoriesService = TestBed.inject(CategoriesService);
    expect(categoriesService.categories().map((category) => category.name)).toEqual(['Beverages']);
    expect(root.querySelector<HTMLInputElement>('#product-category')!.value).toBe('Beverages');
  });
});
