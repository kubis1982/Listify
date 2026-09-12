import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
});
