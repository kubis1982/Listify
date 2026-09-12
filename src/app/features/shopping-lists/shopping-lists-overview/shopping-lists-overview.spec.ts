import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ShoppingListsService } from '../data/shopping-lists.service';
import { ShoppingListsOverview } from './shopping-lists-overview';

function clickConfirmDialogButton(which: 'cancel' | 'confirm'): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.confirm-dialog__actions button');
  (which === 'cancel' ? buttons[0] : buttons[1]).click();
}

@Component({ template: '' })
class DummyDetailComponent {}

describe('ShoppingListsOverview', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShoppingListsOverview],
      providers: [provideRouter([{ path: 'lists/:id', component: DummyDetailComponent }])],
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

  it('focuses the name input when the panel opens', async () => {
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.activeElement).toBe(root.querySelector('#new-list-name'));

    fixture.nativeElement.remove();
  });

  it('navigates to the newly created list', () => {
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const input = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.value = 'Weekly groceries';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const createdId = shoppingListsService.lists()[0].id;
    expect(navigateSpy).toHaveBeenCalledWith(['/lists', createdId]);
  });

  it('deletes a list after the user confirms in the dialog', async () => {
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Delete Weekly groceries"]')!
      .click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(shoppingListsService.lists().length).toBe(1);
    expect(document.body.textContent).toContain('Weekly groceries');

    clickConfirmDialogButton('confirm');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(shoppingListsService.lists()).toEqual([]);
  });

  it('keeps the list when the user cancels the delete dialog', async () => {
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    shoppingListsService.addList('Weekly groceries');
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Delete Weekly groceries"]')!
      .click();
    await TestBed.inject(ApplicationRef).whenStable();

    clickConfirmDialogButton('cancel');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(shoppingListsService.lists().length).toBe(1);
  });
});
