import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n.service';
import { provideFakeCollection } from '../../core/testing/in-memory-collection';
import { CategoriesService, CATEGORIES_COLLECTION } from '../../features/categories/data/categories.service';
import { UnitsService, UNITS_COLLECTION } from '../../features/units/data/units.service';
import { Product } from '../../features/products/data/product.model';
import { ProductsService, PRODUCTS_COLLECTION } from '../../features/products/data/products.service';
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
      providers: [
        provideFakeCollection(CATEGORIES_COLLECTION),
        provideFakeCollection(UNITS_COLLECTION),
        provideFakeCollection(PRODUCTS_COLLECTION),
      ],
    });

    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const productsService = TestBed.inject(ProductsService);
    milk = productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    bread = productsService.add({ name: 'Bread', unitSymbol: 'l', categoryName: 'Dairy' });
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

  it('shows no options and the search hint when the query is blank', () => {
    const fixture = createPicker();
    expect(document.querySelectorAll('mat-option').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Start typing to search products or enter a new one.');
  });

  it('filters products by case-insensitive substring match', async () => {
    const fixture = createPicker();
    await typeQuery(fixture.nativeElement, 'mil');
    expect(optionTexts()).toEqual(['Milk']);
  });

  it('shows no suggestions for a name that matches no product', async () => {
    const fixture = createPicker();
    await typeQuery(fixture.nativeElement, 'Eggs');
    expect(optionTexts()).toEqual([]);
  });

  it('keeps a typed name that matches no product as the value', async () => {
    const fixture = createPicker();
    await typeQuery(fixture.nativeElement, 'Eggs');

    expect(fixture.componentInstance.value()).toBe('Eggs');
    expect(fixture.nativeElement.querySelector('input').value).toBe('Eggs');
  });

  it('selecting a suggested product sets its name as the value and emits productSelected', async () => {
    const fixture = createPicker();
    let selected = false;
    fixture.componentInstance.productSelected.subscribe(() => {
      selected = true;
    });
    await typeQuery(fixture.nativeElement, 'mil');
    clickOption('Milk');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(fixture.componentInstance.value()).toBe('Milk');
    expect(fixture.nativeElement.querySelector('input').value).toBe('Milk');
    expect(selected).toBe(true);
  });

  it('shows an externally set value in the input', async () => {
    const fixture = createPicker();
    fixture.componentRef.setInput('value', 'Bread');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(fixture.nativeElement.querySelector('input').value).toBe('Bread');
  });

  it('emits touch when the input loses focus', () => {
    const fixture = createPicker();
    let touched = false;
    fixture.componentInstance.touch.subscribe(() => {
      touched = true;
    });

    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
    input.dispatchEvent(new Event('blur'));

    expect(touched).toBe(true);
  });

  it('renders the search hint in the selected language', () => {
    const fixture = createPicker();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Start typing to search products or enter a new one.',
    );

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Zacznij pisać, aby wyszukać produkt lub wpisać nowy.',
    );
  });

  it('gives the results panel a translated accessible name', async () => {
    const fixture = createPicker();
    await typeQuery(fixture.nativeElement, 'mil');

    const panel = document.querySelector('[role="listbox"]')!;
    expect(panel.getAttribute('aria-label')).toBe('Product search results');

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect(panel.getAttribute('aria-label')).toBe('Wyniki wyszukiwania produktów');
  });
});
