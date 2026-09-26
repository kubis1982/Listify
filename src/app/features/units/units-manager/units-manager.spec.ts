import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideFakeCollection } from '../../../core/testing/in-memory-collection';
import { I18n } from '../../../core/i18n/i18n.service';
import { ProductsService, PRODUCTS_COLLECTION } from '../../products/data/products.service';
import { UnitsService, UNITS_COLLECTION } from '../data/units.service';
import { UnitsManager } from './units-manager';

function clickConfirmDialogButton(which: 'cancel' | 'confirm'): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.confirm-dialog__actions button');
  (which === 'cancel' ? buttons[0] : buttons[1]).click();
}

describe('UnitsManager', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UnitsManager],
      providers: [
        provideFakeCollection(UNITS_COLLECTION),
        provideFakeCollection(PRODUCTS_COLLECTION),
      ],
    });
  });

  function setInputValue(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('shows an empty-state message when there are no units', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No units yet');
  });

  it('adds a unit from the form and lists it', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const inputs = root.querySelectorAll<HTMLInputElement>('input[type="text"]');

    setInputValue(inputs[0], 'KG');
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(root.querySelectorAll('.list-card').length).toBe(1);
    expect(root.textContent).toContain('kg');
  });

  it('removes a unit after the user confirms in the dialog', async () => {
    const fixture = TestBed.createComponent(UnitsManager);
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Delete l"]')!
      .click();
    await TestBed.inject(ApplicationRef).whenStable();

    clickConfirmDialogButton('confirm');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(unitsService.units()).toEqual([]);
  });

  it('keeps the unit when the user cancels the delete dialog', async () => {
    const fixture = TestBed.createComponent(UnitsManager);
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Delete l"]')!
      .click();
    await TestBed.inject(ApplicationRef).whenStable();

    clickConfirmDialogButton('cancel');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(unitsService.units().length).toBe(1);
  });

  it('allows deleting a unit even while a product still holds its symbol as stored text', async () => {
    const fixture = TestBed.createComponent(UnitsManager);
    const unitsService = TestBed.inject(UnitsService);
    const productsService = TestBed.inject(ProductsService);

    unitsService.add({ symbol: 'l' });
    productsService.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Delete l"]',
    )!;
    expect(button.disabled).toBe(false);

    button.click();
    await TestBed.inject(ApplicationRef).whenStable();

    clickConfirmDialogButton('confirm');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(unitsService.units()).toEqual([]);
    expect(productsService.products()[0].unitSymbol).toBe('l');
  });

  it('resets to add mode when editing is cancelled', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Edit l"]')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Edit unit');

    root.querySelector<HTMLButtonElement>('.btn-outline-pill')!.click();
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Add unit');
    expect(root.querySelectorAll<HTMLInputElement>('input[type="text"]')[0].value).toBe('');
  });

  it('clears typed-in data when adding is cancelled without submitting', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    setInputValue(root.querySelectorAll<HTMLInputElement>('input[type="text"]')[0], 'kg');
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.btn-outline-pill')!.click();
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Add unit');
    expect(root.querySelectorAll<HTMLInputElement>('input[type="text"]')[0].value).toBe('');
  });

  it('highlights the default unit with the default-accent star', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l', isDefault: true });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>(
      'button[aria-label="l is already the default unit"]',
    )!;
    expect(button.classList).toContain('icon-btn--default');
  });

  it('sets a unit as default when its "set as default" action is clicked', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l' });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Set l as default"]')!.click();
    fixture.detectChanges();

    expect(unitsService.units()[0].isDefault).toBe(true);
  });

  it('switches the default unit when a different unit is set as default', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'kg', isDefault: true });
    unitsService.add({ symbol: 'l' });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Set l as default"]')!.click();
    fixture.detectChanges();

    const units = unitsService.units();
    expect(units.find((unit) => unit.symbol === 'kg')?.isDefault).toBe(false);
    expect(units.find((unit) => unit.symbol === 'l')?.isDefault).toBe(true);
  });

  it('disables the "set as default" action for the unit that is already default', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'l', isDefault: true });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>(
      'button[aria-label="l is already the default unit"]',
    );
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(true);
  });

  it('renders the page in Polish once Polish is selected', async () => {
    const fixture = TestBed.createComponent(UnitsManager);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Units of measure');
    expect(root.querySelector<HTMLButtonElement>('.fab')!.getAttribute('aria-label')).toBe(
      'Add unit',
    );

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect(root.textContent).toContain('Jednostki miary');
    expect(root.textContent).toContain('Nie masz jeszcze jednostek');
    expect(root.querySelector<HTMLButtonElement>('.fab')!.getAttribute('aria-label')).toBe(
      'Dodaj jednostkę',
    );
  });
});
