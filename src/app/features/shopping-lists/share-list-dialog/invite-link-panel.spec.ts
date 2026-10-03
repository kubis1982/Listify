import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { createFakeSharingService } from '../../../testing/fake-shopping-list-sharing-service';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';
import { InviteLinkPanel } from './invite-link-panel';

describe('InviteLinkPanel', () => {
  let sharing: ShoppingListSharingService;

  beforeEach(() => {
    sharing = createFakeSharingService();
    TestBed.configureTestingModule({
      imports: [InviteLinkPanel],
      providers: [{ provide: ShoppingListSharingService, useValue: sharing }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { clipboard?: unknown }).clipboard;
    delete (navigator as { share?: unknown }).share;
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(InviteLinkPanel);
    fixture.componentRef.setInput('listId', 'list-1');
    fixture.autoDetectChanges();
    await TestBed.inject(ApplicationRef).whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function button(root: HTMLElement, text: string): HTMLButtonElement {
    return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
  }

  it('shows the invite link in a labelled read-only field', async () => {
    const root = await render();

    const input = root.querySelector<HTMLInputElement>('#invite-link')!;
    expect(input.value).toBe('https://listify.test/lists/join/list-1/token-1');
    expect(input.readOnly).toBe(true);
    expect(root.querySelector('label[for="invite-link"]')).not.toBeNull();
  });

  it('copies the link and announces it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const root = await render();

    button(root, 'Copy').click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(writeText).toHaveBeenCalledWith('https://listify.test/lists/join/list-1/token-1');
    expect(root.querySelector('[aria-live="polite"]')!.textContent).toContain('Link copied.');
  });

  it('tells the user to copy manually when the clipboard is unavailable', async () => {
    const root = await render();

    button(root, 'Copy').click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(root.querySelector('[aria-live="polite"]')!.textContent).toContain("Couldn't copy the link");
  });

  it('regenerates the link after confirmation', async () => {
    vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockResolvedValue(true);
    const regenerate = vi.spyOn(sharing, 'regenerateInviteLink');
    const root = await render();

    button(root, 'Generate new link').click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(regenerate).toHaveBeenCalledWith('list-1');
    expect(root.querySelector<HTMLInputElement>('#invite-link')!.value).toBe(
      'https://listify.test/lists/join/list-1/token-2',
    );
  });

  it('keeps the link when regeneration is cancelled', async () => {
    vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockResolvedValue(false);
    const regenerate = vi.spyOn(sharing, 'regenerateInviteLink');
    const root = await render();

    button(root, 'Generate new link').click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(regenerate).not.toHaveBeenCalled();
  });

  it('offers Send only where the Web Share API exists', async () => {
    expect(button(await render(), 'Send')).toBeUndefined();

    Object.defineProperty(navigator, 'share', { value: vi.fn(), configurable: true });
    expect(button(await render(), 'Send')).toBeDefined();
  });
});
