import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n.service';
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
    expect(fixture.nativeElement.textContent).toContain('Start typing to search products.');
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
    let productCreated = false;
    fixture.componentInstance.productCreated.subscribe(() => {
      productCreated = true;
    });
    await typeQuery(fixture.nativeElement, 'Eggs');
    clickOption('Create product "Eggs"');
    await TestBed.inject(ApplicationRef).whenStable();

    const nameInput = document.querySelector<HTMLInputElement>('#create-product-name')!;
    expect(nameInput.value).toBe('Eggs');

    document.querySelector<HTMLSelectElement>('#create-product-unit')!.value = 'l';
    document
      .querySelector<HTMLSelectElement>('#create-product-unit')!
      .dispatchEvent(new Event('input'));
    document.querySelector<HTMLSelectElement>('#create-product-category')!.value = 'Dairy';
    document
      .querySelector<HTMLSelectElement>('#create-product-category')!
      .dispatchEvent(new Event('input'));
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await TestBed.inject(ApplicationRef).whenStable();

    const productsService = TestBed.inject(ProductsService);
    const created = productsService.products().find((p) => p.name === 'Eggs')!;
    expect(fixture.componentInstance.value()).toBe(created.id);
    expect(fixture.nativeElement.querySelector('input').value).toBe('Eggs');
    expect(productCreated).toBe(true);
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
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input'));
  });

  it('clears the value when the query is edited away from the selected product', async () => {
    const fixture = createPicker();
    await typeQuery(fixture.nativeElement, 'mil');
    clickOption('Milk');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(fixture.componentInstance.value()).toBe(milk.id);

    await typeQuery(fixture.nativeElement, 'Something else');

    expect(fixture.componentInstance.value()).toBe('');
    expect(fixture.nativeElement.querySelector('input').value).toBe('Something else');
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
      'Start typing to search products.',
    );

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Zacznij pisać, aby wyszukać produkty.',
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
