import { Dialog } from '@angular/cdk/dialog';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { createFakeAuthService } from '../../../testing/fake-auth-service';
import { createFakeSharingService } from '../../../testing/fake-shopping-list-sharing-service';
import { buildShoppingList, provideFakeShoppingListsStore } from '../../../testing/in-memory-shopping-lists-store';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';
import { ShareListDialog } from './share-list-dialog';

describe('ShareListDialog', () => {
  function setup(ownerId: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideFakeShoppingListsStore([
          buildShoppingList({
            ownerId,
            memberIds: ['test-uid', 'other-uid'],
            memberNames: { 'test-uid': 'Test User', 'other-uid': 'Other' },
          }),
        ]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: ShoppingListSharingService, useValue: createFakeSharingService() },
      ],
    });
    return TestBed.inject(Dialog).open(ShareListDialog, { data: { listId: 'list-1' } });
  }

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
    vi.restoreAllMocks();
  });

  it('shows the invite link and member management to the owner', async () => {
    setup('test-uid');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.querySelector('app-invite-link-panel')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Remove Other"]')).not.toBeNull();
    expect(document.querySelector('h2')!.textContent).toContain('Share “Weekly groceries”');
  });

  it('shows members only the member list and Leave', async () => {
    setup('other-uid');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.querySelector('app-invite-link-panel')).toBeNull();
    expect(document.body.textContent).toContain('Leave list');
  });

  it('closes and navigates to the lists overview after leaving', async () => {
    const dialogRef = setup('other-uid');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const closed = vi.fn();
    dialogRef.closed.subscribe(closed);
    await TestBed.inject(ApplicationRef).whenStable();

    (dialogRef.componentInstance as unknown as { onLeft(): void }).onLeft();

    expect(closed).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/lists']);
  });
});
