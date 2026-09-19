import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n.service';
import { LanguageSwitcher } from './language-switcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
  });

  function buttons(root: HTMLElement): HTMLButtonElement[] {
    return Array.from(root.querySelectorAll('button'));
  }

  it('offers both languages with their codes', () => {
    const fixture = TestBed.createComponent(LanguageSwitcher);
    fixture.detectChanges();

    const labels = buttons(fixture.nativeElement as HTMLElement).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['EN', 'PL']);
  });

  it('marks the active language as pressed', () => {
    const fixture = TestBed.createComponent(LanguageSwitcher);
    fixture.detectChanges();

    const pressed = buttons(fixture.nativeElement as HTMLElement).map((b) =>
      b.getAttribute('aria-pressed'),
    );
    expect(pressed).toEqual(['true', 'false']);
  });

  it('names each language in full for screen readers', () => {
    const fixture = TestBed.createComponent(LanguageSwitcher);
    fixture.detectChanges();

    const names = buttons(fixture.nativeElement as HTMLElement).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(names).toEqual(['English', 'Polish']);
  });

  it('switches the language when a button is clicked, and relabels itself', () => {
    const fixture = TestBed.createComponent(LanguageSwitcher);
    fixture.detectChanges();

    buttons(fixture.nativeElement as HTMLElement)[1].click();
    fixture.detectChanges();

    expect(TestBed.inject(I18n).language()).toBe('pl');
    const names = buttons(fixture.nativeElement as HTMLElement).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(names).toEqual(['Angielski', 'Polski']);
  });

  it('labels the group for assistive technology', () => {
    const fixture = TestBed.createComponent(LanguageSwitcher);
    fixture.detectChanges();

    const group = (fixture.nativeElement as HTMLElement).querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Language');
  });
});
