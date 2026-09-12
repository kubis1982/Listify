import { TestBed } from '@angular/core/testing';
import { CategoriesService } from '../data/categories.service';
import { CategoriesManager } from './categories-manager';

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

  it('removes a category after the user confirms', () => {
    const fixture = TestBed.createComponent(CategoriesManager);
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    fixture.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Delete Dairy"]')!
      .click();
    fixture.detectChanges();

    expect(categoriesService.categories()).toEqual([]);
  });
});
