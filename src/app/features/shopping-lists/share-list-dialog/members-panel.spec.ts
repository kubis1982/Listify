import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { createFakeSharingService } from '../../../testing/fake-shopping-list-sharing-service';
import { buildShoppingList } from '../../../testing/in-memory-shopping-lists-store';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';
import { MembersPanel } from './members-panel';

const SHARED = buildShoppingList({
  memberIds: ['test-uid', 'ania-uid'],
  memberNames: { 'test-uid': 'Test User', 'ania-uid': 'Ania' },
});

describe('MembersPanel', () => {
  let sharing: ShoppingListSharingService;

  beforeEach(() => {
    sharing = createFakeSharingService();
    TestBed.configureTestingModule({
      imports: [MembersPanel],
      providers: [{ provide: ShoppingListSharingService, useValue: sharing }],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function render(canManage: boolean) {
    const fixture = TestBed.createComponent(MembersPanel);
    fixture.componentRef.setInput('list', SHARED);
    fixture.componentRef.setInput('canManage', canManage);
    fixture.autoDetectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  function button(root: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  }

  it('lists members with the owner first and marked', () => {
    const { root } = render(true);

    const rows = Array.from(root.querySelectorAll('li')).map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('Test User');
    expect(rows[0]).toContain('Owner');
    expect(rows[1]).toContain('Ania');
  });

  it('removes a member and revokes the link by default', async () => {
    const removeMember = vi.spyOn(sharing, 'removeMember');
    const { fixture, root } = render(true);
    const revoked = vi.fn();
    fixture.componentInstance.linkRevoked.subscribe(revoked);

    root.querySelector<HTMLButtonElement>('button[aria-label="Remove Ania"]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    button(root, 'Remove')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(removeMember).toHaveBeenCalledWith('list-1', 'ania-uid', true);
    expect(revoked).toHaveBeenCalled();
  });

  it('keeps the link when the checkbox is cleared', async () => {
    const removeMember = vi.spyOn(sharing, 'removeMember');
    const { fixture, root } = render(true);
    const revoked = vi.fn();
    fixture.componentInstance.linkRevoked.subscribe(revoked);

    root.querySelector<HTMLButtonElement>('button[aria-label="Remove Ania"]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();
    root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    button(root, 'Remove')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(removeMember).toHaveBeenCalledWith('list-1', 'ania-uid', false);
    expect(revoked).not.toHaveBeenCalled();
  });

  it('shows members no remove buttons, only Leave', () => {
    const { root } = render(false);

    expect(root.querySelector('button[aria-label^="Remove"]')).toBeNull();
    expect(button(root, 'Leave list')).toBeDefined();
  });

  it('leaves after confirmation and emits left', async () => {
    vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockResolvedValue(true);
    const leave = vi.spyOn(sharing, 'leave');
    const { fixture, root } = render(false);
    const left = vi.fn();
    fixture.componentInstance.left.subscribe(left);

    button(root, 'Leave list')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(leave).toHaveBeenCalledWith('list-1');
    expect(left).toHaveBeenCalled();
  });
});
