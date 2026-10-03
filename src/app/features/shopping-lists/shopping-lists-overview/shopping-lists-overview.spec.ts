import { registerLocaleData } from '@angular/common';
import localePl from '@angular/common/locales/pl';
import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { createFakeAuthService } from '../../../testing/fake-auth-service';
import { buildShoppingList, provideFakeShoppingListsStore } from '../../../testing/in-memory-shopping-lists-store';
import { I18n } from '../../../core/i18n/i18n.service';
import { ShoppingListsService } from '../data/shopping-lists.service';
import { ShoppingListsOverview } from './shopping-lists-overview';

// DatePipe throws NG0701 for locale 'pl' unless its locale data is registered.
// app.config.ts registers it for the running app, but this spec is loaded in
// isolation by the test runner, so it must register it too.
registerLocaleData(localePl);

function clickConfirmDialogButton(which: 'cancel' | 'confirm'): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.confirm-dialog__actions button');
  (which === 'cancel' ? buttons[0] : buttons[1]).click();
}

function createImportFile(content: string): File {
  return new File([content], 'list.json', { type: 'application/json' });
}

function selectImportFile(root: HTMLElement, file: File): void {
  const fileInput = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
  fileInput.dispatchEvent(new Event('change'));
}

@Component({ template: '' })
class DummyDetailComponent {}

describe('ShoppingListsOverview', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShoppingListsOverview],
      providers: [
        provideRouter([{ path: 'lists/:id', component: DummyDetailComponent }]),
        provideFakeShoppingListsStore(),
        { provide: AuthService, useValue: createFakeAuthService() },
      ],
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

  it('imports a valid file and navigates to the new list', async () => {
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const file = createImportFile(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        list: {
          name: 'Shared list',
          items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2 }],
        },
      }),
    );
    selectImportFile(fixture.nativeElement as HTMLElement, file);
    await TestBed.inject(ApplicationRef).whenStable();

    const shoppingListsService = TestBed.inject(ShoppingListsService);
    expect(shoppingListsService.lists().length).toBe(1);
    expect(shoppingListsService.lists()[0].name).toBe('Shared list');
    const createdId = shoppingListsService.lists()[0].id;
    expect(navigateSpy).toHaveBeenCalledWith(['/lists', createdId]);
  });

  it('shows an alert and creates no list when the file is invalid', async () => {
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    const shoppingListsService = TestBed.inject(ShoppingListsService);

    const file = createImportFile('not valid json');
    selectImportFile(fixture.nativeElement as HTMLElement, file);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(shoppingListsService.lists()).toEqual([]);
    expect(document.body.textContent).toContain('Import failed');
  });

  it('renders the page in Polish once Polish is selected', () => {
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('No shopping lists yet');

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect(root.textContent).toContain('Listy zakupów');
    expect(root.textContent).toContain('Nie masz jeszcze żadnej listy');
  });

  it('formats the created-at date in the selected language', () => {
    TestBed.configureTestingModule({
      providers: [
        provideFakeShoppingListsStore([
          buildShoppingList({ id: '1', createdAt: '2026-03-05T12:00:00.000Z' }),
        ]),
        { provide: AuthService, useValue: createFakeAuthService() },
      ],
    });
    const fixture = TestBed.createComponent(ShoppingListsOverview);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Added Mar 5, 2026');

    TestBed.inject(I18n).setLanguage('pl');
    fixture.detectChanges();

    expect(root.textContent).toContain('Dodano 5 mar 2026');
  });

  describe('shared lists', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideFakeShoppingListsStore([
            buildShoppingList({
              id: 'theirs',
              name: 'Ania groceries',
              ownerId: 'ania-uid',
              memberIds: ['ania-uid', 'test-uid'],
              memberNames: { 'ania-uid': 'Ania', 'test-uid': 'Test User' },
            }),
            buildShoppingList({
              id: 'mine-shared',
              name: 'Family groceries',
              memberIds: ['test-uid', 'a', 'b'],
              memberNames: { 'test-uid': 'Test User', a: 'A', b: 'B' },
            }),
            buildShoppingList({ id: 'mine', name: 'Private groceries' }),
          ]),
        ],
      });
    });

    function card(root: HTMLElement, name: string): HTMLElement {
      return Array.from(root.querySelectorAll<HTMLElement>('.list-card')).find((c) =>
        c.textContent?.includes(name),
      )!;
    }

    it('captions shared lists by owner or member count', () => {
      const fixture = TestBed.createComponent(ShoppingListsOverview);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;

      expect(card(root, 'Ania groceries').textContent).toContain('Shared by Ania');
      expect(card(root, 'Family groceries').textContent).toContain('Shared · 3 people');
      expect(card(root, 'Private groceries').textContent).not.toContain('Shared');
    });

    it("hides rename and delete on someone else's list but keeps Mark complete", () => {
      const fixture = TestBed.createComponent(ShoppingListsOverview);
      fixture.detectChanges();
      const theirs = card(fixture.nativeElement as HTMLElement, 'Ania groceries');

      expect(theirs.querySelector('button[aria-label="Edit Ania groceries"]')).toBeNull();
      expect(theirs.querySelector('button[aria-label="Delete Ania groceries"]')).toBeNull();
      expect(theirs.querySelector('button[aria-label="Mark Ania groceries complete"]')).not.toBeNull();
    });
  });
});
