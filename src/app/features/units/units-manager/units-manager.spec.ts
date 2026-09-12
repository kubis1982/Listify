import { TestBed } from '@angular/core/testing';
import { UnitsService } from '../data/units.service';
import { UnitsManager } from './units-manager';

describe('UnitsManager', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [UnitsManager] });
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
    const inputs = root.querySelectorAll<HTMLInputElement>('input[type="text"]');

    setInputValue(inputs[0], 'Kilogram');
    setInputValue(inputs[1], 'kg');
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(root.querySelectorAll('mat-list-item').length).toBe(1);
    expect(root.textContent).toContain('Kilogram (kg)');
  });

  it('removes a unit after the user confirms', () => {
    const fixture = TestBed.createComponent(UnitsManager);
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ name: 'Litre', symbol: 'l' });
    fixture.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('mat-list-item button + button')!
      .click();
    fixture.detectChanges();

    expect(unitsService.units()).toEqual([]);
  });
});
