import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmDialogService } from './confirm-dialog.service';

describe('ConfirmDialogService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    document
      .querySelectorAll('.cdk-overlay-container')
      .forEach((container) => container.remove());
  });

  function getButtons(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.confirm-dialog__actions button'));
  }

  it('shows the given title and message', async () => {
    const service = TestBed.inject(ConfirmDialogService);

    void service.confirm({ title: 'Delete this shopping list?', message: 'This removes it for good.' });
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.body.textContent).toContain('Delete this shopping list?');
    expect(document.body.textContent).toContain('This removes it for good.');
  });

  it('resolves true when the user clicks the confirm button', async () => {
    const service = TestBed.inject(ConfirmDialogService);
    const resultPromise = service.confirm({ title: 'Delete?', message: 'Sure?' });
    await TestBed.inject(ApplicationRef).whenStable();

    getButtons()[1].click();

    expect(await resultPromise).toBe(true);
  });

  it('resolves false when the user clicks the cancel button', async () => {
    const service = TestBed.inject(ConfirmDialogService);
    const resultPromise = service.confirm({ title: 'Delete?', message: 'Sure?' });
    await TestBed.inject(ApplicationRef).whenStable();

    getButtons()[0].click();

    expect(await resultPromise).toBe(false);
  });

  it('removes the dialog from the DOM once closed', async () => {
    const service = TestBed.inject(ConfirmDialogService);
    const resultPromise = service.confirm({ title: 'Delete?', message: 'Sure?' });
    await TestBed.inject(ApplicationRef).whenStable();

    getButtons()[0].click();
    await resultPromise;

    expect(document.querySelector('.confirm-dialog')).toBeNull();
  });
});

describe('ConfirmDialogService.alert', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    document
      .querySelectorAll('.cdk-overlay-container')
      .forEach((container) => container.remove());
  });

  function getButtons(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.confirm-dialog__actions button'));
  }

  it('shows the given title and message with a single OK button', async () => {
    const service = TestBed.inject(ConfirmDialogService);

    void service.alert({ title: 'Import failed', message: "We couldn't read this file." });
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.body.textContent).toContain('Import failed');
    expect(document.body.textContent).toContain("We couldn't read this file.");
    const buttons = getButtons();
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent?.trim()).toBe('OK');
  });

  it('resolves once the OK button is clicked', async () => {
    const service = TestBed.inject(ConfirmDialogService);
    const resultPromise = service.alert({ title: 'Import failed', message: 'Bad file.' });
    await TestBed.inject(ApplicationRef).whenStable();

    getButtons()[0].click();

    await expect(resultPromise).resolves.toBeUndefined();
  });

  it('removes the dialog from the DOM once closed', async () => {
    const service = TestBed.inject(ConfirmDialogService);
    const resultPromise = service.alert({ title: 'Import failed', message: 'Bad file.' });
    await TestBed.inject(ApplicationRef).whenStable();

    getButtons()[0].click();
    await resultPromise;

    expect(document.querySelector('.confirm-dialog')).toBeNull();
  });
});
