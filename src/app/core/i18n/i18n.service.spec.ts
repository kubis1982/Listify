import { TestBed } from '@angular/core/testing';
import { I18n } from './i18n.service';

function setBrowserLanguage(tag: string): void {
  Object.defineProperty(navigator, 'language', { value: tag, configurable: true });
}

describe('I18n', () => {
  beforeEach(() => {
    localStorage.clear();
    setBrowserLanguage('en-US');
    document.documentElement.lang = '';
  });

  it('defaults to English when nothing is stored and the browser is not Polish', () => {
    setBrowserLanguage('de-DE');
    expect(TestBed.inject(I18n).language()).toBe('en');
  });

  it('picks Polish up from the browser language', () => {
    setBrowserLanguage('pl-PL');
    expect(TestBed.inject(I18n).language()).toBe('pl');
  });

  it('prefers a stored choice over the browser language', () => {
    localStorage.setItem('listify:language', 'pl');
    setBrowserLanguage('en-US');
    expect(TestBed.inject(I18n).language()).toBe('pl');
  });

  it('ignores a stored value that is not a supported language', () => {
    localStorage.setItem('listify:language', 'fr');
    expect(TestBed.inject(I18n).language()).toBe('en');
  });

  it('translates into the selected language', () => {
    const i18n = TestBed.inject(I18n);
    expect(i18n.t('common.cancel')).toBe('Cancel');

    i18n.setLanguage('pl');
    expect(i18n.t('common.cancel')).toBe('Anuluj');
  });

  it('substitutes parameters into a translation', () => {
    expect(TestBed.inject(I18n).t('language.label')).toBe('Language');
  });

  it('persists the selected language', () => {
    TestBed.inject(I18n).setLanguage('pl');
    TestBed.tick();
    expect(localStorage.getItem('listify:language')).toBe('pl');
  });

  it('keeps the document language in sync', () => {
    const i18n = TestBed.inject(I18n);
    TestBed.tick();
    expect(document.documentElement.lang).toBe('en');

    i18n.setLanguage('pl');
    TestBed.tick();
    expect(document.documentElement.lang).toBe('pl');
  });
});
