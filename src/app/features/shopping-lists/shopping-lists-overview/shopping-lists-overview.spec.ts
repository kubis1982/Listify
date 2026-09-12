import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ShoppingListsService } from '../data/shopping-lists.service';
import { ShoppingListsOverview } from './shopping-lists-overview';

describe('ShoppingListsOverview', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShoppingListsOverview],
      providers: [provideRouter([])],
    });
  });

  it('shows an empty-state message when there are no lists', () => {
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No shopping lists yet');
  });

  it('creates a list from the form and lists it', () => {
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const input = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.value = 'Weekly groceries';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    expect(root.querySelectorAll('.list-card').length).toBe(1);
    expect(root.textContent).toContain('Weekly groceries');
  });

  it('deletes a list after the user confirms', () => {
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Delete Weekly groceries"]')!
      .click();
    fixture.detectChanges();

    expect(shoppingListsService.lists()).toEqual([]);
  });
});
