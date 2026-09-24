import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CreatableTextPicker } from './creatable-text-picker';

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

describe('CreatableTextPicker', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CreatableTextPicker] });
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((container) => container.remove());
  });

  function createPicker(options: readonly string[] = ['l', 'kg'], onCreate = (text: string) => text) {
    const fixture = TestBed.createComponent(CreatableTextPicker);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('inputId', 'test-picker');
    fixture.componentRef.setInput('hintText', 'Start typing to search units.');
    fixture.componentRef.setInput('resultsLabel', 'Unit search results');
    fixture.componentRef.setInput('createOptionLabel', (name: string) => `Create unit "${name}"`);
    fixture.componentRef.setInput('onCreate', onCreate);
    fixture.componentRef.setInput('value', '');
    fixture.detectChanges();
    return fixture;
  }

  it('shows no options and the supplied hint when the query is blank', () => {
    const fixture = createPicker();
    expect(document.querySelectorAll('mat-option').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Start typing to search units.');
  });

  it('filters options by case-insensitive substring match', async () => {
    const fixture = createPicker(['l', 'kg', 'ml']);
    await typeQuery(fixture.nativeElement, 'l');
    expect(optionTexts().sort()).toEqual(['l', 'ml']);
  });

  it('shows a create action using the supplied label when the query has no matches', async () => {
    const fixture = createPicker(['l', 'kg']);
    await typeQuery(fixture.nativeElement, 'pcs');
    expect(optionTexts()).toEqual(['Create unit "pcs"']);
  });

  it('selecting an existing option sets the value and updates the input text', async () => {
    const fixture = createPicker(['l', 'kg']);
    await typeQuery(fixture.nativeElement, 'kg');
    clickOption('kg');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(fixture.componentInstance.value()).toBe('kg');
    expect(fixture.nativeElement.querySelector('input').value).toBe('kg');
  });

  it('selecting the create action calls onCreate and selects its returned value', async () => {
    const created: string[] = [];
    const onCreate = (text: string) => {
      created.push(text);
      return text.toLowerCase();
    };
    const fixture = createPicker(['l', 'kg'], onCreate);
    let createdEmitted = false;
    fixture.componentInstance.created.subscribe(() => {
      createdEmitted = true;
    });

    await typeQuery(fixture.nativeElement, 'PCS');
    clickOption('Create unit "PCS"');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(created).toEqual(['PCS']);
    expect(fixture.componentInstance.value()).toBe('pcs');
    expect(fixture.nativeElement.querySelector('input').value).toBe('pcs');
    expect(createdEmitted).toBe(true);
  });

  it('clears the value when the query is edited away from the selected option', async () => {
    const fixture = createPicker(['l', 'kg']);
    await typeQuery(fixture.nativeElement, 'kg');
    clickOption('kg');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(fixture.componentInstance.value()).toBe('kg');

    await typeQuery(fixture.nativeElement, 'something else');

    expect(fixture.componentInstance.value()).toBe('');
    expect(fixture.nativeElement.querySelector('input').value).toBe('something else');
  });

  it('emits touch when the input loses focus', () => {
    const fixture = createPicker();
    let touched = false;
    fixture.componentInstance.touch.subscribe(() => {
      touched = true;
    });

    fixture.nativeElement.querySelector('input').dispatchEvent(new Event('blur'));

    expect(touched).toBe(true);
  });

  it('gives the results panel the supplied accessible name', async () => {
    const fixture = createPicker();
    await typeQuery(fixture.nativeElement, 'l');

    const panel = document.querySelector('[role="listbox"]')!;
    expect(panel.getAttribute('aria-label')).toBe('Unit search results');
  });

  it('forwards the supplied placeholder to the input', () => {
    const fixture = createPicker();
    fixture.componentRef.setInput('placeholder', 'Select a unit');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input').placeholder).toBe('Select a unit');
  });

  it('displays an externally set value without requiring user input', () => {
    const fixture = createPicker(['l', 'kg']);
    fixture.componentRef.setInput('value', 'kg');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input').value).toBe('kg');
  });
});
